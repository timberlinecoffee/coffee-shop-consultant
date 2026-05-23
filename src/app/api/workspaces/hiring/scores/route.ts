// TIM-965: Upsert/delete for interview_scores.
// Upserts by (candidate_id, question_id) unique constraint.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const candidateId = request.nextUrl.searchParams.get("candidate_id")

  let query = supabase.from("interview_scores").select("*")
  if (candidateId) query = query.eq("candidate_id", candidateId)

  const { data, error } = await query
  if (error) return Response.json({ error: "Failed to fetch scores" }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.candidate_id || !body.question_id || body.score === undefined) {
    return Response.json({ error: "Missing required fields: candidate_id, question_id, score" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("interview_scores")
    .upsert({
      candidate_id: body.candidate_id as string,
      question_id: body.question_id as string,
      score: body.score as number,
      notes: (body.notes as string | undefined) ?? null,
    }, { onConflict: "candidate_id,question_id" })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to upsert score" }, { status: 500 })
  return Response.json(data)
}

// PATCH is an alias for POST so the workspace can call PATCH for upserts.
export { POST as PATCH }

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("interview_scores").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete score" }, { status: 500 })
  return Response.json({ ok: true })
}
