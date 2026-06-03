// TIM-1321: AI recipe starting points. Given a menu item name, propose a
// standard recipe and pre-populate the item's ingredient rows — reusing
// existing library ingredients by name (Title Case, TIM-1002) and creating the
// rest with a sensible default the user can price. Reuses the AI integration
// pattern from the TIM-1020 price suggestion.
import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
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
      model: PLATFORM_AI_MODEL,
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

  // ── TIM-1409: Resolve every suggested line to a library ingredient row.
  //    Either link to an existing match (case-insensitive on the trimmed name,
  //    per the Title-Case rule in TIM-1002) or create a new row with the
  //    suggested unit and a $0 cost so the owner can price it. Never persist
  //    an unlinked recipe line — if resolution or insert fails for any reason,
  //    surface the error rather than silently writing an orphan row. ─────────
  const { data: existingIngredients, error: existingErr } = await supabase
    .from("menu_ingredients")
    .select("*")
    .eq("plan_id", planId)
  if (existingErr) {
    console.error("suggest-recipe ingredient read error:", existingErr)
    return Response.json({ error: "Failed to load ingredient library" }, { status: 500 })
  }
  const byName = new Map<string, MenuIngredient>()
  for (const ing of (existingIngredients ?? []) as MenuIngredient[]) {
    byName.set(ing.name.trim().toLowerCase(), ing)
  }

  // Create the ingredients that don't exist yet. Recipe line unit follows the
  // ingredient's package unit (matching the existing combobox add flow), so
  // the COGS math (amount × cost-per-package-unit) stays coherent.
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

  // Hard invariant: every suggested line must now resolve to an ingredient
  // row. If any don't, abort — the alternative is an orphan recipe row that
  // breaks the COGS contract.
  const resolved: { line: typeof lines[number]; ingredient: MenuIngredient }[] = []
  const unresolved: string[] = []
  for (const l of lines) {
    const ing = byName.get(l.name.toLowerCase())
    if (ing) resolved.push({ line: l, ingredient: ing })
    else unresolved.push(l.name)
  }
  if (unresolved.length > 0) {
    console.error("suggest-recipe unresolved lines:", unresolved)
    return Response.json(
      { error: `Couldn't link these ingredients: ${unresolved.join(", ")}` },
      { status: 500 }
    )
  }

  // Skip ingredients already on this item so we don't duplicate or clobber
  // owner-edited rows. These still count as "linked" for acceptance — the
  // pre-existing row is the linkage.
  const { data: existingLines, error: existingLinesErr } = await supabase
    .from("menu_item_ingredients")
    .select("ingredient_id")
    .eq("menu_item_id", body.item_id)
  if (existingLinesErr) {
    console.error("suggest-recipe item-ingredient read error:", existingLinesErr)
    return Response.json({ error: "Failed to load existing recipe lines" }, { status: 500 })
  }
  const alreadyOnItem = new Set(
    ((existingLines ?? []) as { ingredient_id: string }[]).map((r) => r.ingredient_id)
  )

  const lineRows: {
    menu_item_id: string
    ingredient_id: string
    amount: number
    unit: IngredientUnit
  }[] = []
  for (const r of resolved) {
    if (alreadyOnItem.has(r.ingredient.id)) continue
    lineRows.push({
      menu_item_id: body.item_id,
      ingredient_id: r.ingredient.id,
      amount: r.line.amount,
      unit: r.ingredient.package_unit, // follow package unit (no unit conversion in COGS)
    })
    alreadyOnItem.add(r.ingredient.id)
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
