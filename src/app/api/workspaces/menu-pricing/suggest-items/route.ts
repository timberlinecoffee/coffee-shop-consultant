// TIM-1323: AI menu starting points. Given the owner's concept + location,
// propose candidate beverages/food fitting the shop, surfaced as a pick-list
// the owner adds (one tap) into a real category, then refines. v1 is driven by
// the concept document (free text) + location; market-research enrichment is
// noted as v2 (see the PR). Reuses the AI integration + access pattern from the
// TIM-1321 recipe suggestion and TIM-1020 price suggestion.
import { runScoutTurn } from "@/lib/ai/scout-adapter"
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { normalizeAIOutput } from "@/lib/normalize"
import { toTitleCase } from "@/lib/text"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { enforceRateLimit } from "@/lib/rate-limit"
import {
  parseSuggestedItems,
  resolveCategoryId,
  isDuplicateOfExisting,
} from "@/lib/menu-suggest"

export const runtime = "nodejs"
export const maxDuration = 30

const ROUTE_PATH = "/api/workspaces/menu-pricing/suggest-items"

interface ConceptContext {
  shop_identity?: string
  location?: string
  target_customer?: string
  vision?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Rule 4: rate-limit a paid-API route.
  const rateLimited = await enforceRateLimit({
    bucket: "menu:suggest-items",
    id: user.id,
    limit: 10,
    windowSec: 60,
  })
  if (rateLimited) return rateLimited

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

  let body: { concept_context?: ConceptContext }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  // The owner picks items into their real categories, so the model must choose
  // from the categories that already exist on this plan.
  const { data: categoryRows } = await supabase
    .from("menu_categories")
    .select("id, name, position")
    .eq("plan_id", planId)
    .order("position", { ascending: true })
  const categories = (categoryRows ?? []) as { id: string; name: string; position: number }[]
  if (categories.length === 0) {
    return Response.json({ error: "No categories found for this plan" }, { status: 404 })
  }

  const ctx = body.concept_context ?? {}
  const conceptLines: string[] = []
  if (ctx.shop_identity) conceptLines.push(`Shop: ${ctx.shop_identity}`)
  if (ctx.location) conceptLines.push(`Location: ${ctx.location}`)
  if (ctx.target_customer) conceptLines.push(`Target customer: ${ctx.target_customer}`)
  if (ctx.vision) conceptLines.push(`Vision: ${ctx.vision}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "No concept details provided yet — assume a specialty independent café."

  const categoryNames = categories.map((c) => c.name)

  // TIM-3683 Bug 2: pull the current menu so the model doesn't re-suggest items
  // the owner already has (or close variants like "Classic Vanilla Latte" when
  // "Vanilla Latte" is on the menu). We dedupe again server-side after the LLM
  // returns as belt-and-suspenders.
  const { data: existingRows } = await supabase
    .from("menu_items")
    .select("name")
    .eq("plan_id", planId)
    .eq("archived", false)
  const existingNames = (existingRows ?? [])
    .map((r) => (typeof r.name === "string" ? r.name.trim() : ""))
    .filter((n) => n.length > 0)

  const existingBlock = existingNames.length > 0
    ? `\n\nALREADY ON THE MENU (do NOT suggest any of these or close variants — treat "Classic Vanilla Latte", "Our Vanilla Café Latte", and "Iced Vanilla Latte" as variants of "Vanilla Latte" and skip them all):\n${existingNames.map((n) => `- ${n}`).join("\n")}`
    : ""

  const prompt = `You are a café concept consultant helping a first-time owner build a STARTING menu. Propose candidate menu items that fit the owner's concept and location. These are starting points the owner will pick from and adjust, not a final menu.

SHOP CONTEXT:
${conceptSummary}

CATEGORIES (assign every item to exactly one of these, by exact name):
${categoryNames.map((n) => `- ${n}`).join("\n")}${existingBlock}

YOUR TASK:
Suggest 10 to 14 NET-NEW menu items that fit this concept and location. Cover a credible spread across the categories above (espresso drinks, brewed coffee, a few food items, and a seasonal/specialty option or two where it fits). Favor items a real specialty café would actually sell. Every item must be genuinely different from what is already on the menu — no duplicates, no close variants, no reworded versions of existing items.

For each item provide:
- "name": the item name in Title Case (capitalize every word except articles/short prepositions/conjunctions; AP style). Examples: "Oat Flat White", "Cold Brew", "Avocado Toast". No brand names, no emojis.
- "category": EXACTLY one of the category names listed above.
- "rationale": one short, plain sentence on why it fits this shop. Founder voice: concrete and grounded, no hype, no AI language, no em dashes (use a comma or a plain hyphen instead).
- "estimated_price_cents": a realistic retail price for this shop's neighborhood, in whole cents (e.g. 550 for $5.50). Integer.
- "estimated_cogs_cents": realistic ingredient cost in whole cents.
- "ingredients": a COMPLETE list of what actually goes into this drink or dish, INCLUDING non-default items — syrups, alt milks, toppings, sauces, seasonal add-ins. Do NOT list only the espresso base and skip the maple syrup for a "Maple Syrup Latte". Each ingredient is { "name": Title Case, "amount": positive number, "unit": one of "g" | "ml" | "oz" | "each" | "piece" }. Typical shot of espresso is 18 g dry / ~30 ml wet; a 12 oz drink is ~355 ml total; use "each" or "piece" for whole items (croissant, tea bag).

Return a JSON object with this exact shape and nothing else:
{
  "items": [
    {
      "name": "Maple Syrup Latte",
      "category": "Espresso",
      "rationale": "A house twist that leans on regional maple, easy for first-time owners to keep in stock.",
      "estimated_price_cents": 575,
      "estimated_cogs_cents": 145,
      "ingredients": [
        { "name": "Espresso Beans", "amount": 18, "unit": "g" },
        { "name": "Whole Milk", "amount": 240, "unit": "ml" },
        { "name": "Maple Syrup", "amount": 15, "unit": "ml" }
      ]
    }
  ]
}

Rules: no commentary outside the JSON. Every category value must match a listed category name exactly. Every item MUST include a full ingredients array — an espresso drink without the syrup, or a latte without the milk, is a bug.`

  let suggestions
  try {
    const result = await runScoutTurn({
      lane: "menu_suggest_items",
      systemBlocks: [],
      messages: [{ role: "user", content: prompt }],
      // TIM-3683 Bug 3: budget grew from ~name+category+rationale (~30 tok/item)
      // to a full spec with price, COGS, and 3-8 ingredients (~120 tok/item).
      // Cap at 14 items × ~150 tok headroom = ~2100, round up.
      maxTokens: 3500,
      userId: user.id,
      routeTag: ROUTE_PATH,
    })
    suggestions = parseSuggestedItems(result.text)
  } catch (err) {
    console.error("suggest-items AI error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }

  if (!suggestions || suggestions.length === 0) {
    return Response.json({ error: "Could not generate menu suggestions" }, { status: 422 })
  }

  // TIM-3683 Bug 2: server-side dedupe as belt-and-suspenders — even with the
  // prompt block above, a model can still emit a "Classic Vanilla Latte" when
  // the menu has "Vanilla Latte". Drop those before returning.
  const filtered = suggestions.filter((s) => !isDuplicateOfExisting(s.name, existingNames))
  if (filtered.length === 0) {
    return Response.json({ error: "Could not generate net-new menu suggestions" }, { status: 422 })
  }

  // Resolve each candidate's category name to a real category id. Anything the
  // model assigned to an unknown category falls back to the first category so
  // the owner can still add it in one tap and move it later.
  const fallbackId = categories[0].id
  const resolved = filtered.map((s) => {
    const categoryId = resolveCategoryId(s.category, categories) ?? fallbackId
    const categoryName = categories.find((c) => c.id === categoryId)?.name ?? s.category
    return {
      name: toTitleCase(s.name),
      category_id: categoryId,
      category_name: categoryName,
      rationale: s.rationale ? normalizeAIOutput(s.rationale) : null,
      // TIM-3683 Bug 3: pass through the full item spec so the client can add a
      // complete item, not just a name + default ingredients.
      estimated_price_cents: s.estimated_price_cents ?? null,
      estimated_cogs_cents: s.estimated_cogs_cents ?? null,
      ingredients: s.ingredients ?? [],
    }
  })

  return Response.json({ suggestions: resolved })
}
