// TIM-967: CRUD for menu_items.
// TIM-1140: items now reference menu_categories.id; on create, the category's
// default ingredients (cups/lids/etc.) are auto-copied as item ingredients so
// disposables can be amortized across beverages.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { toTitleCase } from "@/lib/text"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
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

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (typeof body.name !== "string") {
    return Response.json({ error: "Missing required field: name" }, { status: 400 })
  }
  if (!body.category_id || typeof body.category_id !== "string") {
    return Response.json({ error: "Missing required field: category_id" }, { status: 400 })
  }

  // Guard: the category must belong to this plan.
  const { data: catRow } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("id", body.category_id)
    .eq("plan_id", planId)
    .maybeSingle()
  if (!catRow) return Response.json({ error: "category_id not found for plan" }, { status: 404 })

  // TIM-1002: drink/item name is label-shaped — enforce Title Case.
  const { data: created, error } = await supabase
    .from("menu_items")
    .insert({
      plan_id: planId,
      name: toTitleCase(body.name),
      category_id: body.category_id,
      position: (body.position as number | undefined) ?? 0,
      price_cents: (body.price_cents as number | undefined) ?? 0,
      cogs_cents: (body.cogs_cents as number | undefined) ?? null,
      expected_mix_pct: (body.expected_mix_pct as number | undefined) ?? 0,
      expected_popularity: (body.expected_popularity as string | undefined) ?? null,
      prep_time_seconds: (body.prep_time_seconds as number | undefined) ?? null,
      notes: (body.notes as string | undefined) ?? null,
      recipe: (body.recipe as Record<string, unknown> | undefined) ?? {},
      archived: false,
    })
    .select()
    .single()

  if (error || !created) return Response.json({ error: "Failed to create menu item" }, { status: 500 })

  // TIM-1140: auto-populate category default ingredients onto the new item.
  // Skip if the client explicitly opts out (e.g. duplicating an item, or when
  // TIM-3683 AI-suggested ingredients are supplied — those replace defaults so
  // an accepted "Maple Syrup Latte" gets the syrup, not just espresso base).
  const skipDefaults = body.skip_category_defaults === true
  const suppliedIngredients = Array.isArray(body.ingredients)
    ? (body.ingredients as Array<Record<string, unknown>>)
    : null
  const useSupplied = suppliedIngredients !== null && suppliedIngredients.length > 0

  if (useSupplied) {
    // TIM-3683 Bug 3: AI-suggested full-recipe path. Lazily upsert the master
    // ingredient rows (name + unit are enough for the owner to see the
    // ingredient; package cost defaults to 0 so the item starts with $0 COGS
    // and the owner fills in real costs later). Then attach via
    // menu_item_ingredients.
    const validUnits = new Set(["g", "ml", "oz", "each", "piece"])
    const cleaned = suppliedIngredients
      .map((raw) => {
        const name = typeof raw.name === "string" ? toTitleCase(raw.name.trim()) : ""
        const amount = typeof raw.amount === "number" ? raw.amount : Number.NaN
        const unitRaw = typeof raw.unit === "string" ? raw.unit.trim().toLowerCase() : ""
        if (!name || !Number.isFinite(amount) || amount <= 0 || !validUnits.has(unitRaw)) {
          return null
        }
        return { name, amount, unit: unitRaw }
      })
      .filter((r): r is { name: string; amount: number; unit: string } => r !== null)

    if (cleaned.length > 0) {
      // Look up which of these already exist for this plan (case-insensitive).
      const { data: existingRows } = await supabase
        .from("menu_ingredients")
        .select("id, name, package_unit")
        .eq("plan_id", planId)
      const existing = new Map<string, { id: string; unit: string }>()
      for (const r of existingRows ?? []) {
        existing.set(String(r.name).trim().toLowerCase(), {
          id: r.id as string,
          unit: r.package_unit as string,
        })
      }

      const toCreate = cleaned.filter((c) => !existing.has(c.name.toLowerCase()))
      if (toCreate.length > 0) {
        const insertRows = toCreate.map((c) => ({
          plan_id: planId,
          name: c.name,
          package_size: 1,
          package_unit: c.unit,
          package_cost_cents: 0,
        }))
        const { data: created2 } = await supabase
          .from("menu_ingredients")
          .insert(insertRows)
          .select("id, name, package_unit")
        for (const r of created2 ?? []) {
          existing.set(String(r.name).trim().toLowerCase(), {
            id: r.id as string,
            unit: r.package_unit as string,
          })
        }
      }

      const junctionRows = cleaned
        .map((c) => {
          const master = existing.get(c.name.toLowerCase())
          if (!master) return null
          return {
            menu_item_id: created.id,
            ingredient_id: master.id,
            amount: c.amount,
            unit: c.unit,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      if (junctionRows.length > 0) {
        await supabase.from("menu_item_ingredients").insert(junctionRows)
      }
    }
  } else if (!skipDefaults) {
    const { data: defaults } = await supabase
      .from("category_default_ingredients")
      .select("ingredient_id, amount, unit")
      .eq("category_id", body.category_id)
    if (defaults && defaults.length > 0) {
      const rows = defaults.map((d) => ({
        menu_item_id: created.id,
        ingredient_id: d.ingredient_id,
        amount: d.amount,
        unit: d.unit,
      }))
      // Best-effort: a single failure (e.g. unique-violation if duplicate) is
      // not a reason to fail item creation.
      await supabase.from("menu_item_ingredients").insert(rows)
    }
  }

  // Return the freshly computed COGS row.
  const { data: withCogs } = await supabase
    .from("menu_items_with_cogs")
    .select("*")
    .eq("id", created.id)
    .maybeSingle()

  return Response.json(withCogs ?? created, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  // Bulk reorder: { reorder: [{ id, position, category_id? }, ...] }
  if (Array.isArray(body.reorder)) {
    const rows = body.reorder as Array<{ id?: unknown; position?: unknown; category_id?: unknown }>
    const updates = rows
      .filter((r) => typeof r.id === "string" && typeof r.position === "number")
      .map((r) => {
        const patch: Record<string, unknown> = { position: r.position as number }
        if (typeof r.category_id === "string") patch.category_id = r.category_id
        return supabase
          .from("menu_items")
          .update(patch)
          .eq("id", r.id as string)
          .eq("plan_id", planId)
      })
    const results = await Promise.all(updates)
    const firstError = results.find((r) => r.error)
    if (firstError?.error) {
      return Response.json({ error: "Failed to reorder items" }, { status: 500 })
    }
    return Response.json({ ok: true })
  }

  const { id, ...rest } = body
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const allowed: Record<string, unknown> = {}
  const fields = [
    "name", "category_id", "price_cents", "cogs_cents",
    "expected_mix_pct", "expected_popularity", "prep_time_seconds", "notes", "recipe",
    "archived", "position",
    // TIM-1471: Recipe-tab ordered prep instructions. Filter empty rows so a
    // half-typed blank step doesn't persist; clamp to a sensible upper bound.
    "preparation_steps",
  ]
  for (const f of fields) {
    if (f in rest) {
      const val = rest[f]
      if (f === "name" && typeof val === "string") {
        allowed[f] = toTitleCase(val)
      } else if (f === "preparation_steps") {
        if (Array.isArray(val)) {
          allowed[f] = val
            .filter((s): s is string => typeof s === "string")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .slice(0, 50)
        }
      } else {
        allowed[f] = val
      }
    }
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
