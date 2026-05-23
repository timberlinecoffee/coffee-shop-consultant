// TIM-967: CRUD for menu_items.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

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

  const { data, error } = await supabase
    .from("menu_items_with_cogs")
    .select("*")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("position")

  if (error) return Response.json({ error: "Failed to fetch menu items" }, { status: 500 })
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
  if (!body.category || typeof body.category !== "string") {
    return Response.json({ error: "Missing required field: category" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      plan_id: planId,
      name: body.name,
      category: body.category,
      position: (body.position as number | undefined) ?? 0,
      price_cents: (body.price_cents as number | undefined) ?? 0,
      cogs_cents: (body.cogs_cents as number | undefined) ?? null,
      expected_mix_pct: (body.expected_mix_pct as number | undefined) ?? 0,
      prep_time_seconds: (body.prep_time_seconds as number | undefined) ?? null,
      notes: (body.notes as string | undefined) ?? null,
      recipe: (body.recipe as Record<string, unknown> | undefined) ?? {},
      archived: false,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create menu item" }, { status: 500 })
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

  const { id, ...rest } = body
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const allowed: Record<string, unknown> = {}
  const fields = ["name", "category", "price_cents", "cogs_cents", "expected_mix_pct", "prep_time_seconds", "notes", "recipe", "archived", "position"]
  for (const f of fields) {
    if (f in rest) allowed[f] = rest[f]
  }

  const { data, error } = await supabase
    .from("menu_items")
    .update(allowed)
    .eq("id", id as string)
    .eq("plan_id", planId)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update menu item" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("menu_items").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete menu item" }, { status: 500 })
  return Response.json({ ok: true })
}
