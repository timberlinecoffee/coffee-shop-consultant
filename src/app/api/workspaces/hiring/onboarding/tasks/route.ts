// TIM-965: CRUD for onboarding_tasks.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const instanceId = request.nextUrl.searchParams.get("instance_id")

  let query = supabase.from("onboarding_tasks").select("*").order("order_index")
  if (instanceId) query = query.eq("instance_id", instanceId)

  const { data, error } = await query
  if (error) return Response.json({ error: "Failed to fetch tasks" }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  // Batch insert for onboarding plan seeding
  if (Array.isArray(body.tasks)) {
    const rows = (body.tasks as Array<Record<string, unknown>>).map((t) => ({
      instance_id: t.instance_id as string,
      phase: t.phase as string,
      task: (t.task as string) || "",
      detail: (t.detail as string | null) ?? null,
      due_offset_days: (t.due_offset_days as number | null) ?? null,
      completed_at: (t.completed_at as string | null) ?? null,
      notes: (t.notes as string | null) ?? null,
      order_index: (t.order_index as number) ?? 0,
    }))

    const { data, error } = await supabase
      .from("onboarding_tasks")
      .insert(rows)
      .select()

    if (error) return Response.json({ error: "Failed to seed tasks" }, { status: 500 })
    return Response.json(data, { status: 201 })
  }

  if (!body.instance_id || !body.phase) {
    return Response.json({ error: "Missing required fields: instance_id, phase" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("onboarding_tasks")
    .insert({
      instance_id: body.instance_id as string,
      phase: body.phase as string,
      task: (body.task as string) || "",
      detail: (body.detail as string | undefined) ?? null,
      due_offset_days: (body.due_offset_days as number | undefined) ?? null,
      completed_at: (body.completed_at as string | undefined) ?? null,
      notes: (body.notes as string | undefined) ?? null,
      order_index: (body.order_index as number | undefined) ?? 0,
    })
    .select()

  if (error) return Response.json({ error: "Failed to create task" }, { status: 500 })
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
    .from("onboarding_tasks")
    .update(rest)
    .eq("id", id)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update task" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("onboarding_tasks").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete task" }, { status: 500 })
  return Response.json({ ok: true })
}
