// TIM-1321: AI recipe starting points. Given a menu item name, propose a
// standard recipe and pre-populate the item's ingredient rows — reusing
// existing library ingredients by name (Title Case, TIM-1002) and creating the
// rest with a sensible default the user can price. Reuses the AI integration
// pattern from the TIM-1020 price suggestion.
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { parseRecipeResponse, defaultPackageSize } from "@/lib/recipe-suggest"
import type { MenuIngredient, MenuItemIngredient, IngredientUnit } from "@/lib/menu"

export const runtime = "nodejs"
export const maxDuration = 30

const anthropic = new Anthropic()

interface ConceptContext {
  shop_identity?: string
  location?: string
  target_customer?: string
  vision?: string
}

async function getPlanId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

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

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: {
    item_id?: string
    item_name?: string
    concept_context?: ConceptContext
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.item_id || typeof body.item_id !== "string") {
    return Response.json({ error: "Missing required field: item_id" }, { status: 400 })
  }
  const itemName = body.item_name?.trim()
  if (!itemName) {
    return Response.json({ error: "Name the item before suggesting a recipe" }, { status: 400 })
  }

  // Verify the item belongs to this plan.
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", body.item_id)
    .eq("plan_id", planId)
    .maybeSingle()
  if (!menuItem) {
    return Response.json({ error: "Menu item not found for this plan" }, { status: 404 })
  }

  const ctx = body.concept_context ?? {}
  const conceptLines: string[] = []
  if (ctx.shop_identity) conceptLines.push(`Shop: ${ctx.shop_identity}`)
  if (ctx.location) conceptLines.push(`Location: ${ctx.location}`)
  if (ctx.target_customer) conceptLines.push(`Target customer: ${ctx.target_customer}`)
  if (ctx.vision) conceptLines.push(`Vision: ${ctx.vision}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "No concept details provided — assume a specialty independent café."

  const prompt = `You are a café operations consultant helping a first-time owner build a recipe. Propose the standard build for the menu item below as a STARTING POINT the owner will adjust.

SHOP CONTEXT:
${conceptSummary}

MENU ITEM:
${itemName}

YOUR TASK:
List the ingredients in a standard single-serving build of "${itemName}", with a realistic quantity and unit per line. Think like a working barista or line cook: include the components that actually drive cost (espresso/coffee dose, milk, syrup, bread, protein, produce, etc.). Aim for 3–8 lines. Omit tap water and trivial garnishes.

UNITS — use ONLY these exact values:
- "g" for solids/coffee by weight
- "ml" for liquids
- "oz" for items commonly measured in ounces
- "each" for whole countable items (e.g. 1 egg, 1 lemon)
- "piece" for portions/slices (e.g. 2 slices of bread)
Convert any other unit (cups, shots, tbsp, kg, lb…) into one of these before answering.

NAMING — return each ingredient name in Title Case (capitalize every word except articles/short prepositions/conjunctions; AP style). Use simple, reusable library names: "Whole Milk", "Espresso", "Vanilla Syrup", "Sourdough Bread", "Avocado". No brand names.

Return a JSON object with this exact shape and nothing else:
{
  "ingredients": [
    { "name": "Espresso", "amount": 18, "unit": "g" },
    { "name": "Whole Milk", "amount": 120, "unit": "ml" }
  ]
}

Rules: no emojis, no AI language, no commentary outside the JSON. Quantities must be realistic for one serving.`

  let lines
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })
    const rawText = message.content[0]?.type === "text" ? message.content[0].text : ""
    lines = parseRecipeResponse(rawText)
  } catch (err) {
    console.error("suggest-recipe AI error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }

  if (!lines || lines.length === 0) {
    return Response.json({ error: "Could not generate a recipe for this item" }, { status: 422 })
  }

  // ── Resolve each suggested line to a library ingredient, creating missing
  //    ones, then attach as recipe lines (skipping ingredients already on the
  //    item so we never duplicate or clobber the owner's existing rows). ──────
  const { data: existingIngredients } = await supabase
    .from("menu_ingredients")
    .select("*")
    .eq("plan_id", planId)
  const byName = new Map<string, MenuIngredient>()
  for (const ing of (existingIngredients ?? []) as MenuIngredient[]) {
    byName.set(ing.name.trim().toLowerCase(), ing)
  }

  // Create any ingredients that don't already exist. Recipe line unit follows
  // the ingredient's package unit (matching the existing combobox add flow),
  // so the COGS math (amount × cost-per-package-unit) stays coherent.
  const toCreate = lines.filter((l) => !byName.has(l.name.toLowerCase()))
  if (toCreate.length > 0) {
    const rows = toCreate.map((l) => ({
      plan_id: planId,
      name: l.name, // already Title Case from the parser
      package_size: defaultPackageSize(l.unit),
      package_unit: l.unit,
      package_cost_cents: 0,
    }))
    const { data: created, error: createErr } = await supabase
      .from("menu_ingredients")
      .insert(rows)
      .select()
    if (createErr) {
      console.error("suggest-recipe ingredient insert error:", createErr)
      return Response.json({ error: "Failed to create ingredients" }, { status: 500 })
    }
    for (const ing of (created ?? []) as MenuIngredient[]) {
      byName.set(ing.name.trim().toLowerCase(), ing)
    }
  }

  // Ingredients already attached to this item — don't add a second row for them.
  const { data: existingLines } = await supabase
    .from("menu_item_ingredients")
    .select("ingredient_id")
    .eq("menu_item_id", body.item_id)
  const alreadyOnItem = new Set(
    ((existingLines ?? []) as { ingredient_id: string }[]).map((r) => r.ingredient_id)
  )

  const lineRows: {
    menu_item_id: string
    ingredient_id: string
    amount: number
    unit: IngredientUnit
  }[] = []
  for (const l of lines) {
    const ing = byName.get(l.name.toLowerCase())
    if (!ing || alreadyOnItem.has(ing.id)) continue
    lineRows.push({
      menu_item_id: body.item_id,
      ingredient_id: ing.id,
      amount: l.amount,
      unit: ing.package_unit, // follow package unit (no unit conversion in COGS)
    })
    alreadyOnItem.add(ing.id)
  }

  if (lineRows.length > 0) {
    const { error: lineErr } = await supabase
      .from("menu_item_ingredients")
      .insert(lineRows)
    if (lineErr) {
      console.error("suggest-recipe item-ingredient insert error:", lineErr)
      return Response.json({ error: "Failed to attach recipe lines" }, { status: 500 })
    }
  }

  // Return fresh state so the client can update without extra round-trips:
  // the full ingredient list (incl. new ones) and every line for this item.
  const [{ data: ingredients }, { data: itemLines }] = await Promise.all([
    supabase.from("menu_ingredients").select("*").eq("plan_id", planId).order("name"),
    supabase.from("menu_item_ingredients").select("*").eq("menu_item_id", body.item_id).order("created_at"),
  ])

  return Response.json({
    suggested_count: lines.length,
    added_count: lineRows.length,
    ingredients: (ingredients ?? []) as MenuIngredient[],
    lines: (itemLines ?? []) as MenuItemIngredient[],
  })
}
