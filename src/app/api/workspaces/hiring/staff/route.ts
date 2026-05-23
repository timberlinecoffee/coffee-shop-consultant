// TIM-965: CRUD for staff_files (one per employee).
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

async function getPlanId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data, error } = await supabase
    .from("staff_files")
    .select("*")
    .eq("plan_id", planId)
    .order("name")

  if (error) return Response.json({ error: "Failed to fetch staff files" }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Missing required field: name" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("staff_files")
    .insert({
      plan_id: planId,
      name: body.name,
      hire_date: (body.hire_date as string | undefined) ?? null,
      role_id: (body.role_id as string | undefined) ?? null,
      notes: (body.notes as string | undefined) ?? null,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create staff file" }, { status: 500 })
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
    .from("staff_files")
    .update(rest)
    .eq("id", id)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update staff file" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("staff_files").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete staff file" }, { status: 500 })
  return Response.json({ ok: true })
}
