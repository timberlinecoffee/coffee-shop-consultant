// TIM-776 / TIM-620-B: Upsert rubric scores for a location candidate.
// TIM-930: Extended to include scorecard factor keys.
// Body: { scores: Array<{ factor_key, score_1_5, notes? }> }
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

type RouteContext = { params: Promise<{ id: string }> }

const VALID_FACTORS = new Set([
  // Original rubric factors
  "foot_traffic",
  "parking_transit",
  "visibility",
  "neighborhood_fit",
  "buildout_cost_estimate",
  "lease_terms",
  // Scorecard factors (TIM-930)
  "foot_traffic_weekday",
  "foot_traffic_weekend",
  "street_visibility",
  "parking",
  "public_transit",
  "surrounding_businesses",
  "demographics_fit",
  "lease_cost_vs_market",
  "space_layout",
  "buildout_condition",
  "permits_zoning",
  "safety_perception",
  "gut_feel",
])

export async function PUT(request: NextRequest, { params }: RouteContext) {
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

  // Ownership check: candidate must belong to the user's plan.
  const { data: candidate } = await supabase
    .from("location_candidates")
    .select("id, plan_id")
    .eq("id", candidateId)
    .maybeSingle()

  if (!candidate) return Response.json({ error: "Candidate not found" }, { status: 404 })
  if (candidate.plan_id !== plan.id) return Response.json({ error: "Forbidden" }, { status: 403 })

  let body: { scores?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!Array.isArray(body.scores)) {
    return Response.json({ error: "scores must be an array" }, { status: 400 })
  }

  for (const entry of body.scores) {
    if (typeof entry !== "object" || entry === null) {
      return Response.json({ error: "Each score entry must be an object" }, { status: 400 })
    }
    const { factor_key, score_1_5 } = entry as Record<string, unknown>
    if (typeof factor_key !== "string" || !VALID_FACTORS.has(factor_key)) {
      return Response.json(
        { error: `Invalid factor_key: ${factor_key}. Must be one of: ${[...VALID_FACTORS].join(", ")}` },
        { status: 400 }
      )
    }
    if (score_1_5 !== null && score_1_5 !== undefined) {
      if (typeof score_1_5 !== "number" || score_1_5 < 1 || score_1_5 > 5 || !Number.isInteger(score_1_5)) {
        return Response.json({ error: "score_1_5 must be an integer between 1 and 5" }, { status: 400 })
      }
    }
  }

  const rows = (body.scores as Array<Record<string, unknown>>).map((entry) => ({
    candidate_id: candidateId,
    factor_key: entry.factor_key as string,
    score_1_5: (entry.score_1_5 as number | null | undefined) ?? null,
    notes: (entry.notes as string | null | undefined) ?? null,
  }))

  const { data, error } = await supabase
    .from("location_rubric_scores")
    .upsert(rows, { onConflict: "candidate_id,factor_key" })
    .select()

  if (error) {
    console.error("location_rubric_scores upsert error:", error)
    return Response.json({ error: "Failed to upsert scores" }, { status: 500 })
  }

  return Response.json(data)
}
