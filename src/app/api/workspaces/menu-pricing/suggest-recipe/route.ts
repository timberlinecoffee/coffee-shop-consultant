// TIM-1321: AI recipe starting points. Given a menu item name, propose a
// standard recipe and pre-populate the item's ingredient rows — reusing
// existing library ingredients by name (Title Case, TIM-1002) and creating the
// rest with a sensible default the user can price. Reuses the AI integration
// pattern from the TIM-1020 price suggestion.
import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { enforceRateLimit } from "@/lib/rate-limit"
import { parseRecipeResponse } from "@/lib/recipe-suggest"

export const runtime = "nodejs"
export const maxDuration = 30

const anthropic = new Anthropic()

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
    bucket: "menu:suggest-recipe",
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

  // TIM-2924 Shape C fix: do not create ingredients or recipe lines here.
  // The review modal is the Accept gate; the /apply sub-route does the DB
  // writes after the user confirms in the modal.
  return Response.json({ lines })
}
