// TIM-1037: Business Plan data assembly endpoint.
// Loads all suite data and returns per-section assembled content + user overrides.

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import {
  BUSINESS_PLAN_SECTIONS,
  assembleCompanyConcept,
  assembleTargetMarket,
  assembleExecutionOperations,
  assembleExecutionMarketingSales,
  assembleOperationsLaunch,
  assembleTeamHiring,
  assembleFinancialPlan,
  // TIM-2341: lender-ready section assemblers.
  assembleUnitEconomicsSection,
  assembleBreakEvenSection,
  assembleSensitivitySection,
  assembleDscrSection,
  assembleCapexScheduleSection,
  assembleDepreciationScheduleSection,
  assembleWorkingCapitalSection,
  assembleRisksPlaceholderSection,
  type BusinessPlanSectionData,
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpMenuItem,
  type BpLaunchItem,
  type BpHiringRole,
  toBpMarketingPlanning,
} from "@/lib/business-plan";
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection";
// TIM-2341: build plan_state so we can render the lender-metrics auto-content
// from the same single source of truth the regenerate-all path uses.
import { buildPlanState } from "@/lib/business-plan/plan-state";
import { loadPlanContext } from "@/lib/plan-context";

export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  const planId = plan.id;

  const [
    { data: conceptDoc },
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: launchRows },
    { data: hiringRows },
    { data: marketingDoc },
    { data: financialModel },
    { data: savedSections },
    planContext,
  ] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    // TIM-2341: also load city + country so plan_state can resolve the region
    // and the lender-metrics block reflects the regional tax/lender posture.
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
      // TIM-1694: also select cogs/mix columns so Financials → Cost of Goods can
      // resolve the blended menu COGS pct (menu→COGS auto-sync on load).
      .select(
        "id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived"
      )
      .eq("plan_id", planId)
      .order("position"),
    supabase
      .from("launch_timeline_items")
      .select("id, milestone, target_date, status")
      .eq("plan_id", planId)
      .order("order_index"),
    supabase
      .from("hiring_plan_roles")
      .select("id, role_title, headcount, start_date, monthly_cost_cents, status")
      .eq("plan_id", planId)
      .order("created_at"),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "marketing")
      .maybeSingle(),
    supabase
      .from("financial_models")
      .select("forecast_inputs, monthly_projections, startup_costs")
      .eq("plan_id", planId)
      .maybeSingle(),
    supabase
      .from("business_plan_sections")
      .select("section_key, user_content, is_visible")
      .eq("plan_id", planId),
    // TIM-2341: load plan context (country / city / competitors) so plan_state
    // resolves the region for the lender-metrics block.
    loadPlanContext(supabase, user.id),
  ]);

  const savedMap = new Map(
    (savedSections ?? []).map((s) => [s.section_key, s])
  );

  // TIM-1694: menu→COGS sync. Blended pct feeds the Financials section so
  // menu-linked COGS lines resolve against live menu costing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);

  // TIM-2341: assemble plan_state ONCE so the lender-ready sections render
  // from the same engine slices the financial tables read. If the financial
  // model isn't filled in, plan_state still builds (lender_metrics will reflect
  // engine defaults; the section assemblers will note that the financials are
  // empty rather than render a misleading number).
  const planState = buildPlanState({
    shopName: plan.plan_name ?? "this coffee shop",
    financialModel,
    locationCandidates: (locationRows ?? []) as BpLocationCandidate[],
    equipment: (equipmentRows ?? []) as BpEquipmentItem[],
    hiringRoles: (hiringRows ?? []) as BpHiringRole[],
    menuBlendedCogsPct,
    locationCountry: planContext.location_country,
    competitors: planContext.competitors,
    noDirectCompetitorsIdentified: planContext.no_direct_competitors_identified,
    cityLabel: planContext.city_label,
  });
  const currencyCode = planState.meta.currency_code;
  const lenderMetrics = financialModel ? planState.lender_metrics : null;

  // TIM-1498: two-level taxonomy. Subsections with no auto-assembled content
  // (Problem & Solution, Competition, Financing) render the click-to-generate
  // placeholder and rely on the AI generator route to fill them in.
  const autoContent: Record<string, string> = {
    "executive-summary": savedMap.get("executive-summary")?.user_content ??
      "Click Generate to create an AI-written executive summary from your completed suite data.",
    "opportunity-problem-solution":
      "Click Generate to draft this section from your plan data.",
    "opportunity-target-market": assembleTargetMarket(conceptDoc?.content),
    "opportunity-competition":
      "Click Generate to identify the most relevant competitors in your catchment area.",
    "opportunity-risks": assembleRisksPlaceholderSection(),
    "execution-marketing-sales": assembleExecutionMarketingSales(
      (menuRows ?? []) as BpMenuItem[],
      toBpMarketingPlanning(marketingDoc?.content),
    ),
    "execution-operations": assembleExecutionOperations(
      (locationRows ?? []) as BpLocationCandidate[],
      (equipmentRows ?? []) as BpEquipmentItem[],
      financialModel,
    ),
    "execution-milestones-metrics": assembleOperationsLaunch(
      (launchRows ?? []) as BpLaunchItem[],
    ),
    "company-overview": assembleCompanyConcept(conceptDoc?.content),
    "company-team": assembleTeamHiring((hiringRows ?? []) as BpHiringRole[]),
    "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct, currencyCode),
    "financial-plan-unit-economics": assembleUnitEconomicsSection(lenderMetrics, currencyCode),
    "financial-plan-break-even": assembleBreakEvenSection(lenderMetrics, currencyCode),
    "financial-plan-sensitivity": assembleSensitivitySection(lenderMetrics, currencyCode),
    "financial-plan-financing":
      "Click Generate to draft this section from your plan data.",
    "financial-plan-dscr": assembleDscrSection(lenderMetrics, currencyCode),
    "financial-plan-capex-schedule": assembleCapexScheduleSection(lenderMetrics, currencyCode),
    "financial-plan-depreciation": assembleDepreciationScheduleSection(lenderMetrics, currencyCode),
    "financial-plan-working-capital": assembleWorkingCapitalSection(lenderMetrics, currencyCode),
    "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct, currencyCode),
    "appendix-monthly-statements":
      "Monthly P&L, cash flow, and balance sheet statements are rendered in the exported PDF appendix.",
  };

  const sections: BusinessPlanSectionData[] = BUSINESS_PLAN_SECTIONS.map((meta) => {
    const saved = savedMap.get(meta.key);
    return {
      key: meta.key,
      title: meta.title,
      sourceLabel: meta.sourceLabel,
      autoContent: autoContent[meta.key] ?? "",
      userContent: saved?.user_content ?? null,
      isVisible: saved?.is_visible ?? meta.defaultVisible,
    };
  });

  return Response.json({
    planId,
    shopName: plan.plan_name,
    sections,
  });
}
