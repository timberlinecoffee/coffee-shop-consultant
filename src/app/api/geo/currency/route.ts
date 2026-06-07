// TIM-2485: Return the visitor's detected country and the USD exchange rate
// for their local currency so /pricing can show an approximate local price.
//
// Country detection: Vercel injects `x-vercel-ip-country` at the edge.
// Exchange rates: open.er-api.com free tier (1500 req/month, no key needed).
// The rate response is cached server-side for 1 hour via Next.js fetch cache.

import { headers } from "next/headers";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

// ISO-3166-1 alpha-2 country → ISO 4217 currency. Only countries whose
// currency differs from USD are listed — everything else falls through to USD.
const COUNTRY_CURRENCY: Record<string, string> = {
  // North America
  CA: "CAD", MX: "MXN",
  // Europe — non-EUR
  GB: "GBP", CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", PL: "PLN",
  CZ: "CZK", HU: "HUF", RO: "RON", RS: "RSD", TR: "TRY", UA: "UAH",
  IS: "ISK", BG: "BGN",
  // Europe — EUR zone
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR",
  AT: "EUR", PT: "EUR", FI: "EUR", IE: "EUR", GR: "EUR", SK: "EUR",
  SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", LU: "EUR", MT: "EUR",
  CY: "EUR",
  // Asia-Pacific
  AU: "AUD", NZ: "NZD", JP: "JPY", CN: "CNY", KR: "KRW", IN: "INR",
  SG: "SGD", HK: "HKD", TW: "TWD", TH: "THB", MY: "MYR", ID: "IDR",
  PH: "PHP", VN: "VND", PK: "PKR", BD: "BDT", LK: "LKR",
  // Middle East
  AE: "AED", SA: "SAR", IL: "ILS", QA: "QAR", KW: "KWD", BH: "BHD",
  // Africa
  ZA: "ZAR", NG: "NGN", KE: "KES", EG: "EGP", GH: "GHS", TZ: "TZS",
  // South America
  BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
};

type RateCache = { rates: Record<string, number>; fetchedAt: number };
let rateCache: RateCache | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getExchangeRates(): Promise<Record<string, number> | null> {
  if (rateCache && Date.now() - rateCache.fetchedAt < CACHE_TTL_MS) {
    return rateCache.rates;
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: string; rates: Record<string, number> };
    if (data.result !== "success" || !data.rates) return null;
    rateCache = { rates: data.rates, fetchedAt: Date.now() };
    return data.rates;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const headerList = await headers();
  const ip = clientIp(headerList);

  const limited = await enforceRateLimit({
    bucket: "geo-currency",
    id: ip,
    limit: 60,
    windowSec: 60,
  });
  if (limited) return limited;

  // Sanitize: accept only 2-letter uppercase ISO country codes.
  const raw = headerList.get("x-vercel-ip-country") ?? "";
  const countryCode = /^[A-Z]{2}$/.test(raw) ? raw : "";

  if (!countryCode || countryCode === "US") {
    return Response.json({ countryCode: countryCode || "US", currencyCode: "USD", rate: 1 });
  }

  const currencyCode = COUNTRY_CURRENCY[countryCode] ?? null;
  if (!currencyCode || currencyCode === "USD") {
    return Response.json({ countryCode, currencyCode: "USD", rate: 1 });
  }

  const rates = await getExchangeRates();
  const rate = rates?.[currencyCode] ?? null;

  if (!rate) {
    return Response.json({ countryCode, currencyCode: "USD", rate: 1 });
  }

  return Response.json(
    { countryCode, currencyCode, rate },
    {
      headers: {
        // Allow CDN/browser to cache for 30 min; rates don't change by the minute.
        "Cache-Control": "public, max-age=1800, s-maxage=1800",
      },
    },
  );
}
