// TIM-965: Upsert/delete for competency_evaluations.
// Upserts by (staff_file_id, competency_id) unique constraint.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const staffFileId = request.nextUrl.searchParams.get("staff_file_id")

  let query = supabase.from("competency_evaluations").select("*")
  if (staffFileId) query = query.eq("staff_file_id", staffFileId)

  const { data, error } = await query
  if (error) return Response.json({ error: "Failed to fetch evaluations" }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.staff_file_id || !body.competency_id || body.score === undefined) {
    return Response.json({ error: "Missing required fields: staff_file_id, competency_id, score" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("competency_evaluations")
    .upsert({
      staff_file_id: body.staff_file_id as string,
      competency_id: body.competency_id as string,
      score: body.score as number,
      notes: (body.notes as string | undefined) ?? null,
      evaluated_at: (body.evaluated_at as string | undefined) ?? new Date().toISOString().split("T")[0],
    }, { onConflict: "staff_file_id,competency_id" })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to upsert evaluation" }, { status: 500 })
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

  const { error } = await supabase.from("competency_evaluations").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete evaluation" }, { status: 500 })
  return Response.json({ ok: true })
}
