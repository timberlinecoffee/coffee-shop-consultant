// TIM-1145: Address autocomplete via Nominatim (OpenStreetMap).
// Free, no API key. We proxy server-side so the User-Agent stays compliant
// with Nominatim's usage policy and we never expose any provider key.

import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
const USER_AGENT = "Groundwork-CoffeeShopConsultant/1.0 (https://coffee-shop-consultant.vercel.app)"

type NominatimRaw = {
  place_id: number
  lat: string
  lon: string
  display_name: string
  type?: string
  class?: string
  address?: {
    house_number?: string
    road?: string
    city?: string
    town?: string
    village?: string
    suburb?: string
    neighbourhood?: string
    state?: string
    postcode?: string
    country?: string
    country_code?: string
  }
}

export type PlaceSuggestion = {
  placeId: number
  displayName: string
  shortLabel: string
  lat: number
  lng: number
  streetAddress: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  countryCode: string | null
}

function toShortLabel(raw: NominatimRaw): string {
  const a = raw.address ?? {}
  const street = [a.house_number, a.road].filter(Boolean).join(" ")
  const locality = a.city || a.town || a.village || a.suburb || ""
  const parts = [street, locality, a.state].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : raw.display_name
}

function toStreetAddress(raw: NominatimRaw): string | null {
  const a = raw.address ?? {}
  const parts = [a.house_number, a.road].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : null
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 3) {
    return Response.json({ results: [] })
  }

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set("q", q)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("addressdetails", "1")
  url.searchParams.set("limit", "6")

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en",
      },
      next: { revalidate: 60 * 60 * 24 },
    })

    if (!res.ok) {
      return Response.json({ results: [] }, { status: 200 })
    }

    const raw = (await res.json()) as NominatimRaw[]
    const results: PlaceSuggestion[] = raw.map((r) => {
      const a = r.address ?? {}
      return {
        placeId: r.place_id,
        displayName: r.display_name,
        shortLabel: toShortLabel(r),
        lat: Number(r.lat),
        lng: Number(r.lon),
        streetAddress: toStreetAddress(r),
        neighborhood: a.neighbourhood ?? a.suburb ?? null,
        city: a.city ?? a.town ?? a.village ?? null,
        state: a.state ?? null,
        postalCode: a.postcode ?? null,
        country: a.country ?? null,
        countryCode: a.country_code?.toUpperCase() ?? null,
      }
    })

    return Response.json({ results })
  } catch {
    return Response.json({ results: [] })
  }
}
