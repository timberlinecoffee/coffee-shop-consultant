// TIM-1471: AI benchmark — "Benchmark against cafés in my area."
// Takes an item name + current price + the owner's location/concept and returns
// a typical price range comparable shops charge, plus a verdict on whether the
// current price is below / within / above the band. Lean v1: text response.
// Sibling of /suggest-price; that one recommends a price, this one positions
// the current one against local market reality.
// TIM-1692: Also captures anonymized price data to menu_price_aggregates for
// future cross-user percentile calculations.
// TIM-1698: Checks curated public industry dataset first; falls back to AI only
// when no industry record exists for the item. Returns source:"industry_benchmark"
// for items covered by the dataset, "ai_estimated" otherwise.
import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { createServiceClient } from "@/lib/supabase/service"
import { normalizeAIOutput } from "@/lib/normalize"
import { isSubscriptionActive, isBetaWaived, effectivePlanForGating } from "@/lib/access"
import { lookupIndustryBenchmark } from "@/lib/menu-pricing/industry-benchmarks"

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

// TIM-1692: Normalize an item name for aggregate bucketing.
// Lossy by design — we want "Oat Milk Latte" and "oat milk latte" to group.
function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

// TIM-1692: Derive a coarse region bucket from a free-text location string.
// Best-effort only; returns null if the location is absent or unrecognized.
function deriveRegionBucket(location?: string): string | null {
  if (!location) return null
  const loc = location.toLowerCase()
  if (loc.match(/\b(seattle|portland|vancouver|tacoma|olympia)\b/)) return "Pacific Northwest"
  if (loc.match(/\b(san francisco|los angeles|san diego|oakland|berkeley|sacramento)\b/)) return "California"
  if (loc.match(/\b(new york|brooklyn|manhattan|queens|bronx|jersey city)\b/)) return "New York Metro"
  if (loc.match(/\b(chicago|milwaukee|minneapolis)\b/)) return "Midwest"
  if (loc.match(/\b(denver|boulder|fort collins|salt lake)\b/)) return "Mountain West"
  if (loc.match(/\b(austin|dallas|houston|san antonio)\b/)) return "Texas"
  if (loc.match(/\b(miami|orlando|tampa|atlanta|charlotte|raleigh)\b/)) return "Southeast"
  if (loc.match(/\b(boston|cambridge|providence|new haven)\b/)) return "New England"
  if (loc.match(/\b(phoenix|tucson|albuquerque|las vegas)\b/)) return "Southwest"
  if (loc.match(/\b(london|uk|england|scotland|ireland)\b/)) return "UK"
  if (loc.match(/\b(australia|sydney|melbourne|brisbane)\b/)) return "Australia"
  if (loc.match(/\b(canada|toronto|montreal|calgary|vancouver bc)\b/)) return "Canada"
  return "Other"
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
    // TIM-1955: paused_from_tier intentionally omitted — column lands with
    // the TIM-1923 migration backlog; effectiveTierForRead treats it as
    // optional (paused users fall back to subscription_tier).
    .select(
      "subscription_status, subscription_tier, trial_ends_at, beta_waiver_until",
    )
    .eq("id", user.id)
    .single()

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 })
  }

  // TIM-1955: Coffee Shop World (cross-shop benchmarking) is a Pro feature.
  // Trialists are Pro per effectivePlanForGating (TIM-1902). Beta-waived
  // accounts bypass like every other gate. Starter clients render an upgrade
  // prompt against this 402 (TIM-1956).
  if (
    !isBetaWaived(profile.beta_waiver_until) &&
    effectivePlanForGating(profile) !== "pro"
  ) {
    return Response.json(
      { error: "Pro plan required", code: "pro_required" },
      { status: 402 },
    )
  }

  const planId = await getActivePlanId(supabase, user.id)
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

  // Verify the item belongs to this plan and check aggregate opt-in.
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", body.item_id)
    .eq("plan_id", planId)
    .maybeSingle()
  if (!menuItem) return Response.json({ error: "Menu item not found" }, { status: 404 })

  // TIM-1692: Check if this plan is opted in to aggregate capture.
  const { data: planRow } = await supabase
    .from("coffee_shop_plans")
    .select("aggregate_opt_in")
    .eq("id", planId)
    .maybeSingle()
  const aggregateOptIn = planRow?.aggregate_opt_in !== false

  const ctx = body.concept_context ?? {}
  const regionBucket = deriveRegionBucket(ctx.location)

  const currentCents = typeof body.current_price_cents === "number" && body.current_price_cents > 0
    ? body.current_price_cents
    : 0

  // TIM-1698: Check curated industry dataset before falling back to AI.
  const industryData = lookupIndustryBenchmark(itemName, regionBucket)
  if (industryData) {
    // Capture aggregate data even for industry-benchmarked items — this builds
    // the cross-user dataset for future platform_data percentiles.
    if (aggregateOptIn && currentCents > 0) {
      const serviceClient = createServiceClient()
      serviceClient
        .from("menu_price_aggregates")
        .insert({
          item_name_normalized: normalizeItemName(itemName),
          price_cents: currentCents,
          region_bucket: regionBucket,
        })
        .then(({ error }) => {
          if (error) console.warn("menu_price_aggregates insert failed:", error.message)
        })
    }

    const regionNote = regionBucket && regionBucket !== "Other"
      ? ` adjusted for the ${regionBucket} market`
      : ""
    const verdictText = currentCents > 0
      ? deriveVerdict(currentCents, industryData.low_cents, industryData.high_cents)
      : "unknown"
    const lowDollars = (industryData.low_cents / 100).toFixed(2)
    const highDollars = (industryData.high_cents / 100).toFixed(2)
    let commentary = `Industry data from ${industryData.source_label.replace("_", " ")} shows ${itemName} typically priced between $${lowDollars} and $${highDollars} at independent specialty cafés${regionNote}.`
    if (currentCents > 0) {
      const currentDollars = (currentCents / 100).toFixed(2)
      if (verdictText === "below") {
        commentary += ` At $${currentDollars}, your price is below the typical range — consider whether a modest increase would hurt volume or help margins.`
      } else if (verdictText === "above") {
        commentary += ` At $${currentDollars}, your price is above the typical range — make sure your quality, positioning, and shop experience justify the premium.`
      } else {
        commentary += ` At $${currentDollars}, you are in line with where most established shops land.`
      }
    }

    return Response.json({
      low_cents: industryData.low_cents,
      high_cents: industryData.high_cents,
      current_price_cents: currentCents,
      verdict: verdictText,
      commentary,
      source: "industry_benchmark" as const,
      source_label: industryData.source_label,
      source_note: industryData.source_note,
    })
  }

  // Fallback: no industry record for this item — use AI estimate.
  const conceptLines: string[] = []
  if (ctx.shop_identity) conceptLines.push(`Shop: ${ctx.shop_identity}`)
  if (ctx.location) conceptLines.push(`Location: ${ctx.location}`)
  if (ctx.target_customer) conceptLines.push(`Target customer: ${ctx.target_customer}`)
  if (ctx.vision) conceptLines.push(`Vision: ${ctx.vision}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "A specialty independent café."

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
      low_cents?: unknown
      high_cents?: unknown
      commentary?: unknown
    }

    const low = Math.max(0, Math.round(Number(parsed.low_cents)))
    const high = Math.max(low, Math.round(Number(parsed.high_cents)))
    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= 0) {
      return Response.json({ error: "AI returned no usable range" }, { status: 500 })
    }

    // TIM-1692: Capture anonymized price data for future cross-user percentiles.
    // Fire-and-forget; failure must not block the benchmark response.
    if (aggregateOptIn && currentCents > 0) {
      const serviceClient = createServiceClient()
      serviceClient
        .from("menu_price_aggregates")
        .insert({
          item_name_normalized: normalizeItemName(itemName),
          price_cents: currentCents,
          region_bucket: regionBucket,
        })
        .then(({ error }) => {
          if (error) console.warn("menu_price_aggregates insert failed:", error.message)
        })
    }

    return Response.json({
      low_cents: low,
      high_cents: high,
      current_price_cents: currentCents,
      verdict: deriveVerdict(currentCents, low, high),
      commentary: normalizeAIOutput(String(parsed.commentary ?? "")),
      // TIM-1698: "ai_estimated" only when the item is not in the industry dataset.
      source: "ai_estimated" as const,
    })
  } catch (err) {
    console.error("benchmark-price error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }
}
