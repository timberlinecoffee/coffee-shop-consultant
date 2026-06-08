// TIM-2449: load the plan-side inputs (concept, financials, menu, etc.) the
// verdict engine needs to derive a WorkspaceProfile. Mirrors the snapshot the
// AI Companion benchmark route already builds in /api/companion/benchmark, so
// the two stay in lock-step.
//
// The caller has already authorized the user against the plan; this module
// only does the read.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BpEquipmentItem,
  BpHiringRole,
  BpLocationCandidate,
} from "../business-plan.ts";
import { buildPlanState } from "../business-plan/plan-state.ts";
import { computeMenuBlendedCogsPct } from "../financial-projection.ts";
import { normalizeConceptV2 } from "../concept.ts";
import type { PlanState } from "../business-plan/plan-state.ts";

export interface WorkspaceInputs {
  planState: PlanState;
  conceptContent: Record<string, unknown> | null;
  onboardingData: Record<string, unknown> | null;
  menuRows: ReadonlyArray<{
    price_cents: number | null;
    expected_mix_pct?: number | null;
    archived?: boolean | null;
    computed_cogs_cents?: number | null;
    cogs_cents?: number | null;
  }>;
}

export async function loadWorkspaceInputs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  planId: string,
  userId: string,
): Promise<WorkspaceInputs | { error: "no_plan" }> {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!plan) return { error: "no_plan" };

  const [
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: hiringRows },
    { data: conceptDoc },
    { data: financialModel },
    { data: userProfile },
  ] = await Promise.all([
    supabase
      .from("location_candidates")
      .select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes, city, country")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position"),
    supabase
      .from("buildout_equipment_items")
      .select("id, name, cost_usd, category, notes")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position"),
    supabase
      .from("menu_items_with_cogs")
      .select(
        "id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived",
      )
      .eq("plan_id", planId)
      .order("position"),
    supabase
      .from("hiring_plan_roles")
      .select("id, role_title, headcount, start_date, monthly_cost_cents, status")
      .eq("plan_id", planId)
      .order("created_at"),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("financial_models")
      .select("forecast_inputs, monthly_projections, startup_costs")
      .eq("plan_id", planId)
      .maybeSingle(),
    supabase.from("users").select("onboarding_data").eq("id", userId).maybeSingle(),
  ]);

  const shopName = plan.plan_name ?? "this coffee shop";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);
  const concept = normalizeConceptV2(conceptDoc?.content);
  const competitors = (concept.competitors ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address ?? null,
    what_they_do_well: c.what_they_do_well ?? null,
    gaps: c.gaps ?? null,
  }));
  const noDirectCompetitorsIdentified = concept.no_direct_competitors_identified ?? false;
  const locArr = (locationRows ?? []) as Array<{
    city?: string | null;
    address?: string | null;
    status?: string | null;
  }>;
  const cityCandidate = locArr.find((l) => l.status === "signed") ?? locArr[0] ?? null;
  const cityLabel = cityCandidate?.city?.trim() || null;

  const planState = buildPlanState({
    shopName,
    financialModel,
    locationCandidates: (locationRows ?? []) as BpLocationCandidate[],
    equipment: (equipmentRows ?? []) as BpEquipmentItem[],
    hiringRoles: (hiringRows ?? []) as BpHiringRole[],
    menuBlendedCogsPct,
    competitors,
    noDirectCompetitorsIdentified,
    cityLabel,
  });

  return {
    planState,
    conceptContent: (conceptDoc?.content ?? null) as Record<string, unknown> | null,
    onboardingData: (userProfile?.onboarding_data ?? null) as Record<string, unknown> | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    menuRows: (menuRows ?? []) as any[],
  };
}
