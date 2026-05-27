// TIM-1140: CRUD for category_default_ingredients (per-category disposables
// that auto-populate onto new items). Also supports `applyToExisting` to
// retroactively merge a category's defaults into items already in that
// category — the founder opted-in path, not a silent backfill.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

const ALLOWED_UNITS = new Set(["g", "ml", "oz", "each", "piece"])

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

async function assertCategoryOwned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  categoryId: string,
) {
  const { data } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("plan_id", planId)
    .maybeSingle()
  return Boolean(data)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const categoryId = request.nextUrl.searchParams.get("category_id")

  // If no category_id is given, return every default for the plan in one go
  // (lets the workspace hydrate without N round-trips).
  let query = supabase
    .from("category_default_ingredients")
    .select("id, category_id, ingredient_id, amount, unit, position, created_at, menu_categories!inner(plan_id)")
    .eq("menu_categories.plan_id", planId)

  if (categoryId) query = query.eq("category_id", categoryId)

  const { data, error } = await query
  if (error) return Response.json({ error: "Failed to fetch category defaults" }, { status: 500 })
  // Strip the join-only field before returning.
  const cleaned = (data ?? []).map(({ menu_categories: _mc, ...rest }) => rest)
  return Response.json(cleaned)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const categoryId = body.category_id as string | undefined
  const ingredientId = body.ingredient_id as string | undefined
  const amount = body.amount as number | undefined
  const unit = body.unit as string | undefined

  if (!categoryId || !ingredientId || amount === undefined || !unit) {
    return Response.json({ error: "Missing required field" }, { status: 400 })
  }
  if (!ALLOWED_UNITS.has(unit)) {
    return Response.json({ error: "Invalid unit" }, { status: 400 })
  }
  if (!(await assertCategoryOwned(supabase, planId, categoryId))) {
    return Response.json({ error: "Category not found" }, { status: 404 })
  }

  const { data, error } = await supabase
    .from("category_default_ingredients")
    .insert({
      category_id: categoryId,
      ingredient_id: ingredientId,
      amount,
      unit,
      position: (body.position as number | undefined) ?? 0,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "This ingredient is already a default for the category" }, { status: 409 })
    }
    return Response.json({ error: "Failed to add default" }, { status: 500 })
  }
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

  // applyToExisting: copy this category's default ingredients into every
  // existing item in the category, skipping ingredients the item already has.
  if (body.applyToExisting === true && typeof body.category_id === "string") {
    const categoryId = body.category_id
    if (!(await assertCategoryOwned(supabase, planId, categoryId))) {
      return Response.json({ error: "Category not found" }, { status: 404 })
    }
    const { data: defaults } = await supabase
      .from("category_default_ingredients")
      .select("ingredient_id, amount, unit")
      .eq("category_id", categoryId)
    if (!defaults || defaults.length === 0) return Response.json({ applied: 0 })

    const { data: items } = await supabase
      .from("menu_items")
      .select("id")
      .eq("category_id", categoryId)
      .eq("archived", false)
    if (!items || items.length === 0) return Response.json({ applied: 0 })

    const { data: existingPairs } = await supabase
      .from("menu_item_ingredients")
      .select("menu_item_id, ingredient_id")
      .in("menu_item_id", items.map((i) => i.id))

    const existingKey = new Set(
      (existingPairs ?? []).map((p) => `${p.menu_item_id}:${p.ingredient_id}`),
    )

    const rows: Array<Record<string, unknown>> = []
    for (const item of items) {
      for (const def of defaults) {
        if (!existingKey.has(`${item.id}:${def.ingredient_id}`)) {
          rows.push({
            menu_item_id: item.id,
            ingredient_id: def.ingredient_id,
            amount: def.amount,
            unit: def.unit,
          })
        }
      }
    }
    if (rows.length > 0) {
      const { error } = await supabase.from("menu_item_ingredients").insert(rows)
      if (error) return Response.json({ error: "Failed to apply defaults" }, { status: 500 })
    }
    return Response.json({ applied: rows.length })
  }

  const id = body.id as string | undefined
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const allowed: Record<string, unknown> = {}
  if ("amount" in body && typeof body.amount === "number") allowed.amount = body.amount
  if ("unit" in body && typeof body.unit === "string") {
    if (!ALLOWED_UNITS.has(body.unit)) return Response.json({ error: "Invalid unit" }, { status: 400 })
    allowed.unit = body.unit
  }
  if ("position" in body && typeof body.position === "number") allowed.position = body.position

  const { data, error } = await supabase
    .from("category_default_ingredients")
    .update(allowed)
    .eq("id", id)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update default" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("category_default_ingredients").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete default" }, { status: 500 })
  return Response.json({ ok: true })
}
