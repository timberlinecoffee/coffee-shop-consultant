// TIM-3022: pure dispatch logic for the Supabase Auth Send-Email hook.
//
// Extracted from `route.ts` so it can be unit-tested without going through
// the Next.js route boundary (which pulls @/-aliased imports that node --test
// can't resolve). The route itself is a thin wrapper: verify signature,
// rate-limit, then hand off to `dispatchEmailHook` here.

import type { TransactionalSendResult } from '../../../../lib/email/resend-dispatch.ts';
import type {
  VerifyEmailProps,
  WelcomeEmailProps,
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
  sendWelcomeEmail: (args: {
    to: string;
    userId: string;
    props: WelcomeEmailProps;
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
  | { kind: 'invalid'; reason: 'missing_user_email' };

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

export function buildVerifyUrl(
  emailData: SupabaseEmailHookPayload['email_data'],
  opts: { useNewTokenHash?: boolean } = {},
): string {
  const siteUrl = (emailData.site_url ?? '').replace(/\/+$/, '');
  const tokenHash = opts.useNewTokenHash
    ? emailData.token_hash_new
    : emailData.token_hash;
  const params = new URLSearchParams();
  if (tokenHash) params.set('token', tokenHash);
  if (emailData.email_action_type) {
    params.set('type', emailData.email_action_type);
  }
  if (emailData.redirect_to) params.set('redirect_to', emailData.redirect_to);
  return `${siteUrl}/auth/v1/verify?${params.toString()}`;
}

export function buildDashboardUrl(
  emailData: SupabaseEmailHookPayload['email_data'],
): string {
  if (emailData.redirect_to) return emailData.redirect_to;
  const siteUrl = (emailData.site_url ?? '').replace(/\/+$/, '');
  return `${siteUrl}/dashboard`;
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
  const action = payload.email_data?.email_action_type;

  switch (action) {
    case 'signup': {
      const result = await senders.sendWelcomeEmail({
        to,
        userId,
        props: {
          firstName,
          dashboardUrl: buildDashboardUrl(payload.email_data),
        },
      });
      return { kind: 'sent', result };
    }
    case 'email': {
      const result = await senders.sendVerifyEmail({
        to,
        userId,
        props: { firstName, verifyUrl: buildVerifyUrl(payload.email_data) },
      });
      return { kind: 'sent', result };
    }
    case 'recovery': {
      const result = await senders.sendPasswordResetEmail({
        to,
        userId,
        props: { firstName, resetUrl: buildVerifyUrl(payload.email_data) },
      });
      return { kind: 'sent', result };
    }
    case 'email_change': {
      const isNewAddress =
        payload.email_data.new_email !== undefined &&
        payload.user.email === payload.email_data.new_email;
      const result = await senders.sendEmailChangeEmail({
        to,
        userId,
        props: {
          firstName,
          oldEmail: payload.user.email ?? '',
          newEmail: payload.email_data.new_email ?? payload.user.email ?? '',
          confirmUrl: buildVerifyUrl(payload.email_data, {
            useNewTokenHash: isNewAddress,
          }),
        },
      });
      return { kind: 'sent', result };
    }
    case 'magiclink': {
      if (!isMagicLinkFlagOn()) {
        return { kind: 'skipped', reason: 'magic_link_flag_off' };
      }
      const result = await senders.sendMagicLinkEmail({
        to,
        userId,
        props: {
          firstName,
          magicLinkUrl: buildVerifyUrl(payload.email_data),
        },
      });
      return { kind: 'sent', result };
    }
    default:
      return { kind: 'skipped', reason: 'unknown_action' };
  }
}
