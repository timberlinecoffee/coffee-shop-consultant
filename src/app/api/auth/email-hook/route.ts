// TIM-3022: Supabase Auth Send-Email hook → Resend transactional templates.
//
// Wiring per https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook:
// when a project enables this hook, Supabase Auth stops sending its built-in
// emails and POSTs the full email payload here. We verify the
// standard-webhooks signature, route by `email_data.email_action_type`, and
// send the matching React Email template through Resend. Returning `{}` tells
// Supabase to SKIP its built-in send. Returning `{ error: ... }` causes
// Supabase to fall back to the legacy template — which still delivers, just
// from the old skin. So failures here are degraded service, not silent.
//
// Magic-link is gated behind NEXT_PUBLIC_FEATURE_MAGIC_LINK (template dispatch
// honors the flag too, so we return early to avoid the wasted send attempt).
//
// Rate-limit per AGENTS.md Rule 4 / TIM-2246: defense in depth on top of
// Supabase's own auth throttling.
//
// All routing logic lives in `./dispatch.ts` so it can be unit-tested without
// the @/ alias boundary; this file is a thin wrapper.

import { NextRequest } from 'next/server';
import { enforceRateLimit, clientIp } from '@/lib/rate-limit';
import {
  extractHeaders,
  verifyStandardWebhook,
} from '@/lib/webhooks/standard-webhooks';
import {
  sendVerifyEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendEmailChangeEmail,
  sendMagicLinkEmail,
} from '@/lib/email/templates';
import {
  dispatchEmailHook,
  type DispatchOutcome,
  type SupabaseEmailHookPayload,
} from './dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Read raw body BEFORE JSON.parse — the standard-webhooks signature is
  // computed over the exact UTF-8 bytes Supabase POSTed.
  const rawBody = await request.text();

  const verify = verifyStandardWebhook({
    secret: process.env.SEND_EMAIL_HOOK_SECRET,
    headers: extractHeaders(request.headers),
    payload: rawBody,
  });
  if (!verify.ok) {
    return Response.json(
      { error: `unauthorized: ${verify.reason}` },
      { status: 401 },
    );
  }

  let payload: SupabaseEmailHookPayload;
  try {
    payload = JSON.parse(rawBody) as SupabaseEmailHookPayload;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const userId = payload.user?.id ?? 'anon';
  const ip = clientIp(request.headers);
  const limited = await enforceRateLimit({
    bucket: 'auth-email-hook',
    id: `${ip}:${userId}`,
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;

  let outcome: DispatchOutcome;
  try {
    outcome = await dispatchEmailHook(payload, {
      sendVerifyEmail,
      sendWelcomeEmail,
      sendPasswordResetEmail,
      sendEmailChangeEmail,
      sendMagicLinkEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `dispatch_threw: ${message.slice(0, 200)}` },
      { status: 500 },
    );
  }

  return outcomeToResponse(outcome);
}

// Translate a dispatch outcome into a Supabase hook response. `{}` tells
// Supabase to SKIP its built-in send. `{ error }` causes Supabase to fall
// BACK to the built-in template — degraded chrome but the user still gets
// the email. We intentionally return `{}` (drop, no fallback) for
// flag-off / unknown-action / configured-skip so users never receive the
// legacy template chrome mid-rollout.
function outcomeToResponse(outcome: DispatchOutcome): Response {
  if (outcome.kind === 'invalid') {
    return Response.json({ error: outcome.reason }, { status: 400 });
  }
  if (outcome.kind === 'skipped') {
    if (outcome.reason === 'unknown_action') {
      console.warn(
        '[auth-email-hook] unknown email_action_type — returning {} so Supabase skips built-in send',
      );
    }
    return Response.json({});
  }
  const { result } = outcome;
  if (result.ok) return Response.json({});
  if (result.skipped) return Response.json({});
  return Response.json(
    { error: `resend_${result.status}: ${result.error.slice(0, 200)}` },
    { status: 502 },
  );
}
