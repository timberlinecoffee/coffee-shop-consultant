// TIM-1115: AI trade-off analysis for shortlisted location candidates.
// POST body: { candidateIds: string[] }
// Returns JSON: { perCandidate: [{ id, name, strengths, weaknesses }], ranking: [{ id, name, position, reasoning }] }

export const runtime = "nodejs"
export const maxDuration = 60

import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { NextRequest } from "next/server"
import { toTitleCase } from "@/lib/text"
import { normalizeAIOutput } from "@/lib/normalize"
// TIM-2868: getActivePlanId() — see candidates/route.ts header.
import { getActivePlanId } from "@/lib/plan-context"
import { notifyIfCreditBalanceLow } from "@/lib/email/credit-balance-low-callsite"

const SCORECARD_FACTORS = [
  { key: "foot_traffic_weekday", label: "Weekday Foot Traffic" },
  { key: "foot_traffic_weekend", label: "Weekend Foot Traffic" },
  { key: "street_visibility", label: "Street Visibility" },
  { key: "parking", label: "Parking Availability" },
  { key: "public_transit", label: "Public Transit Proximity" },
  { key: "surrounding_businesses", label: "Surrounding Businesses" },
  { key: "demographics_fit", label: "Demographics Fit" },
  { key: "lease_cost_vs_market", label: "Lease Cost vs. Market" },
  { key: "space_layout", label: "Space Layout Suitability" },
  { key: "buildout_condition", label: "Build-out Condition" },
  { key: "permits_zoning", label: "Permits / Zoning" },
  { key: "safety_perception", label: "Safety / Area Perception" },
] as const

type CandidateRow = {
  id: string
  name: string
  address: string | null
  neighborhood: string | null
  sq_ft: number | null
  asking_rent_cents: number | null
}

type ScoreRow = {
  candidate_id: string
  factor_key: string
  score_1_5: number | null
  notes: string | null
}

type LeaseRow = {
  candidate_id: string
  base_rent_cents: number | null
  rent_escalation_pct: number | null
  term_months: number | null
}

function buildPrompt(
  candidates: CandidateRow[],
  scoresByCandidate: Map<string, ScoreRow[]>,
  leaseByCandidate: Map<string, LeaseRow | undefined>
): string {
  const blocks = candidates.map((c) => {
    const scoreLines = SCORECARD_FACTORS.map((f) => {
      const row = (scoresByCandidate.get(c.id) ?? []).find((s) => s.factor_key === f.key)
      const score = row?.score_1_5 != null ? `${row.score_1_5}/5` : "—"
      return `- ${f.label}: ${score}`
    }).join("\n")

    const lease = leaseByCandidate.get(c.id)
    const leaseLines: string[] = []
    if (lease?.base_rent_cents != null) leaseLines.push(`base rent $${(lease.base_rent_cents / 100).toFixed(0)}/mo`)
    if (lease?.term_months != null) leaseLines.push(`${lease.term_months}-month term`)
    if (lease?.rent_escalation_pct != null) leaseLines.push(`${lease.rent_escalation_pct}% annual escalation`)
    const leaseSummary = leaseLines.length ? leaseLines.join(", ") : "no lease terms captured"

    const identity = [c.address, c.neighborhood].filter(Boolean).join(", ") || "address not set"
    const intake = [
      c.sq_ft ? `${c.sq_ft} sq ft` : null,
      c.asking_rent_cents ? `$${(c.asking_rent_cents / 100).toFixed(0)}/mo asking` : null,
    ].filter(Boolean).join(", ")

    return `### ${c.name}
Identity: ${identity}${intake ? ` | ${intake}` : ""}
Lease: ${leaseSummary}
Scorecard:
${scoreLines}`
  }).join("\n\n")

  const idMap = candidates.map((c) => `- "${c.name}" → id ${c.id}`).join("\n")

  return `You are a coffee-shop site-selection advisor. Compare these shortlisted candidates side-by-side and give the owner a clear, opinionated trade-off read.

Candidates:

${blocks}

Candidate IDs (use the exact id strings in your response):
${idMap}

Return a single JSON object with this exact shape — no prose, no markdown fences, no preamble:

{
  "perCandidate": [
    {
      "id": "<uuid>",
      "strengths": ["short concrete strength", "...", "..."],
      "weaknesses": ["short concrete weakness", "...", "..."]
    }
  ],
  "ranking": [
    {
      "id": "<uuid>",
      "position": 1,
      "reasoning": "1-2 sentences saying why this candidate is at this rank versus the others."
    }
  ]
}

Rules:
- Use the candidate id strings exactly as given above.
- For each candidate: 2-3 strengths, 2-3 weaknesses. Concrete, specific to the numbers shown. No filler. No emojis. No consultant jargon.
- Strengths and weaknesses should each be a short noun phrase (Title Case where appropriate, e.g. "Strong Weekday Foot Traffic", "Above-Market Rent"). Not a full sentence.
- Rank every candidate, 1 = best, n = worst. Include every candidate id.
- Reasoning is one or two plain-English sentences — name the trade-off ("wins on X, loses on Y") and the deciding factor.
- Do not invent data that is not in the scorecard or lease terms.`
}

type PerCandidateOut = { id: string; strengths: string[]; weaknesses: string[] }
type RankingOut = { id: string; position: number; reasoning: string }
type Parsed = { perCandidate: PerCandidateOut[]; ranking: RankingOut[] }

function safeParseJson(raw: string): Parsed | null {
  // Strip leading/trailing fences just in case the model adds them
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "")
  try {
    const parsed = JSON.parse(cleaned) as Parsed
    if (!parsed.perCandidate || !Array.isArray(parsed.perCandidate)) return null
    if (!parsed.ranking || !Array.isArray(parsed.ranking)) return null
    return parsed
  } catch {
    return null
  }
}

function titleCaseList(items: string[]): string[] {
  return items.map((s) => {
    const trimmed = s.trim()
    if (!trimmed) return trimmed
    // Treat as label-shaped; pass through title case helper.
    return toTitleCase(trimmed)
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("users")
    .select("ai_credits_remaining, subscription_tier, subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .maybeSingle()

  const tier = profile?.subscription_tier ?? "free"
  const credits = profile?.ai_credits_remaining ?? 0
  if (tier === "free") {
    return Response.json({ error: "AI trade-off feedback requires a paid plan." }, { status: 402 })
  }
  if (credits <= 0) {
    return Response.json({ error: "You are out of AI credits this month." }, { status: 402 })
  }

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: { candidateIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!Array.isArray(body.candidateIds) || body.candidateIds.length < 2) {
    return Response.json({ error: "Need at least 2 candidate IDs to compare." }, { status: 400 })
  }
  if (body.candidateIds.length > 6) {
    return Response.json({ error: "Compare up to 6 candidates at a time." }, { status: 400 })
  }
  const ids = body.candidateIds.filter((v): v is string => typeof v === "string")
  if (ids.length !== body.candidateIds.length) {
    return Response.json({ error: "candidateIds must be strings." }, { status: 400 })
  }

  const { data: candidates } = await supabase
    .from("location_candidates")
    .select("id, plan_id, name, address, neighborhood, sq_ft, asking_rent_cents")
    .in("id", ids)
  if (!candidates || candidates.length === 0) {
    return Response.json({ error: "No candidates found." }, { status: 404 })
  }
  for (const c of candidates) {
    if (c.plan_id !== planId) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const [{ data: scoreRows }, { data: leaseRows }] = await Promise.all([
    supabase
      .from("location_rubric_scores")
      .select("candidate_id, factor_key, score_1_5, notes")
      .in("candidate_id", ids)
      .in("factor_key", SCORECARD_FACTORS.map((f) => f.key)),
    supabase
      .from("location_lease_terms")
      .select("candidate_id, base_rent_cents, rent_escalation_pct, term_months")
      .in("candidate_id", ids),
  ])

  const scoresByCandidate = new Map<string, ScoreRow[]>()
  for (const row of (scoreRows ?? []) as ScoreRow[]) {
    const list = scoresByCandidate.get(row.candidate_id) ?? []
    list.push(row)
    scoresByCandidate.set(row.candidate_id, list)
  }

  const leaseByCandidate = new Map<string, LeaseRow | undefined>()
  for (const row of (leaseRows ?? []) as LeaseRow[]) {
    leaseByCandidate.set(row.candidate_id, row)
  }

  const candidateList = candidates as CandidateRow[]

  // Require at least one scored factor across the set, otherwise the comparison is meaningless.
  const totalScored = (scoreRows ?? []).filter((s) => s.score_1_5 != null).length
  if (totalScored === 0) {
    return Response.json(
      { error: "Score at least one location before generating a trade-off." },
      { status: 422 }
    )
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const prompt = buildPrompt(candidateList, scoresByCandidate, leaseByCandidate)

  let raw: string
  try {
    const message = await anthropic.messages.create({
      model: PLATFORM_AI_MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a knowledgeable coffee shop site-selection advisor. Reply ONLY with the JSON object the user asks for. No prose outside the JSON. Use plain English in the reasoning fields — direct, opinionated, no filler.",
    })

    // TIM-2509: record per-turn telemetry into ai_turn_metrics on every
    // successful Anthropic call. resolvePlanTier handles a partially-populated
    // profile gracefully (no beta_waiver_until → not beta_waived).
    const telemetrySvc = createServiceClient()
    await recordTurnMetric(
      {
        async insert(row) {
          return telemetrySvc.from("ai_turn_metrics").insert(row)
        },
      },
      {
        route: "/api/workspaces/location-lease/tradeoff",
        model: PLATFORM_AI_MODEL,
        usage: message.usage,
        userId: user.id,
        planTier: resolvePlanTier(profile ?? {}),
      },
    )

    const firstBlock = message.content[0]
    if (!firstBlock || firstBlock.type !== "text") {
      return Response.json({ error: "AI returned no text." }, { status: 502 })
    }
    raw = firstBlock.text
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI tradeoff failed."
    return Response.json({ error: msg }, { status: 502 })
  }

  const parsed = safeParseJson(raw)
  if (!parsed) {
    return Response.json({ error: "AI returned unparseable output." }, { status: 502 })
  }

  // Cross-reference candidate names; apply Title Case to strengths/weaknesses.
  const nameById = new Map(candidateList.map((c) => [c.id, c.name]))
  const perCandidate = parsed.perCandidate
    .filter((p) => nameById.has(p.id))
    .map((p) => ({
      id: p.id,
      name: nameById.get(p.id)!,
      strengths: titleCaseList(Array.isArray(p.strengths) ? p.strengths : []).slice(0, 4),
      weaknesses: titleCaseList(Array.isArray(p.weaknesses) ? p.weaknesses : []).slice(0, 4),
    }))

  const ranking = parsed.ranking
    .filter((r) => nameById.has(r.id))
    .map((r) => ({
      id: r.id,
      name: nameById.get(r.id)!,
      position: typeof r.position === "number" ? r.position : 99,
      reasoning: normalizeAIOutput(typeof r.reasoning === "string" ? r.reasoning.trim() : ""),
    }))
    .sort((a, b) => a.position - b.position)

  // Decrement AI credit
  const postDebitBalance = Math.max(0, credits - 1)
  await supabase
    .from("users")
    .update({ ai_credits_remaining: postDebitBalance })
    .eq("id", user.id)
  // TIM-3023: at-most-one credit-balance-low notice per month.
  void notifyIfCreditBalanceLow({ userId: user.id, postMutationBalance: postDebitBalance })

  return Response.json({ perCandidate, ranking })
}
