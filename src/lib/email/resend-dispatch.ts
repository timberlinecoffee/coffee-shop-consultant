// TIM-2366: unified Resend dispatch for all transactional templates (auth + product).
//
// Wraps Resend's REST `/emails` endpoint with the shared sender identity from
// Email Comms Plan §3 (noreply@groundwork.cafe + reply-to support@groundwork.cafe),
// renders React Email templates to HTML on the fly, and returns a structured
// result. Mirrors the existing pattern in send-account-email.ts /
// trial-reminders.ts so callers can stay route-boundary safe (never throws).
//
// Two ways to call this:
//   1. Pass a pre-rendered html/text pair (matches the legacy senders).
//   2. Pass a React Email element + plaintext fallback and let dispatch render.
//
// Either way the call is graceful when RESEND_API_KEY is missing — we return
// {skipped:true, reason:"no_api_key"} instead of throwing, so dev/preview can
// run without keys configured.

import { render as renderEmail } from '@react-email/render';
import type * as React from 'react';
import {
  TRANSACTIONAL_FROM,
  TRANSACTIONAL_REPLY_TO,
} from '../../components/email/tokens.ts';

export type TransactionalSendResult =
  | { ok: true; provider: 'resend'; id: string }
  | { ok: false; skipped: true; reason: 'no_api_key' | 'feature_flagged_off' }
  | { ok: false; skipped: false; status: number; error: string };

// Feature flags surfaced as env-vars so we can flip without redeploying code.
// Defaults are CONSERVATIVE: passwordless and share-notifications stay off
// until product launches the corresponding flow.
function isFeatureEnabled(flag: 'magic_link' | 'share_notification'): boolean {
  const envName =
    flag === 'magic_link'
      ? 'NEXT_PUBLIC_FEATURE_MAGIC_LINK'
      : 'NEXT_PUBLIC_FEATURE_SHARING';
  // Match the Vercel env-var convention used elsewhere in the repo. Any of
  // "1" / "true" / "on" counts as on. Tolerate stray trailing \n that has
  // tripped us many times before (per memory).
  const raw = (process.env[envName] ?? '').replace(/\n/g, '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

interface DispatchArgs {
  to: string;
  subject: string;
  preview?: string;
  text: string;
  refId: string;
  from?: string;
  replyTo?: string;
  // Provide ONE of `react` or `html`.
  react?: React.ReactElement;
  html?: string;
  // If set and the flag is off, dispatch returns {skipped:true} without sending.
  featureFlag?: 'magic_link' | 'share_notification';
}

export async function sendTransactionalEmail(
  args: DispatchArgs,
): Promise<TransactionalSendResult> {
  if (args.featureFlag && !isFeatureEnabled(args.featureFlag)) {
    return { ok: false, skipped: true, reason: 'feature_flagged_off' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, reason: 'no_api_key' };

  let html: string;
  if (args.html !== undefined) {
    html = args.html;
  } else if (args.react) {
    // @react-email/render returns a Promise<string> in v2+. Keep async-aware.
    html = await renderEmail(args.react);
  } else {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: 'dispatch: neither html nor react was provided',
    };
  }

  const from =
    args.from ?? process.env.TRANSACTIONAL_FROM_EMAIL ?? TRANSACTIONAL_FROM;
  const replyTo =
    args.replyTo ??
    process.env.TRANSACTIONAL_REPLY_TO ??
    TRANSACTIONAL_REPLY_TO;

  const body = {
    from,
    to: [args.to],
    subject: args.subject,
    html,
    text: args.text,
    reply_to: replyTo,
    headers: {
      // Lets Resend dedupe within a short window if the same trigger fires
      // twice. Caller is responsible for choosing a refId that uniquely keys
      // the event (e.g. `tim2366-welcome-${userId}`).
      'X-Entity-Ref-ID': args.refId,
    },
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        skipped: false,
        status: res.status,
        error: text.slice(0, 500),
      };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, provider: 'resend', id: data?.id ?? 'unknown' };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
