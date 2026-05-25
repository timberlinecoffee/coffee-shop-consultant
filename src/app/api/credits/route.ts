// TIM-866: returns usage state used by the Copilot drawer to show pre-cap indicators.
import { createClient } from "@/lib/supabase/server";

const FREE_TRIAL_COPILOT_LIMIT = 5;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("ai_credits_remaining, copilot_trial_messages_used, subscription_tier, subscription_status")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  const isTrial = profile.subscription_status === "free_trial";

  if (isTrial) {
    const used = profile.copilot_trial_messages_used ?? 0;
    return Response.json({
      mode: "trial",
      trialUsed: used,
      trialLimit: FREE_TRIAL_COPILOT_LIMIT,
      trialRemaining: Math.max(0, FREE_TRIAL_COPILOT_LIMIT - used),
      tier: profile.subscription_tier,
    });
  }

  return Response.json({
    mode: "credits",
    remaining: profile.ai_credits_remaining,
    tier: profile.subscription_tier,
  });
}
