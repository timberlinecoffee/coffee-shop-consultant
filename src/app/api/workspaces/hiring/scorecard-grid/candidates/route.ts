// TIM-3370: CRUD for scorecard_grid_candidates (grid rows).
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
    .from("scorecard_grid_candidates")
    .select("*")
    .eq("scorecard_id", scorecardId)
    .eq("plan_id", planId)
    .order("order_index")

  if (error) return Response.json({ error: "Failed to fetch candidates" }, { status: 500 })
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
  if (!isProvidedString(body.name)) return Response.json({ error: "Missing name" }, { status: 400 })

  const { data, error } = await supabase
    .from("scorecard_grid_candidates")
    .insert({
      scorecard_id: scorecardId,
      plan_id: planId,
      name: body.name as string,
      email: (body.email as string | undefined) ?? null,
      interviewed_at: (body.interviewed_at as string | undefined) ?? null,
      interviewer: (body.interviewer as string | undefined) ?? null,
      order_index: (body.order_index as number | undefined) ?? 0,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create candidate" }, { status: 500 })
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
    .from("scorecard_grid_candidates")
    .update(patch)
    .eq("id", id)
    .eq("plan_id", planId)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update candidate" }, { status: 500 })
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
    .from("scorecard_grid_candidates")
    .delete()
    .eq("id", id)
    .eq("plan_id", planId)

  if (error) return Response.json({ error: "Failed to delete candidate" }, { status: 500 })
  return Response.json({ ok: true })
}
