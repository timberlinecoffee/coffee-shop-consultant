// TIM-3370: CRUD for scorecard_competencies (grid columns).
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
  if (!scorecardId) return Response.json({ error: "Missing scorecard_id" }, { status: 400 })

  const { data, error } = await supabase
    .from("scorecard_competencies")
    .select("*")
    .eq("scorecard_id", scorecardId)
    .eq("plan_id", planId)
    .order("order_index")

  if (error) return Response.json({ error: "Failed to fetch competencies" }, { status: 500 })
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

  const scorecardId = body.scorecard_id as string | undefined
  if (!scorecardId) return Response.json({ error: "Missing scorecard_id" }, { status: 400 })
  if (!isProvidedString(body.label)) return Response.json({ error: "Missing label" }, { status: 400 })

  const { data, error } = await supabase
    .from("scorecard_competencies")
    .insert({
      scorecard_id: scorecardId,
      plan_id: planId,
      label: body.label as string,
      multiplier: (body.multiplier as number | undefined) ?? 1.0,
      description: (body.description as string | undefined) ?? null,
      linked_question_ids: (body.linked_question_ids as string[] | undefined) ?? [],
      order_index: (body.order_index as number | undefined) ?? 0,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create competency" }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const id = body.id as string | undefined
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { id: _id, ...patch } = body

  const { data, error } = await supabase
    .from("scorecard_competencies")
    .update(patch)
    .eq("id", id)
    .eq("plan_id", planId)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update competency" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase
    .from("scorecard_competencies")
    .delete()
    .eq("id", id)
    .eq("plan_id", planId)

  if (error) return Response.json({ error: "Failed to delete competency" }, { status: 500 })
  return Response.json({ ok: true })
}
