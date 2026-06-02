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
  type BusinessPlanSectionData,
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpMenuItem,
  type BpLaunchItem,
  type BpHiringRole,
  toBpMarketingPlanning,
} from "@/lib/business-plan";
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection";

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
  ] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("location_candidates")
      .select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes")
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
  ]);

  const savedMap = new Map(
    (savedSections ?? []).map((s) => [s.section_key, s])
  );

  // TIM-1694: menu→COGS sync. Blended pct feeds the Financials section so
  // menu-linked COGS lines resolve against live menu costing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);

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
    "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct),
    "financial-plan-financing":
      "Click Generate to draft this section from your plan data.",
    "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct),
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
