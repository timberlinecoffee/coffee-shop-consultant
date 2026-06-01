// TIM-1546: Returns the current user's billing status so the /account/billing
// page can render the paused-state card without relying on URL params.

import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const TIER_MONTHLY_CENTS: Record<string, number> = {
  starter: PLANS.starter_monthly.amount,
  growth: PLANS.growth_monthly.amount,
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
    .select("subscription_status, subscription_tier, paused_from_tier")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  const resumeTier = profile.paused_from_tier ?? profile.subscription_tier;
  const resumePriceCents = resumeTier ? (TIER_MONTHLY_CENTS[resumeTier] ?? null) : null;

  return Response.json({
    status: profile.subscription_status,
    tier: profile.subscription_tier,
    pausedFromTier: profile.paused_from_tier ?? null,
    resumeTier: resumeTier ?? null,
    resumePrice: resumePriceCents !== null ? centsToDollars(resumePriceCents) : null,
  });
}
