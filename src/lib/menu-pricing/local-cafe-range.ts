// TIM-2922: Shared local-cafe-range engine. Extracted from the
// /benchmark-price route so /suggest-price (and any future caller) can
// reuse the same web-search-backed research without cross-route imports.
//
// Returns a price range derived from real cited cafes in the requested
// country. Industry-body figures (SCA/NCA/Square/BLS) are explicitly banned
// from the prompt — those live in a separate curated-dataset lookup that
// remains a labelled "for reference" panel in the route response.
//
// TIM-3496: routed through `runScoutTurn` on the `menu_benchmark_price` lane.
// The lane lives in REQUIRES_RESEARCH_MODEL_LANES and in
// BLOCK_CROSS_PROVIDER_FAILOVER_LANES so the router pins to Anthropic Sonnet 4.6
// and the adapter never attempts a DeepSeek failover (web_search hosted tool is
// Anthropic-only). Both calls (initial + retry) emit their own envelope; the
// returned envelope is the LAST call's envelope with usage/webSearchRequests
// summed across both so a single `recordTurnMetric` row captures the full turn.
import { normalizeAIOutput } from "@/lib/normalize"
import { runScoutTurn, type ScoutTurnOutput } from "@/lib/ai/scout-adapter"
import type { NormalizedUsage, ScoutServerToolDefinition } from "@/lib/ai/scout-adapter"

export interface BenchmarkCitation {
  name: string
  url: string
  price_cents: number
  city?: string | null
}

export interface LocalRangeResult {
  low_cents: number
  high_cents: number
  citations: BenchmarkCitation[]
  commentary: string
  country_used: string | null
  city_used: string | null
  web_search_requests: number
  // TIM-3496: route caller passes this through `toTurnMetricArgs(envelope, lane)`
  // to populate ai_turn_metrics provider/lane/latencyMs/fallbackUsed. Usage and
  // webSearchRequests are SUMMED across the (up to two) underlying Scout calls
  // — single recordTurnMetric row, full turn cost captured.
  envelope: ScoutTurnOutput
  raw_text: string
  dropped_out_of_country: number
}

interface ConceptContext {
  shop_identity?: string
  location?: string
  target_customer?: string
  vision?: string
}

interface CountryInfo {
  name: string
  currency: string
  currencySymbol: string
  // City tokens that strongly indicate a cafe is in THIS country. Used to
  // verify citations the model returns belong where it claims.
  cityTokens: string[]
}

// TIM-2922: ISO-2 to display name + currency + city allow-list. The city
// allow-list is intentionally permissive (top cities + their common
// alternate spellings) — false positives are fine; false negatives drop
// legitimate citations.
const COUNTRY_LABELS: Record<string, CountryInfo> = {
  US: {
    name: "the United States",
    currency: "USD",
    currencySymbol: "$",
    cityTokens: [
      "seattle", "portland", "san francisco", "san jose", "oakland",
      "los angeles", "san diego", "sacramento", "new york", "brooklyn",
      "manhattan", "queens", "bronx", "boston", "cambridge", "providence",
      "philadelphia", "washington", "miami", "orlando", "tampa", "atlanta",
      "charlotte", "raleigh", "nashville", "chicago", "milwaukee",
      "minneapolis", "detroit", "cleveland", "denver", "boulder",
      "salt lake", "austin", "dallas", "houston", "san antonio", "phoenix",
      "tucson", "las vegas", "honolulu",
    ],
  },
  CA: {
    name: "Canada",
    currency: "CAD",
    currencySymbol: "$",
    cityTokens: [
      "calgary", "toronto", "vancouver", "montreal", "ottawa", "edmonton",
      "winnipeg", "halifax", "quebec", "regina", "saskatoon", "victoria",
      "hamilton", "kitchener", "london, on", "kelowna", "burnaby",
      "mississauga", "brampton", "richmond hill",
    ],
  },
  GB: {
    name: "the United Kingdom",
    currency: "GBP",
    currencySymbol: "£",
    cityTokens: [
      "london", "manchester", "birmingham", "leeds", "liverpool", "bristol",
      "newcastle", "sheffield", "nottingham", "edinburgh", "glasgow",
      "cardiff", "belfast", "brighton", "oxford", "cambridge, uk",
    ],
  },
  AU: {
    name: "Australia",
    currency: "AUD",
    currencySymbol: "$",
    cityTokens: [
      "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra",
      "gold coast", "newcastle, au", "hobart", "darwin",
    ],
  },
  NZ: {
    name: "New Zealand",
    currency: "NZD",
    currencySymbol: "$",
    cityTokens: ["auckland", "wellington", "christchurch", "dunedin", "hamilton, nz"],
  },
  IE: {
    name: "Ireland",
    currency: "EUR",
    currencySymbol: "€",
    cityTokens: ["dublin", "cork", "galway", "limerick"],
  },
  DE: {
    name: "Germany",
    currency: "EUR",
    currencySymbol: "€",
    cityTokens: ["berlin", "munich", "hamburg", "frankfurt", "cologne", "stuttgart"],
  },
  FR: {
    name: "France",
    currency: "EUR",
    currencySymbol: "€",
    cityTokens: ["paris", "lyon", "marseille", "toulouse", "nice", "bordeaux"],
  },
  NL: {
    name: "the Netherlands",
    currency: "EUR",
    currencySymbol: "€",
    cityTokens: ["amsterdam", "rotterdam", "the hague", "utrecht"],
  },
  MX: {
    name: "Mexico",
    currency: "MXN",
    currencySymbol: "$",
    cityTokens: ["mexico city", "guadalajara", "monterrey", "puebla"],
  },
}

export function countryDisplayName(code: string | null | undefined): string {
  if (!code) return ""
  return COUNTRY_LABELS[code.toUpperCase()]?.name ?? code.toUpperCase()
}

// TIM-2922: Parse a price-like value the model emitted. Two competing
// conventions in practice: the prompt asks for INTEGER CENTS, but models
// often emit a dollar decimal like 4.5 anyway. Heuristic:
//   - Floating point ⇒ dollars (4.5 → 450 cents)
//   - Integer < 100 ⇒ dollars (e.g. 4 → 400 cents)
//   - Integer ≥ 100 ⇒ cents (e.g. 450 → 450 cents)
// The edge case of a sub-dollar drip coffee priced "99" is the only real
// loser; we accept that to keep the common case (model emits 4.50 or 450).
function parsePriceToCents(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (!Number.isInteger(raw)) return Math.round(raw * 100)
    return raw < 100 ? Math.round(raw * 100) : Math.round(raw)
  }
  if (typeof raw !== "string") return 0
  const trimmed = raw.trim()
  const hasDot = trimmed.includes(".") || trimmed.includes(",")
  const cleaned = trimmed.replace(/[^\d.,]/g, "").replace(",", ".")
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num)) return 0
  if (hasDot) return Math.round(num * 100)
  return num < 100 ? Math.round(num * 100) : Math.round(num)
}

// TIM-2922: Drop citations whose city token belongs to a country OTHER than
// the one we asked for. Catches the common failure where the model leaks a
// US cafe into a CA-instructed search and pollutes the recomputed band.
function citationLooksOutOfCountry(
  citation: BenchmarkCitation,
  requestedCountry: string | null,
): boolean {
  if (!requestedCountry) return false
  const wanted = requestedCountry.toUpperCase()
  const cityLower = (citation.city ?? "").toLowerCase()
  const urlLower = (citation.url ?? "").toLowerCase()
  for (const [code, info] of Object.entries(COUNTRY_LABELS)) {
    if (code === wanted) continue
    for (const token of info.cityTokens) {
      if (cityLower.includes(token)) return true
    }
  }
  // URL TLD check: a .ca cafe is almost certainly CA; a .co.uk cafe is GB.
  // These are positive signals against the wanted country only when they
  // disagree.
  if (wanted !== "CA" && /\.ca(\/|$|\?)/.test(urlLower)) return true
  if (wanted !== "GB" && /\.co\.uk(\/|$|\?)/.test(urlLower)) return true
  if (wanted !== "AU" && /\.com\.au(\/|$|\?)/.test(urlLower)) return true
  if (wanted !== "NZ" && /\.co\.nz(\/|$|\?)/.test(urlLower)) return true
  return false
}

// TIM-2922 (hardening): a city only "belongs" to a country if its tokens
// appear in that country's allow-list. When the founder forces a country
// override (e.g. CA→US for a hypothetical scenario) but the signed city is
// still Calgary, the prompt "Calgary, in the United States" is incoherent and
// the model often refuses. Drop the city when it doesn't match the country.
function cityMatchesCountry(city: string | null, country: string | null): boolean {
  if (!city || !country) return false
  const info = COUNTRY_LABELS[country.toUpperCase()]
  if (!info) return false
  const cityLower = city.toLowerCase()
  return info.cityTokens.some((t) => cityLower.includes(t))
}

interface ParsedRange {
  citations: BenchmarkCitation[]
  droppedOutOfCountry: number
  commentary: string
  rawText: string
  envelope: ScoutTurnOutput
}

// TIM-2922 (hardening): runs ONE Anthropic call and parses citations. Returns
// an empty-citations shape on parse failure / refusal rather than throwing,
// so the caller can decide whether to retry or surface a degraded result.
// TIM-3496: now goes through runScoutTurn under lane `menu_benchmark_price`.
// Lane is in REQUIRES_RESEARCH_MODEL_LANES + BLOCK_CROSS_PROVIDER_FAILOVER_LANES
// so the router pins Sonnet 4.6 and no DeepSeek failover is attempted (server
// tool is Anthropic-only). The web_search request count surfaces via the
// adapter's normalized usage (read from message.usage.server_tool_use).
async function runOneSearch(
  prompt: string,
  webSearchTool: ScoutServerToolDefinition,
  country: string | null,
  userId: string | null,
  routeTag: string,
): Promise<ParsedRange> {
  const envelope = await runScoutTurn({
    lane: "menu_benchmark_price",
    systemBlocks: [],
    messages: [{ role: "user", content: prompt }],
    tools: [webSearchTool],
    maxTokens: 4096,
    userId,
    routeTag,
  })

  const rawText = envelope.text

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { citations: [], droppedOutOfCountry: 0, commentary: "", rawText, envelope }
  }
  let parsed: { citations?: unknown; commentary?: unknown } = {}
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return { citations: [], droppedOutOfCountry: 0, commentary: "", rawText, envelope }
  }
  const rawCitations: unknown[] = Array.isArray(parsed.citations) ? parsed.citations : []
  const allCitations: BenchmarkCitation[] = []
  for (const c of rawCitations) {
    if (!c || typeof c !== "object") continue
    const r = c as Record<string, unknown>
    const name = typeof r.name === "string" ? r.name.trim() : ""
    const url = typeof r.url === "string" ? r.url.trim() : ""
    const priceCents = parsePriceToCents(r.price_cents ?? r.price)
    const cityVal = typeof r.city === "string" ? r.city.trim() : null
    if (!name || !url || priceCents <= 0) continue
    allCitations.push({ name, url, price_cents: priceCents, city: cityVal })
  }
  const filtered = allCitations.filter((c) => !citationLooksOutOfCountry(c, country))
  return {
    citations: filtered,
    droppedOutOfCountry: allCitations.length - filtered.length,
    commentary: typeof parsed.commentary === "string" ? parsed.commentary : "",
    rawText,
    envelope,
  }
}

// TIM-3496: fold a follow-up Scout envelope into the running total so the
// route's recordTurnMetric row reflects the full turn cost (initial + retry).
// LatencyMs sums; fallbackUsed is OR'd; provider/modelId/routeReason are taken
// from the LAST envelope (they're constant within a single lane in practice but
// the LAST snapshot is what callers should reason about).
function mergeEnvelopes(
  a: ScoutTurnOutput,
  b: ScoutTurnOutput,
): ScoutTurnOutput {
  const usage: NormalizedUsage = {
    inputTokensUncached: a.usage.inputTokensUncached + b.usage.inputTokensUncached,
    inputTokensCachedRead: a.usage.inputTokensCachedRead + b.usage.inputTokensCachedRead,
    inputTokensCacheCreate: a.usage.inputTokensCacheCreate + b.usage.inputTokensCacheCreate,
    outputTokens: a.usage.outputTokens + b.usage.outputTokens,
    webSearchRequests: a.usage.webSearchRequests + b.usage.webSearchRequests,
    toolCalls: a.usage.toolCalls + b.usage.toolCalls,
  }
  return {
    text: b.text,
    toolUses: b.toolUses,
    usage,
    provider: b.provider,
    modelId: b.modelId,
    latencyMs: a.latencyMs + b.latencyMs,
    fallbackUsed: a.fallbackUsed || b.fallbackUsed,
    routeErrorClass: b.routeErrorClass ?? a.routeErrorClass,
    routeReason: b.routeReason,
  }
}

function dedupCitations(cites: BenchmarkCitation[]): BenchmarkCitation[] {
  const seen = new Set<string>()
  const out: BenchmarkCitation[] = []
  for (const c of cites) {
    const key = (c.name.toLowerCase() + "|" + c.url.toLowerCase()).trim()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

export async function computeLocalCafeRange(args: {
  itemName: string
  currentCents: number
  country: string | null
  city: string | null
  ctx: ConceptContext
  // TIM-3496: identity for the Scout envelope so ai_turn_metrics rows attribute
  // the turn to the right user. Optional so the existing /suggest-price caller
  // (and any future caller) can opt in without breaking the lib's contract.
  userId?: string | null
  routeTag?: string
}): Promise<LocalRangeResult> {
  const { itemName, currentCents, country, ctx } = args
  const userId = args.userId ?? null
  const routeTag = args.routeTag ?? "menu-pricing/local-cafe-range"
  const countryInfo = country ? COUNTRY_LABELS[country.toUpperCase()] : null
  const countryName = countryInfo?.name ?? "the cafe's country"
  const currency = countryInfo?.currency ?? "local currency"
  const currencySymbol = countryInfo?.currencySymbol ?? "$"

  // TIM-2922 (hardening): drop city when it doesn't match the requested
  // country — "Calgary in the United States" is incoherent and the model
  // refuses with no JSON. When mismatched, search country-wide instead.
  const cityIsConsistent = cityMatchesCountry(args.city, country)
  const city = cityIsConsistent ? args.city : null

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

  const cityClause = city
    ? ` Prefer cafes in ${city} or nearby; widen to the rest of ${countryName} only if you cannot find three in-city.`
    : ""

  // TIM-2922 (hardening): require 3 distinct web_search queries, demand 3+
  // citations, and remove the soft "minimum 1" escape that previously let
  // the model return 1 cafe and call it done.
  const initialPrompt = `You are a coffee shop pricing consultant. The owner wants to know how their price for "${itemName}" compares to comparable cafés in their area. You MUST use the web_search tool to find real prices at real, named, independent specialty cafés in ${countryName} — do NOT answer from memory and do NOT use industry-body figures (SCA, NCA, Square, BLS) for the local range; those are not real cafes.

SHOP CONTEXT:
${conceptSummary}

ITEM:
- Name: ${itemName}
- Current price: ${currentDollars}

YOUR TASK:
1. Run AT LEAST THREE distinct web_search queries — vary the terms across calls (e.g. "${itemName} price ${city ?? countryName}", "specialty coffee menu ${city ?? countryName}", "${itemName} menu ${countryName} cafe"). Do NOT stop after one search if you have fewer than three usable cafes.${cityClause}
2. Collect AT LEAST THREE distinct real cafés in ${countryName}. Each must be a real business with a verifiable URL (the cafe's own site, Google Maps menu, Square/Toast/Square Online public menu, or a recent local-press menu reference). Reject industry-body pages, retailers (Starbucks-owned, Tim Hortons-owned), franchises, and any cafe outside ${countryName}.
3. Compute the local range from those citations only. Low = the lowest cited price. High = the highest cited price. Use prices in ${currency}.
4. Compare the owner's current price (${currentDollars}) to that range and write one short paragraph of commentary.

Return ONLY a JSON object with these exact fields (no other text, no markdown, no code fences):
{
  "low_cents": <integer, low end of the local cafe range in ${currency} cents>,
  "high_cents": <integer, high end of the local cafe range in ${currency} cents>,
  "citations": [
    {"name": "<cafe name>", "url": "<verifiable URL>", "price_cents": <integer cents in ${currency}>, "city": "<city>"},
    ... AT LEAST 3 entries, all in ${countryName} ...
  ],
  "commentary": "<2-4 sentences. Reference the specific city and which cafes anchor the range. Say whether the current price reads low, fair, or premium. No em dashes, no jargon, no AI language.>"
}

Never fall back to industry-body averages — that defeats the purpose of this benchmark. If after three searches you only have one or two real cafés, return the JSON with what you found AND keep searching; do not stop early.`

  // TIM-2922 (hardening): bumped from 5 → 10 to give the model headroom for
  // the explicit 3-query requirement plus follow-ups. The location bias is
  // dropped when city is mismatched (see cityIsConsistent above).
  // TIM-3496: passed through ScoutServerToolDefinition; the adapter forwards
  // user_location/max_uses verbatim to the Anthropic SDK web_search_20250305
  // shape (lane is pinned Anthropic-only, so no DeepSeek normalization needed).
  const webSearchTool: ScoutServerToolDefinition = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 10,
    ...(country
      ? { user_location: { type: "approximate", country: country.toUpperCase(), ...(city ? { city } : {}) } }
      : {}),
  }

  const first = await runOneSearch(initialPrompt, webSearchTool, country, userId, routeTag)
  let citations = dedupCitations(first.citations)
  let droppedOutOfCountry = first.droppedOutOfCountry
  let commentary = first.commentary
  let envelope: ScoutTurnOutput = first.envelope
  let rawText = first.rawText

  // TIM-2922 (hardening): if first pass < 3 citations, retry once with the
  // existing citations as anti-duplicates context. Cap at 1 retry to keep
  // worst-case latency bounded by maxDuration in the caller routes.
  if (citations.length < 3) {
    const seenList = citations.length > 0
      ? citations.map((c) => `- ${c.name} (${c.city ?? "?"}) ${c.url}`).join("\n")
      : "(none yet)"
    const retryPrompt = `Same task as before — find real independent specialty cafés in ${countryName} that sell "${itemName}", with verifiable URLs and prices in ${currency}. You already found:

${seenList}

Use web_search to find AT LEAST ${Math.max(3 - citations.length, 1)} MORE distinct cafés in ${countryName} that are NOT in the list above. Vary your search terms. Return ONLY a JSON object:

{
  "low_cents": <integer cents>,
  "high_cents": <integer cents>,
  "citations": [
    {"name": "<cafe name>", "url": "<verifiable URL>", "price_cents": <integer cents in ${currency}>, "city": "<city>"},
    ... at least ${Math.max(3 - citations.length, 1)} NEW entries, all in ${countryName} ...
  ],
  "commentary": "<one paragraph>"
}`

    const second = await runOneSearch(retryPrompt, webSearchTool, country, userId, routeTag)
    citations = dedupCitations([...citations, ...second.citations])
    droppedOutOfCountry += second.droppedOutOfCountry
    if (second.commentary) commentary = second.commentary
    envelope = mergeEnvelopes(envelope, second.envelope)
    rawText = `${rawText}\n--- retry ---\n${second.rawText}`
  }

  if (citations.length === 0) {
    // TIM-2922 (hardening): the route caller decides how to surface a
    // thin/empty result. Don't throw — return the empty-citation shape and
    // let the caller produce a 200 with a flag, or fall back to the
    // industry panel in /benchmark-price.
    return {
      low_cents: 0,
      high_cents: 0,
      citations: [],
      commentary: normalizeAIOutput(commentary),
      country_used: country?.toUpperCase() ?? null,
      city_used: city,
      web_search_requests: envelope.usage.webSearchRequests,
      envelope,
      raw_text: rawText,
      dropped_out_of_country: droppedOutOfCountry,
    }
  }

  // Recompute from citations — never trust the model's own summary of the
  // prices it cited.
  const prices = citations.map((c) => c.price_cents).sort((a, b) => a - b)
  const low = prices[0]
  const high = prices[prices.length - 1]

  return {
    low_cents: low,
    high_cents: high,
    citations,
    commentary: normalizeAIOutput(commentary),
    country_used: country?.toUpperCase() ?? null,
    city_used: city,
    web_search_requests: envelope.usage.webSearchRequests,
    envelope,
    raw_text: rawText,
    dropped_out_of_country: droppedOutOfCountry,
  }
}
