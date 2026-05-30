// TIM-1471: AI benchmark — "Benchmark against cafés in my area."
// Takes an item name + current price + the owner's location/concept and returns
// a typical price range comparable shops charge, plus a verdict on whether the
// current price is below / within / above the band. Lean v1: text response.
// Sibling of /suggest-price; that one recommends a price, this one positions
// the current one against local market reality.
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { normalizeAIOutput } from "@/lib/normalize"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"

export const runtime = "nodejs"
export const maxDuration = 30

const anthropic = new Anthropic()

interface ConceptContext {
  shop_identity?: string
  location?: string
  target_customer?: string
  vision?: string
}

type Verdict = "below" | "in_band" | "above" | "unknown"

async function getPlanId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
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

function deriveVerdict(
  current: number,
  low: number,
  high: number,
): Verdict {
  if (!Number.isFinite(current) || current <= 0) return "unknown"
  if (current < low) return "below"
  if (current > high) return "above"
  return "in_band"
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
    current_price_cents?: number
    concept_context?: ConceptContext
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.item_id || typeof body.item_id !== "string") {
    return Response.json({ error: "Missing required field: item_id" }, { status: 400 })
  }
  const itemName = body.item_name?.trim()
  if (!itemName) {
    return Response.json({ error: "Name the item before running a benchmark" }, { status: 400 })
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
  if (ctx.vision) conceptLines.push(`Vision: ${ctx.vision}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "A specialty independent café."

  const currentCents = typeof body.current_price_cents === "number" && body.current_price_cents > 0
    ? body.current_price_cents
    : 0
  const currentDollars = currentCents > 0
    ? `$${(currentCents / 100).toFixed(2)}`
    : "no price set yet"

  const prompt = `You are a coffee shop pricing consultant. The shop owner wants to know how their current price compares to cafés in their area.

SHOP CONTEXT:
${conceptSummary}

ITEM:
- Name: ${itemName}
- Current price: ${currentDollars}

YOUR TASK:
Estimate the typical price range comparable cafés in this area charge for ${itemName}. Then compare the owner's current price to that range.

Return a JSON object with these exact fields:
- low_cents: integer, low end of the typical local range in cents
- high_cents: integer, high end of the typical local range in cents
- commentary: string, 2–4 sentences. Reference the specific location and shop positioning. Say whether the current price reads low, fair, or premium, and give the owner one concrete recommendation. No em dashes, no jargon, no AI language.

Return ONLY the JSON object.`

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })

    const rawText = message.content[0]?.type === "text" ? message.content[0].text : ""
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json({ error: "No JSON in AI response" }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      low_cents?: unknown
      high_cents?: unknown
      commentary?: unknown
    }

    const low = Math.max(0, Math.round(Number(parsed.low_cents)))
    const high = Math.max(low, Math.round(Number(parsed.high_cents)))
    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= 0) {
      return Response.json({ error: "AI returned no usable range" }, { status: 500 })
    }

    return Response.json({
      low_cents: low,
      high_cents: high,
      current_price_cents: currentCents,
      verdict: deriveVerdict(currentCents, low, high),
      commentary: normalizeAIOutput(String(parsed.commentary ?? "")),
    })
  } catch (err) {
    console.error("benchmark-price error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }
}
