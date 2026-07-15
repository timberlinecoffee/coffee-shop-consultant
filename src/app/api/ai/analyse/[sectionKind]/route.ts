// TIM-3878: POST /api/ai/analyse/<sectionKind>
// Phase 3 of TIM-3870 — structured AI analysis for location-property,
// location-shortlist, and lease-terms sections. Pro plan only.
// TIM-3897: Extended with 4 Financials v2 section kinds (daily-traffic,
// revenue-streams, costs-overhead, growth-ramp). Reads financial_models table.
//
// Rule 1 (RLS): No new tables. Reads only existing tables that already have
//   RLS enabled (location_candidates, location_rubric_scores, location_lease_terms,
//   module_responses, financial_models). No service-client writes.
// Rule 2 (server-side auth): effectivePlanForGating + plan ownership re-checked
//   server-side on every request. Client button state is UI only.
// Rule 3 (validate): Zod on request body AND on AI response shape;
//   bounded retry (3 attempts) on mismatch, never returns raw model output.
// Rule 4 (rate-limit): enforceRateLimit — short window (5/60s) + daily cap
//   (20/86400s) per user. Aligned with Check/Benchmark caps.
// Rule 5 (no raw errors): Catch at route boundary; log with context;
//   return sanitized { error: string }. Never leak stack traces or Anthropic error bodies.
//
// AI never auto-applies: Recommendations may include actionRef as read-only
// insight only. This endpoint never writes user data based on AI output.

import { z } from "zod"
import { runScoutTurn, toTurnMetricArgs } from "@/lib/ai/scout-adapter"
import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getActivePlanId } from "@/lib/plan-context"
import { enforceRateLimit } from "@/lib/rate-limit"
import { isSubscriptionActive, isBetaWaived, effectivePlanForGating } from "@/lib/access"
import { normalizeMarketing } from "@/lib/marketing"
import { normalizeConceptV2 } from "@/lib/concept"
import { menuItemMixWeight } from "@/lib/financial-projection"
import type { NextRequest } from "next/server"
import type { ScoutLane } from "@/lib/ai/scout-lane"
import { toTitleCase } from "@/lib/text"

export const runtime = "nodejs"
export const maxDuration = 60

const ROUTE_PATH = "/api/ai/analyse/[sectionKind]"

const SECTION_KINDS = [
  "location-property",
  "location-shortlist",
  "lease-terms",
  "marketing-channels",
  "marketing-pre-launch",
  "financials-cogs-menu",
  "financials-cogs-additional",
  "menu-ingredients",
  // TIM-3897: Financials v2 sections
  "financials-daily-traffic",
  "financials-revenue-streams",
  "financials-costs-overhead",
  "financials-growth-ramp",
] as const
type SectionKind = (typeof SECTION_KINDS)[number]

function isSectionKind(v: string): v is SectionKind {
  return (SECTION_KINDS as readonly string[]).includes(v)
}

const LANE_BY_KIND: Record<SectionKind, ScoutLane> = {
  "location-property": "analyse_location_property",
  "location-shortlist": "analyse_location_shortlist",
  "lease-terms": "analyse_lease_terms",
  "marketing-channels": "analyse_marketing_channels",
  "marketing-pre-launch": "analyse_marketing_pre_launch",
  "financials-cogs-menu": "analyse_financials_cogs_menu",
  "financials-cogs-additional": "analyse_financials_cogs_additional",
  "menu-ingredients": "analyse_menu_ingredients",
  "financials-daily-traffic": "analyse_financials_daily_traffic",
  "financials-revenue-streams": "analyse_financials_revenue_streams",
  "financials-costs-overhead": "analyse_financials_costs_overhead",
  "financials-growth-ramp": "analyse_financials_growth_ramp",
}

// ── AnalyseResponse Zod schema (locked per TIM-3878 spec) ────────────────────

const ScoreSchema = z.object({
  value: z.number().min(0).max(100),
  scale: z.number(),
  label: z.string().max(80).optional(),
  band: z.enum(["strong", "ok", "weak"]).optional(),
})

const StrengthSchema = z.object({
  text: z.string().min(1).max(400),
  dataRef: z.string().max(120).optional(),
})

const ConcernSchema = z.object({
  text: z.string().min(1).max(400),
  dataRef: z.string().max(120).optional(),
  severity: z.enum(["info", "warn", "critical"]).optional(),
})

const CalloutSchema = z.object({
  text: z.string().min(1).max(400),
  benchmark: z
    .object({
      yours: z.string().max(80),
      typical: z.string().max(80),
      delta: z.string().max(80),
    })
    .optional(),
})

const RecommendationSchema = z.object({
  text: z.string().min(1).max(400),
  actionRef: z.string().max(120).optional(),
})

// Full AnalyseResponse — version/sectionKey/generatedAt set by server.
export const AnalyseResponseSchema = z.object({
  version: z.literal(1),
  sectionKey: z.string(),
  generatedAt: z.string(),
  score: ScoreSchema.optional(),
  strengths: z.array(StrengthSchema).max(8),
  concerns: z.array(ConcernSchema).max(8),
  callouts: z.array(CalloutSchema).max(6),
  recommendations: z.array(RecommendationSchema).max(8),
  benchmarkContext: z
    .object({
      source: z.string().max(200),
      note: z.string().max(400).optional(),
    })
    .optional(),
})

export type AnalyseResponse = z.infer<typeof AnalyseResponseSchema>

// AI content schema — the subset the model returns (server fills the rest).
const AIContentSchema = z.object({
  score: ScoreSchema.optional(),
  strengths: z.array(StrengthSchema).min(1).max(8),
  concerns: z.array(ConcernSchema).min(1).max(8),
  callouts: z.array(CalloutSchema).max(6),
  recommendations: z.array(RecommendationSchema).min(1).max(8),
  benchmarkContext: z
    .object({
      source: z.string().max(200),
      note: z.string().max(400).optional(),
    })
    .optional(),
})

// Request body — resourceId is required for location-property and lease-terms.
const RequestBodySchema = z.object({
  resourceId: z.string().uuid().optional(),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {}
  }
  const start = trimmed.indexOf("{")
  if (start !== -1) {
    // Walk forward tracking brace depth to find the balanced closing brace,
    // avoiding false matches when the model appends prose containing "}" after
    // the JSON object (e.g. formula references like {2–3×}).
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i]
      if (escape) { escape = false; continue }
      if (ch === "\\" && inString) { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) {
          try { return JSON.parse(trimmed.slice(start, i + 1)) } catch {}
          break
        }
      }
    }
  }
  return null
}

const JSON_SCHEMA_INSTRUCTION = `Respond with ONLY valid JSON — no prose, no markdown code fences, no explanation. Exact shape:
{
  "score": {"value": <0-100 integer>, "scale": 100, "label": "<short label>", "band": "<strong|ok|weak>"},
  "strengths": [{"text": "<plain sentence max 60 words>", "dataRef": "<optional field name>"}],
  "concerns": [{"text": "<plain sentence max 60 words>", "dataRef": "<optional field name>", "severity": "<info|warn|critical>"}],
  "callouts": [{"text": "<plain sentence max 60 words>", "benchmark": {"yours": "<value>", "typical": "<value>", "delta": "<delta>"}}],
  "recommendations": [{"text": "<plain sentence max 60 words>", "actionRef": "<optional key>"}],
  "benchmarkContext": {"source": "<source description>", "note": "<optional>"}
}
Rules:
- strengths: 2–5 items minimum.
- concerns: 2–5 items minimum.
- callouts: 0–4 items (include only when there is a concrete benchmark or comparison to show).
- recommendations: 2–5 items minimum.
- score.band: "strong" if value >= 70, "ok" if 40–69, "weak" if < 40.
- benchmarkContext: include when you cite market norms or industry figures.
- Plain English. No consultant jargon. No emojis. Title Case for dataRef/actionRef keys only.`

// ── Per-section data loaders ─────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function loadPropertyContext(
  supabase: SupabaseClient,
  planId: string,
  candidateId: string,
): Promise<{
  owned: boolean
  prompt: string
}> {
  const { data: candidate } = await supabase
    .from("location_candidates")
    .select("id, plan_id, name, address, neighborhood, city")
    .eq("id", candidateId)
    .maybeSingle()

  if (!candidate || candidate.plan_id !== planId) {
    return { owned: false, prompt: "" }
  }

  // Parallelize the three independent lookups after ownership is confirmed.
  const [{ data: scores }, { data: leaseRow }, { data: conceptRow }] = await Promise.all([
    supabase
      .from("location_rubric_scores")
      .select("factor_key, score_1_5, notes")
      .eq("candidate_id", candidateId),
    supabase
      .from("location_lease_terms")
      .select(
        "base_rent_cents, rent_escalation_pct, term_months, ti_allowance_cents, security_deposit_cents, personal_guarantee, exit_clauses",
      )
      .eq("candidate_id", candidateId)
      .maybeSingle(),
    supabase
      .from("module_responses")
      .select("response_data")
      .eq("plan_id", planId)
      .eq("module_number", 1)
      .maybeSingle(),
  ])

  const conceptBits: string[] = []
  const conceptData = (conceptRow?.response_data ?? {}) as Record<string, unknown>
  for (const k of ["one_liner", "concept", "target_customer", "differentiator"]) {
    const v = conceptData[k]
    if (typeof v === "string" && v.trim()) conceptBits.push(v.trim())
  }

  const scoredLines = (scores ?? [])
    .map((s) => {
      const score = s.score_1_5 != null ? `${s.score_1_5}/5` : "not rated"
      const note = s.notes?.trim() ? ` — ${s.notes.trim()}` : ""
      return `  ${s.factor_key}: ${score}${note}`
    })
    .join("\n")

  const leaseLines = leaseRow
    ? [
        leaseRow.base_rent_cents != null
          ? `  Base rent: $${(leaseRow.base_rent_cents / 100).toFixed(0)}/mo`
          : null,
        leaseRow.term_months != null ? `  Term: ${leaseRow.term_months} months` : null,
        leaseRow.rent_escalation_pct != null
          ? `  Escalation: ${leaseRow.rent_escalation_pct}% /yr`
          : null,
        leaseRow.ti_allowance_cents != null
          ? `  TI allowance: $${(leaseRow.ti_allowance_cents / 100).toFixed(0)}`
          : null,
        leaseRow.personal_guarantee ? `  Personal guarantee: ${leaseRow.personal_guarantee}` : null,
        leaseRow.exit_clauses ? `  Exit clauses: ${leaseRow.exit_clauses}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : null

  const location = [candidate.name, candidate.address, candidate.neighborhood, candidate.city]
    .filter(Boolean)
    .join(", ")

  const prompt = `Analyse this coffee shop location candidate as a potential site.

Location: ${location}
${conceptBits.length > 0 ? `\nOwner's concept:\n${conceptBits.join(" — ")}\n` : ""}
${scoredLines ? `\nScorecard (1=poor, 5=excellent):\n${scoredLines}\n` : "Scorecard: no scores entered yet."}
${leaseLines ? `\nLease terms on file:\n${leaseLines}\n` : "Lease terms: none on file."}

Provide a structured analysis covering: overall site viability, strongest positives from the data, specific risks or red flags, how lease terms affect the picture (if available), and concrete next steps for the owner. Weight concerns by severity (critical = deal-breaker risk, warn = manageable with action, info = worth noting).

${JSON_SCHEMA_INSTRUCTION}`

  return { owned: true, prompt }
}

async function loadShortlistContext(
  supabase: SupabaseClient,
  planId: string,
): Promise<string> {
  const { data: candidates } = await supabase
    .from("location_candidates")
    .select("id, name, address, neighborhood, city")
    .eq("plan_id", planId)
    .order("created_at", { ascending: true })
    .limit(10)

  if (!candidates || candidates.length === 0) {
    return ""
  }

  const truncated = candidates.length === 10

  const { data: allScores } = await supabase
    .from("location_rubric_scores")
    .select("candidate_id, factor_key, score_1_5")
    .in(
      "candidate_id",
      candidates.map((c) => c.id),
    )

  const scoreMap = new Map<string, { total: number; count: number }>()
  for (const s of allScores ?? []) {
    if (s.score_1_5 == null) continue
    const entry = scoreMap.get(s.candidate_id) ?? { total: 0, count: 0 }
    entry.total += s.score_1_5
    entry.count += 1
    scoreMap.set(s.candidate_id, entry)
  }

  const lines = candidates.map((c) => {
    const entry = scoreMap.get(c.id)
    const avg =
      entry && entry.count > 0
        ? ` (avg scorecard: ${(entry.total / entry.count).toFixed(1)}/5)`
        : " (no scorecard scores)"
    const loc = [c.name, c.address, c.neighborhood, c.city].filter(Boolean).join(", ")
    return `- ${loc}${avg}`
  })

  const countNote = truncated ? `the first ${candidates.length} (list may have more — ranked oldest-first)` : `all ${candidates.length}`
  return `Compare and rank ${countNote} location candidates on the shortlist for this coffee shop owner.

Candidates:
${lines.join("\n")}

For each candidate give a comparative assessment. Identify the strongest overall candidate, any candidates that should be dropped, and what the owner should verify across the shortlist before making a final decision. Include a benchmarkContext if you can reference typical café site scores or market norms.

${JSON_SCHEMA_INSTRUCTION}`
}

async function loadLeaseTermsContext(
  supabase: SupabaseClient,
  planId: string,
  candidateId: string,
): Promise<{ owned: boolean; prompt: string }> {
  const { data: candidate } = await supabase
    .from("location_candidates")
    .select("id, plan_id, name, address, city")
    .eq("id", candidateId)
    .maybeSingle()

  if (!candidate || candidate.plan_id !== planId) {
    return { owned: false, prompt: "" }
  }

  const { data: lease } = await supabase
    .from("location_lease_terms")
    .select(
      "base_rent_cents, rent_escalation_pct, security_deposit_cents, ti_allowance_cents, term_months, options_text, personal_guarantee, exit_clauses",
    )
    .eq("candidate_id", candidateId)
    .maybeSingle()

  if (!lease) {
    return {
      owned: true,
      prompt: "",
    }
  }

  const fields: string[] = []
  if (lease.base_rent_cents != null)
    fields.push(`Base rent: $${(lease.base_rent_cents / 100).toFixed(0)}/mo`)
  if (lease.term_months != null) fields.push(`Term length: ${lease.term_months} months`)
  if (lease.rent_escalation_pct != null) fields.push(`Annual escalation: ${lease.rent_escalation_pct}%`)
  if (lease.security_deposit_cents != null)
    fields.push(`Security deposit: $${(lease.security_deposit_cents / 100).toFixed(0)}`)
  if (lease.ti_allowance_cents != null)
    fields.push(`TI allowance: $${(lease.ti_allowance_cents / 100).toFixed(0)}`)
  if (lease.options_text) fields.push(`Renewal options: ${lease.options_text}`)
  if (lease.personal_guarantee) fields.push(`Personal guarantee: ${lease.personal_guarantee}`)
  if (lease.exit_clauses) fields.push(`Exit / termination clauses: ${lease.exit_clauses}`)

  // No meaningful data to analyse — all nullable columns are null.
  if (fields.length === 0) {
    return { owned: true, prompt: "" }
  }

  const location = [candidate.name, candidate.address, candidate.city].filter(Boolean).join(", ")

  const prompt = `Analyse the lease terms for this coffee shop candidate site.

Location: ${location}

Lease terms:
${fields.map((f) => `  ${f}`).join("\n")}

Evaluate each term against typical coffee shop lease norms. Flag any terms that are unusually favorable or unfavorable. Identify clauses the owner should push back on before signing and what outcomes to aim for. Include concrete benchmark comparisons where you can (e.g. typical TI allowance, market escalation rates). Weight concerns by severity: critical = significant financial risk or deal-breaker, warn = negotiate or clarify before signing, info = awareness item.

${JSON_SCHEMA_INSTRUCTION}`

  return { owned: true, prompt }
}

// ── Marketing data loaders (TIM-3885) ────────────────────────────────────────

async function loadMarketingChannelsContext(
  supabase: SupabaseClient,
  planId: string,
): Promise<string> {
  const [{ data: marketingDoc }, { data: conceptDoc }] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "marketing")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
  ])

  const marketing = normalizeMarketing(marketingDoc?.content)
  const selected = marketing.channels.selected

  if (selected.length === 0) return ""

  const concept = normalizeConceptV2(conceptDoc?.content)
  const conceptBits: string[] = []
  for (const k of ["shop_identity", "target_customer", "differentiation", "brand_voice"] as const) {
    const v = concept.components[k]?.content
    if (typeof v === "string" && v.trim()) conceptBits.push(v.trim())
  }

  const channelLines = selected.map((c) => {
    const notes = c.notes?.trim() ? ` — ${c.notes.trim()}` : ""
    return `- ${c.name}${notes}`
  })

  return `Analyse the marketing channel mix for this coffee shop.
${conceptBits.length > 0 ? `\nShop context:\n${conceptBits.join(" — ")}\n` : ""}
Current channels (${selected.length}):
${channelLines.join("\n")}

Evaluate this channel selection: which channels are strongest given the concept and audience, coverage gaps, channels that may be hard to sustain consistently, and what the owner should prioritise first. Consider mix breadth, effort-to-reach ratio, and consistency of execution. Score the overall mix as a channel strategy.

${JSON_SCHEMA_INSTRUCTION}`
}

async function loadMarketingPreLaunchContext(
  supabase: SupabaseClient,
  planId: string,
): Promise<string> {
  const [{ data: marketingDoc }, { data: conceptDoc }] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "marketing")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
  ])

  const marketing = normalizeMarketing(marketingDoc?.content)
  const milestones = marketing.pre_launch.milestones

  if (milestones.length === 0) return ""

  const concept = normalizeConceptV2(conceptDoc?.content)
  const conceptBits: string[] = []
  for (const k of ["shop_identity", "target_customer", "differentiation"] as const) {
    const v = concept.components[k]?.content
    if (typeof v === "string" && v.trim()) conceptBits.push(v.trim())
  }

  const done = milestones.filter((m) => m.completed).length
  const milestoneLines = milestones.map((m, i) => {
    const label = m.label?.trim() || `Milestone ${i + 1}`
    const date = m.target_date ? ` (target: ${m.target_date})` : ""
    const status = m.completed ? " [done]" : ""
    const notes = m.notes?.trim() ? ` — ${m.notes.trim()}` : ""
    return `${i + 1}. ${label}${date}${status}${notes}`
  })

  return `Analyse the pre-launch marketing plan for this coffee shop.
${conceptBits.length > 0 ? `\nShop context:\n${conceptBits.join(" — ")}\n` : ""}
Pre-launch milestones (${done}/${milestones.length} complete):
${milestoneLines.join("\n")}

Evaluate the pre-launch sequence: timing and sequencing of milestones, coverage of key launch activities (community building, press and PR, soft launch or trial events, grand opening), and any gaps. Identify the most critical milestones and any that are missing. Score the plan's overall launch readiness and provide concrete recommendations to improve it.

${JSON_SCHEMA_INSTRUCTION}`
}

// ── Financials COGS data loaders (TIM-3887) ──────────────────────────────────

async function loadCogsMenuContext(
  supabase: SupabaseClient,
  planId: string,
): Promise<string> {
  const [modelResult, menuResult] = await Promise.all([
    supabase
      .from("financial_models")
      .select("forecast_inputs")
      .eq("plan_id", planId)
      .maybeSingle(),
    supabase
      .from("menu_items_with_cogs")
      // category_id is the key used in menu_cogs_category_units — must be included.
      .select("id, name, category_id, category_name, price_cents, computed_cogs_cents, expected_popularity")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("category_name"),
  ])

  if (menuResult.error) {
    throw new Error(`menu_items_with_cogs query failed: ${menuResult.error.message}`)
  }
  const menuItems = menuResult.data
  if (!menuItems || menuItems.length === 0) return ""

  // Propagate RLS or query errors rather than silently zeroing all cost data.
  if (modelResult.error) {
    throw new Error(`financial_models query failed: ${modelResult.error.message}`)
  }

  const inputs = (modelResult.data?.forecast_inputs ?? {}) as Record<string, unknown>
  // menu_cogs_category_units keys are category_id (UUID) or "__uncategorized__" —
  // mirrors computeCogsGrandTotalMonthlyCents in financial-projection.ts.
  const categoryUnits = (inputs.menu_cogs_category_units ?? {}) as Record<string, number>
  const currencyCode = typeof inputs.currency_code === "string" ? inputs.currency_code : "USD"

  // Group by category_id (the key used in the financial model), store category_name for display.
  type CatEntry = { displayName: string; items: typeof menuItems; units: number }
  const categoryMap = new Map<string, CatEntry>()
  for (const item of menuItems) {
    const idKey = item.category_id ?? "__uncategorized__"
    const entry = categoryMap.get(idKey) ?? {
      displayName: item.category_name ?? "Uncategorized",
      items: [] as typeof menuItems,
      units: categoryUnits[idKey] ?? 0,
    }
    entry.items.push(item)
    categoryMap.set(idKey, entry)
  }

  let totalMonthlyCents = 0
  const categoryLines: string[] = []
  for (const [, cat] of categoryMap) {
    // Popularity-weighted COGS — uses canonical menuItemMixWeight from financial-projection.ts.
    const totalWeight = cat.items.reduce((s, it) => s + menuItemMixWeight(it), 0)
    const monthlyCostCents =
      totalWeight > 0 && cat.units > 0
        ? Math.round(
            cat.items.reduce((sum, it) => {
              const w = menuItemMixWeight(it)
              return sum + (cat.units * w / totalWeight) * (it.computed_cogs_cents ?? 0)
            }, 0),
          )
        : 0
    totalMonthlyCents += monthlyCostCents
    const line = `- ${cat.displayName}: ${cat.items.length} item${cat.items.length !== 1 ? "s" : ""}, ${cat.units} units/mo sold → ${(monthlyCostCents / 100).toFixed(0)} ${currencyCode}/mo`
    categoryLines.push(line)
  }

  // Return empty when no units are configured — the AI would receive a fabricated $0 context.
  if (totalMonthlyCents === 0 && Object.keys(categoryUnits).length === 0) return ""

  const totalItems = menuItems.length

  return `Analyse the menu-driven Cost of Goods Sold for this coffee shop.

Total menu items: ${totalItems} across ${categoryMap.size} categor${categoryMap.size !== 1 ? "ies" : "y"}
Currency: ${currencyCode}
Estimated total menu COGS: ${(totalMonthlyCents / 100).toFixed(0)} ${currencyCode}/month

Category breakdown:
${categoryLines.join("\n")}

Evaluate the COGS structure: which categories are the highest cost drivers, whether the unit assumptions look reasonable for a coffee shop, category-level COGS percentages relative to typical industry benchmarks (specialty coffee: 28–35% COGS), items where COGS may be too high or underpriced, and concrete recommendations to improve margin. Include benchmark comparisons where you can.

${JSON_SCHEMA_INSTRUCTION}`
}

async function loadCogsAdditionalContext(
  supabase: SupabaseClient,
  planId: string,
): Promise<string> {
  const { data: model } = await supabase
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", planId)
    .maybeSingle()

  const inputs = (model?.forecast_inputs ?? {}) as Record<string, unknown>
  const additionalItems = Array.isArray(inputs.additional_cogs_items)
    ? (inputs.additional_cogs_items as Array<{ name?: string; monthly_cost_cents?: number; notes?: string | null }>)
    : []
  const currencyCode = typeof inputs.currency_code === "string" ? inputs.currency_code : "USD"

  if (additionalItems.length === 0) return ""

  // Build from named items once — avoids double-filter and keeps count/total in sync.
  const namedItems = additionalItems.filter((it) => it.name?.trim())
  if (namedItems.length === 0) return ""

  const itemLines = namedItems.map((it) => {
    const cost = ((it.monthly_cost_cents ?? 0) / 100).toFixed(0)
    const note = it.notes?.trim() ? ` (${it.notes.trim()})` : ""
    return `- ${it.name?.trim()}: ${cost} ${currencyCode}/mo${note}`
  })
  const totalCents = namedItems.reduce((s, it) => s + (it.monthly_cost_cents ?? 0), 0)

  return `Analyse the additional (non-menu) Cost of Goods for this coffee shop.

Total additional COGS: ${(totalCents / 100).toFixed(0)} ${currencyCode}/month
Items (${itemLines.length}):
${itemLines.join("\n")}

Evaluate these additional COGS items: whether all major non-menu cost categories are covered (packaging, to-go supplies, cleaning products, paper goods, etc.), any items that seem unusually high or low, missing categories typical for a coffee shop, and concrete recommendations to optimise these costs. Include benchmark comparisons where relevant.

${JSON_SCHEMA_INSTRUCTION}`
}

// ── Financials v2 data loader (shared across all 4 sections) ─────────────────
// TIM-3897: Rule 1 — reads financial_models (existing RLS-enabled table only).

type MonthlyProjectionsRaw = Record<string, unknown>

async function loadFinancialModel(
  supabase: SupabaseClient,
  planId: string,
): Promise<MonthlyProjectionsRaw | null> {
  const { data: model } = await supabase
    .from("financial_models")
    .select("forecast_inputs, monthly_projections")
    .eq("plan_id", planId)
    .maybeSingle()

  if (!model) return null
  const mp =
    (model as { forecast_inputs?: unknown; monthly_projections?: unknown }).forecast_inputs ??
    (model as { monthly_projections?: unknown }).monthly_projections
  if (!mp || typeof mp !== "object" || Array.isArray(mp)) return null
  return mp as MonthlyProjectionsRaw
}

function fmtCents(cents: unknown): string {
  if (typeof cents !== "number") return "—"
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

function fmtPct(pct: unknown): string {
  if (typeof pct !== "number") return "—"
  return `${pct}%`
}

function buildDailyTrafficPrompt(mp: MonthlyProjectionsRaw): string {
  const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
  const DAY_LABELS: Record<string, string> = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday",
  }

  const schedule = (mp.weekly_schedule ?? {}) as Record<string, { open?: boolean; open_time?: string; close_time?: string }>
  const flow = (mp.daily_flow ?? {}) as Record<string, number>
  const openDays = DAY_KEYS.filter((d) => schedule[d]?.open)
  if (openDays.length === 0) return ""

  const scheduleLines = openDays.map((d) => {
    const s = schedule[d]
    const customers = flow[d] ?? 0
    return `  ${DAY_LABELS[d]}: ${s?.open_time ?? "?"}–${s?.close_time ?? "?"}, ${customers} customers`
  })
  const totalWeekly = openDays.reduce((sum, d) => sum + (flow[d] ?? 0), 0)
  const avgPerDay = openDays.length > 0 ? Math.round(totalWeekly / openDays.length) : 0

  return `Analyse the daily traffic and operating schedule for this coffee shop.

Operating schedule (${openDays.length} days/week):
${scheduleLines.join("\n")}

Weekly total: ${totalWeekly} customers
Average per open day: ${avgPerDay} customers

Assess whether the customer volume and hours are realistic. Flag schedule patterns that could affect revenue (e.g. no weekend coverage, very long hours with low traffic). Include concrete benchmarks for typical coffee shop daily foot traffic. Weight concerns by severity.

${JSON_SCHEMA_INSTRUCTION}`
}

function buildRevenueStreamsPrompt(mp: MonthlyProjectionsRaw): string {
  const avgTicketCents = mp.avg_ticket_cents as number | undefined
  const cogsPct = mp.cogs_pct as number | undefined
  const revenueSplit = mp.revenue_split_enabled as boolean | undefined
  const bevTicketCents = mp.beverage_ticket_cents as number | undefined
  const foodTicketCents = mp.food_ticket_cents as number | undefined

  const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
  const schedule = (mp.weekly_schedule ?? {}) as Record<string, { open?: boolean }>
  const flow = (mp.daily_flow ?? {}) as Record<string, number>
  const openDays = DAY_KEYS.filter((d) => schedule[d]?.open)
  const totalWeekly = openDays.reduce((sum, d) => sum + (flow[d] ?? 0), 0)

  const fields: string[] = []
  if (revenueSplit && bevTicketCents != null && foodTicketCents != null) {
    fields.push(`Beverage avg ticket: ${fmtCents(bevTicketCents)}`)
    fields.push(`Food avg ticket: ${fmtCents(foodTicketCents)}`)
    fields.push(`Combined avg ticket: ${fmtCents(bevTicketCents + foodTicketCents)}`)
  } else if (avgTicketCents != null) {
    fields.push(`Average ticket: ${fmtCents(avgTicketCents)}`)
  }
  if (cogsPct != null) fields.push(`COGS % of revenue: ${fmtPct(cogsPct)}`)
  if (totalWeekly > 0) fields.push(`Weekly customers: ${totalWeekly}`)
  if (fields.length === 0) return ""

  const forecastLines = Array.isArray(mp.forecast_lines)
    ? (mp.forecast_lines as Array<Record<string, unknown>>)
    : []
  const revenueLines = forecastLines.filter((l) => l.category === "revenue" && ((l.value as number) ?? 0) > 0)
  const revLinesSummary =
    revenueLines.length > 0
      ? revenueLines.map((l) => `  ${l.label ?? "Revenue line"}: ${fmtCents(l.value as number)}/mo`).join("\n")
      : "  None"

  return `Analyse the revenue streams for this coffee shop.

Revenue inputs:
${fields.map((f) => `  ${f}`).join("\n")}

Additional revenue streams:
${revLinesSummary}

Assess whether the average ticket and COGS % are realistic. Benchmark against typical coffee shop norms (avg ticket $6–$10, COGS 28–35%). Flag if COGS is out of range. Evaluate whether additional revenue streams diversify income effectively. Weight concerns by severity.

${JSON_SCHEMA_INSTRUCTION}`
}

// ── TIM-3888: Menu ingredients context loader ────────────────────────────────

const MENU_INGREDIENTS_LIMIT = 60

async function loadMenuIngredientsContext(
  supabase: SupabaseClient,
  planId: string,
): Promise<string> {
  const { data: ingredients, error: ingredientsError } = await supabase
    .from("menu_ingredients")
    .select("name, package_size, package_unit, package_cost_cents, category, notes")
    .eq("plan_id", planId)
    .order("name", { ascending: true })
    .limit(MENU_INGREDIENTS_LIMIT)

  if (ingredientsError) throw new Error(`loadMenuIngredientsContext: ${ingredientsError.message}`)
  if (!ingredients || ingredients.length === 0) return ""

  const truncated = ingredients.length === MENU_INGREDIENTS_LIMIT
  const lines = ingredients.map((ing) => {
    const costPkg = ing.package_cost_cents / 100
    const cpu = ing.package_size > 0
      ? `$${(costPkg / ing.package_size).toFixed(4)}/${ing.package_unit}`
      : null
    const costLine = ing.package_cost_cents > 0
      ? `$${costPkg.toFixed(2)} for ${ing.package_size} ${ing.package_unit}${cpu ? ` → ${cpu}` : ""}`
      : "no cost entered"
    const cat = ing.category ? ` [${ing.category}]` : ""
    const note = ing.notes?.trim() ? ` (${ing.notes.trim()})` : ""
    return `  ${ing.name}${cat}: ${costLine}${note}`
  })

  const catalogHeader = truncated
    ? `Ingredient catalog (first ${MENU_INGREDIENTS_LIMIT} of a larger catalog, alphabetical):`
    : `Ingredient catalog (${ingredients.length} items):`

  return `Analyse the ingredient cost structure for this coffee shop's menu.

${catalogHeader}
${lines.join("\n")}

Evaluate: cost-per-unit competitiveness, any ingredients that look unusually expensive or cheap for their category, gaps (common coffee-shop ingredients that are missing), and diversity of supply sources implied by the catalog. Recommend 2–4 concrete actions the owner can take to reduce ingredient costs or improve margin without sacrificing quality. Include benchmarkContext if you can cite typical wholesale cost ranges for coffee ingredients.

${JSON_SCHEMA_INSTRUCTION}`
}

function buildCostsOverheadPrompt(mp: MonthlyProjectionsRaw): string {
  const fields: string[] = []

  const forecastLines = Array.isArray(mp.forecast_lines)
    ? (mp.forecast_lines as Array<Record<string, unknown>>)
    : []
  const costLines = forecastLines.filter(
    (l) => ["overhead", "cogs"].includes(l.category as string) && ((l.value as number) ?? 0) > 0,
  )
  costLines.forEach((l) => fields.push(`  ${l.label ?? "Cost line"}: ${fmtCents(l.value as number)}/mo`))

  const paymentPct = mp.payment_processing_pct as number | undefined
  const spoilagePct = mp.spoilage_pct as number | undefined
  const loyaltyPct = mp.loyalty_discount_pct as number | undefined
  if (paymentPct != null && paymentPct > 0) fields.push(`Payment processing: ${fmtPct(paymentPct)}`)
  if (spoilagePct != null && spoilagePct > 0) fields.push(`Spoilage: ${fmtPct(spoilagePct)}`)
  if (loyaltyPct != null && loyaltyPct > 0) fields.push(`Loyalty discount: ${fmtPct(loyaltyPct)}`)

  const personnel = Array.isArray(mp.personnel) ? (mp.personnel as Array<Record<string, unknown>>) : []
  if (personnel.length > 0) {
    fields.push(`Personnel (${personnel.length} roles):`)
    personnel.forEach((p) => {
      const pay =
        (p.hourly_rate_cents as number) > 0
          ? `${fmtCents(p.hourly_rate_cents as number)}/hr`
          : `${fmtCents(p.annual_salary_cents as number)}/yr`
      fields.push(`  ${p.role_title ?? "Staff"}: ${pay}`)
    })
  }

  const sc = (mp.startup_costs ?? {}) as Record<string, unknown>
  const equipmentCents = (sc.equipment_cents as number) ?? 0
  const buildoutCents = (sc.buildout_cents as number) ?? 0
  const totalStartup = equipmentCents + buildoutCents
  if (totalStartup > 0) {
    fields.push(
      `Startup costs: ${fmtCents(totalStartup)} (equipment: ${fmtCents(equipmentCents)}, buildout: ${fmtCents(buildoutCents)})`,
    )
  }

  const funding = Array.isArray(mp.funding_sources) ? (mp.funding_sources as Array<Record<string, unknown>>) : []
  if (funding.length > 0) {
    fields.push(`Funding sources (${funding.length}):`)
    funding.forEach((f) => fields.push(`  ${f.label ?? "Funding"}: ${fmtCents(f.amount_cents as number)}`))
  }

  if (fields.length === 0) return ""

  return `Analyse the costs, overhead, and staffing for this coffee shop.

Cost inputs:
${fields.join("\n")}

Assess whether the cost structure is realistic. Benchmark overhead against industry norms (rent typically 8–12% of revenue, payroll 35–45% of revenue). Flag overspending or underspending in any category. Evaluate whether startup costs and funding are adequate. Weight concerns by severity: critical = financially dangerous gap, warn = needs adjustment, info = worth monitoring.

${JSON_SCHEMA_INSTRUCTION}`
}

function buildGrowthRampPrompt(mp: MonthlyProjectionsRaw): string {
  const fields: string[] = []

  const rampMonths = mp.ramp_months as number | undefined
  const rampMultipliers = Array.isArray(mp.ramp_multipliers) ? (mp.ramp_multipliers as number[]) : []
  const growthMode = (mp.growth_mode ?? "simple") as string
  const growthMonthlyPct = mp.growth_monthly_pct as number | undefined
  const growthCustomMonthly = Array.isArray(mp.growth_custom_monthly) ? (mp.growth_custom_monthly as number[]) : []
  const incomeTaxPct = mp.income_tax_pct as number | undefined
  const salesTaxPct = mp.sales_tax_pct as number | undefined

  if (rampMonths != null && rampMonths > 0) {
    fields.push(`Ramp period: ${rampMonths} months`)
    if (rampMultipliers.length > 0) {
      fields.push(`Ramp multipliers: ${rampMultipliers.map((v, i) => `M${i + 1}=${v}%`).join(", ")}`)
    }
  } else {
    fields.push("Ramp period: none (starts at full revenue)")
  }

  if (growthMode === "custom" && growthCustomMonthly.length > 0) {
    fields.push(`Monthly growth (custom): ${growthCustomMonthly.map((v, i) => `M${i + 1}=${v}%`).join(", ")}`)
  } else if (growthMonthlyPct != null) {
    const annualApprox = Math.round(((1 + growthMonthlyPct / 100) ** 12 - 1) * 100)
    fields.push(`Monthly growth: ${fmtPct(growthMonthlyPct)} (~${annualApprox}% annually)`)
  }

  if (incomeTaxPct != null) fields.push(`Income tax rate: ${fmtPct(incomeTaxPct)}`)
  if (salesTaxPct != null) fields.push(`Sales tax rate: ${fmtPct(salesTaxPct)}`)
  if (fields.length === 0) return ""

  return `Analyse the growth assumptions and tax settings for this coffee shop projection.

Growth and tax inputs:
${fields.map((f) => `  ${f}`).join("\n")}

Assess whether the ramp period is realistic (a new coffee shop typically takes 3–12 months to reach steady-state). Evaluate whether the monthly growth rate is achievable (2–5%/month is aggressive; over 8%/month is unrealistic for a single location). Flag income tax rates far from typical small-business rates (20–30%). Include benchmarks where applicable. Weight concerns by severity.

${JSON_SCHEMA_INSTRUCTION}`
}

// ── Route handler ─────────────────────────────────────────────────────────────

type RouteContext = { params: Promise<{ sectionKind: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  // Feature flag gate — 403 when explicitly disabled (mirrors ai-analyse-button.ts default-ON polarity).
  if (process.env.NEXT_PUBLIC_AI_ANALYSE_BUTTON === "false") {
    return Response.json({ error: "Feature not available" }, { status: 403 })
  }

  const { sectionKind } = await params

  if (!isSectionKind(sectionKind)) {
    return Response.json({ error: `Unknown section kind: ${sectionKind}` }, { status: 400 })
  }

  // Rule 2: server-side auth.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Rule 4: rate-limit before any expensive work — short window + daily cap.
  const rl1 = await enforceRateLimit({ bucket: "ai-analyse:1m", id: user.id, limit: 5, windowSec: 60 })
  if (rl1) return rl1
  const rl2 = await enforceRateLimit({
    bucket: "ai-analyse:1d",
    id: user.id,
    limit: 20,
    windowSec: 86400,
  })
  if (rl2) return rl2

  // Rule 2: plan tier + subscription (Pro required — analyse is a paid feature).
  const { data: profile } = await supabase
    .from("users")
    .select(
      "subscription_status, subscription_tier, trial_ends_at, beta_waiver_until, paused_from_tier",
    )
    .eq("id", user.id)
    .single()

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 })
  }

  if (!isBetaWaived(profile.beta_waiver_until) && effectivePlanForGating(profile) !== "pro") {
    return Response.json({ error: "Pro plan required", code: "pro_required" }, { status: 402 })
  }

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  // Rule 3: validate request body.
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsedBody = RequestBodySchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return Response.json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    )
  }

  const { resourceId } = parsedBody.data

  if (
    (sectionKind === "location-property" || sectionKind === "lease-terms") &&
    !resourceId
  ) {
    return Response.json({ error: "resourceId (candidateId) required for this section" }, { status: 400 })
  }
  // Sections that do not use resourceId — reject any stray value at the boundary.
  if (
    (sectionKind === "location-shortlist" ||
      sectionKind === "marketing-channels" ||
      sectionKind === "marketing-pre-launch" ||
      sectionKind === "financials-cogs-menu" ||
      sectionKind === "financials-cogs-additional" ||
      sectionKind === "menu-ingredients") &&
    resourceId
  ) {
    return Response.json({ error: "resourceId is not accepted for this section" }, { status: 400 })
  }

  // ── Load section-specific data ────────────────────────────────────────────

  let prompt = ""
  let sectionKey = ""

  try {
    if (sectionKind === "location-property") {
      const ctx = await loadPropertyContext(supabase, planId, resourceId!)
      if (!ctx.owned) return Response.json({ error: "Candidate not found" }, { status: 404 })
      if (!ctx.prompt) return Response.json({ error: "No data available to analyse" }, { status: 422 })
      prompt = ctx.prompt
      sectionKey = `location-lease.property.${resourceId}`
    } else if (sectionKind === "location-shortlist") {
      prompt = await loadShortlistContext(supabase, planId)
      if (!prompt) return Response.json({ error: "No candidates on shortlist yet" }, { status: 422 })
      sectionKey = `location-lease.shortlist.${planId}`
    } else if (sectionKind === "marketing-channels") {
      prompt = await loadMarketingChannelsContext(supabase, planId)
      if (!prompt) {
        return Response.json(
          { error: "No channels selected yet. Add channels in the Marketing workspace before running analysis." },
          { status: 422 },
        )
      }
      sectionKey = `marketing.channels.${planId}`
    } else if (sectionKind === "marketing-pre-launch") {
      prompt = await loadMarketingPreLaunchContext(supabase, planId)
      if (!prompt) {
        return Response.json(
          { error: "No milestones in the pre-launch plan yet. Add milestones before running analysis." },
          { status: 422 },
        )
      }
      sectionKey = `marketing.pre-launch.${planId}`
    } else if (sectionKind === "financials-cogs-menu") {
      prompt = await loadCogsMenuContext(supabase, planId)
      if (!prompt) {
        return Response.json(
          { error: "No menu items with configured unit costs found. Add items in the Menu workspace and set monthly units in Financials before running analysis." },
          { status: 422 },
        )
      }
      sectionKey = `financials.cogs-menu.${planId}`
    } else if (sectionKind === "financials-cogs-additional") {
      prompt = await loadCogsAdditionalContext(supabase, planId)
      if (!prompt) {
        return Response.json(
          { error: "No additional COGS items yet. Add items before running analysis." },
          { status: 422 },
        )
      }
      sectionKey = `financials.cogs-additional.${planId}`
    } else if (sectionKind === "lease-terms") {
      const ctx = await loadLeaseTermsContext(supabase, planId, resourceId!)
      if (!ctx.owned) return Response.json({ error: "Candidate not found" }, { status: 404 })
      if (!ctx.prompt) {
        return Response.json(
          { error: "No lease terms on file — add lease terms before running analysis" },
          { status: 422 },
        )
      }
      prompt = ctx.prompt
      sectionKey = `location-lease.lease-terms.${resourceId}`
    } else if (sectionKind === "menu-ingredients") {
      prompt = await loadMenuIngredientsContext(supabase, planId)
      if (!prompt) return Response.json({ error: "No ingredients in catalog yet" }, { status: 422 })
      sectionKey = `menu-pricing.ingredients.${planId}`
    } else if (
      sectionKind === "financials-daily-traffic" ||
      sectionKind === "financials-revenue-streams" ||
      sectionKind === "financials-costs-overhead" ||
      sectionKind === "financials-growth-ramp"
    ) {
      // TIM-3897: Financials v2 sections — load from financial_models table.
      const financialsMp = await loadFinancialModel(supabase, planId)
      if (!financialsMp) {
        return Response.json({ error: "No financial model found" }, { status: 404 })
      }

      if (sectionKind === "financials-daily-traffic") {
        prompt = buildDailyTrafficPrompt(financialsMp)
        sectionKey = `financials.daily-traffic.${planId}`
      } else if (sectionKind === "financials-revenue-streams") {
        prompt = buildRevenueStreamsPrompt(financialsMp)
        sectionKey = `financials.revenue-streams.${planId}`
      } else if (sectionKind === "financials-costs-overhead") {
        prompt = buildCostsOverheadPrompt(financialsMp)
        sectionKey = `financials.costs-overhead.${planId}`
      } else if (sectionKind === "financials-growth-ramp") {
        prompt = buildGrowthRampPrompt(financialsMp)
        sectionKey = `financials.growth-ramp.${planId}`
      } else {
        // Should not be reachable — SECTION_KINDS allowlist checked at route entry
        return Response.json({ error: "Unknown section kind" }, { status: 400 })
      }

      if (!prompt) {
        return Response.json(
          { error: "Not enough data entered yet — fill in this section before running analysis" },
          { status: 422 },
        )
      }
    } else {
      const _exhaustive: never = sectionKind
      return Response.json({ error: `Unhandled section kind: ${_exhaustive}` }, { status: 500 })
    }
  } catch (err) {
    console.error(`[ai-analyse/${sectionKind}] data load error:`, err)
    return Response.json({ error: "Failed to load section data" }, { status: 500 })
  }

  // ── AI call with bounded retry (max 3 attempts) ───────────────────────────

  const lane = LANE_BY_KIND[sectionKind]
  const generatedAt = new Date().toISOString()

  let analysisResult: AnalyseResponse | null = null
  let lastScoutResult: Awaited<ReturnType<typeof runScoutTurn>> | null = null

  // Accumulate token counts across all retry attempts so telemetry reflects true spend.
  const accUsage = {
    inputTokensUncached: 0,
    inputTokensCachedRead: 0,
    inputTokensCacheCreate: 0,
    outputTokens: 0,
    webSearchRequests: 0,
    toolCalls: 0,
  }
  let accLatencyMs = 0

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const systemText =
        attempt === 0
          ? "You are a coffee shop business advisor. Give direct, specific, data-driven analysis. Plain English — no jargon, no emojis."
          : `You are a coffee shop business advisor. Previous response did not match the required JSON schema. Return ONLY valid JSON with the exact shape specified — no additional keys, no prose outside the JSON object.`

      const scoutResult = await runScoutTurn({
        lane,
        systemBlocks: [{ text: systemText }],
        messages: [{ role: "user", content: prompt }],
        maxTokens: 1500,
        userId: user.id,
        routeTag: ROUTE_PATH,
      })

      // Accumulate across attempts so telemetry captures total spend, not just the last attempt.
      accUsage.inputTokensUncached += scoutResult.usage.inputTokensUncached
      accUsage.inputTokensCachedRead += scoutResult.usage.inputTokensCachedRead
      accUsage.inputTokensCacheCreate += scoutResult.usage.inputTokensCacheCreate
      accUsage.outputTokens += scoutResult.usage.outputTokens
      accUsage.webSearchRequests += scoutResult.usage.webSearchRequests
      accUsage.toolCalls += scoutResult.usage.toolCalls
      accLatencyMs += scoutResult.latencyMs

      lastScoutResult = { ...scoutResult, usage: accUsage, latencyMs: accLatencyMs }

      const raw = extractJson(scoutResult.text ?? "")
      const validation = AIContentSchema.safeParse(raw)

      if (validation.success) {
        const d = validation.data
        // TIM-1002: normalize label-shaped fields through toTitleCase before returning.
        analysisResult = {
          version: 1,
          sectionKey,
          generatedAt,
          ...d,
          score: d.score ? { ...d.score, label: d.score.label ? toTitleCase(d.score.label) : d.score.label } : d.score,
        }
        break
      }

      if (attempt === 2) {
        console.error(
          `[ai-analyse/${sectionKind}] schema mismatch after 3 attempts — userId=${user.id} error=${validation.error.message.slice(0, 200)}`,
        )
        return Response.json({ error: "Analysis generation failed — please try again" }, { status: 502 })
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error(`[ai-analyse/${sectionKind}] AI call error — userId=${user.id}:`, msg)
    // Rule 5: sanitized message to client.
    return Response.json({ error: "Analysis generation failed" }, { status: 502 })
  }

  // ── Telemetry ─────────────────────────────────────────────────────────────

  if (lastScoutResult) {
    try {
      const telemetryClient = createServiceClient()
      const metricArgs = toTurnMetricArgs(lastScoutResult, lane)
      await recordTurnMetric(
        {
          async insert(row) {
            return telemetryClient.from("ai_turn_metrics").insert(row)
          },
        },
        {
          route: ROUTE_PATH,
          ...metricArgs,
          userId: user.id,
          planTier: resolvePlanTier(profile),
        },
      )
    } catch (telemetryErr) {
      // Swallow — a telemetry failure must not tank the user response.
      console.warn(`[ai-analyse/${sectionKind}] telemetry insert failed:`, telemetryErr)
    }
  }

  return Response.json(analysisResult)
}
