// TIM-2924: Apply-gate for suggest-recipe. Called by the review modal's
// onApply after the user accepts (and optionally edits) the proposed recipe.
// Resolves ingredient names to library rows, creates any missing ones, inserts
// recipe lines, then returns fresh state so the client can update without
// extra round-trips. This is the work that /suggest-recipe used to do inline
// (Shape C) — now it only runs after explicit user acceptance.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { defaultPackageSize } from "@/lib/recipe-suggest"
import type { MenuIngredient, MenuItemIngredient, IngredientUnit } from "@/lib/menu"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single()

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 })
  }

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: {
    item_id?: string
    lines?: Array<{ name: string; amount: number; unit: string }>
  }
  try { body = await request.json() } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.item_id || typeof body.item_id !== "string") {
    return Response.json({ error: "Missing item_id" }, { status: 400 })
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return Response.json({ error: "lines must be a non-empty array" }, { status: 400 })
  }

  const lines = body.lines.filter(
    (l): l is { name: string; amount: number; unit: string } =>
      typeof l.name === "string" &&
      l.name.trim().length > 0 &&
      typeof l.amount === "number" &&
      l.amount > 0 &&
      Number.isFinite(l.amount) &&
      typeof l.unit === "string",
  )

  if (lines.length === 0) {
    return Response.json({ error: "No valid lines provided" }, { status: 400 })
  }

  // Verify the item belongs to this plan.
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", body.item_id)
    .eq("plan_id", planId)
    .maybeSingle()
  if (!menuItem) return Response.json({ error: "Menu item not found" }, { status: 404 })

  // Resolve ingredient names to library rows (TIM-1409 invariant).
  const { data: existingIngredients, error: existingErr } = await supabase
    .from("menu_ingredients")
    .select("*")
    .eq("plan_id", planId)
  if (existingErr) {
    console.error("suggest-recipe/apply ingredient read error:", existingErr)
    return Response.json({ error: "Failed to load ingredient library" }, { status: 500 })
  }
  const byName = new Map<string, MenuIngredient>()
  for (const ing of (existingIngredients ?? []) as MenuIngredient[]) {
    byName.set(ing.name.trim().toLowerCase(), ing)
  }

  // Create missing ingredients with $0 cost — owner fills in prices later.
  const MENU_VALID_UNITS = new Set(["g", "ml", "oz", "each", "piece"])
  const toCreate = lines.filter((l) => !byName.has(l.name.trim().toLowerCase()))
  if (toCreate.length > 0) {
    const rows = toCreate.map((l) => {
      const unit = (MENU_VALID_UNITS.has(l.unit) ? l.unit : "oz") as IngredientUnit
      return {
        plan_id: planId,
        name: l.name,
        package_size: defaultPackageSize(unit),
        package_unit: unit,
        package_cost_cents: 0,
      }
    })
    const { data: created, error: createErr } = await supabase
      .from("menu_ingredients")
      .insert(rows)
      .select()
    if (createErr) {
      console.error("suggest-recipe/apply ingredient insert error:", createErr)
      return Response.json({ error: "Failed to create ingredients" }, { status: 500 })
    }
    for (const ing of (created ?? []) as MenuIngredient[]) {
      byName.set(ing.name.trim().toLowerCase(), ing)
    }
  }

  // All lines must resolve — abort rather than write orphan rows.
  const resolved: { line: (typeof lines)[number]; ingredient: MenuIngredient }[] = []
  const unresolved: string[] = []
  for (const l of lines) {
    const ing = byName.get(l.name.trim().toLowerCase())
    if (ing) resolved.push({ line: l, ingredient: ing })
    else unresolved.push(l.name)
  }
  if (unresolved.length > 0) {
    console.error("suggest-recipe/apply unresolved:", unresolved)
    return Response.json(
      { error: `Couldn't link these ingredients: ${unresolved.join(", ")}` },
      { status: 500 },
    )
  }

  // Build the new line rows, deduplicating by ingredient_id.
  const seen = new Set<string>()
  const lineRows: {
    menu_item_id: string
    ingredient_id: string
    amount: number
    unit: IngredientUnit
  }[] = []
  for (const r of resolved) {
    if (seen.has(r.ingredient.id)) continue
    seen.add(r.ingredient.id)
    const unit = (MENU_VALID_UNITS.has(r.ingredient.package_unit) ? r.ingredient.package_unit : "oz") as IngredientUnit
    lineRows.push({
      menu_item_id: body.item_id,
      ingredient_id: r.ingredient.id,
      amount: r.line.amount,
      unit,
    })
  }

  // UPSERT first (handles both new additions and amount updates for existing
  // ingredients). If this fails, old lines are untouched — no data loss.
  if (lineRows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("menu_item_ingredients")
      .upsert(lineRows, { onConflict: "menu_item_id,ingredient_id" })
    if (upsertErr) {
      console.error("suggest-recipe/apply upsert error:", upsertErr)
      return Response.json({ error: "Failed to attach recipe lines" }, { status: 500 })
    }
  }

  // DELETE rows for ingredients no longer in the AI suggestion (removes
  // ingredients the user dropped from the recipe in the review modal).
  // Runs after UPSERT so a delete failure never leaves recipe lines missing —
  // worst case is a stale extra row which the user can remove manually.
  const keepIds = lineRows.map((r) => r.ingredient_id)
  if (keepIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from("menu_item_ingredients")
      .delete()
      .eq("menu_item_id", body.item_id)
      .not("ingredient_id", "in", `(${keepIds.join(",")})`)
    if (deleteErr) {
      console.error("suggest-recipe/apply stale-line delete error (upsert succeeded):", deleteErr)
      // Non-fatal: user sees extra old lines; upsert already captured the new amounts.
    }
  }

  // Return fresh state so the client can update without extra round-trips.
  const [{ data: ingredients }, { data: itemLines }] = await Promise.all([
    supabase.from("menu_ingredients").select("*").eq("plan_id", planId).order("name"),
    supabase.from("menu_item_ingredients").select("*").eq("menu_item_id", body.item_id).order("created_at"),
  ])

  return Response.json({
    added_count: lineRows.length,
    ingredients: (ingredients ?? []) as MenuIngredient[],
    lines: (itemLines ?? []) as MenuItemIngredient[],
  })
}
