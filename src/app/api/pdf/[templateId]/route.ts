import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive } from "@/lib/access"
import { getActivePlanId } from "@/lib/plan-context"
import { getTemplate } from "@/lib/pdf/registry"
import "@/lib/pdf/templates" // Side-effect: registers all templates
import { registerFonts, resolveBrand, type BrandConfig } from "@/lib/pdf/brand"
import { getAccountSettings } from "@/lib/account-settings"
import {
  BUSINESS_PLAN_SECTIONS,
  assembleCompanyConcept,
  assembleTargetMarket,
  assembleExecutionOperations,
  assembleExecutionMarketingSales,
  assembleOperationsLaunch,
  assembleTeamHiring,
  assembleFinancialPlan,
  toBpMarketingPlanning,
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpMenuItem,
  type BpLaunchItem,
  type BpHiringRole,
} from "@/lib/business-plan"
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection"
import { buildPlanState } from "@/lib/business-plan/plan-state"
import { runReconciliation } from "@/lib/business-plan/validate"
import type { NextRequest } from "next/server"
import type { DocumentProps } from "@react-pdf/renderer"
import type { ReactElement, JSXElementConstructor } from "react"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteContext = { params: Promise<{ templateId: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { templateId } = await params

  const tmpl = getTemplate(templateId)
  if (!tmpl) {
    return Response.json({ error: "Unknown template" }, { status: 404 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, email")
    .eq("id", user.id)
    .single()

  if (!profile || !isSubscriptionActive(profile.subscription_status)) {
    return Response.json(
      { reason: "paywall", tier_required: "starter" },
      { status: 402 }
    )
  }

  const activePlanId = await getActivePlanId(supabase, user.id)
  if (!activePlanId) {
    return Response.json({ error: "No plan found" }, { status: 404 })
  }
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("id", activePlanId)
    .maybeSingle()

  if (!plan) {
    return Response.json({ error: "No plan found" }, { status: 404 })
  }

  // TIM-2336: export gate for business_plan_full. Runs Pass 1 numeric
  // reconciliation against plan_state; blocks the PDF when any narrative
  // figure contradicts the canonical model. Soft-override via ?force=1
  // after the user has reviewed each finding in the modal. Pass 2 (LLM)
  // is NEVER blocking — only the in-app validate endpoint runs it.
  if (templateId === "business_plan_full") {
    const searchParams = new URL(request.url).searchParams
    const forced = searchParams.get("force") === "1"
    if (!forced) {
      const gate = await runBusinessPlanExportGate(supabase, plan.id, plan.plan_name ?? "this coffee shop")
      if (gate.blocking) {
        return Response.json(
          { error: "validation_blocked", report: gate.report },
          { status: 422 },
        )
      }
    }
  }

  // Load per-plan brand config and resolve logo bytes.
  const brandConfig = await loadBrandConfig(supabase, plan.id)

  let content: unknown

  if (tmpl.dataLoader) {
    content = await tmpl.dataLoader(plan.id, user.id, supabase, new URL(request.url).searchParams)
  } else {
    const wsKeys = [tmpl.workspace_key, ...(tmpl.also_load ?? [])]

    const { data: docs } = await supabase
      .from("workspace_documents")
      .select("workspace_key, content")
      .eq("plan_id", plan.id)
      .in("workspace_key", wsKeys)

    const primary = docs?.find((d: { workspace_key: string }) => d.workspace_key === tmpl.workspace_key)
    if (!primary) {
      return Response.json({ error: "Workspace document not found" }, { status: 404 })
    }
    content = primary.content
  }

  registerFonts()

  const settings = await getAccountSettings(supabase, user.id)
  const brand = resolveBrand(brandConfig)

  const ctx = {
    content,
    brand,
    user: { id: user.id, email: profile.email ?? null },
    plan: { id: plan.id, shop_name: plan.plan_name ?? null },
    currencyCode: settings.currencyCode,
  }

  const element = (await tmpl.render(ctx)) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>
  const filename = tmpl.filename(ctx)

  const { renderToStream } = await import("@react-pdf/renderer")
  const stream = await renderToStream(element)

  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

// TIM-2336: business-plan export gate. Loads narrative + plan_state and runs
// Pass 1 reconciliation. Pass 2 (LLM) is intentionally skipped here — that's
// the in-app validate route, gated on rate limit + non-trivial cost. The
// export gate stays a sub-second programmatic check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runBusinessPlanExportGate(supabase: any, planId: string, shopName: string) {
  const [
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: hiringRows },
    { data: marketingDoc },
    { data: conceptDoc },
    { data: launchRows },
    { data: financialModel },
    { data: savedSections },
  ] = await Promise.all([
    supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items").select("id, name, cost_local, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents, status").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
    supabase.from("business_plan_sections").select("section_key, user_content, is_visible").eq("plan_id", planId),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[])
  const planState = buildPlanState({
    shopName,
    financialModel,
    locationCandidates: (locationRows ?? []) as BpLocationCandidate[],
    equipment: (equipmentRows ?? []) as BpEquipmentItem[],
    hiringRoles: (hiringRows ?? []) as BpHiringRole[],
    menuBlendedCogsPct,
  })

  const savedMap = new Map(
    (savedSections ?? []).map((s: { section_key: string; user_content: string | null; is_visible: boolean }) => [s.section_key, s]),
  )
  const autoContent: Record<string, string> = {
    "executive-summary": "",
    "opportunity-problem-solution": "",
    "opportunity-target-market": assembleTargetMarket(conceptDoc?.content),
    "opportunity-competition": "",
    "execution-marketing-sales": assembleExecutionMarketingSales(
      (menuRows ?? []) as BpMenuItem[],
      toBpMarketingPlanning(marketingDoc?.content),
      planState.meta.currency_code,
    ),
    "execution-operations": assembleExecutionOperations(
      (locationRows ?? []) as BpLocationCandidate[],
      (equipmentRows ?? []) as BpEquipmentItem[],
      financialModel,
      planState.meta.currency_code,
    ),
    "execution-milestones-metrics": assembleOperationsLaunch(
      (launchRows ?? []) as BpLaunchItem[],
    ),
    "company-overview": assembleCompanyConcept(conceptDoc?.content),
    "company-team": assembleTeamHiring((hiringRows ?? []) as BpHiringRole[], planState.meta.currency_code),
    "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct, planState.meta.currency_code),
    "financial-plan-financing": "",
    "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct, planState.meta.currency_code),
    "appendix-monthly-statements": "",
  }

  const sectionTexts = new Map<string, string>()
  for (const meta of BUSINESS_PLAN_SECTIONS) {
    const saved = savedMap.get(meta.key) as { user_content: string | null; is_visible: boolean } | undefined
    if (saved && saved.is_visible === false) continue
    const text = (saved?.user_content ?? autoContent[meta.key] ?? "").trim()
    if (text.length === 0) continue
    sectionTexts.set(meta.key, text)
  }

  const report = runReconciliation({ planState, sections: sectionTexts })
  return { blocking: report.blocking, report }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadBrandConfig(supabase: any, planId: string): Promise<BrandConfig> {
  const { data: row } = await supabase
    .from("brand_config")
    .select("logo_path, primary_color, accent_color, ink_color, paper_color, muted_color, rule_color")
    .eq("plan_id", planId)
    .maybeSingle()

  if (!row) return {}

  let logoBytes: BrandConfig["logoBytes"] = null

  if (row.logo_path) {
    const { data: logoBlob } = await supabase.storage
      .from("shop-brand-logos")
      .download(row.logo_path)
    if (logoBlob) {
      const ab = await logoBlob.arrayBuffer()
      const ext = (row.logo_path as string).endsWith(".jpg") ? "jpg" : "png"
      logoBytes = { data: Buffer.from(ab), format: ext as "png" | "jpg" }
    }
  }

  const colors: BrandConfig["colors"] = {}
  if (row.primary_color) colors.primary = row.primary_color
  if (row.accent_color) colors.accent = row.accent_color
  if (row.ink_color) colors.ink = row.ink_color
  if (row.paper_color) colors.paper = row.paper_color
  if (row.muted_color) colors.muted = row.muted_color
  if (row.rule_color) colors.rule = row.rule_color

  return { logoBytes, colors }
}
