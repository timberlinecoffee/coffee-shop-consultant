// TIM-1546: Returns the current user's billing status so the /account/billing
// page can render the paused-state card without relying on URL params.
// TIM-1902: also surfaces the 7-day trial window (trial_ends_at) and the dunning
// stamp (past_due_since) so the billing UI can render the trial countdown and
// the update-payment banner.

import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const TIER_MONTHLY_CENTS: Record<string, number> = {
  starter: PLANS.starter_monthly.amount,
  pro: PLANS.pro_monthly.amount,
};

function centsToDollars(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, subscription_tier, paused_from_tier, trial_ends_at, past_due_since, ai_credits_remaining")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  const resumeTier = profile.paused_from_tier ?? profile.subscription_tier;
  const resumePriceCents = resumeTier ? (TIER_MONTHLY_CENTS[resumeTier] ?? null) : null;

  // TIM-1903: a Starter-bound trialist is a user who is still in their 7-day
  // trial (subscription_status='free_trial') but picked Starter at signup.
  // They have temporary Pro access (effectivePlanForGating returns 'pro' in
  // this state) but will lose Pro-only features on conversion. Client
  // surfaces use this flag to show the in-feature upgrade prompt as an
  // informational nudge while the trial is still live.
  const starterBoundTrialist =
    profile.subscription_status === "free_trial" &&
    profile.subscription_tier === "starter" &&
    profile.trial_ends_at !== null &&
    new Date(profile.trial_ends_at) > new Date();

  return Response.json({
    status: profile.subscription_status,
    tier: profile.subscription_tier,
    pausedFromTier: profile.paused_from_tier ?? null,
    resumeTier: resumeTier ?? null,
    resumePrice: resumePriceCents !== null ? centsToDollars(resumePriceCents) : null,
    trialEndsAt: profile.trial_ends_at ?? null,
    pastDueSince: profile.past_due_since ?? null,
    creditsRemaining: profile.ai_credits_remaining ?? null,
    starterBoundTrialist,
  });
}
