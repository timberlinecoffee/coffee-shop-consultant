// TIM-930: Stream AI feedback for a location scorecard.
// POST body: { planId: string }
// Streams SSE with delta/error/done events (same shape as copilot/stream).

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

Based on this scorecard, provide a structured assessment with exactly these four sections — use the exact headers below:

## Overall Risk Profile
Two to three sentences describing the overall risk level (low / medium / high) and the primary driver of that risk. Be direct and specific to this location's numbers.

## Top 3 Strengths
List exactly three bullet points. Each one names the specific criterion and explains why it matters for a coffee shop in practical terms.

## Top 3 Concerns
List exactly three bullet points. Each one names the specific criterion and explains the concrete risk or impact on the business.

## Due-Diligence Questions
List exactly five specific, actionable questions the owner should answer before signing a lease on this site. Make them concrete — not generic real estate questions.

Keep each section tight. No filler phrases, no "it's important to note that…" Lead with the insight.`
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
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
          system:
            "You are a knowledgeable coffee shop business advisor. Give direct, specific, actionable feedback. Never use filler phrases or hedge unnecessarily. Use plain English — no consultant jargon.",
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
