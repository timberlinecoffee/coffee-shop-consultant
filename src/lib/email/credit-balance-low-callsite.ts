// TIM-3023: Call-site wiring for the credit-balance-low monitor.
//
// The pure dependency-injected monitor lives in `./credit-balance-monitor.ts`
// (originally from TIM-2366 PR #152). This module is the boundary between
// that monitor and the credit-mutating code paths: it owns the Supabase
// service-role client, the `credit_low_month_markers` storage adapter, the
// threshold derivation from `CREDIT_LOW_EMAIL_THRESHOLD_USD`, and the
// user-context lookup.
//
// Call sites pass only `(userId, postMutationBalance)`. The helper:
//   1. Short-circuits when `postMutationBalance` is above the threshold.
//   2. Looks up `email` and `full_name` on the `users` row.
//   3. Builds the buy-more URL from `NEXT_PUBLIC_SITE_URL`.
//   4. Delegates to `maybeFireCreditBalanceLowNotice` with sql-backed
//      `hasNoticedThisMonth` / `markNoticedThisMonth` against
//      `credit_low_month_markers`.
//
// Safety: the call is wrapped in try/catch and ALWAYS resolves, never throws.
// A failure in the notice path must not break a debit/grant request flow.
//
// Standing Rule 4 (paid-API rate limit / cost cap): one Resend send per user
// per calendar month is enforced by the (user_id, month_key) PK on the marker
// table — the monitor's mark-only-on-success ordering plus the PK is the
// rate limiter for this dispatch.
//
// The JSX-bearing template is loaded via dynamic `await import()` so this
// module stays out of the `--experimental-strip-types` graph for tests that
// inject their own `sendNotice` stub.

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "../supabase/service.ts";
import {
  CREDIT_BALANCE_LOW_THRESHOLD,
  maybeFireCreditBalanceLowNotice,
  type CreditBalanceMonitorResult,
  type SendCreditBalanceLowFn,
} from "./credit-balance-monitor.ts";

const DEFAULT_THRESHOLD_USD = 1.0;

// $0.099/credit is the Pro tier per-credit cost (TIM-2309: 1,000 credits per
// $99/mo grant). Used as the most conservative USD→credits conversion so a
// $1.00 threshold yields ~10 credits (matches the monitor's existing
// CREDIT_BALANCE_LOW_THRESHOLD default).
const USD_PER_CREDIT = 0.099;

let cachedThreshold: number | null = null;

function computeThresholdCredits(): number {
  if (cachedThreshold !== null) return cachedThreshold;
  const raw = process.env.CREDIT_LOW_EMAIL_THRESHOLD_USD?.trim();
  if (!raw) {
    cachedThreshold = CREDIT_BALANCE_LOW_THRESHOLD;
    return cachedThreshold;
  }
  const usd = Number(raw);
  if (!Number.isFinite(usd) || usd <= 0) {
    cachedThreshold = CREDIT_BALANCE_LOW_THRESHOLD;
    return cachedThreshold;
  }
  cachedThreshold = Math.max(1, Math.round(usd / USD_PER_CREDIT));
  return cachedThreshold;
}

// Test-only hook so the integration test can reset the memoized threshold
// (and pick up env changes set between cases).
export function _resetThresholdCache(): void {
  cachedThreshold = null;
}

// Lazy default sender: only loads the .tsx template at production runtime.
// Tests inject `sendNotice` explicitly so this path is never executed and
// the JSX import stays out of the node --experimental-strip-types graph.
async function defaultSendNotice(
  args: Parameters<SendCreditBalanceLowFn>[0],
): ReturnType<SendCreditBalanceLowFn> {
  const mod = await import("./templates/credit-balance-low.tsx");
  return mod.sendCreditBalanceLowEmail(args);
}

function buildBuyMoreUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
    "https://groundwork.cafe";
  return `${base}/account/credits`;
}

interface UserContext {
  email: string;
  firstName: string | null;
}

async function lookupUser(
  svc: SupabaseClient,
  userId: string,
): Promise<UserContext | null> {
  const { data, error } = await svc
    .from("users")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data?.email) return null;
  const fullName = (data.full_name ?? "").trim();
  const firstName = fullName.length > 0 ? fullName.split(/\s+/)[0] : null;
  return { email: data.email, firstName };
}

export interface NotifyArgs {
  userId: string;
  postMutationBalance: number;
  // Optional overrides for tests + the Stripe webhook (which already has its
  // own service client + can reuse the email it just resolved from the
  // customer object).
  supabase?: SupabaseClient;
  emailOverride?: string;
  firstNameOverride?: string | null;
  // Test-only: bypass the lazy .tsx import.
  sendNotice?: SendCreditBalanceLowFn;
}

export interface NotifyResult {
  status:
    | "skipped_above_threshold"
    | "skipped_no_user"
    | "skipped_internal_error"
    | "delegated";
  monitor?: CreditBalanceMonitorResult;
}

/**
 * Inline boundary: invoke right after a successful mutation of
 * `users.ai_credits_remaining`. Resolves silently on any internal error so a
 * failure in the notice path cannot break the caller's request.
 */
export async function notifyIfCreditBalanceLow(
  args: NotifyArgs,
): Promise<NotifyResult> {
  try {
    const threshold = computeThresholdCredits();
    if (args.postMutationBalance >= threshold) {
      return { status: "skipped_above_threshold" };
    }

    const svc = args.supabase ?? createServiceClient();

    let email = args.emailOverride ?? null;
    let firstName = args.firstNameOverride ?? null;
    if (!email) {
      const ctx = await lookupUser(svc, args.userId);
      if (!ctx) return { status: "skipped_no_user" };
      email = ctx.email;
      firstName = ctx.firstName;
    }

    const monitor = await maybeFireCreditBalanceLowNotice({
      userId: args.userId,
      email,
      firstName,
      currentBalance: args.postMutationBalance,
      threshold,
      buyMoreUrl: buildBuyMoreUrl(),
      sendNotice: args.sendNotice ?? defaultSendNotice,
      hasNoticedThisMonth: async (uid, monthKey) => {
        const { data } = await svc
          .from("credit_low_month_markers")
          .select("user_id")
          .eq("user_id", uid)
          .eq("month_key", monthKey)
          .maybeSingle();
        return Boolean(data);
      },
      markNoticedThisMonth: async (uid, monthKey) => {
        // upsert handles the harmless race where two concurrent debits both
        // see no marker, both send, and the second mark would otherwise
        // collide on the (user_id, month_key) PK. The monitor only calls
        // mark on send-success, so an upsert here cannot mask a real
        // double-send: the PK is the hard limiter.
        await svc
          .from("credit_low_month_markers")
          .upsert(
            { user_id: uid, month_key: monthKey },
            { onConflict: "user_id,month_key", ignoreDuplicates: true },
          );
      },
    });

    return { status: "delegated", monitor };
  } catch (err) {
    // Standing Rule 5: log server-side, never bubble to the caller's request.
    console.error("[TIM-3023] notifyIfCreditBalanceLow failed", err);
    return { status: "skipped_internal_error" };
  }
}

// Export the default constant the env var derives from, so the cap is visible
// to anyone grepping for it.
export { DEFAULT_THRESHOLD_USD };
