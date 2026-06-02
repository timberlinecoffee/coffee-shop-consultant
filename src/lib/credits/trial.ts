// TIM-1825: one-time free-trial credit grant.
//
// Free-trial users get a single grant of TRIAL_GRANT_CREDITS (15) credits into
// the same `ai_credits_remaining` balance paid tiers use, then spend it
// per-action via the variable credit model (src/lib/credits/cost.ts). The grant
// is applied lazily on the first credit-gated action and made idempotent by the
// `users.trial_credits_granted` boolean — so it lands exactly once whether the
// user signed up before or after this shipped, and never re-grants.
//
// Why lazy (vs. at signup): it makes the API self-sufficient and
// deploy-order-independent — existing trial users (ai_credits_remaining = 0)
// are topped up on their next action without a backfill, and the only schema
// dependency is the additive `trial_credits_granted` column.
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRIAL_GRANT_CREDITS } from "../access.ts";

export interface TrialGrantProfile {
  ai_credits_remaining: number | null;
  trial_credits_granted?: boolean | null;
}

/**
 * Ensure a free-trial user has received their one-time credit grant. Returns
 * the user's credit balance after any grant (so callers can gate/debit against
 * a fresh value without re-reading). No-op (and no write) once granted.
 *
 * MUST be called with a service-role client — RLS blocks users from mutating
 * their own `ai_credits_remaining` / `trial_credits_granted`.
 */
export async function ensureTrialGrant(
  svc: SupabaseClient,
  userId: string,
  profile: TrialGrantProfile,
): Promise<number> {
  const current = profile.ai_credits_remaining ?? 0;
  if (profile.trial_credits_granted) return current;

  const granted = current + TRIAL_GRANT_CREDITS;
  await svc
    .from("users")
    .update({ ai_credits_remaining: granted, trial_credits_granted: true })
    .eq("id", userId);
  await svc.from("credit_transactions").insert({
    user_id: userId,
    amount: TRIAL_GRANT_CREDITS,
    type: "trial_grant",
    description: `Free trial — ${TRIAL_GRANT_CREDITS} Scout credits`,
  });
  return granted;
}
