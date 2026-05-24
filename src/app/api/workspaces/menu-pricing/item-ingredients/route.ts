// TIM-967: CRUD for menu_item_ingredients junction.
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

  const itemId = request.nextUrl.searchParams.get("item_id")
  if (!itemId) return Response.json({ error: "Missing item_id" }, { status: 400 })

  const { data, error } = await supabase
    .from("menu_item_ingredients")
    .select("*")
    .eq("menu_item_id", itemId)
    .order("created_at")

  if (error) return Response.json({ error: "Failed to fetch item ingredients" }, { status: 500 })
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

  if (!body.menu_item_id || typeof body.menu_item_id !== "string") {
    return Response.json({ error: "Missing required field: menu_item_id" }, { status: 400 })
  }
  if (!body.ingredient_id || typeof body.ingredient_id !== "string") {
    return Response.json({ error: "Missing required field: ingredient_id" }, { status: 400 })
  }
  if (body.amount === undefined || body.amount === null) {
    return Response.json({ error: "Missing required field: amount" }, { status: 400 })
  }
  if (!body.unit || typeof body.unit !== "string") {
    return Response.json({ error: "Missing required field: unit" }, { status: 400 })
  }

  const { data: menuItem, error: itemError } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", body.menu_item_id)
    .eq("plan_id", planId)
    .maybeSingle()

  if (itemError || !menuItem) {
    return Response.json({ error: "Menu item not found for this plan" }, { status: 404 })
  }

  const { data, error } = await supabase
    .from("menu_item_ingredients")
    .insert({
      menu_item_id: body.menu_item_id,
      ingredient_id: body.ingredient_id,
      amount: body.amount as number,
      unit: body.unit as string,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create item ingredient" }, { status: 500 })
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
  const fields = ["amount", "unit"]
  for (const f of fields) {
    if (f in rest) allowed[f] = rest[f]
  }

  const { data, error } = await supabase
    .from("menu_item_ingredients")
    .update(allowed)
    .eq("id", id as string)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update item ingredient" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("menu_item_ingredients").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete item ingredient" }, { status: 500 })
  return Response.json({ ok: true })
}
