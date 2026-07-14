// TIM-1140: CRUD for category_default_ingredients (per-category disposables
// that auto-populate onto new items). Also supports `applyToExisting` to
// retroactively merge a category's defaults into items already in that
// category — the founder opted-in path, not a silent backfill.
// TIM-3863: zod validation (Rule 3) + ingredient ownership check (Rule 2) +
// ownership guard on DELETE. Supply defaults use the same table; the
// menu_ingredients.category field (TIM-3861) determines ingredient vs supply group.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { z } from "zod"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

const UNIT_VALUES = ["g", "ml", "oz", "each", "piece"] as const
type IngredientUnit = (typeof UNIT_VALUES)[number]

const PostBodySchema = z.object({
  category_id: z.string().uuid(),
  ingredient_id: z.string().uuid(),
  amount: z.number().positive(),
  unit: z.enum(UNIT_VALUES),
  position: z.number().int().optional(),
})

const PatchBodySchema = z.discriminatedUnion("applyToExisting", [
  // applyToExisting path
  z.object({
    applyToExisting: z.literal(true),
    category_id: z.string().uuid(),
  }),
  // row-update path
  z.object({
    applyToExisting: z.literal(false).optional(),
    id: z.string().uuid(),
    amount: z.number().positive().optional(),
    unit: z.enum(UNIT_VALUES).optional(),
    position: z.number().int().optional(),
  }),
])

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

async function assertIngredientOwned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  ingredientId: string,
) {
  const { data } = await supabase
    .from("menu_ingredients")
    .select("id")
    .eq("id", ingredientId)
    .eq("plan_id", planId)
    .maybeSingle()
  return Boolean(data)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cleaned = (data ?? []).map(({ menu_categories: _mc, ...rest }) => rest)
  return Response.json(cleaned)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let rawBody: unknown
  try { rawBody = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = PostBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }
  const { category_id, ingredient_id, amount, unit, position } = parsed.data

  // Rule 2: ownership checks on both category and ingredient.
  if (!(await assertCategoryOwned(supabase, planId, category_id))) {
    return Response.json({ error: "Category not found" }, { status: 404 })
  }
  if (!(await assertIngredientOwned(supabase, planId, ingredient_id))) {
    return Response.json({ error: "Ingredient not found" }, { status: 404 })
  }

  const { data, error } = await supabase
    .from("category_default_ingredients")
    .insert({ category_id, ingredient_id, amount, unit: unit as IngredientUnit, position: position ?? 0 })
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

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let rawBody: unknown
  try { rawBody = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  // Normalize: treat missing applyToExisting as false for discriminated union.
  const normalized = rawBody && typeof rawBody === "object" && !("applyToExisting" in rawBody)
    ? { ...rawBody as object, applyToExisting: false }
    : rawBody

  const parsed = PatchBodySchema.safeParse(normalized)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }

  // applyToExisting: copy this category's default ingredients into every
  // existing item in the category, skipping ingredients the item already has.
  if (parsed.data.applyToExisting === true) {
    const categoryId = parsed.data.category_id
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

  // Row-update path.
  const { id, amount, unit, position } = parsed.data
  const allowed: Record<string, unknown> = {}
  if (amount !== undefined) allowed.amount = amount
  if (unit !== undefined) allowed.unit = unit
  if (position !== undefined) allowed.position = position

  // Rule 2: explicit ownership check — verify the row's category is on this plan.
  const { data: existing } = await supabase
    .from("category_default_ingredients")
    .select("id, menu_categories!inner(plan_id)")
    .eq("id", id)
    .eq("menu_categories.plan_id", planId)
    .maybeSingle()
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 })

  const { data, error } = await supabase
    .from("category_default_ingredients")
    .update(allowed)
    .eq("id", id)
    .select()
    .single()

  if (error || !data) return Response.json({ error: "Failed to update default" }, { status: 500 })
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

  // Rule 2: verify ownership before delete (RLS also enforces this,
  // but an explicit check gives a 404 rather than a silent no-op).
  const { data: existing } = await supabase
    .from("category_default_ingredients")
    .select("id, menu_categories!inner(plan_id)")
    .eq("id", id)
    .eq("menu_categories.plan_id", planId)
    .maybeSingle()
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 })

  const { error } = await supabase
    .from("category_default_ingredients")
    .delete()
    .eq("id", id)

  if (error) return Response.json({ error: "Failed to delete default" }, { status: 500 })
  return Response.json({ ok: true })
}
