// TIM-4101 (T1-A): Shared cross-suite conflict detection.
//
// Extracted verbatim from the GET half of
// src/app/api/copilot/cross-suite-resolver/route.ts so that BOTH the
// resolver API route (which powers the amber "Resolve plan conflict" badge
// inside a workspace) and the Home dashboard overview read from the SAME
// detectors.
//
// Why this module exists: before T1-A there were two independent conflict
// systems. Home derived its "Your plan looks good" verdict from a cached
// business-plan self-consistency report, while the workspace badge ran these
// live cross-suite detectors. Neither knew about the other, so Home could
// render a green all-clear while Financials simultaneously showed a conflict
// badge. There is now exactly one source of truth for cross-suite conflicts,
// and it is this file.
//
// The reads and detector wiring below are unchanged behaviour — this is a
// move, not a rewrite. Only the supabase client parameter is widened to the
// generic SupabaseClient type so a Server Component (the dashboard) can call
// it with the same client it already holds.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPlanState } from "@/lib/business-plan/plan-state";
import { loadBenchmarks } from "@/lib/business-plan/benchmarks";
import { detectHiringFinancialsConflict } from "@/lib/cross-suite/hiring-financials";
import { detectMenuTicketMismatch } from "@/lib/cross-suite/menu-ticket";
import { detectEquipmentMismatch } from "@/lib/cross-suite/equipment-financials";
import { blendedTicketCentsFromMenu } from "@/lib/menu";
import type { CrossSuiteConflict } from "@/lib/cross-suite/types";
import type {
  BpLocationCandidate,
  BpEquipmentItem,
  BpHiringRole,
} from "@/lib/business-plan";
import {
  computeMenuBlendedCogsPct,
  groupMenuItemsByCategory,
  computeCogsGrandTotalMonthlyCents,
  normalizeMonthlyProjections,
  type MenuItemForCogs,
} from "@/lib/financial-projection";
import { normalizeConceptV2 } from "@/lib/concept";


// Read every input the registered resolvers need. A single pass keeps
// per-conflict queries from fanning out.
export async function readCrossSuiteInputs(
  supabase: SupabaseClient,
  planId: string,
) {
  const [
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: hiringRows },
    { data: conceptDoc },
    { data: financialModel },
    { data: planRow },
  ] = await Promise.all([
    supabase.from("location_candidates")
      .select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes, city, country")
      .eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items")
      .select("id, name, cost_local, category, notes")
      .eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs")
      .select("id, name, category_id, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived")
      .eq("plan_id", planId).order("position"),
    supabase.from("hiring_plan_roles")
      .select("id, role_title, headcount, start_date, monthly_cost_cents")
      .eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents")
      .select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("financial_models")
      .select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
    supabase.from("coffee_shop_plans")
      .select("plan_name").eq("id", planId).maybeSingle(),
  ]);

  const shopName = planRow?.plan_name ?? "this coffee shop";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);
  const menuCogsByCategory = groupMenuItemsByCategory((menuRows ?? []) as MenuItemForCogs[]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mpForCogs = normalizeMonthlyProjections((financialModel as any)?.monthly_projections);
  const cogsGrandTotalMonthlyCents = computeCogsGrandTotalMonthlyCents(mpForCogs, menuCogsByCategory) || null;
  const concept = normalizeConceptV2(conceptDoc?.content);
  const competitors = (concept.competitors ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address ?? null,
    what_they_do_well: c.what_they_do_well ?? null,
    gaps: c.gaps ?? null,
  }));
  const noDirectCompetitorsIdentified = concept.no_direct_competitors_identified ?? false;
  const locArr = (locationRows ?? []) as Array<{ city?: string | null; address?: string | null; status?: string | null }>;
  const cityCandidate = locArr.find((l) => l.status === "signed") ?? locArr[0] ?? null;
  const cityLabel = cityCandidate?.city?.trim() || null;

  const planState = buildPlanState({
    shopName,
    financialModel,
    locationCandidates: (locationRows ?? []) as BpLocationCandidate[],
    equipment: (equipmentRows ?? []) as BpEquipmentItem[],
    hiringRoles: (hiringRows ?? []) as BpHiringRole[],
    menuBlendedCogsPct,
    cogsGrandTotalMonthlyCents,
    competitors,
    noDirectCompetitorsIdentified,
    cityLabel,
  });

  // TIM-2482 (F13): expose menu rows + forecast_inputs.avg_ticket_cents so the
  // menu↔ticket detector can compute the blend and compare to the live
  // forecast value (the value driving every revenue projection downstream).
  const menuRowsTyped = (menuRows ?? []) as Array<{
    id: string;
    name: string | null;
    price_cents: number | null;
    expected_popularity: "low" | "medium" | "high" | null;
    archived: boolean | null;
  }>;
  const forecastAvgTicketCents = Math.max(
    0,
    Math.round(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Number((financialModel?.forecast_inputs as any)?.avg_ticket_cents ?? 0),
    ),
  );

  // TIM-2481 (F12): buildout grid total + financials startup_costs.equipment.
  // cost_local is a NUMERIC generated column = unit_cost_cents * quantity / 100
  // (dollars). Multiply by 100 + round to recover cents.
  const equipmentRowsTyped = (equipmentRows ?? []) as Array<{
    id: string;
    name: string | null;
    cost_local: number | string | null;
  }>;
  const buildoutGridTotalCents = equipmentRowsTyped.reduce(
    (acc, e) => acc + Math.round(Number(e.cost_local ?? 0) * 100),
    0,
  );
  const buildoutItemCount = equipmentRowsTyped.filter(
    (e) => Number(e.cost_local ?? 0) > 0,
  ).length;
  const financialsEquipmentCents = Math.max(
    0,
    Math.round(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Number((financialModel?.startup_costs as any)?.equipment_cents ?? 0),
    ),
  );

  return {
    planState,
    hiringRows: (hiringRows ?? []) as Array<{
      id: string;
      role_title: string;
      headcount: number;
      start_date: string | null;
      monthly_cost_cents: number | null;
    }>,
    menuRows: menuRowsTyped,
    forecastAvgTicketCents,
    buildoutGridTotalCents,
    buildoutItemCount,
    financialsEquipmentCents,
  };
}

// Pull the labor benchmark band (28–35%) into the {min,max,source} the
// detector expects. Returns null when the dataset doesn't have a parseable
// labor entry — detector will then hide zone 3.
export function laborPctBand() {
  const ds = loadBenchmarks();
  const b = ds.benchmarks.find((x) => x.key === "coffee_shop_labor_pct");
  if (!b) return null;
  const m = b.value_range.replace(/%/g, "").match(/(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const minRaw = Number(m[1]);
  const maxRaw = Number(m[2]);
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return null;
  return {
    min: Math.min(minRaw, maxRaw) / 100,
    max: Math.max(minRaw, maxRaw) / 100,
    source: b.source ?? "Industry benchmark",
  };
}

// Run every registered resolver against the gathered inputs. Each resolver
// either returns one CrossSuiteConflict or null (no contradiction → no
// surface). Returning null is normal: the modal only fires when there's a
// real conflict to walk the owner through.
export function runCrossSuiteResolvers(
  args: Awaited<ReturnType<typeof readCrossSuiteInputs>>,
): CrossSuiteConflict[] {
  const out: CrossSuiteConflict[] = [];

  // Hiring ↔ Financials — first pair (UX spec §11 / TIM-2426 immediate scope).
  // Y1 annual revenue → monthly. plan_state.years is empty until the engine
  // ran a forecast; fall back to 0 → benchmark hidden by detector.
  const y1AnnualCents = args.planState.years?.[0]?.revenue_cents ?? 0;
  const monthlyRevenueCents = Math.round(y1AnnualCents / 12);
  const hf = detectHiringFinancialsConflict({
    hiringRoles: args.hiringRows.map((r) => ({
      id: r.id,
      role_title: r.role_title ?? "Untitled role",
      headcount: r.headcount ?? 0,
      monthly_cost_cents: r.monthly_cost_cents ?? null,
      start_date: r.start_date ?? null,
    })),
    financialsLabor: {
      total_headcount: args.planState.labor.total_headcount,
      monthly_loaded_cost_cents: args.planState.labor.monthly_loaded_cost_cents,
    },
    monthlyRevenueCents,
    laborPctBand: laborPctBand(),
    currencyCode: args.planState.meta.currency_code || "USD",
  });
  if (hf) out.push(hf);

  // TIM-2482 (F13): Menu blended ticket ↔ Forecast Inputs avg ticket.
  // Popularity-weighted blend lives in menu.ts; detector decides whether the
  // drift is meaningful (5% rel AND 25¢ abs) and returns null when not.
  const activeMenu = args.menuRows.filter(
    (r) => !r.archived && (r.price_cents ?? 0) > 0,
  );
  const menuBlendedTicketCents = blendedTicketCentsFromMenu(
    activeMenu.map((r) => ({
      id: r.id,
      price_cents: r.price_cents ?? 0,
      expected_popularity: r.expected_popularity,
      archived: r.archived ?? false,
    })),
  );
  const mt = detectMenuTicketMismatch({
    menuBlendedTicketCents,
    forecastAvgTicketCents: args.forecastAvgTicketCents,
    activeMenuItemCount: activeMenu.length,
    currencyCode: args.planState.meta.currency_code || "USD",
  });
  if (mt) out.push(mt);

  // TIM-2481 (F12): Buildout grid total ↔ Financials startup_costs.equipment.
  // Tolerance constants live in equipment-financials.ts; the detector returns
  // null when the grid is empty, the financials line is 0, or the drift is
  // under tolerance.
  const eq = detectEquipmentMismatch({
    buildoutGridTotalCents: args.buildoutGridTotalCents,
    financialsEquipmentCents: args.financialsEquipmentCents,
    activeBuildoutItemCount: args.buildoutItemCount,
    currencyCode: args.planState.meta.currency_code || "USD",
  });
  if (eq) out.push(eq);

  return out;
}

// One-call convenience wrapper: read the inputs, run every registered
// detector, return the conflicts. This is what both callers use.
export async function detectCrossSuiteConflicts(
  supabase: SupabaseClient,
  planId: string,
): Promise<CrossSuiteConflict[]> {
  const inputs = await readCrossSuiteInputs(supabase, planId);
  return runCrossSuiteResolvers(inputs);
}
