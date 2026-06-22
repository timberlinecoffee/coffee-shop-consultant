// TIM-1471: AI benchmark — "Benchmark against cafés in my area."
// TIM-2922: Real local-cafe research with country/city awareness.
//
// Resolves the workspace's structured geo (plan_hiring_settings.hiring_country
// then signed/active location_candidate) via resolvePlanGeo. Registers the
// Anthropic web_search_20250305 tool with a country bias so the model searches
// independent specialty cafés in the SAME country as the cafe. Demands ≥3
// citations (name + URL + price) and bans industry-body figures (SCA, NCA,
// Square, BLS) from the primary local range — those move to a secondary,
// labelled "industry comparison" panel.
//
// Pre-TIM-2922 history: TIM-1692 menu_price_aggregates capture, TIM-1698
// curated industry dataset fallback, TIM-2361 model flip to Sonnet 4.6. The
// industry dataset still ships as a secondary reference; it never replaces
// the local-cafe primary range.
import { RESEARCH_AI_MODEL } from "@/lib/ai/models"
import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { createServiceClient } from "@/lib/supabase/service"
import { normalizeAIOutput } from "@/lib/normalize"
import { isSubscriptionActive, isBetaWaived, effectivePlanForGating } from "@/lib/access"
import { lookupIndustryBenchmark } from "@/lib/menu-pricing/industry-benchmarks"
import { resolvePlanGeo } from "@/lib/wages/resolve-plan-geo"
import { enforceRateLimit } from "@/lib/rate-limit"

const ROUTE_PATH = "/api/workspaces/menu-pricing/benchmark-price"

export const runtime = "nodejs"
export const maxDuration = 60

const anthropic = new Anthropic()

interface ConceptContext {
  shop_identity?: string
  location?: string
  target_customer?: string
  vision?: string
}

type Verdict = "below" | "in_band" | "above" | "unknown"

export interface BenchmarkCitation {
  name: string
  url: string
  price_cents: number
  city?: string | null
}

// TIM-2922: ISO-2 to country name + currency symbol. Used to phrase the
// prompt naturally and to render the citation panel without re-deriving.
const COUNTRY_LABELS: Record<string, { name: string; currency: string; currencySymbol: string }> = {
  US: { name: "the United States", currency: "USD", currencySymbol: "$" },
  CA: { name: "Canada", currency: "CAD", currencySymbol: "$" },
  GB: { name: "the United Kingdom", currency: "GBP", currencySymbol: "£" },
  AU: { name: "Australia", currency: "AUD", currencySymbol: "$" },
  NZ: { name: "New Zealand", currency: "NZD", currencySymbol: "$" },
  IE: { name: "Ireland", currency: "EUR", currencySymbol: "€" },
  DE: { name: "Germany", currency: "EUR", currencySymbol: "€" },
  FR: { name: "France", currency: "EUR", currencySymbol: "€" },
  NL: { name: "the Netherlands", currency: "EUR", currencySymbol: "€" },
  MX: { name: "Mexico", currency: "MXN", currencySymbol: "$" },
}

// TIM-1692: Normalize an item name for aggregate bucketing.
// Lossy by design — we want "Oat Milk Latte" and "oat milk latte" to group.
function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

// TIM-2922: Translate ISO-2 country to a coarse region bucket the curated
// industry dataset already knows about. Used only for the secondary
// industry-comparison panel — the primary range comes from real-cafe research.
function regionBucketFromCountry(country: string | null, city: string | null): string | null {
  if (!country) return null
  const c = country.toUpperCase()
  const cityLower = (city ?? "").toLowerCase()
  if (c === "CA") return "Canada"
  if (c === "GB" || c === "IE") return "UK"
  if (c === "AU" || c === "NZ") return "Australia"
  if (c === "US") {
    if (/(seattle|portland|tacoma|olympia)/.test(cityLower)) return "Pacific Northwest"
    if (/(san francisco|los angeles|san diego|oakland|berkeley|sacramento)/.test(cityLower)) return "California"
    if (/(new york|brooklyn|manhattan|queens|bronx|jersey city)/.test(cityLower)) return "New York Metro"
    if (/(chicago|milwaukee|minneapolis)/.test(cityLower)) return "Midwest"
    if (/(denver|boulder|salt lake)/.test(cityLower)) return "Mountain West"
    if (/(austin|dallas|houston|san antonio)/.test(cityLower)) return "Texas"
    if (/(miami|orlando|tampa|atlanta|charlotte|raleigh)/.test(cityLower)) return "Southeast"
    if (/(boston|cambridge|providence)/.test(cityLower)) return "New England"
    if (/(phoenix|tucson|las vegas)/.test(cityLower)) return "Southwest"
    return "Other"
  }
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

// TIM-2922: parse a price-like value from the model. The web_search call returns
// strings like "$4.50", "4,50 €", "4.50 CAD" — we just need cents.
function parsePriceToCents(raw: unknown, currencySymbol: string): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Model emitted cents directly OR a dollar value. Heuristic: < 100 = dollars.
    return raw < 100 ? Math.round(raw * 100) : Math.round(raw)
  }
  if (typeof raw !== "string") return 0
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(",", ".")
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num)) return 0
  void currencySymbol
  return Math.round(num * 100)
}

interface LocalRangeResult {
  low_cents: number
  high_cents: number
  citations: BenchmarkCitation[]
  commentary: string
  country_used: string | null
  city_used: string | null
  web_search_requests: number
  usage: Anthropic.Messages.Usage
  raw_text: string
}

// TIM-2922: Export the local-range computation so suggest-price can consult
// the same engine before emitting a recommendation.
export async function computeLocalCafeRange(args: {
  itemName: string
  currentCents: number
  country: string | null
  city: string | null
  ctx: ConceptContext
}): Promise<LocalRangeResult> {
  const { itemName, currentCents, country, city, ctx } = args
  const countryInfo = country ? COUNTRY_LABELS[country.toUpperCase()] : null
  const countryName = countryInfo?.name ?? "the cafe's country"
  const currency = countryInfo?.currency ?? "local currency"
  const currencySymbol = countryInfo?.currencySymbol ?? "$"

  const conceptLines: string[] = []
  if (ctx.shop_identity) conceptLines.push(`Shop: ${ctx.shop_identity}`)
  if (city) conceptLines.push(`City: ${city}`)
  if (country) conceptLines.push(`Country: ${countryName} (ISO ${country.toUpperCase()})`)
  if (ctx.location) conceptLines.push(`Owner-entered location detail: ${ctx.location}`)
  if (ctx.target_customer) conceptLines.push(`Target customer: ${ctx.target_customer}`)
  if (ctx.vision) conceptLines.push(`Vision: ${ctx.vision}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "A specialty independent café."

  const currentDollars = currentCents > 0
    ? `${currencySymbol}${(currentCents / 100).toFixed(2)}`
    : "no price set yet"

  const cityClause = city ? ` Prefer cafes in ${city} or nearby; widen to the rest of ${countryName} only if you cannot find three in-city.` : ""

  const prompt = `You are a coffee shop pricing consultant. The owner wants to know how their price for "${itemName}" compares to comparable cafés in their area. You MUST use the web_search tool to find real prices at real, named, independent specialty cafés in ${countryName} — do NOT answer from memory and do NOT use industry-body figures (SCA, NCA, Square, BLS) for the local range; those are not real cafes.

SHOP CONTEXT:
${conceptSummary}

ITEM:
- Name: ${itemName}
- Current price: ${currentDollars}

YOUR TASK:
1. Use web_search at least once to find current menu prices for "${itemName}" at independent specialty cafés in ${countryName}.${cityClause}
2. Collect at least THREE real cafés. Each must be a real business in ${countryName} with a verifiable URL (the cafe's own site, Google Maps menu, Square/Toast/Square Online public menu, or a recent local-press menu reference). Reject industry-body pages, retailers (Starbucks-owned, Tim Hortons-owned), franchises, and any cafe outside ${countryName}.
3. Compute the local range from those citations only. Low = the lowest cited price. High = the highest cited price. Use prices in ${currency}.
4. Compare the owner's current price (${currentDollars}) to that range and write one short paragraph of commentary.

Return ONLY a JSON object with these exact fields (no other text, no markdown, no code fences):
{
  "low_cents": <integer, low end of the local cafe range in ${currency} cents>,
  "high_cents": <integer, high end of the local cafe range in ${currency} cents>,
  "citations": [
    {"name": "<cafe name>", "url": "<verifiable URL>", "price_cents": <integer cents in ${currency}>, "city": "<city>"},
    ... at least 3 entries, all in ${countryName} ...
  ],
  "commentary": "<2-4 sentences. Reference the specific city and which cafes anchor the range. Say whether the current price reads low, fair, or premium. No em dashes, no jargon, no AI language.>"
}

If you genuinely cannot find three cafés in ${countryName}, return the JSON with the citations you DID find (minimum 1) and explain in the commentary that the data is thin. Never fall back to industry-body averages — that defeats the purpose of this benchmark.`

  const webSearchTool: Anthropic.WebSearchTool20250305 = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 5,
    // TIM-2922: country bias so search results lean toward the cafe's country.
    // Anthropic supports user_location with country (ISO-2) hints.
    ...(country
      ? { user_location: { type: "approximate", country: country.toUpperCase(), ...(city ? { city } : {}) } }
      : {}),
  }

  const message = await anthropic.messages.create({
    model: RESEARCH_AI_MODEL,
    max_tokens: 4096,
    tools: [webSearchTool],
    messages: [{ role: "user", content: prompt }],
  })

  // Collect ALL text blocks (web_search interleaves text/tool_use/result blocks).
  const rawText = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
  const webSearchRequests = message.usage.server_tool_use?.web_search_requests ?? 0

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error("No JSON in benchmark response")
  }
  const parsed = JSON.parse(jsonMatch[0]) as {
    low_cents?: unknown
    high_cents?: unknown
    citations?: unknown
    commentary?: unknown
  }

  const rawCitations: unknown[] = Array.isArray(parsed.citations) ? parsed.citations : []
  const citations: BenchmarkCitation[] = []
  for (const c of rawCitations) {
    if (!c || typeof c !== "object") continue
    const r = c as Record<string, unknown>
    const name = typeof r.name === "string" ? r.name.trim() : ""
    const url = typeof r.url === "string" ? r.url.trim() : ""
    const priceCents = parsePriceToCents(r.price_cents ?? r.price, currencySymbol)
    const cityVal = typeof r.city === "string" ? r.city.trim() : null
    if (!name || !url || priceCents <= 0) continue
    citations.push({ name, url, price_cents: priceCents, city: cityVal })
  }

  let low = Math.max(0, Math.round(Number(parsed.low_cents)))
  let high = Math.max(low, Math.round(Number(parsed.high_cents)))

  // If citations exist, recompute the range from them — never trust the
  // model to summarize its own citations correctly.
  if (citations.length > 0) {
    const prices = citations.map((c) => c.price_cents).sort((a, b) => a - b)
    low = prices[0]
    high = prices[prices.length - 1]
  }

  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= 0) {
    throw new Error("Benchmark returned no usable range")
  }

  return {
    low_cents: low,
    high_cents: high,
    citations,
    commentary: normalizeAIOutput(String(parsed.commentary ?? "")),
    country_used: country?.toUpperCase() ?? null,
    city_used: city,
    web_search_requests: webSearchRequests,
    usage: message.usage,
    raw_text: rawText,
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Rule 4: rate-limit a route that calls a paid API (Anthropic + web_search).
  const rateLimited = await enforceRateLimit({
    bucket: "menu-benchmark",
    id: user.id,
    limit: 10,
    windowSec: 60,
  })
  if (rateLimited) return rateLimited

  const { data: profile } = await supabase
    .from("users")
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

  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", body.item_id)
    .eq("plan_id", planId)
    .maybeSingle()
  if (!menuItem) return Response.json({ error: "Menu item not found" }, { status: 404 })

  const { data: planRow } = await supabase
    .from("coffee_shop_plans")
    .select("aggregate_opt_in")
    .eq("id", planId)
    .maybeSingle()
  const aggregateOptIn = planRow?.aggregate_opt_in !== false

  // TIM-2922: resolve structured geo (country/city) — NOT the free-text concept blob.
  const geo = await resolvePlanGeo(supabase, planId)
  const country = geo.countryCode
  const city = geo.city
  const ctx = body.concept_context ?? {}

  const currentCents = typeof body.current_price_cents === "number" && body.current_price_cents > 0
    ? body.current_price_cents
    : 0

  // TIM-1698 retained: the curated industry dataset (NCA/SCA/Square/BLS) is
  // computed and returned as a SECONDARY panel labelled "industry comparison".
  // It never replaces the primary local-cafe range. Surfaces only when we have
  // a curated row for this item AND a country match.
  const regionBucket = regionBucketFromCountry(country, city)
  const industryData = lookupIndustryBenchmark(itemName, regionBucket)

  // Aggregate capture is unchanged from TIM-1692. Fires for both paths.
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

  try {
    const local = await computeLocalCafeRange({
      itemName,
      currentCents,
      country,
      city,
      ctx,
    })

    const telemetryClient = createServiceClient()
    await recordTurnMetric(
      {
        async insert(row) {
          return telemetryClient.from("ai_turn_metrics").insert(row)
        },
      },
      {
        route: ROUTE_PATH,
        model: RESEARCH_AI_MODEL,
        usage: local.usage,
        webSearchRequests: local.web_search_requests,
        toolCalls: 0,
        userId: user.id,
        planTier: resolvePlanTier(profile),
      },
    )

    const verdict = deriveVerdict(currentCents, local.low_cents, local.high_cents)

    return Response.json({
      // Primary local-cafe range — derived from real cited cafes in the same country.
      low_cents: local.low_cents,
      high_cents: local.high_cents,
      current_price_cents: currentCents,
      verdict,
      commentary: local.commentary,
      source: "local_cafes" as const,
      citations: local.citations,
      country_used: local.country_used,
      city_used: local.city_used,
      // Secondary industry comparison (labelled, optional). UI renders this as
      // a small "for reference" panel below the primary range — never as the
      // headline number.
      industry_comparison: industryData
        ? {
            low_cents: industryData.low_cents,
            high_cents: industryData.high_cents,
            source_label: industryData.source_label,
            source_note: industryData.source_note,
          }
        : null,
    })
  } catch (err) {
    console.error("benchmark-price error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }
}
