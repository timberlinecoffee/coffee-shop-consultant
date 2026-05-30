// TIM-1411: Opening Milestones workspace — backward-scheduled milestones with
// AI generation, regenerate-when-stale banner, list + calendar views.
// (Renamed from the old Launch Plan workspace; tactical week-by-week content
// now lives in Opening Month Plan at /workspace/opening-month-plan.)
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { normalizeLaunchPlanConfig } from "@/lib/launch-plan";
import { OpeningMilestonesWorkspace } from "./opening-milestones-workspace";
import type { Milestone } from "@/lib/launch-plan";

export const dynamic = "force-dynamic";

export default async function OpeningMilestonesWorkspacePage() {
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

  const [
    { data: milestonesData },
    { data: configDoc },
    { data: profile },
    { data: sourceDocs },
  ] = await Promise.all([
    supabase
      .from("launch_milestones")
      .select("*")
      .eq("plan_id", planId)
      .order("order_index", { ascending: true })
      .order("target_date", { ascending: true }),
    supabase
      .from("workspace_documents")
      .select("content, updated_at")
      .eq("plan_id", planId)
      .eq("workspace_key", "opening_milestones")
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used, beta_waiver_until")
      .eq("id", user.id)
      .maybeSingle(),
    // Source workspaces that inform the milestones — track their latest update to detect stale plans.
    supabase
      .from("workspace_documents")
      .select("workspace_key, updated_at")
      .eq("plan_id", planId)
      .in("workspace_key", ["concept", "location_lease", "buildout_equipment", "hiring", "financials"]),
  ]);

  const config = normalizeLaunchPlanConfig(configDoc?.content);

  const sourcesUpdatedAt =
    sourceDocs && sourceDocs.length > 0
      ? sourceDocs.reduce<string | null>((max, d) => {
          if (!max) return d.updated_at;
          return d.updated_at > max ? d.updated_at : max;
        }, null)
      : null;

  const canEdit =
    isSubscriptionActive(profile?.subscription_status ?? "free_trial") ||
    isBetaWaived(profile?.beta_waiver_until ?? null);

  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <OpeningMilestonesWorkspace
      planId={planId}
      initialMilestones={(milestonesData ?? []) as Milestone[]}
      initialConfig={config}
      initialSourcesUpdatedAt={sourcesUpdatedAt}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
