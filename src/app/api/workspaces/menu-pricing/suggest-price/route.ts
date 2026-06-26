// TIM-967: AI suggested retail price for menu items.
// TIM-1020: Concept-aware pricing — location, positioning, regional benchmarks, margin floor, range output.
// TIM-2922: Consults the live local-cafe benchmark engine (computeLocalCafeRange)
// before recommending; anchors the suggestion inside the local cafe band or
// surfaces disagreement_reason. Same Pro gating + ownership check + rate
// limit as /benchmark-price — both routes trigger the same paid Sonnet +
// web_search round-trip and must be guarded identically.
import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { normalizeAIOutput } from "@/lib/normalize"
import { isSubscriptionActive, isBetaWaived, effectivePlanForGating } from "@/lib/access"
import { resolvePlanGeo } from "@/lib/wages/resolve-plan-geo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { computeLocalCafeRange, type BenchmarkCitation } from "@/lib/menu-pricing/local-cafe-range"
import { resolveCogsFraction, computeMarginFloorCents } from "@/lib/menu-pricing/cogs-target"

export const runtime = "nodejs"
// TIM-2922: bumped from 30s. We now run web_search Sonnet + a Haiku
// suggestion call sequentially. 120s leaves margin (Vercel Pro allows 300s).
export const maxDuration = 120

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
    bucket: "menu-suggest-price",
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

  // TIM-2922: match /benchmark-price — both routes call the same paid
  // web_search engine, so both must be Pro-gated. Without this, Starter
  // subscribers can drive web_search billing through suggest-price.
  if (
    !isBetaWaived(profile.beta_waiver_until) &&
    effectivePlanForGating(profile) !== "pro"
  ) {
    return Response.json(
      { error: "Pro plan required", code: "pro_required" },
      { status: 402 },
    )
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

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const itemName = body.item_name?.trim()
  if (!itemName) {
    return Response.json({ error: "Missing required field: item_name" }, { status: 400 })
  }

  // TIM-2922: ownership check — confirm the named item exists on this plan
  // before doing any paid AI work. Mirror /benchmark-price (which uses item_id).
  // suggest-price's contract pre-dated item_id, so we look up by name; for
  // accounts with two items of the same name we accept the first since the
  // suggestion is shape-agnostic to which row served it.
  // TIM-3245: also fetch the category COGS range for the midpoint floor calculation.
  const { data: ownedItem } = await supabase
    .from("menu_items")
    .select("id, menu_categories!category_id(target_cogs_low_pct, target_cogs_high_pct)")
    .eq("plan_id", planId)
    .ilike("name", itemName)
    .limit(1)
    .maybeSingle()
  if (!ownedItem) {
    return Response.json({ error: "Menu item not found in active plan" }, { status: 404 })
  }

  // TIM-3245: resolve COGS target from the item's category range midpoint.
  // Falls back to 25% (75% gross margin) when the category has no range set.
  const catCogs = ownedItem.menu_categories as unknown as
    | { target_cogs_low_pct: number | null; target_cogs_high_pct: number | null }
    | null
  const cogsTargetFraction = resolveCogsFraction(
    catCogs?.target_cogs_low_pct,
    catCogs?.target_cogs_high_pct,
  )

  // TIM-2922: structured country/city for the local range.
  const geo = await resolvePlanGeo(supabase, planId)

  const cogsDollars = (body.cogs_cents / 100).toFixed(2)
  const ctx = body.concept_context ?? {}

  // Margin floor: price = COGS / cogsTargetFraction. Uses per-category midpoint
  // (TIM-3245) with 25% fallback (= 75% gross margin, pre-TIM-3245 behaviour).
  const marginFloorCents = computeMarginFloorCents(body.cogs_cents, cogsTargetFraction)
  const marginFloorDollars = (marginFloorCents / 100).toFixed(2)
  const grossMarginFloorPct = Math.round((1 - cogsTargetFraction) * 1000) / 10

  // TIM-2922: Pull the live local cafe range. Same engine as /benchmark-price.
  // TIM-2922 (hardening): computeLocalCafeRange now returns empty-citations
  // rather than throwing on thin LLM output, so localUnavailable is set
  // either when the engine throws (network, infra) OR when the returned
  // citation list is empty.
  let localLow = 0
  let localHigh = 0
  let localCitations: BenchmarkCitation[] = []
  let localUnavailable: string | null = null
  try {
    const local = await computeLocalCafeRange({
      itemName,
      currentCents: 0,
      country: geo.countryCode,
      city: geo.city,
      ctx,
    })
    if (local.citations.length === 0) {
      localUnavailable = "Could not pull live local cafe prices"
    } else {
      localLow = local.low_cents
      localHigh = local.high_cents
      localCitations = local.citations
    }
  } catch (err) {
    localUnavailable = err instanceof Error ? err.message : "Local research unavailable"
    console.warn("suggest-price: local range fetch failed:", localUnavailable)
  }

  const conceptLines: string[] = []
  if (ctx.shop_identity) conceptLines.push(`Shop: ${ctx.shop_identity}`)
  if (geo.city) conceptLines.push(`City: ${geo.city}`)
  if (geo.countryCode) conceptLines.push(`Country: ${geo.countryCode}`)
  if (ctx.location) conceptLines.push(`Owner-entered location detail: ${ctx.location}`)
  if (ctx.target_customer) conceptLines.push(`Target customer: ${ctx.target_customer}`)
  if (ctx.vision) conceptLines.push(`Vision: ${ctx.vision}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "No concept details provided — assume a specialty independent café."

  const localBlock = localLow > 0 && localHigh > 0
    ? `LOCAL CAFE BAND (live web research; THIS IS YOUR HARD CONSTRAINT):
Real cafes in ${geo.city ?? geo.countryCode ?? "the local market"} charge between $${(localLow / 100).toFixed(2)} and $${(localHigh / 100).toFixed(2)} for ${itemName}.
Citations (${localCitations.length}): ${localCitations.slice(0, 5).map((c) => `${c.name} ($${(c.price_cents / 100).toFixed(2)})`).join(", ")}.

Your suggested_price_cents MUST fall inside [$${(localLow / 100).toFixed(2)}, $${(localHigh / 100).toFixed(2)}] — that is the real local market.
If — and ONLY if — the margin floor of $${marginFloorDollars} pushes you above $${(localHigh / 100).toFixed(2)}, OR you have a defensible positioning argument for going outside the band, set disagreement_reason to a one-sentence explanation. Otherwise leave disagreement_reason as null.`
    : `LOCAL CAFE BAND: Could not pull live local data (${localUnavailable ?? "no signal"}). Use your judgment but anchor on the margin floor and ${geo.countryCode ?? "the cafe's"} market norms. Set disagreement_reason to "Local research unavailable" so the UI can flag it.`

  const prompt = `You are a coffee shop pricing consultant. You think like an independent shop owner, not a management consultant. Be direct, specific, and practical.

SHOP CONTEXT:
${conceptSummary}

ITEM BEING PRICED:
- Name: ${itemName}
- COGS: $${cogsDollars}

${localBlock}

MARGIN FLOOR:
A ${grossMarginFloorPct}% gross margin floor (based on this item's category target) puts the minimum retail price at $${marginFloorDollars} for this COGS. Do not suggest below this floor.

YOUR TASK:
Suggest a retail price range for ${itemName}. The midpoint of your range is your recommendation. It MUST sit inside the local cafe band above (unless the margin floor forces it higher, or you set disagreement_reason).

Return a JSON object with these exact fields:
- suggested_price_cents: integer, your recommended retail price in cents
- low_cents: integer, the low end of what makes sense for this shop and market
- high_cents: integer, the high end of what this shop could charge without pushing customers away
- margin_pct: number, the gross margin at suggested_price_cents as a decimal (e.g. 0.80 for 80%)
- commentary: string, 2–3 sentences. Reference the specific city and the cited cafes that anchor your range. Name a real number. No jargon. No em dashes.
- disagreement_reason: string OR null. NULL when your suggestion is inside the local cafe band. Otherwise one short sentence explaining why you went outside the band.

Rules: no emojis, no AI language, the suggestion must be at or above $${marginFloorDollars} (${grossMarginFloorPct}% gross margin floor for this category), be specific about the market and city.

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
      disagreement_reason?: string | null
    }

    // Enforce margin floor — never return below it.
    let suggestedCents = Math.max(Number(parsed.suggested_price_cents), marginFloorCents)
    // TIM-2922 (review fix): normalise an inverted (low > high) range from the
    // model BEFORE clamping. Previously the floor-then-max chain turned a
    // {low:600,high:300} response into {600,600} (zero-width at the low end);
    // now we sort the pair first so the displayed range is always coherent.
    let parsedLow = Number(parsed.low_cents)
    let parsedHigh = Number(parsed.high_cents)
    if (Number.isFinite(parsedLow) && Number.isFinite(parsedHigh) && parsedLow > parsedHigh) {
      const swap = parsedLow
      parsedLow = parsedHigh
      parsedHigh = swap
    }
    let lowCents = Math.max(parsedLow, marginFloorCents)
    let highCents = Math.max(parsedHigh, lowCents)
    let disagreementReason: string | null =
      typeof parsed.disagreement_reason === "string" && parsed.disagreement_reason.trim().length > 0
        ? normalizeAIOutput(parsed.disagreement_reason.trim())
        : null

    // TIM-2922: hard-enforce reconciliation with the local cafe band.
    // If the model recommended outside [localLow, localHigh] without setting
    // a disagreement_reason, clamp into the band. If margin floor is above
    // the local high, surface that as a defensible disagreement_reason.
    if (localLow > 0 && localHigh > 0) {
      const insideBand = suggestedCents >= localLow && suggestedCents <= localHigh
      if (!insideBand) {
        if (marginFloorCents > localHigh) {
          if (!disagreementReason) {
            disagreementReason = `Margin floor ($${marginFloorDollars}) exceeds the local cafe high of $${(localHigh / 100).toFixed(2)}. Suggestion sits at the floor.`
          }
        } else if (!disagreementReason) {
          suggestedCents = Math.max(localLow, Math.min(localHigh, suggestedCents))
          lowCents = Math.max(marginFloorCents, localLow)
          highCents = Math.max(lowCents, localHigh)
        }
      }
    }
    // TIM-2922 (hardening): when the local band IS unavailable, set
    // disagreement_reason explicitly so the UI surfaces "couldn't check
    // local cafes" instead of silently presenting the suggestion as
    // reconciled. Distinct from the local_range_unavailable top-level flag —
    // disagreement_reason captures "the suggestion is not anchored to live
    // local data", which is exactly the board's complaint to fix.
    const localRangeChecked = localLow > 0 && localHigh > 0
    if (!localRangeChecked && !disagreementReason) {
      disagreementReason = `Could not pull live local cafe prices; suggestion is not anchored to a local range. (${localUnavailable ?? "no signal"})`
    }

    const marginAtSuggested = body.cogs_cents > 0
      ? (suggestedCents - body.cogs_cents) / suggestedCents
      : Number(parsed.margin_pct)

    return Response.json({
      suggested_price_cents: suggestedCents,
      low_cents: lowCents,
      high_cents: highCents,
      margin_pct: marginAtSuggested,
      commentary: normalizeAIOutput(String(parsed.commentary ?? "")),
      // TIM-2922 new fields
      disagreement_reason: disagreementReason,
      local_range: localRangeChecked
        ? { low_cents: localLow, high_cents: localHigh, citations: localCitations }
        : null,
      local_range_unavailable: localRangeChecked ? null : (localUnavailable ?? "no signal"),
      country_used: geo.countryCode,
      city_used: geo.city,
    })
  } catch (err) {
    console.error("suggest-price error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }
}
