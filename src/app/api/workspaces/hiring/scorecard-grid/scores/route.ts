// TIM-3370: Upsert/delete for scorecard_cell_scores (candidate × competency cells).
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const scorecardId = request.nextUrl.searchParams.get("scorecard_id")
  if (!scorecardId) return Response.json({ error: "Missing scorecard_id" }, { status: 400 })

  const { data, error } = await supabase
    .from("scorecard_cell_scores")
    .select("*")
    .eq("scorecard_id", scorecardId)
    .eq("plan_id", planId)

  if (error) return Response.json({ error: "Failed to fetch scores" }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { candidate_id, competency_id, scorecard_id, score, notes } = body as {
    candidate_id?: string
    competency_id?: string
    scorecard_id?: string
    score?: number | null
    notes?: string | null
  }

  if (!candidate_id || !competency_id || !scorecard_id) {
    return Response.json({ error: "Missing required fields: candidate_id, competency_id, scorecard_id" }, { status: 400 })
  }

  if (score !== undefined && score !== null && (score < 1 || score > 5)) {
    return Response.json({ error: "Score must be 1–5" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("scorecard_cell_scores")
    .upsert({
      scorecard_id,
      candidate_id,
      competency_id,
      plan_id: planId,
      score: score ?? null,
      notes: notes ?? null,
    }, { onConflict: "candidate_id,competency_id" })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to upsert score" }, { status: 500 })
  return Response.json(data)
}

export { POST as PATCH }

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase
    .from("scorecard_cell_scores")
    .delete()
    .eq("id", id)
    .eq("plan_id", planId)

  if (error) return Response.json({ error: "Failed to delete score" }, { status: 500 })
  return Response.json({ ok: true })
}
