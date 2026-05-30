// TIM-1411: Opening Month Plan workspace — tactical week-by-week / day-by-day
// playbook for the weeks before opening through the first 30 days. Distinct
// from Opening Milestones (which tracks gating dated milestones).
//
// Data: reuses `soft_open_plan_items` (day_offset, task, owner, status, notes).
// Buckets: Pre-Open Weeks (-28..-1), Opening Week (0..7), First 30 Days (8..30).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { OpeningMonthPlanWorkspace } from "./opening-month-plan-workspace";

export const dynamic = "force-dynamic";

export default async function OpeningMonthPlanWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/onboarding");

  const planId = plan.id;

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, subscription_tier, copilot_trial_messages_used, beta_waiver_until")
    .eq("id", user.id)
    .maybeSingle();

  const canEdit =
    isSubscriptionActive(profile?.subscription_status ?? "free_trial") ||
    isBetaWaived(profile?.beta_waiver_until ?? null);

  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <OpeningMonthPlanWorkspace
      planId={planId}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
