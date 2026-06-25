// TIM-1521: shared loader for /workspace/launch-plan/milestones and
// /workspace/launch-plan/opening-month. Mirrors the legacy
// /workspace/opening-month-plan/page.tsx loader so the underlying workspace
// component sees an identical Props payload regardless of which sub-page
// rendered it.
// TIM-2980: switched off inline latest-by-created plan resolver — use canonical
// getActivePlanId (TIM-2377) so SSR planId agrees with users.current_plan_id.
import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import { redirect } from "next/navigation";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { normalizeLaunchPlanConfig } from "@/lib/launch-plan";
import type { Milestone } from "@/lib/launch-plan";

export interface LaunchPlanLoaderResult {
  planId: string;
  initialMilestones: Milestone[];
  initialConfig: ReturnType<typeof normalizeLaunchPlanConfig>;
  initialSourcesUpdatedAt: string | null;
  canEdit: boolean;
  initialTrialMessagesUsed: number | undefined;
}

export async function loadLaunchPlanWorkspaceData(): Promise<LaunchPlanLoaderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) redirect("/onboarding");

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
      .eq("workspace_key", "opening_month_plan")
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used, beta_waiver_until")
      .eq("id", user.id)
      .maybeSingle(),
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

  return {
    planId,
    initialMilestones: (milestonesData ?? []) as Milestone[],
    initialConfig: config,
    initialSourcesUpdatedAt: sourcesUpdatedAt,
    canEdit,
    initialTrialMessagesUsed,
  };
}
