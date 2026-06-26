// TIM-1471: AI-generated preparation steps for a menu item.
// Sibling of /suggest-recipe — that one generates ingredients, this one
// generates the ordered prep instructions shown in the Recipe tab.
// Title Case per TIM-1002 at the API boundary. No em dashes per Voice Mandate.
import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { normalizeAIOutput } from "@/lib/normalize"
import { toTitleCase } from "@/lib/text"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { enforceRateLimit } from "@/lib/rate-limit"

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
    bucket: "menu:suggest-prep-steps",
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
    ingredient_names?: string[]
    concept_context?: ConceptContext
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.item_id || typeof body.item_id !== "string") {
    return Response.json({ error: "Missing required field: item_id" }, { status: 400 })
  }
  const itemName = body.item_name?.trim()
  if (!itemName) {
    return Response.json({ error: "Name the item before suggesting prep steps" }, { status: 400 })
  }

  // Verify the item belongs to this plan.
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", body.item_id)
    .eq("plan_id", planId)
    .maybeSingle()
  if (!menuItem) return Response.json({ error: "Menu item not found" }, { status: 404 })

  const ctx = body.concept_context ?? {}
  const conceptLines: string[] = []
  if (ctx.shop_identity) conceptLines.push(`Shop: ${ctx.shop_identity}`)
  if (ctx.location) conceptLines.push(`Location: ${ctx.location}`)
  if (ctx.target_customer) conceptLines.push(`Target customer: ${ctx.target_customer}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "A specialty independent café."

  const ingredientNames = Array.isArray(body.ingredient_names)
    ? body.ingredient_names.filter((s): s is string => typeof s === "string").slice(0, 30)
    : []
  const ingredientHint = ingredientNames.length > 0
    ? `Ingredients already on this recipe: ${ingredientNames.join(", ")}.`
    : "No ingredients listed yet — assume the standard build for this drink."

  const prompt = `You are a working barista writing the prep steps for a café recipe card. Be concrete and physical: temperatures, times, sequence. No marketing language, no em dashes.

SHOP CONTEXT:
${conceptSummary}

ITEM:
- Name: ${itemName}
- ${ingredientHint}

YOUR TASK:
Return between 4 and 8 short ordered preparation steps a new barista could follow. Each step is one imperative sentence (10–18 words). Cover: prep, pull/brew, steam/build, finish. Skip greeting and order-taking — start at the bar.

Return values in Title Case for any label-shaped fragments (every word capitalized except articles/short prepositions/conjunctions; AP style). Full sentences stay sentence-cased.

Return ONLY a JSON object: { "steps": ["...", "...", ...] }`

  try {
    const message = await anthropic.messages.create({
      model: PLATFORM_AI_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })

    const rawText = message.content[0]?.type === "text" ? message.content[0].text : ""
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json({ error: "No JSON in AI response" }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0]) as { steps?: unknown }
    const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : []
    const steps = rawSteps
      .filter((s): s is string => typeof s === "string")
      .map((s) => normalizeAIOutput(s).trim())
      .filter((s) => s.length > 0)
      .slice(0, 12)

    if (steps.length === 0) {
      return Response.json({ error: "AI returned no steps" }, { status: 500 })
    }

    // TIM-1002: Title-Case fragment-shaped lines at the boundary; full
    // sentences (end in punctuation) stay sentence-cased.
    const persisted = steps.map((s) =>
      /[.!?]$/.test(s) ? s : toTitleCase(s),
    )

    // TIM-2924 Shape C fix: do not persist here. The review modal is the
    // Accept gate; onApply writes via the items PATCH when the user confirms.
    return Response.json({ steps: persisted })
  } catch (err) {
    console.error("suggest-preparation-steps error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }
}
