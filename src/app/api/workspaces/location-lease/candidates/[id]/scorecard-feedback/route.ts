// TIM-930: Stream AI feedback for a location scorecard.
// TIM-1104: Every concern must be paired with a concrete recommendation, a
//           specific next step the owner can take, and a one-sentence why.
// POST body: { planId: string }
// Streams SSE with delta/error/done events (same shape as copilot/stream).
// TIM-1365 normalization: pure stream — tokens are sent as-is. Client normalizes the assembled
// text via normalizeAIOutput() after SSE stream ends. *.delta.text is exempt from the ESLint gate.

export const runtime = "nodejs"
export const maxDuration = 60

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

type RouteContext = { params: Promise<{ id: string }> }

const SCORECARD_FACTORS = [
  { key: "foot_traffic_weekday", label: "Weekday Foot Traffic", hasScore: true },
  { key: "foot_traffic_weekend", label: "Weekend Foot Traffic", hasScore: true },
  { key: "street_visibility", label: "Street Visibility", hasScore: true },
  { key: "parking", label: "Parking Availability", hasScore: true },
  { key: "public_transit", label: "Public Transit Proximity", hasScore: true },
  { key: "surrounding_businesses", label: "Surrounding Businesses", hasScore: true },
  { key: "demographics_fit", label: "Demographics Fit", hasScore: true },
  { key: "lease_cost_vs_market", label: "Lease Cost vs. Market", hasScore: true },
  { key: "space_layout", label: "Space Layout Suitability", hasScore: true },
  { key: "buildout_condition", label: "Build-out Condition", hasScore: true },
  { key: "permits_zoning", label: "Permits / Zoning", hasScore: true },
  { key: "safety_perception", label: "Safety / Area Perception", hasScore: true },
  { key: "gut_feel", label: "Owner's Gut Feel", hasScore: false },
] as const

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function buildPrompt(
  candidateName: string,
  address: string | null,
  neighborhood: string | null,
  scores: Array<{ factor_key: string; score_1_5: number | null; notes: string | null }>
): string {
  const scoredLines = SCORECARD_FACTORS.map(f => {
    const row = scores.find(s => s.factor_key === f.key)
    const score = row?.score_1_5 != null ? `${row.score_1_5}/5` : "not rated"
    const notes = row?.notes?.trim() ? ` — ${row.notes.trim()}` : ""
    return `- **${f.label}**: ${score}${notes}`
  }).join("\n")

  const locationDesc = [candidateName, address, neighborhood].filter(Boolean).join(", ")

  return `You are reviewing a location scorecard for a coffee shop candidate site: **${locationDesc}**.

Here are the scores and observations across 12 criteria (1 = poor, 5 = excellent):

${scoredLines}

Based on this scorecard, provide a structured assessment with exactly these five sections — use the exact headers below in this order:

## Recommendation
Start the body with a single bolded verdict on its own line, choosing exactly one of: **Move Forward**, **Negotiate First**, or **Pass**. Then write one short paragraph (2–3 sentences max) explaining the verdict in plain English — what tips the decision, and the single biggest thing that would change it.

## Overall Risk Profile
Two to three sentences describing the overall risk level (low / medium / high) and the primary driver of that risk. Be direct and specific to this location's numbers.

## Top 3 Strengths
List exactly three bullet points. Each one names the specific criterion and explains why it matters for a coffee shop in practical terms.

## Top 3 Concerns
List exactly three concerns. For EACH concern, write a small block with these four lines in this exact order — no extra prose between them:

- **Concern:** name the specific criterion and the concrete risk or impact on the business (1 sentence).
- **Recommendation:** what to do to mitigate or fix it. Be concrete with numbers, vendors, or specific actions when possible. No vague verbs ("consider", "explore"). (1 sentence)
- **Next Step:** the single, named thing the owner can do this week to act on it (1 sentence with a target, e.g. "Email the landlord and ask for a 6-month TI allowance breakdown.").
- **Why It Should Work:** one sentence on the mechanism — why this fix lowers the risk.

## Due-Diligence Questions
List exactly five specific, actionable questions the owner should answer before signing a lease on this site. Make them concrete — not generic real estate questions.

Keep each section tight. No filler phrases, no "it's important to note that…" Lead with the insight. Never name a concern without telling the owner exactly what to do about it.`
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id: candidateId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single()
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  // Ownership + candidate load
  const { data: candidate } = await supabase
    .from("location_candidates")
    .select("id, plan_id, name, address, neighborhood")
    .eq("id", candidateId)
    .maybeSingle()
  if (!candidate) return Response.json({ error: "Candidate not found" }, { status: 404 })
  if (candidate.plan_id !== plan.id) return Response.json({ error: "Forbidden" }, { status: 403 })

  // Load scorecard scores
  const { data: scoreRows } = await supabase
    .from("location_rubric_scores")
    .select("factor_key, score_1_5, notes")
    .eq("candidate_id", candidateId)
    .in("factor_key", SCORECARD_FACTORS.map(f => f.key))

  const scores = (scoreRows ?? []) as Array<{ factor_key: string; score_1_5: number | null; notes: string | null }>

  const hasAnyScore = scores.some(s => s.score_1_5 != null || s.notes?.trim())
  if (!hasAnyScore) {
    return Response.json({ error: "Fill in at least one scorecard criterion before requesting feedback." }, { status: 422 })
  }

  const prompt = buildPrompt(candidate.name, candidate.address, candidate.neighborhood, scores)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1800,
          messages: [{ role: "user", content: prompt }],
          system:
            "You are a knowledgeable coffee shop business advisor. Give direct, specific, actionable feedback. Never name a problem, risk, or weakness without pairing it with a concrete recommendation, a single named next step, and a one-sentence why. No filler phrases, no hedging. Plain English — no consultant jargon (never use: leverage, synergy, curated, unlock, elevate, embark, delve). No emojis. Title case for any headings; sentence case for body copy.",
        })

        for await (const chunk of response) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(sse("text", { delta: chunk.delta.text })))
          }
        }

        const finalMsg = await response.finalMessage()
        controller.enqueue(encoder.encode(sse("done", { threadId: finalMsg.id })))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "AI feedback failed."
        controller.enqueue(encoder.encode(sse("error", { code: "error", message: msg })))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
