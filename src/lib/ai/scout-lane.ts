// TIM-3463: Scout lane registry (single source of truth for routing taxonomy).
//
// Every Scout call site declares its lane via `runScoutTurn({ lane, ... })`.
// The router (scout-router.ts) reads this lane to decide provider + model id.
// Lane names are stable identifiers in `ai_turn_metrics.lane` for cost
// attribution — renaming a lane forks the dashboard query, so don't.
//
// Plan: TIM-3333 §3 (revision 94e4b911). Lane → default-provider mapping there.

export const SCOUT_LANES = [
  // Chat lanes — copilot conversations. Default to DeepSeek post-flip.
  "chat_general",
  "chat_title",
  "chat_launch_readiness",
  "chat_cross_suite_resolver",
  "chat_improve",
  // Business plan section generation / audit. Pinned to Anthropic (Rule 1).
  "generate_business_plan_section",
  "business_plan_audit",
  "write_executive_summary",
  // Menu lanes. Suggest/recipe/price → DeepSeek. Benchmark needs web_search → Sonnet.
  "menu_suggest_items",
  "menu_suggest_recipe",
  "menu_suggest_price",
  "menu_benchmark_price",
  // Location lanes. Area analysis needs web_search → Sonnet. Others → DeepSeek.
  "location_area_analysis",
  "location_scorecard_feedback",
  "location_tradeoff",
  // TIM-3878: Analyse endpoint lanes — structured JSON analysis for Pro users.
  "analyse_location_property",
  "analyse_location_shortlist",
  "analyse_lease_terms",
  // TIM-3894: Concept workspace — differentiation + competitors analysis.
  "analyse_concept_differentiation",
  "analyse_concept_competitors",
  // TIM-3899: Hiring v2 — role analysis.
  "analyse_hiring_role",
  // Marketing, hiring, suppliers, concept, financials → DeepSeek.
  "marketing_generate",
  "hiring_improve_jd",
  "suppliers_seed",
  "concept_review",
  "financial_critique",
  "financial_projection",
  // Buildout. describe + ai-write + recommendations → DeepSeek; import is long docs → Haiku.
  "buildout_describe",
  "buildout_import",
  "buildout_recommendations",
  // Doc-gen lanes — long structured business-plan-style outputs. Pinned to Anthropic.
  "ops_playbook_generate",
  "opening_month_generate",
  // Vision required (PDF/image extraction) — DeepSeek v4-flash is text-only.
  "document_import_extract",
] as const

export type ScoutLane = (typeof SCOUT_LANES)[number]

// Lanes pinned to Anthropic regardless of `SCOUT_DEEPSEEK_PROD_ENABLED`.
// Plan §3 Rule 1: explicit task identifier override fires first.
export const FORCE_ANTHROPIC_LANES = new Set<ScoutLane>([
  "generate_business_plan_section",
  "business_plan_audit",
  "write_executive_summary",
  "ops_playbook_generate",
  "opening_month_generate",
  "document_import_extract",
  "buildout_import",
  // TIM-3878: Analyse lanes require structured JSON output — Anthropic for reliability.
  "analyse_location_property",
  "analyse_location_shortlist",
  "analyse_lease_terms",
  // TIM-3894: Concept analyse lanes — structured JSON, Anthropic for reliability.
  "analyse_concept_differentiation",
  "analyse_concept_competitors",
  // TIM-3899: Hiring analyse lane — structured JSON, Anthropic for reliability.
  "analyse_hiring_role",
])

// Lanes that need Anthropic Sonnet 4.6 specifically — they depend on the
// hosted web_search tool or on stronger research synthesis (Rule 2).
export const REQUIRES_RESEARCH_MODEL_LANES = new Set<ScoutLane>([
  "menu_benchmark_price",
  "location_area_analysis",
])

// Lanes routed to DeepSeek when SCOUT_DEEPSEEK_PROD_ENABLED is true.
// (Outside prod the gate is implicitly true via env override; see scout-router.)
export const DEEPSEEK_PREFERRED_LANES = new Set<ScoutLane>(
  SCOUT_LANES.filter(
    (l) =>
      !FORCE_ANTHROPIC_LANES.has(l) && !REQUIRES_RESEARCH_MODEL_LANES.has(l),
  ),
)

export function isScoutLane(value: string): value is ScoutLane {
  return (SCOUT_LANES as readonly string[]).includes(value)
}
