// TIM-967: AI suggested retail price for menu items.
// TIM-1020: Concept-aware pricing — location, positioning, regional benchmarks, margin floor, range output.
import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { normalizeAIOutput } from "@/lib/normalize"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"

export const runtime = "nodejs"
export const maxDuration = 30

const anthropic = new Anthropic()

// Regional benchmark prices (low–high) in cents for canonical espresso drinks.
// Used to anchor the model on current market reality.
const REGIONAL_BENCHMARKS: Record<string, Record<string, [number, number]>> = {
  "canada-major-metro": {
    latte:      [495, 695],
    cappuccino: [475, 650],
    americano:  [375, 525],
    drip:       [300, 450],
    cortado:    [425, 575],
    mocha:      [550, 750],
    "cold brew":[550, 725],
    matcha:     [575, 750],
  },
  "canada-other": {
    latte:      [425, 600],
    cappuccino: [400, 575],
    americano:  [325, 475],
    drip:       [275, 400],
    cortado:    [375, 525],
    mocha:      [475, 650],
    "cold brew":[475, 650],
    matcha:     [500, 675],
  },
  "us-major-metro": {
    latte:      [550, 750],
    cappuccino: [525, 700],
    americano:  [375, 550],
    drip:       [300, 475],
    cortado:    [450, 625],
    mocha:      [600, 800],
    "cold brew":[575, 775],
    matcha:     [600, 800],
  },
  "us-other": {
    latte:      [395, 575],
    cappuccino: [375, 550],
    americano:  [300, 450],
    drip:       [250, 400],
    cortado:    [350, 500],
    mocha:      [450, 625],
    "cold brew":[450, 625],
    matcha:     [500, 675],
  },
  "uk-london": {
    latte:      [450, 650],
    cappuccino: [425, 625],
    americano:  [350, 525],
    drip:       [300, 450],
    cortado:    [400, 575],
    mocha:      [500, 700],
    "cold brew":[525, 725],
    matcha:     [550, 750],
  },
  "uk-other": {
    latte:      [395, 575],
    cappuccino: [375, 550],
    americano:  [325, 475],
    drip:       [275, 400],
    cortado:    [375, 525],
    mocha:      [450, 625],
    "cold brew":[475, 650],
    matcha:     [500, 675],
  },
  "au": {
    latte:      [450, 625],
    cappuccino: [425, 600],
    americano:  [375, 525],
    drip:       [325, 475],
    cortado:    [400, 575],
    mocha:      [500, 675],
    "cold brew":[525, 700],
    matcha:     [550, 725],
  },
  "eu": {
    latte:      [375, 575],
    cappuccino: [350, 550],
    americano:  [300, 475],
    drip:       [275, 425],
    cortado:    [350, 525],
    mocha:      [425, 625],
    "cold brew":[450, 650],
    matcha:     [475, 675],
  },
}

function detectRegion(location: string): string {
  const l = location.toLowerCase()
  if (l.includes("toronto") || l.includes("vancouver") || l.includes("montreal") || l.includes("calgary")) return "canada-major-metro"
  if (l.includes("canada") || l.includes("ontario") || l.includes("bc") || l.includes("alberta") || l.includes("québec")) return "canada-other"
  if (l.includes("london")) return "uk-london"
  if (l.includes("uk") || l.includes("england") || l.includes("scotland") || l.includes("wales")) return "uk-other"
  if (l.includes("australia") || l.includes("sydney") || l.includes("melbourne") || l.includes("brisbane")) return "au"
  if (l.includes("new york") || l.includes("nyc") || l.includes("san francisco") || l.includes("los angeles") || l.includes("chicago") || l.includes("seattle") || l.includes("boston")) return "us-major-metro"
  if (l.includes("europe") || l.includes("germany") || l.includes("france") || l.includes("netherlands") || l.includes("spain") || l.includes("italy") || l.includes("belgium")) return "eu"
  // Default: us-other for unrecognised locations
  return "us-other"
}

function findBestBenchmark(itemName: string, region: string): [number, number] | null {
  const benchmarks = REGIONAL_BENCHMARKS[region]
  if (!benchmarks) return null
  const name = itemName.toLowerCase()
  for (const [key, range] of Object.entries(benchmarks)) {
    if (name.includes(key)) return range
  }
  // Fall back to latte as canonical espresso benchmark
  return benchmarks["latte"] ?? null
}

function buildBenchmarkTable(region: string): string {
  const benchmarks = REGIONAL_BENCHMARKS[region]
  if (!benchmarks) return ""
  const regionLabel = region.replace(/-/g, " ")
  const lines = [`Typical retail prices in ${regionLabel} (low–high):`]
  for (const [drink, [low, high]] of Object.entries(benchmarks)) {
    lines.push(`  ${drink}: $${(low / 100).toFixed(2)}–$${(high / 100).toFixed(2)}`)
  }
  return lines.join("\n")
}

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

  let body: {
    item_name?: string
    cogs_cents: number
    concept_context?: ConceptContext
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (body.cogs_cents === undefined || body.cogs_cents === null) {
    return Response.json({ error: "Missing required field: cogs_cents" }, { status: 400 })
  }

  const cogsDollars = (body.cogs_cents / 100).toFixed(2)
  const ctx = body.concept_context ?? {}
  const itemName = body.item_name?.trim() || "this item"

  // Margin floor: coffee shops target 75–85% gross margin.
  // Floor = COGS / (1 - 0.75) = COGS × 4
  const marginFloorCents = Math.ceil(body.cogs_cents / 0.25)
  const marginFloorDollars = (marginFloorCents / 100).toFixed(2)

  // Detect region from location context
  const locationText = ctx.location ?? ""
  const region = detectRegion(locationText)
  const benchmarkRange = findBestBenchmark(itemName, region)
  const benchmarkTable = buildBenchmarkTable(region)

  // Build concept summary for prompt
  const conceptLines: string[] = []
  if (ctx.shop_identity) conceptLines.push(`Shop: ${ctx.shop_identity}`)
  if (ctx.location) conceptLines.push(`Location: ${ctx.location}`)
  if (ctx.target_customer) conceptLines.push(`Target customer: ${ctx.target_customer}`)
  if (ctx.vision) conceptLines.push(`Vision: ${ctx.vision}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "No concept details provided — assume a specialty independent café."

  const benchmarkHint = benchmarkRange
    ? `The typical market range for ${itemName} in this region is $${(benchmarkRange[0] / 100).toFixed(2)}–$${(benchmarkRange[1] / 100).toFixed(2)}.`
    : ""

  const prompt = `You are a coffee shop pricing consultant. You think like an independent shop owner, not a management consultant. Be direct, specific, and practical.

SHOP CONTEXT:
${conceptSummary}

ITEM BEING PRICED:
- Name: ${itemName}
- COGS: $${cogsDollars}

MARKET REFERENCE (use these to anchor your suggestion):
${benchmarkTable}

${benchmarkHint}

MARGIN FLOOR:
A 75% gross margin floor puts the minimum retail price at $${marginFloorDollars} for this COGS. Do not suggest below this floor. Most quality independent shops target 78–82%.

YOUR TASK:
Suggest a retail price range for ${itemName}. The range should reflect this shop's specific market and positioning.

Return a JSON object with these exact fields:
- suggested_price_cents: integer, your recommended retail price in cents (the midpoint of your range, anchored above the margin floor and within or near the market range)
- low_cents: integer, the low end of what makes sense for this shop and market (never below the margin floor)
- high_cents: integer, the high end of what this shop could charge without pushing customers away
- margin_pct: number, the gross margin at suggested_price_cents as a decimal (e.g. 0.80 for 80%)
- commentary: string, 2–3 sentences. Explain the specific price with reference to this location and positioning. Name a real number. No jargon. Write like you are talking directly to the shop owner.

Rules: no emojis, no AI language, the suggestion must be above $${marginFloorDollars}, be specific about the market and location.

Return ONLY the JSON object, no other text.`

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

    const parsed = JSON.parse(jsonMatch[0]) as {
      suggested_price_cents: number
      low_cents: number
      high_cents: number
      margin_pct: number
      commentary: string
    }

    // Enforce margin floor — never return below it
    const suggestedCents = Math.max(Number(parsed.suggested_price_cents), marginFloorCents)
    const lowCents = Math.max(Number(parsed.low_cents), marginFloorCents)
    const highCents = Math.max(Number(parsed.high_cents), lowCents)
    const marginAtSuggested = body.cogs_cents > 0
      ? (suggestedCents - body.cogs_cents) / suggestedCents
      : Number(parsed.margin_pct)

    return Response.json({
      suggested_price_cents: suggestedCents,
      low_cents: lowCents,
      high_cents: highCents,
      margin_pct: marginAtSuggested,
      commentary: normalizeAIOutput(String(parsed.commentary ?? "")),
    })
  } catch (err) {
    console.error("suggest-price error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }
}
