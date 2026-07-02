// TIM-1471: AI benchmark — "Benchmark against cafés in my area."
// TIM-2922: Real local-cafe research with country/city awareness.
//
// Resolves the workspace's structured geo (plan_hiring_settings.hiring_country
// then signed/active location_candidate) via resolvePlanGeo. The actual
// web-search-backed range computation lives in `src/lib/menu-pricing/
// local-cafe-range.ts` so the engine can be reused from /suggest-price
// without a cross-route import.
//
// Pre-TIM-2922 history: TIM-1692 menu_price_aggregates capture, TIM-1698
// curated industry dataset fallback, TIM-2361 model flip to Sonnet 4.6. The
// industry dataset still ships as a SECONDARY reference panel; it never
// replaces the local-cafe primary range.
//
// TIM-3496: routed through `runScoutTurn` under lane `menu_benchmark_price`
// (REQUIRES_RESEARCH_MODEL_LANES pins Sonnet 4.6, BLOCK_CROSS_PROVIDER_FAILOVER_LANES
// blocks DeepSeek failover). `recordTurnMetric` populates
// provider/lane/latencyMs/fallbackUsed via `toTurnMetricArgs(envelope, lane)`.
import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics"
import { toTurnMetricArgs } from "@/lib/ai/scout-adapter"
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { createServiceClient } from "@/lib/supabase/service"
import { isSubscriptionActive, isBetaWaived, effectivePlanForGating } from "@/lib/access"
import { lookupIndustryBenchmark } from "@/lib/menu-pricing/industry-benchmarks"
import { resolvePlanGeo } from "@/lib/wages/resolve-plan-geo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { computeLocalCafeRange } from "@/lib/menu-pricing/local-cafe-range"

const ROUTE_PATH = "/api/workspaces/menu-pricing/benchmark-price"

export const runtime = "nodejs"
// TIM-2922: bumped from 30s. web_search up to 5 calls + Sonnet output can
// easily exceed 30s; 120s leaves margin without flirting with the Vercel
// Pro 300s ceiling.
export const maxDuration = 120

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

// TIM-2922: Translate ISO-2 country to the coarse region bucket the curated
// industry dataset knows about. Used only for the secondary
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
  // It never replaces the primary local-cafe range.
  const regionBucket = regionBucketFromCountry(country, city)
  const industryData = lookupIndustryBenchmark(itemName, regionBucket)

  // Aggregate capture is unchanged from TIM-1692.
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
      userId: user.id,
      routeTag: ROUTE_PATH,
    })

    const telemetryClient = createServiceClient()
    // TIM-3496: provider/lane/latencyMs/fallbackUsed populated from envelope —
    // toTurnMetricArgs already maps NormalizedUsage back to the Anthropic-shape
    // field names buildTurnMetricRecord expects. Usage and webSearchRequests
    // are SUMMED across the initial + retry calls inside computeLocalCafeRange,
    // so one row captures the full turn.
    const metricArgs = toTurnMetricArgs(local.envelope, "menu_benchmark_price")
    await recordTurnMetric(
      {
        async insert(row) {
          return telemetryClient.from("ai_turn_metrics").insert(row)
        },
      },
      {
        route: ROUTE_PATH,
        ...metricArgs,
        userId: user.id,
        planTier: resolvePlanTier(profile),
      },
    )

    const industryPanel = industryData
      ? {
          low_cents: industryData.low_cents,
          high_cents: industryData.high_cents,
          source_label: industryData.source_label,
          source_note: industryData.source_note,
          currency: "USD" as const,
        }
      : null

    // TIM-2922 (hardening): local research can come back empty when the
    // model refuses (country/city mismatch, no usable JSON, etc.). Don't
    // 500 — surface a 200 with source=local_cafes_unavailable so the UI
    // can render the industry panel as a temporary fallback with an
    // explicit "couldn't pull live cafes" note.
    if (local.citations.length === 0) {
      const fallbackLow = industryData?.low_cents ?? 0
      const fallbackHigh = industryData?.high_cents ?? 0
      return Response.json({
        low_cents: fallbackLow,
        high_cents: fallbackHigh,
        current_price_cents: currentCents,
        verdict: deriveVerdict(currentCents, fallbackLow, fallbackHigh),
        commentary: local.commentary || "Could not pull live cafe prices for this market right now. Industry reference data is shown below as a temporary backstop.",
        source: "local_cafes_unavailable" as const,
        citations: [],
        country_used: local.country_used,
        city_used: local.city_used,
        industry_comparison: industryPanel,
      })
    }

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
      // Secondary industry comparison (labelled, optional). UI renders this
      // as a small "for reference" subline — never as the headline.
      industry_comparison: industryPanel,
    })
  } catch (err) {
    console.error("benchmark-price error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }
}
