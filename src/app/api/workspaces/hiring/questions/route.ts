// TIM-965: CRUD for interview_questions.
// TIM-1299: extended with scorecard_id support.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isProvidedString } from "@/lib/hiring"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const scorecardId = request.nextUrl.searchParams.get("scorecard_id")
  const roleId = request.nextUrl.searchParams.get("role_id")

  let query = supabase
    .from("interview_questions")
    .select("*")
    .eq("plan_id", planId)
    .order("order_index")

  if (scorecardId) query = query.eq("scorecard_id", scorecardId)
  else if (roleId) query = query.eq("role_id", roleId)

  const { data, error } = await query
  if (error) return Response.json({ error: "Failed to fetch questions" }, { status: 500 })
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

  // TIM-1217: allow blank prompt (optimistic inline-edit row). See isProvidedString.
  if (!isProvidedString(body.prompt)) {
    return Response.json({ error: "Missing required field: prompt" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("interview_questions")
    .insert({
      plan_id: planId,
      role_id: (body.role_id as string | undefined) ?? null,
      scorecard_id: (body.scorecard_id as string | undefined) ?? null,
      prompt: body.prompt,
      weight: (body.weight as number | undefined) ?? 1,
      order_index: (body.order_index as number | undefined) ?? 0,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create question" }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const id = body.id as string | undefined
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { id: _id, ...rest } = body
  const { data, error } = await supabase
    .from("interview_questions")
    .update(rest)
    .eq("id", id)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update question" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("interview_questions").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete question" }, { status: 500 })
  return Response.json({ ok: true })
}
