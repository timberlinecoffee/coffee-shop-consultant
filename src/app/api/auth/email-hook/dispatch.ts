// TIM-3022: pure dispatch logic for the Supabase Auth Send-Email hook.
//
// Extracted from `route.ts` so it can be unit-tested without going through
// the Next.js route boundary (which pulls @/-aliased imports that node --test
// can't resolve). The route itself is a thin wrapper: verify signature,
// rate-limit, then hand off to `dispatchEmailHook` here.
//
// TIM-3441 (2026-08-05): two bugs fixed here. Both shipped a confirmation
// email that could not confirm anything.
//
//  1. `signup` sent the WELCOME email, whose only link is the dashboard URL.
//     A signup confirmation email with no token in it. The user clicked it,
//     landed on /auth/callback with no `code`, was bounced to
//     /login?error=auth_failed, and their address stayed unconfirmed — so the
//     next manual login failed with "Email not confirmed". The tell in the
//     Supabase Auth logs: zero /verify requests all day. The link never
//     reached the auth server at all, because it carried nothing to verify.
//
//  2. `buildVerifyUrl` built `${email_data.site_url}/auth/v1/verify`.
//     `site_url` in the hook payload is the project's *Site URL* — this app's
//     own domain — not the Supabase API domain. That produced
//     https://groundwork.cafe/auth/v1/verify, a 404 in this Next app, which
//     silently broke password reset, magic link, and email change too.
//
// The fix removes the dependency on both `site_url` and the Supabase-hosted
// /auth/v1/verify endpoint. Every email now links at our own /auth/confirm
// route, which calls `verifyOtp({ type, token_hash })` server-side and writes
// the session cookies itself. That is the documented @supabase/ssr pattern,
// and it keeps the user on the exact origin they started from — which the
// apex-vs-www cookie problem in TIM-3327 makes load-bearing here.
//
// The welcome email moved to /auth/confirm, where it goes out AFTER the
// address is actually confirmed — which is also the moment its subject line,
// "Your Groundwork trial is live", becomes true.

import type { TransactionalSendResult } from '../../../../lib/email/resend-dispatch.ts';
import type {
  VerifyEmailProps,
  PasswordResetProps,
  EmailChangeProps,
  MagicLinkProps,
} from '../../../../lib/email/templates/index.ts';

export interface SupabaseEmailHookPayload {
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown> | null;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type:
      | 'signup'
      | 'invite'
      | 'magiclink'
      | 'recovery'
      | 'email_change'
      | 'email'
      | string;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
    new_email?: string;
  };
}

export interface DispatchSenders {
  sendVerifyEmail: (args: {
    to: string;
    userId: string;
    props: VerifyEmailProps;
  }) => Promise<TransactionalSendResult>;
  sendPasswordResetEmail: (args: {
    to: string;
    userId: string;
    props: PasswordResetProps;
  }) => Promise<TransactionalSendResult>;
  sendEmailChangeEmail: (args: {
    to: string;
    userId: string;
    props: EmailChangeProps;
  }) => Promise<TransactionalSendResult>;
  sendMagicLinkEmail: (args: {
    to: string;
    userId: string;
    props: MagicLinkProps;
  }) => Promise<TransactionalSendResult>;
}

export type DispatchOutcome =
  | { kind: 'sent'; result: TransactionalSendResult }
  | { kind: 'skipped'; reason: 'magic_link_flag_off' | 'unknown_action' }
  | {
      kind: 'invalid';
      reason: 'missing_user_email' | 'missing_token_hash' | 'missing_origin';
    };

export function firstNameFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta) return null;
  const candidates = ['first_name', 'given_name', 'firstName'];
  for (const key of candidates) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const full = meta['full_name'] ?? meta['name'];
  if (typeof full === 'string' && full.trim()) {
    return full.trim().split(/\s+/)[0] ?? null;
  }
  return null;
}

// Where the confirmation link should point. `redirect_to` is the strongest
// signal because it descends from `window.location.origin` at the moment the
// user submitted the form, so it keeps them on the host whose cookies they
// already hold (TIM-3327: host-only cookies set on www are invisible on apex).
// NEXT_PUBLIC_SITE_URL is the deployment's own idea of itself. `site_url` —
// the project's configured Site URL — is the last resort, and is the value
// that caused bug 2 above when it was trusted as an API base.
export function appOriginFrom(
  emailData: SupabaseEmailHookPayload['email_data'],
): string | null {
  const candidates = [
    emailData.redirect_to,
    process.env.NEXT_PUBLIC_SITE_URL,
    emailData.site_url,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // Not a parseable absolute URL — try the next candidate.
    }
  }
  return null;
}

// Landing page per action, once the token has been exchanged for a session.
// Every value here must survive `resolveNext`'s allowlist or /auth/confirm
// will silently drop it — dispatch.test.mjs asserts that agreement, so a typo
// here fails the suite instead of quietly dumping users on /dashboard.
//
// This map doubles as the supported-action list: an action_type that is not a
// key here is `unknown_action`, and no email is sent.
export const NEXT_BY_ACTION: Record<string, string> = {
  signup: '/onboarding',
  invite: '/onboarding',
  email: '/onboarding',
  recovery: '/reset-password',
  magiclink: '/dashboard',
  email_change: '/account',
};

export function buildConfirmUrl(
  emailData: SupabaseEmailHookPayload['email_data'],
  opts: { useNewTokenHash?: boolean } = {},
): string | null {
  const origin = appOriginFrom(emailData);
  if (!origin) return null;

  const tokenHash = opts.useNewTokenHash
    ? emailData.token_hash_new
    : emailData.token_hash;
  // A confirmation link with no token is precisely the bug this file was
  // rewritten for. Refuse to build one rather than mail a dead button.
  if (!tokenHash) return null;

  const params = new URLSearchParams();
  params.set('token_hash', tokenHash);
  params.set('type', emailData.email_action_type);
  const next = NEXT_BY_ACTION[emailData.email_action_type];
  if (next) params.set('next', next);

  return `${origin}/auth/confirm?${params.toString()}`;
}

export function isMagicLinkFlagOn(): boolean {
  const raw = (process.env.NEXT_PUBLIC_FEATURE_MAGIC_LINK ?? '')
    .replace(/\n/g, '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

export async function dispatchEmailHook(
  payload: SupabaseEmailHookPayload,
  senders: DispatchSenders,
): Promise<DispatchOutcome> {
  const to = payload.user?.email;
  if (!to) return { kind: 'invalid', reason: 'missing_user_email' };

  const userId = payload.user?.id ?? 'anon';
  const firstName = firstNameFromMetadata(payload.user.user_metadata);
  const emailData = payload.email_data;
  const action = emailData?.email_action_type;

  // Magic link is gated. Check before building anything, so a flag-off
  // project never reports a token failure for a mail it was never going to
  // send.
  if (action === 'magiclink' && !isMagicLinkFlagOn()) {
    return { kind: 'skipped', reason: 'magic_link_flag_off' };
  }

  if (!NEXT_BY_ACTION[action]) {
    return { kind: 'skipped', reason: 'unknown_action' };
  }

  // `email_change` fires twice — once to the old address, once to the new one.
  // The mail going TO the new address must carry the new token hash.
  const isNewAddress =
    action === 'email_change' &&
    emailData.new_email !== undefined &&
    payload.user.email === emailData.new_email;

  const confirmUrl = buildConfirmUrl(emailData, {
    useNewTokenHash: isNewAddress,
  });
  if (!confirmUrl) {
    return {
      kind: 'invalid',
      reason: appOriginFrom(emailData) ? 'missing_token_hash' : 'missing_origin',
    };
  }

  switch (action) {
    case 'signup':
    case 'invite':
    case 'email': {
      // The welcome email is NOT sent here — see the header note. It goes out
      // from /auth/confirm once the address is genuinely confirmed.
      const result = await senders.sendVerifyEmail({
        to,
        userId,
        props: { firstName, verifyUrl: confirmUrl },
      });
      return { kind: 'sent', result };
    }
    case 'recovery': {
      const result = await senders.sendPasswordResetEmail({
        to,
        userId,
        props: { firstName, resetUrl: confirmUrl },
      });
      return { kind: 'sent', result };
    }
    case 'email_change': {
      const result = await senders.sendEmailChangeEmail({
        to,
        userId,
        props: {
          firstName,
          oldEmail: payload.user.email ?? '',
          newEmail: emailData.new_email ?? payload.user.email ?? '',
          confirmUrl,
        },
      });
      return { kind: 'sent', result };
    }
    case 'magiclink': {
      const result = await senders.sendMagicLinkEmail({
        to,
        userId,
        props: { firstName, magicLinkUrl: confirmUrl },
      });
      return { kind: 'sent', result };
    }
    default:
      return { kind: 'skipped', reason: 'unknown_action' };
  }
}
