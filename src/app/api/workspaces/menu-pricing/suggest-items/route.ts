// TIM-1323: AI menu starting points. Given the owner's concept + location,
// propose candidate beverages/food fitting the shop, surfaced as a pick-list
// the owner adds (one tap) into a real category, then refines. v1 is driven by
// the concept document (free text) + location; market-research enrichment is
// noted as v2 (see the PR). Reuses the AI integration + access pattern from the
// TIM-1321 recipe suggestion and TIM-1020 price suggestion.
//
// TIM-3683 Bugs 2 & 3:
// - Include the current menu items in the prompt so the AI stops re-suggesting
//   items already on the menu (plus a server-side loose-name filter as a
//   belt-and-suspenders since prompts alone don't strictly bind the model).
// - Ask for a full spec (price, estimated COGS, ingredient list w/ amounts and
//   units, including non-defaults) so the Accept flow lands a complete item
//   rather than a placeholder with only category-default ingredients.
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
  isCloseNameVariant,
  type SuggestedIngredient,
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

  // TIM-3683 Bug 2: pull the current (non-archived) menu items so the prompt
  // can list them and the server can filter close variants after generation.
  const { data: existingItemRows } = await supabase
    .from("menu_items")
    .select("name")
    .eq("plan_id", planId)
    .eq("archived", false)
  const existingItemNames = (existingItemRows ?? [])
    .map((r) => (typeof r.name === "string" ? r.name.trim() : ""))
    .filter((n) => n.length > 0)

  // TIM-3683 Bug 3: pull the plan's existing ingredient names so the model
  // prefers reusing them (accept-side lookup is name-based and case-insensitive).
  const { data: existingIngRows } = await supabase
    .from("menu_ingredients")
    .select("name")
    .eq("plan_id", planId)
    .order("name")
  const existingIngredientNames = (existingIngRows ?? [])
    .map((r) => (typeof r.name === "string" ? r.name.trim() : ""))
    .filter((n) => n.length > 0)

  const ctx = body.concept_context ?? {}
  const conceptLines: string[] = []
  if (ctx.shop_identity) conceptLines.push(`Shop: ${ctx.shop_identity}`)
  if (ctx.location) conceptLines.push(`Location: ${ctx.location}`)
  if (ctx.target_customer) conceptLines.push(`Target customer: ${ctx.target_customer}`)
  if (ctx.vision) conceptLines.push(`Vision: ${ctx.vision}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "No concept details provided yet -- assume a specialty independent café."

  const categoryNames = categories.map((c) => c.name)

  const existingItemsBlock = existingItemNames.length > 0
    ? `ITEMS ALREADY ON THE MENU (DO NOT SUGGEST THESE OR ANY CLOSE VARIANT):
${existingItemNames.map((n) => `- ${n}`).join("\n")}

A "close variant" means: same core drink or dish with a different filler adjective. Examples of items that are ALL variants of "Vanilla Latte" and must be excluded if "Vanilla Latte" is already on the menu: "Classic Vanilla Latte", "Vanilla Café Latte", "House Vanilla Latte", "Vanilla Coffee Latte". Suggest only net-new items -- different core drink, different core dish, or a genuinely distinct flavor profile.
`
    : ""

  const existingIngredientsBlock = existingIngredientNames.length > 0
    ? `INGREDIENTS ALREADY IN THIS PLAN'S PANTRY (reuse these names verbatim whenever the item calls for them, so we don't create duplicates):
${existingIngredientNames.slice(0, 60).map((n) => `- ${n}`).join("\n")}
`
    : ""

  const prompt = `You are a café concept consultant helping a first-time owner build a STARTING menu. Propose candidate menu items that fit the owner's concept and location. These are starting points the owner will pick from and adjust, not a final menu.

SHOP CONTEXT:
${conceptSummary}

CATEGORIES (assign every item to exactly one of these, by exact name):
${categoryNames.map((n) => `- ${n}`).join("\n")}

${existingItemsBlock}${existingIngredientsBlock}
YOUR TASK:
Suggest 8 to 12 menu items that fit this concept and location. Cover a credible spread across the categories above (espresso drinks, brewed coffee, a few food items, and a seasonal/specialty option or two where it fits). Favor items a real specialty café would actually sell. Avoid duplicates and avoid anything that does not fit the concept.

For each item provide:
- "name": the item name in Title Case (capitalize every word except articles/short prepositions/conjunctions; AP style). Examples: "Oat Flat White", "Cold Brew", "Avocado Toast". No brand names, no emojis. This name must NOT appear on the "already on the menu" list and must not be a close variant of anything on that list.
- "category": EXACTLY one of the category names listed above.
- "rationale": one short, plain sentence on why it fits this shop. Founder voice: concrete and grounded, no hype, no AI language, no em dashes (use a comma or a plain hyphen instead).
- "price": suggested retail price in US dollars as a plain number (e.g. 5.5 for $5.50). Reasonable for a specialty café -- espresso drinks $4.00-$7.50, brewed coffee $3.00-$5.00, most food $6.00-$14.00.
- "cogs": estimated cost of goods in US dollars as a plain number (e.g. 1.25 for $1.25). Realistic per-serving cost given the ingredients you list. Should land the item near a 65-80% gross margin.
- "ingredients": a complete list of every ingredient needed to actually make this item, including base ingredients AND non-default add-ins (syrups, alt milks, toppings, sauces, seasonal). Do NOT omit anything essential -- if it is a Maple Syrup Latte, include the maple syrup AND the milk AND the espresso. Each ingredient is an object:
    { "name": "Maple Syrup", "amount": 15, "unit": "ml" }
  Rules: amount is a positive number. unit is exactly one of: "g", "ml", "oz", "each", "piece". Prefer "ml" for liquids and "g" for solids. Use "each" or "piece" for whole items (e.g. one lemon = { "name": "Lemon", "amount": 1, "unit": "each" }). When an ingredient name matches something on the pantry list above, use that exact name.

Return a JSON object with this exact shape and nothing else:
{
  "items": [
    {
      "name": "Oat Flat White",
      "category": "Espresso",
      "rationale": "A reliable seller for the plant-based regulars in this neighborhood.",
      "price": 5.5,
      "cogs": 1.1,
      "ingredients": [
        { "name": "Espresso Beans", "amount": 18, "unit": "g" },
        { "name": "Oat Milk", "amount": 180, "unit": "ml" }
      ]
    }
  ]
}

Rules: no commentary outside the JSON. Every category value must match a listed category name exactly. Every "ingredients" array must be non-empty and complete for the item.`

  let suggestions
  try {
    const result = await runScoutTurn({
      lane: "menu_suggest_items",
      systemBlocks: [],
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4000,
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

  // Resolve each candidate's category name to a real category id. Anything the
  // model assigned to an unknown category falls back to the first category so
  // the owner can still add it in one tap and move it later. Then filter out
  // close-name variants of anything already on the menu (Bug 2 belt-and-suspenders).
  const fallbackId = categories[0].id
  const resolved = suggestions
    .filter((s) => !isCloseNameVariant(s.name, existingItemNames))
    .map((s) => {
      const categoryId = resolveCategoryId(s.category, categories) ?? fallbackId
      const categoryName = categories.find((c) => c.id === categoryId)?.name ?? s.category
      return {
        name: toTitleCase(s.name),
        category_id: categoryId,
        category_name: categoryName,
        rationale: s.rationale ? normalizeAIOutput(s.rationale) : null,
        suggested_price_cents: typeof s.price_cents === "number" ? s.price_cents : null,
        estimated_cogs_cents: typeof s.estimated_cogs_cents === "number" ? s.estimated_cogs_cents : null,
        ingredients: (s.ingredients ?? []).map((ing: SuggestedIngredient) => ({
          name: toTitleCase(ing.name),
          amount: ing.amount,
          unit: ing.unit,
        })),
      }
    })

  if (resolved.length === 0) {
    return Response.json({ error: "All suggestions duplicated the existing menu" }, { status: 422 })
  }

  return Response.json({ suggestions: resolved })
}
