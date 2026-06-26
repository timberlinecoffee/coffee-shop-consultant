// TIM-2366 #25: Credit balance low notice — one-shot/month dedup logic.
//
// The send fn and storage of the "already-notified-this-month" marker are
// dependency-injected so this module stays small, testable, and free of
// JSX-dependent imports. The expected call site after wiring (post-merge,
// separate ticket) is the credit-debit path:
//
//   import { sendCreditBalanceLowEmail }
//     from "@/lib/email/templates/credit-balance-low";
//   await maybeFireCreditBalanceLowNotice({
//     sendNotice: sendCreditBalanceLowEmail,
//     hasNoticedThisMonth: makeSupabaseHasNotice(supabase),
//     markNoticedThisMonth: makeSupabaseMarkNotice(supabase),
//     ...
//   })
//
// Threshold and dedup semantics (per the plan):
//   - Notify when post-debit balance < THRESHOLD (10 credits).
//   - At most ONE notice per (user, calendar-month).
//   - Caller owns email lookup + notice persistence; this module owns the
//     ordering: peek → guard → send → mark. Mark only on send success so a
//     transient Resend failure does not silently swallow the month.

import type { TransactionalSendResult } from './resend-dispatch.ts';

export const CREDIT_BALANCE_LOW_THRESHOLD = 10;

export function monthKeyFor(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export interface CreditBalanceLowSendArgs {
  to: string;
  userId: string;
  monthKey: string;
  props: {
    firstName?: string | null;
    currentBalance: number;
    buyMoreUrl: string;
  };
}

export type SendCreditBalanceLowFn = (
  args: CreditBalanceLowSendArgs,
) => Promise<TransactionalSendResult>;

export interface CreditBalanceMonitorArgs {
  userId: string;
  email: string;
  firstName?: string | null;
  currentBalance: number;
  buyMoreUrl: string;
  // Caller-injected sender so this module has zero JSX-template dependency.
  sendNotice: SendCreditBalanceLowFn;
  // Caller-injected "have we already sent a notice this month?" lookup.
  hasNoticedThisMonth: (userId: string, monthKey: string) => Promise<boolean>;
  // Caller-injected "mark sent" persistence. Called only on send success.
  markNoticedThisMonth: (userId: string, monthKey: string) => Promise<void>;
  // Caller-injected clock so tests + backfills can pin a specific date.
  now?: () => Date;
  // Optional override for the low-balance threshold in credits. Defaults to
  // CREDIT_BALANCE_LOW_THRESHOLD. TIM-3023 wires this from the
  // `CREDIT_LOW_EMAIL_THRESHOLD_USD` env var via a USD → credits conversion.
  threshold?: number;
}

export type CreditBalanceMonitorResult =
  | { status: 'skipped'; reason: 'above_threshold' }
  | { status: 'skipped'; reason: 'already_noticed_this_month' }
  | {
      status: 'sent';
      sendResult: TransactionalSendResult;
      monthKey: string;
    }
  | {
      status: 'send_failed';
      sendResult: TransactionalSendResult;
      monthKey: string;
    };

export async function maybeFireCreditBalanceLowNotice(
  args: CreditBalanceMonitorArgs,
): Promise<CreditBalanceMonitorResult> {
  const threshold = args.threshold ?? CREDIT_BALANCE_LOW_THRESHOLD;
  if (args.currentBalance >= threshold) {
    return { status: 'skipped', reason: 'above_threshold' };
  }

  const monthKey = monthKeyFor((args.now ?? (() => new Date()))());

  const alreadyNoticed = await args.hasNoticedThisMonth(args.userId, monthKey);
  if (alreadyNoticed) {
    return { status: 'skipped', reason: 'already_noticed_this_month' };
  }

  const sendResult = await args.sendNotice({
    to: args.email,
    userId: args.userId,
    monthKey,
    props: {
      firstName: args.firstName ?? null,
      currentBalance: args.currentBalance,
      buyMoreUrl: args.buyMoreUrl,
    },
  });

  if (sendResult.ok) {
    // Persist BEFORE returning so a same-process re-entry can't double-fire.
    await args.markNoticedThisMonth(args.userId, monthKey);
    return { status: 'sent', sendResult, monthKey };
  }

  // skipped-due-to-no-key counts as a "didn't actually mail anyone" — leave the
  // month-marker unmarked so a later well-configured deploy will pick it up.
  return { status: 'send_failed', sendResult, monthKey };
}
