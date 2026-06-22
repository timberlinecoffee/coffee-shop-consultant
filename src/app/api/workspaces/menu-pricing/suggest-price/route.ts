// TIM-967: AI suggested retail price for menu items.
// TIM-1020: Concept-aware pricing — location, positioning, regional benchmarks, margin floor, range output.
// TIM-2922: Consult the live local-cafe benchmark engine before recommending.
//   The previous version maintained its own hardcoded REGIONAL_BENCHMARKS table
//   and a `detectRegion()` that defaulted to `us-other` for any unrecognised
//   string — so a Calgary cafe got US prices and a $5 espresso suggestion
//   while the local CAD range was $3–$4. Now: resolve structured country/city
//   via resolvePlanGeo, call computeLocalCafeRange (web-search backed) to get
//   real cited cafe prices in the same country, then anchor the suggestion
//   inside that range (or surface `disagreement_reason` if the model insists).
import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { normalizeAIOutput } from "@/lib/normalize"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { resolvePlanGeo } from "@/lib/wages/resolve-plan-geo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { computeLocalCafeRange, type BenchmarkCitation } from "../benchmark-price/route"

export const runtime = "nodejs"
export const maxDuration = 60

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

  const planId = await getActivePlanId(supabase, user.id)
  // TIM-2922: structured country/city for the local range.
  const geo = planId ? await resolvePlanGeo(supabase, planId) : { city: null, countryCode: null }

  const cogsDollars = (body.cogs_cents / 100).toFixed(2)
  const ctx = body.concept_context ?? {}
  const itemName = body.item_name?.trim() || "this item"

  // Margin floor: coffee shops target 75–85% gross margin.
  const marginFloorCents = Math.ceil(body.cogs_cents / 0.25)
  const marginFloorDollars = (marginFloorCents / 100).toFixed(2)

  // TIM-2922: Pull the live local cafe range. This is the same engine
  // /benchmark-price uses, so suggestion ↔ benchmark will agree.
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
    localLow = local.low_cents
    localHigh = local.high_cents
    localCitations = local.citations
  } catch (err) {
    // If the local research fails (web_search unavailable, model refused, etc.)
    // we still want to suggest a price — just flag in the response so the UI
    // can surface that the band wasn't checked.
    localUnavailable = err instanceof Error ? err.message : "Local research unavailable"
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
A 75% gross margin floor puts the minimum retail price at $${marginFloorDollars} for this COGS. Do not suggest below this floor. Most quality independent shops target 78–82%.

YOUR TASK:
Suggest a retail price range for ${itemName}. The midpoint of your range is your recommendation. It MUST sit inside the local cafe band above (unless the margin floor forces it higher, or you set disagreement_reason).

Return a JSON object with these exact fields:
- suggested_price_cents: integer, your recommended retail price in cents
- low_cents: integer, the low end of what makes sense for this shop and market
- high_cents: integer, the high end of what this shop could charge without pushing customers away
- margin_pct: number, the gross margin at suggested_price_cents as a decimal (e.g. 0.80 for 80%)
- commentary: string, 2–3 sentences. Reference the specific city and the cited cafes that anchor your range. Name a real number. No jargon. No em dashes.
- disagreement_reason: string OR null. NULL when your suggestion is inside the local cafe band. Otherwise one short sentence explaining why you went outside the band.

Rules: no emojis, no AI language, the suggestion must be above $${marginFloorDollars}, be specific about the market and city.

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

    // Enforce margin floor — never return below it
    let suggestedCents = Math.max(Number(parsed.suggested_price_cents), marginFloorCents)
    let lowCents = Math.max(Number(parsed.low_cents), marginFloorCents)
    let highCents = Math.max(Number(parsed.high_cents), lowCents)
    let disagreementReason: string | null =
      typeof parsed.disagreement_reason === "string" && parsed.disagreement_reason.trim().length > 0
        ? normalizeAIOutput(parsed.disagreement_reason.trim())
        : null

    // TIM-2922: Hard-enforce reconciliation with the local cafe band.
    // If the model recommended outside [localLow, localHigh] without setting
    // a disagreement_reason, clamp into the band. If margin floor is above
    // the local high, that itself is a defensible disagreement_reason.
    if (localLow > 0 && localHigh > 0) {
      const insideBand = suggestedCents >= localLow && suggestedCents <= localHigh
      if (!insideBand) {
        if (marginFloorCents > localHigh) {
          // COGS forces above the local band — surface as a disagreement.
          if (!disagreementReason) {
            disagreementReason = `Margin floor ($${marginFloorDollars}) exceeds the local cafe high of $${(localHigh / 100).toFixed(2)}. Suggestion sits at the floor.`
          }
        } else if (!disagreementReason) {
          // No defensible reason — clamp to the band so suggestion + benchmark agree.
          suggestedCents = Math.max(localLow, Math.min(localHigh, suggestedCents))
          // Re-derive low/high around the local band so the displayed range
          // reflects reality, not the model's free-text guess.
          lowCents = Math.max(marginFloorCents, localLow)
          highCents = Math.max(lowCents, localHigh)
        }
        // If the model DID set a disagreement reason, trust it and leave the price.
      }
    } else if (!disagreementReason) {
      disagreementReason = "Local cafe band unavailable; suggestion based on margin and concept only."
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
      local_range: localLow > 0 && localHigh > 0
        ? { low_cents: localLow, high_cents: localHigh, citations: localCitations }
        : null,
      country_used: geo.countryCode,
      city_used: geo.city,
    })
  } catch (err) {
    console.error("suggest-price error:", err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }
}
