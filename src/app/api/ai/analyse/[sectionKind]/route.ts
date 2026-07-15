// TIM-3878: POST /api/ai/analyse/<sectionKind>
// Phase 3 of TIM-3870 — structured AI analysis for location-property,
// location-shortlist, and lease-terms sections. Pro plan only.
// TIM-3894: Concept workspace — concept-differentiation, concept-competitors.
//
// Rule 1 (RLS): No new tables. Reads only existing tables that already have
//   RLS enabled (location_candidates, location_rubric_scores, location_lease_terms,
//   module_responses). No service-client writes.
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
import type { NextRequest } from "next/server"
import type { ScoutLane } from "@/lib/ai/scout-lane"

export const runtime = "nodejs"
export const maxDuration = 60

const ROUTE_PATH = "/api/ai/analyse/[sectionKind]"

const SECTION_KINDS = [
  "location-property",
  "location-shortlist",
  "lease-terms",
  "concept-differentiation",
  "concept-competitors",
] as const
type SectionKind = (typeof SECTION_KINDS)[number]

function isSectionKind(v: string): v is SectionKind {
  return (SECTION_KINDS as readonly string[]).includes(v)
}

const LANE_BY_KIND: Record<SectionKind, ScoutLane> = {
  "location-property": "analyse_location_property",
  "location-shortlist": "analyse_location_shortlist",
  "lease-terms": "analyse_lease_terms",
  "concept-differentiation": "analyse_concept_differentiation",
  "concept-competitors": "analyse_concept_competitors",
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

// ── TIM-3894: Concept workspace context loaders ───────────────────────────────

type ConceptComponentsRow = {
  components?: Record<string, { content?: string }>
  personas?: Array<{ name?: string; whyTheyVisit?: string }>
  competitors?: Array<{ name?: string; address?: string }>
  no_direct_competitors_identified?: boolean
}

async function loadConceptDoc(
  supabase: SupabaseClient,
  planId: string,
): Promise<ConceptComponentsRow | null> {
  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", planId)
    .eq("workspace_key", "concept")
    .maybeSingle()

  if (!doc?.content) return null
  return doc.content as ConceptComponentsRow
}

function conceptField(doc: ConceptComponentsRow, key: string): string {
  return (doc.components?.[key]?.content ?? "").trim()
}

async function loadDifferentiationContext(
  supabase: SupabaseClient,
  planId: string,
): Promise<string> {
  const doc = await loadConceptDoc(supabase, planId)
  if (!doc) return ""

  const differentiation = conceptField(doc, "differentiation")
  if (!differentiation) return ""

  const contextFields: string[] = []
  const shopName = conceptField(doc, "shop_identity")
  if (shopName) contextFields.push(`Shop name: ${shopName}`)
  const vision = conceptField(doc, "vision")
  if (vision) contextFields.push(`Vision: ${vision}`)
  const brandVoice = conceptField(doc, "brand_voice")
  if (brandVoice) contextFields.push(`Brand voice: ${brandVoice}`)
  const offering = conceptField(doc, "offering")
  if (offering) contextFields.push(`Offering: ${offering}`)
  const location = conceptField(doc, "location")
  if (location) contextFields.push(`Location context: ${location}`)

  const personas = (doc.personas ?? [])
    .map((p) => p.name?.trim())
    .filter(Boolean)
    .slice(0, 3)
  if (personas.length > 0) contextFields.push(`Target personas: ${personas.join(", ")}`)

  return `Analyse the differentiation strategy for this coffee shop concept.

Differentiation statement: ${differentiation}
${contextFields.length > 0 ? `\nContext:\n${contextFields.map((f) => `  ${f}`).join("\n")}` : ""}

Evaluate: how distinctive and defensible this differentiation is, whether competitors in a typical coffee market could easily replicate it, how well it aligns with the stated vision and target customers, and what the owner can do to sharpen or reinforce it. Weight concerns by severity (critical = core risk to the business model, warn = should address before launch, info = useful refinement).

${JSON_SCHEMA_INSTRUCTION}`
}

async function loadCompetitorsContext(
  supabase: SupabaseClient,
  planId: string,
): Promise<string> {
  const doc = await loadConceptDoc(supabase, planId)
  if (!doc) return ""

  const competitors = doc.competitors ?? []
  const noDirectCompetitors = doc.no_direct_competitors_identified === true

  if (competitors.length === 0 && !noDirectCompetitors) return ""

  const contextFields: string[] = []
  const shopName = conceptField(doc, "shop_identity")
  if (shopName) contextFields.push(`Shop name: ${shopName}`)
  const differentiation = conceptField(doc, "differentiation")
  if (differentiation) contextFields.push(`Differentiation: ${differentiation}`)
  const location = conceptField(doc, "location")
  if (location) contextFields.push(`Location: ${location}`)

  const competitorLines =
    noDirectCompetitors && competitors.length === 0
      ? ["Owner indicates no direct competitors in their catchment."]
      : competitors.map((c) => {
          const parts = [c.name?.trim(), c.address?.trim()].filter(Boolean)
          return `  - ${parts.join(" · ")}`
        })

  return `Analyse the competitive landscape for this coffee shop based on nearby competitors.
${contextFields.length > 0 ? `\nShop context:\n${contextFields.map((f) => `  ${f}`).join("\n")}` : ""}

Nearby competitors:
${competitorLines.join("\n")}

Evaluate: how competitive this market appears, whether the owner's differentiation addresses the competitive pressures identified, any gaps or under-served customer segments the competitors leave open, and concrete actions to strengthen the owner's competitive position before launch. Weight concerns by severity (critical = direct threat to viability, warn = requires a clear response strategy, info = worth monitoring).

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
    } else if (sectionKind === "concept-differentiation") {
      prompt = await loadDifferentiationContext(supabase, planId)
      if (!prompt) {
        return Response.json(
          { error: "Fill in your Differentiation section before running analysis" },
          { status: 422 },
        )
      }
      sectionKey = `concept.differentiation.${planId}`
    } else if (sectionKind === "concept-competitors") {
      prompt = await loadCompetitorsContext(supabase, planId)
      if (!prompt) {
        return Response.json(
          { error: "Add competitors or mark no direct competitors before running analysis" },
          { status: 422 },
        )
      }
      sectionKey = `concept.competitors.${planId}`
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
  let accUsage = {
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
        analysisResult = {
          version: 1,
          sectionKey,
          generatedAt,
          ...validation.data,
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
