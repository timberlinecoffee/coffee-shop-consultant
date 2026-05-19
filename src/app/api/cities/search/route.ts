// TIM-808: Nominatim proxy for worldwide city autocomplete.
// Caches responses for 5 min to stay well under the 1 req/s rate limit.

import type { NextRequest } from "next/server";

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  region?: string;
  state_district?: string;
  county?: string;
  country?: string;
  country_code?: string;
}

interface NominatimResult {
  name: string;
  address: NominatimAddress;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ results: [] });

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "10");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "TimberlineCoffeeSchool/1.0 (trentrollings@gmail.com)",
        "Accept-Language": "en",
      },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return Response.json({ results: [] });

    const data: NominatimResult[] = await res.json();

    const seen = new Set<string>();
    const results = data
      .filter((item) => item.address?.country_code)
      .map((item) => {
        const addr = item.address;
        const city =
          addr.city ||
          addr.town ||
          addr.village ||
          addr.municipality ||
          item.name;
        const region =
          addr.state || addr.region || addr.state_district || addr.county || "";
        const countryCode = (addr.country_code || "").toUpperCase();
        const country = addr.country || "";
        const parts = [city, region, country].filter(Boolean);
        const displayName = parts.join(", ");
        return { city, region, countryCode, displayName };
      })
      .filter((r) => r.city && r.countryCode)
      .filter((r) => {
        if (seen.has(r.displayName)) return false;
        seen.add(r.displayName);
        return true;
      })
      .slice(0, 8);

    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}
