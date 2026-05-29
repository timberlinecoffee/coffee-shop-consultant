// TIM-1299: CRUD for competency_form_templates (per-role competency form template).
import { createClient } from "@/lib/supabase/server"
import { isProvidedString } from "@/lib/hiring"
import { toTitleCase } from "@/lib/text"
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

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const roleId = request.nextUrl.searchParams.get("role_id")

  let query = supabase
    .from("competency_form_templates")
    .select("*")
    .eq("plan_id", planId)
    .order("order_index")

  if (roleId === "null") {
    query = query.is("role_id", null)
  } else if (roleId) {
    query = query.eq("role_id", roleId)
  }

  const { data, error } = await query
  if (error) return Response.json({ error: "Failed to fetch competency form templates" }, { status: 500 })
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

  if (!isProvidedString(body.name)) {
    return Response.json({ error: "Missing required field: name" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("competency_form_templates")
    .insert({
      plan_id: planId,
      role_id: (body.role_id as string | undefined) ?? null,
      name: toTitleCase(body.name as string),
      order_index: (body.order_index as number | undefined) ?? 0,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create competency form template" }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const id = body.id as string | undefined
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { id: _id, ...rest } = body
  if (typeof rest.name === "string") rest.name = toTitleCase(rest.name)

  const { data, error } = await supabase
    .from("competency_form_templates")
    .update(rest)
    .eq("id", id)
    .eq("plan_id", planId)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update competency form template" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase
    .from("competency_form_templates")
    .delete()
    .eq("id", id)
    .eq("plan_id", planId)

  if (error) return Response.json({ error: "Failed to delete competency form template" }, { status: 500 })
  return Response.json({ ok: true })
}
