import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function loadWorkspaceContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: plan }, { data: profile }] = await Promise.all([
    supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_tier, copilot_trial_messages_used")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (!plan) {
    redirect("/onboarding");
  }

  const trialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return { planId: plan.id, trialMessagesUsed };
}
