// TIM-1037: Business Plan Generator workspace page.
// TIM-1225: loads cover settings + signed logo URL for CoverBrandingPanel.
// TIM-1483: loads financial document visibility for FinancialDocumentsPanel.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { BusinessPlanWorkspace } from "./business-plan-workspace";
import type { CoverSettings } from "./cover-branding-panel";
import { buildInitialFinancialDocuments } from "@/lib/business-plan-financials";
import type { CoverTemplateId } from "@/lib/pdf/business-plan/covers";
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

export const dynamic = "force-dynamic";

export default async function BusinessPlanWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/onboarding");

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
    { data: profile },
    { data: coverRow },
    { data: financialDocRows },
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
      .select("id, name, category_name, price_cents")
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
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("business_plan_cover")
      .select("template_id, accent_color, logo_path, tagline, prepared_for, author_name, body_font")
      .eq("plan_id", planId)
      .maybeSingle(),
    supabase
      .from("business_plan_financial_documents")
      .select("document_key, is_visible")
      .eq("plan_id", planId),
  ]);

  const savedMap = new Map(
    (savedSections ?? []).map((s) => [s.section_key, s])
  );

  // TIM-1498: two-level taxonomy autoContent map.
  const autoContent: Record<string, string> = {
    "executive-summary":
      (savedMap.get("executive-summary") as { user_content: string | null } | undefined)
        ?.user_content ??
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
    "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? []),
    "financial-plan-financing":
      "Click Generate to draft this section from your plan data.",
    "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? []),
    "appendix-monthly-statements":
      "Monthly P&L, cash flow, and balance sheet statements are rendered in the exported PDF appendix.",
  };

  const sections: BusinessPlanSectionData[] = BUSINESS_PLAN_SECTIONS.map((meta) => {
    const saved = savedMap.get(meta.key) as
      | { user_content: string | null; is_visible: boolean }
      | undefined;
    return {
      key: meta.key,
      title: meta.title,
      sourceLabel: meta.sourceLabel,
      autoContent: autoContent[meta.key] ?? "",
      userContent: saved?.user_content ?? null,
      isVisible: saved?.is_visible ?? meta.defaultVisible,
    };
  });

  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  const initialCoverSettings: CoverSettings = {
    template_id: (coverRow?.template_id ?? "classic") as CoverTemplateId,
    accent_color: coverRow?.accent_color ?? null,
    color_pack_id: (coverRow as { color_pack_id?: string | null } | null)?.color_pack_id ?? null,
    logo_path: coverRow?.logo_path ?? null,
    tagline: coverRow?.tagline ?? null,
    prepared_for: coverRow?.prepared_for ?? null,
    author_name: coverRow?.author_name ?? null,
    body_font: (coverRow as { body_font?: string | null } | null)?.body_font ?? null,
  };

  const initialFinancialDocuments = buildInitialFinancialDocuments(
    (financialDocRows ?? []) as { document_key: string; is_visible: boolean }[]
  );

  // Get a signed URL for the logo preview (1 hour).
  let logoPublicUrl: string | null = null;
  if (coverRow?.logo_path) {
    const { data: signed } = await supabase.storage
      .from("business-plan-logos")
      .createSignedUrl(coverRow.logo_path, 3600);
    logoPublicUrl = signed?.signedUrl ?? null;
  }

  return (
    <BusinessPlanWorkspace
      planId={planId}
      shopName={plan.plan_name ?? ""}
      initialSections={sections}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialCoverSettings={initialCoverSettings}
      logoPublicUrl={logoPublicUrl}
      initialFinancialDocuments={initialFinancialDocuments}
    />
  );
}
