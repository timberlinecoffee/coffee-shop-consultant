// TIM-967: AI suggested retail price for menu items.
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"

export const runtime = "nodejs"
export const maxDuration = 30

const anthropic = new Anthropic()

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

  let body: { cogs_cents: number; concept_type: 'premium' | 'neighborhood' | 'specialty'; market: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (body.cogs_cents === undefined || body.cogs_cents === null) {
    return Response.json({ error: "Missing required field: cogs_cents" }, { status: 400 })
  }
  if (!body.concept_type) {
    return Response.json({ error: "Missing required field: concept_type" }, { status: 400 })
  }
  if (!body.market || typeof body.market !== "string") {
    return Response.json({ error: "Missing required field: market" }, { status: 400 })
  }

  const cogsDollars = (body.cogs_cents / 100).toFixed(2)
  const prompt = `You are a coffee shop pricing consultant. You think like an independent shop owner, not a management consultant. Be direct, specific, and practical.

Given:
- COGS: $${cogsDollars}
- Shop type: ${body.concept_type} coffee shop
- Market: ${body.market}

Suggest a retail price for this menu item. Consider local market norms for a ${body.concept_type} shop in ${body.market}.

Return a JSON object with these exact fields:
- suggested_price_cents: integer, your recommended retail price in cents
- low_cents: integer, the low end of what this item typically sells for in this market
- high_cents: integer, the high end of what this item typically sells for in this market
- margin_pct: number, the gross margin percentage at the suggested price (as a decimal, e.g. 0.72 for 72%)
- commentary: string, 2-3 sentences explaining the pricing rationale in plain language. No jargon. Be specific about why this price makes sense for this market and shop type. Write like you are talking directly to the shop owner.

Rules: no emojis, no AI language, be specific about the market.

Return ONLY the JSON object, no other text.`

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
      suggested_price_cents: number
      low_cents: number
      high_cents: number
      margin_pct: number
      commentary: string
    }

    return Response.json({
      suggested_price_cents: Number(parsed.suggested_price_cents),
      low_cents: Number(parsed.low_cents),
      high_cents: Number(parsed.high_cents),
      margin_pct: Number(parsed.margin_pct),
      commentary: String(parsed.commentary ?? ""),
    })
  } catch (err) {
    console.error("suggest-price error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }
}
