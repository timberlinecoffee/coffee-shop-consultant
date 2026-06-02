// TIM-866: returns usage state used by the Copilot drawer to show pre-cap indicators.
// TIM-1671: credit-model accounts also get `monthlyGrant` (the tier's monthly
// credit cap) so the in-chat meter can render "X of Y credits".
// TIM-1825: free trial is now a one-time 15-credit grant (not a 5-message
// counter); trial mode reports `remaining`/`grant` credits like paid mode.
import { createClient } from "@/lib/supabase/server";
import { MONTHLY_CREDITS, type Tier } from "@/lib/stripe";
import { TRIAL_GRANT_CREDITS } from "@/lib/access";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("ai_credits_remaining, trial_credits_granted, subscription_tier, subscription_status")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  const isTrial = profile.subscription_status === "free_trial";

  if (isTrial) {
    // The 15-credit grant is applied lazily on the first action (ensureTrialGrant).
    // Until then the stored balance is 0, so report the full grant so the meter
    // shows "15 of 15" before the user's first message.
    const remaining = profile.trial_credits_granted
      ? (profile.ai_credits_remaining ?? 0)
      : TRIAL_GRANT_CREDITS;
    return Response.json({
      mode: "trial",
      remaining,
      grant: TRIAL_GRANT_CREDITS,
      tier: profile.subscription_tier,
    });
  }

  return Response.json({
    mode: "credits",
    remaining: profile.ai_credits_remaining,
    monthlyGrant: MONTHLY_CREDITS[(profile.subscription_tier as Tier) ?? "free"] ?? 0,
    tier: profile.subscription_tier,
  });
}
