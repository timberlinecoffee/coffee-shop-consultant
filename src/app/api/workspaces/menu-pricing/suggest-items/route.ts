// TIM-1323: AI menu starting points. Given the owner's concept + location,
// propose candidate beverages/food fitting the shop, surfaced as a pick-list
// the owner adds (one tap) into a real category, then refines. v1 is driven by
// the concept document (free text) + location; market-research enrichment is
// noted as v2 (see the PR). Reuses the AI integration + access pattern from the
// TIM-1321 recipe suggestion and TIM-1020 price suggestion.
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { parseSuggestedItems, resolveCategoryId } from "@/lib/menu-suggest"

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

  const prompt = `You are a café concept consultant helping a first-time owner build a STARTING menu. Propose candidate menu items that fit the owner's concept and location. These are starting points the owner will pick from and adjust, not a final menu.

SHOP CONTEXT:
${conceptSummary}

CATEGORIES (assign every item to exactly one of these, by exact name):
${categoryNames.map((n) => `- ${n}`).join("\n")}

YOUR TASK:
Suggest 10 to 14 menu items that fit this concept and location. Cover a credible spread across the categories above (espresso drinks, brewed coffee, a few food items, and a seasonal/specialty option or two where it fits). Favor items a real specialty café would actually sell. Avoid duplicates and avoid anything that does not fit the concept.

For each item provide:
- "name": the item name in Title Case (capitalize every word except articles/short prepositions/conjunctions; AP style). Examples: "Oat Flat White", "Cold Brew", "Avocado Toast". No brand names, no emojis.
- "category": EXACTLY one of the category names listed above.
- "rationale": one short, plain sentence on why it fits this shop. Founder voice: concrete and grounded, no hype, no AI language, no em dashes (use a comma or a plain hyphen instead).

Return a JSON object with this exact shape and nothing else:
{
  "items": [
    { "name": "Oat Flat White", "category": "Espresso", "rationale": "A reliable seller for the plant-based regulars in this neighborhood." }
  ]
}

Rules: no commentary outside the JSON. Every category value must match a listed category name exactly.`

  let suggestions
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    })
    const rawText = message.content[0]?.type === "text" ? message.content[0].text : ""
    suggestions = parseSuggestedItems(rawText)
  } catch (err) {
    console.error("suggest-items AI error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }

  if (!suggestions || suggestions.length === 0) {
    return Response.json({ error: "Could not generate menu suggestions" }, { status: 422 })
  }

  // Resolve each candidate's category name to a real category id. Anything the
  // model assigned to an unknown category falls back to the first category so
  // the owner can still add it in one tap and move it later.
  const fallbackId = categories[0].id
  const resolved = suggestions.map((s) => {
    const categoryId = resolveCategoryId(s.category, categories) ?? fallbackId
    const categoryName = categories.find((c) => c.id === categoryId)?.name ?? s.category
    return {
      name: s.name,
      category_id: categoryId,
      category_name: categoryName,
      rationale: s.rationale ?? null,
    }
  })

  return Response.json({ suggestions: resolved })
}
