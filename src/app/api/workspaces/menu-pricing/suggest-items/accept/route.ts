// TIM-3683 Bug 3: Accept an AI-suggested menu item (from /suggest-items) into
// the plan as a complete item -- name, price, and the full ingredient list.
// The prior client flow only POSTed name+category so accepted items lost every
// non-default ingredient the model produced. This route:
//   1) creates the menu item (skipping the category-default auto-copy so the
//      AI's list is authoritative and defaults do not double-insert),
//   2) resolves each suggested ingredient name against the plan's existing
//      menu_ingredients (case-insensitive), creating a zero-cost placeholder
//      row for any that do not exist yet,
//   3) inserts menu_item_ingredients rows for the resolved set.
// Best-effort: if any ingredient row insert fails we still return the created
// item so the client can render it, but we surface a soft warning.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { toTitleCase } from "@/lib/text"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { enforceRateLimit } from "@/lib/rate-limit"
import { defaultPackageSize } from "@/lib/recipe-suggest"
import { z } from "zod"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

const PACKAGE_UNIT_SET = new Set(["g", "ml", "oz", "each", "piece"])

const UNIT_ENUM = z.enum(["g", "ml", "oz", "each", "piece"])

const BodySchema = z.object({
  name: z.string().min(1).max(120),
  category_id: z.string().uuid(),
  position: z.number().int().min(0).max(500).optional(),
  price_cents: z.number().int().min(0).max(500_00).optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        amount: z.number().positive().max(10_000),
        unit: UNIT_ENUM,
      })
    )
    .max(24)
    .optional(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Rule 4: rate-limit paid-tier mutation so a scripted client can't spam
  // menu_items/menu_ingredients writes bypassing the paid-tier gate below.
  const rateLimited = await enforceRateLimit({
    bucket: "menu:suggest-items-accept",
    id: user.id,
    limit: 30,
    windowSec: 60,
  })
  if (rateLimited) return rateLimited

  // Sibling /suggest-items enforces subscription/beta -- mirror it here so the
  // Accept path can't be reached with a lapsed subscription via direct POST.
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

  let json: unknown
  try { json = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return Response.json({ error: "Invalid body" }, { status: 400 })
  }
  const body = parsed.data

  // Guard: the category must belong to this plan.
  const { data: catRow } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("id", body.category_id)
    .eq("plan_id", planId)
    .maybeSingle()
  if (!catRow) return Response.json({ error: "category_id not found for plan" }, { status: 404 })

  // Create the item. Skip the category-default auto-copy because the AI's list
  // is authoritative for this flow.
  const itemName = toTitleCase(body.name)
  const { data: created, error: createErr } = await supabase
    .from("menu_items")
    .insert({
      plan_id: planId,
      name: itemName,
      category_id: body.category_id,
      position: body.position ?? 0,
      price_cents: body.price_cents ?? 0,
      cogs_cents: null,
      expected_mix_pct: 0,
      expected_popularity: null,
      prep_time_seconds: null,
      notes: null,
      recipe: {},
      archived: false,
    })
    .select()
    .single()

  if (createErr || !created) {
    return Response.json({ error: "Failed to create menu item" }, { status: 500 })
  }

  const ingredientsIn = body.ingredients ?? []
  let ingredientsInserted = 0

  if (ingredientsIn.length > 0) {
    // Pull the plan's existing ingredients for a case-insensitive name lookup.
    const { data: existingIngs } = await supabase
      .from("menu_ingredients")
      .select("id, name, package_unit")
      .eq("plan_id", planId)
    const byLower = new Map<string, { id: string; package_unit: string }>()
    for (const row of existingIngs ?? []) {
      if (typeof row.name === "string" && typeof row.id === "string") {
        byLower.set(row.name.trim().toLowerCase(), {
          id: row.id,
          package_unit: (row.package_unit as string) ?? "each",
        })
      }
    }

    // Resolve or create each ingredient row, then build the junction inserts.
    const junctionRows: { menu_item_id: string; ingredient_id: string; amount: number; unit: string }[] = []
    for (const ing of ingredientsIn) {
      const cleanName = toTitleCase(ing.name)
      const key = cleanName.toLowerCase()
      let ingredientId = byLower.get(key)?.id ?? null

      if (!ingredientId) {
        // Create a placeholder ingredient. package_cost_cents defaults to 0
        // (owner sets real costs later); package_size must be > 0 per the
        // menu_ingredients CHECK -- reuse recipe-suggest's defaults so the
        // cost-per-unit is sensible once the owner enters a package cost.
        const packageUnit = PACKAGE_UNIT_SET.has(ing.unit) ? ing.unit : "each"
        const { data: newIng, error: newErr } = await supabase
          .from("menu_ingredients")
          .insert({
            plan_id: planId,
            name: cleanName,
            package_size: defaultPackageSize(packageUnit as "g" | "ml" | "oz" | "each" | "piece"),
            package_unit: packageUnit,
            package_cost_cents: 0,
            vendor_id: null,
            notes: null,
          })
          .select("id")
          .single()
        if (newErr || !newIng) {
          // Race: a concurrent Accept for the same plan+name may have won.
          // Re-read the pantry for that name so the junction row still lands.
          const { data: raceRow } = await supabase
            .from("menu_ingredients")
            .select("id")
            .eq("plan_id", planId)
            .ilike("name", cleanName)
            .maybeSingle()
          if (!raceRow || typeof raceRow.id !== "string") continue
          ingredientId = raceRow.id
        } else {
          ingredientId = newIng.id
        }
        if (!ingredientId) continue
        byLower.set(key, { id: ingredientId, package_unit: ing.unit })
      }

      if (!ingredientId) continue
      junctionRows.push({
        menu_item_id: created.id,
        ingredient_id: ingredientId,
        amount: ing.amount,
        unit: ing.unit,
      })
    }

    if (junctionRows.length > 0) {
      const { error: junctionErr, count } = await supabase
        .from("menu_item_ingredients")
        .insert(junctionRows, { count: "exact" })
      if (!junctionErr) ingredientsInserted = count ?? junctionRows.length
    }
  }

  // Return the freshly computed COGS row so the client can render the item
  // with its new computed_cogs_cents.
  const { data: withCogs } = await supabase
    .from("menu_items_with_cogs")
    .select("*")
    .eq("id", created.id)
    .maybeSingle()

  return Response.json(
    { item: withCogs ?? created, ingredients_inserted: ingredientsInserted },
    { status: 201 }
  )
}
