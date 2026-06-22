// TIM-2922: Shared local-cafe-range engine. Extracted from the
// /benchmark-price route so /suggest-price (and any future caller) can
// reuse the same web-search-backed research without cross-route imports.
//
// Returns a price range derived from real cited cafes in the requested
// country. Industry-body figures (SCA/NCA/Square/BLS) are explicitly banned
// from the prompt — those live in a separate curated-dataset lookup that
// remains a labelled "for reference" panel in the route response.
import Anthropic from "@anthropic-ai/sdk"
import { RESEARCH_AI_MODEL } from "@/lib/ai/models"
import { normalizeAIOutput } from "@/lib/normalize"

const anthropic = new Anthropic()

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
  usage: Anthropic.Messages.Usage
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

  const cityClause = city
    ? ` Prefer cafes in ${city} or nearby; widen to the rest of ${countryName} only if you cannot find three in-city.`
    : ""

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
  // TIM-2922: drop citations that look like they belong to a different
  // country than requested. This is what stops a Seattle ($4.50 USD)
  // citation from poisoning a Canada (CAD) recomputed range.
  const citations = allCitations.filter((c) => !citationLooksOutOfCountry(c, country))
  const droppedOutOfCountry = allCitations.length - citations.length

  let low = Math.max(0, Math.round(Number(parsed.low_cents)))
  let high = Math.max(low, Math.round(Number(parsed.high_cents)))

  // Recompute from citations when we have any — never trust the model's
  // own summary of the prices it cited.
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
    dropped_out_of_country: droppedOutOfCountry,
  }
}
