// TIM-965: CRUD for interview_candidates.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isProvidedString } from "@/lib/hiring"
import type { NextRequest } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data, error } = await supabase
    .from("interview_candidates")
    .select("*")
    .eq("plan_id", planId)
    .order("position")

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

  // TIM-1217: allow blank name (optimistic inline-edit row). See isProvidedString.
  if (!isProvidedString(body.name)) {
    return Response.json({ error: "Missing required field: name" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("interview_candidates")
    .insert({
      plan_id: planId,
      role_id: (body.role_id as string | undefined) ?? null,
      name: body.name,
      contact: (body.contact as string | undefined) ?? null,
      status: (body.status as string | undefined) ?? "applied",
      notes: (body.notes as string | undefined) ?? null,
      position: (body.position as number | undefined) ?? 0,
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

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const id = body.id as string | undefined
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { id: _id, ...rest } = body
  const { data, error } = await supabase
    .from("interview_candidates")
    .update(rest)
    .eq("id", id)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update candidate" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("interview_candidates").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete candidate" }, { status: 500 })
  return Response.json({ ok: true })
}
