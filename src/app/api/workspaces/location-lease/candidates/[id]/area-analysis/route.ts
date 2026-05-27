// TIM-1145: AI area analysis for a selected location.
// Pulls nearby businesses from OpenStreetMap Overpass (free, no API key) and
// hands the structured neighborhood snapshot to Claude so the response is
// specific to the actual block, not generic boilerplate.

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }

const OVERPASS_URL = "https://overpass-api.de/api/interpreter"
const USER_AGENT = "Groundwork-CoffeeShopConsultant/1.0 (https://coffee-shop-consultant.vercel.app)"
const RADIUS_METERS = 400

type OverpassElement = {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

type NearbyItem = {
  name: string
  category: string
}

async function fetchNearby(lat: number, lng: number): Promise<{ items: NearbyItem[]; counts: Record<string, number> }> {
  const query = `
    [out:json][timeout:20];
    (
      node["amenity"~"^(cafe|restaurant|fast_food|bar|pub|food_court|ice_cream|bakery)$"](around:${RADIUS_METERS},${lat},${lng});
      node["shop"](around:${RADIUS_METERS},${lat},${lng});
      node["office"](around:${RADIUS_METERS},${lat},${lng});
      node["amenity"~"^(school|university|college|library|hospital|theatre|cinema)$"](around:${RADIUS_METERS},${lat},${lng});
      node["highway"="bus_stop"](around:${RADIUS_METERS},${lat},${lng});
      node["public_transport"~"^(station|stop_position|platform)$"](around:${RADIUS_METERS},${lat},${lng});
      node["amenity"="parking"](around:${RADIUS_METERS},${lat},${lng});
    );
    out tags 80;
  `.trim()

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
    })

    if (!res.ok) return { items: [], counts: {} }

    const data = (await res.json()) as { elements: OverpassElement[] }
    const items: NearbyItem[] = []
    const counts: Record<string, number> = {}

    for (const el of data.elements ?? []) {
      const t = el.tags ?? {}
      let category: string | null = null
      const amenity = t["amenity"]
      const shop = t["shop"]
      const office = t["office"]
      const pt = t["public_transport"]

      if (amenity === "cafe") category = "Cafe"
      else if (amenity === "restaurant") category = "Restaurant"
      else if (amenity === "fast_food") category = "Fast Food"
      else if (amenity === "bar" || amenity === "pub") category = "Bar / Pub"
      else if (amenity === "bakery") category = "Bakery"
      else if (amenity === "ice_cream") category = "Ice Cream"
      else if (amenity === "school" || amenity === "university" || amenity === "college") category = "School / University"
      else if (amenity === "library") category = "Library"
      else if (amenity === "hospital") category = "Hospital"
      else if (amenity === "theatre" || amenity === "cinema") category = "Theater / Cinema"
      else if (amenity === "parking") category = "Parking"
      else if (t["highway"] === "bus_stop") category = "Bus Stop"
      else if (pt) category = "Transit"
      else if (shop) category = `Shop: ${shop.replace(/_/g, " ")}`
      else if (office) category = `Office: ${office.replace(/_/g, " ")}`

      if (!category) continue
      counts[category] = (counts[category] ?? 0) + 1
      const name = t["name"]?.trim()
      if (name && items.length < 50) items.push({ name, category })
    }

    return { items, counts }
  } catch {
    return { items: [], counts: {} }
  }
}

function buildPrompt(
  locationLine: string,
  city: string | null,
  counts: Record<string, number>,
  items: NearbyItem[],
  conceptSummary: string | null,
): string {
  const countLines = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n") || "(No structured data found within 400 meters.)"

  const namedExamples = items
    .filter((i) => i.name)
    .slice(0, 18)
    .map((i) => `- ${i.name} (${i.category})`)
    .join("\n") || "(No named businesses returned.)"

  const concept = conceptSummary
    ? `\n\nThe owner's concept summary:\n${conceptSummary}\n`
    : ""

  return `You are reviewing a candidate coffee shop site for a first-time owner.

Site: ${locationLine}
City: ${city ?? "(not provided)"}
${concept}
Within ${RADIUS_METERS} meters of the address, OpenStreetMap reports the following counts:
${countLines}

A sample of named places nearby:
${namedExamples}

Write a short area analysis for this specific block — two short paragraphs, ~120-180 words total. Be concrete and specific to what is actually around this address. Cover:
- The neighborhood character implied by the mix (residential, office, retail, transit-heavy, etc.)
- Who likely walks past (morning commuters, students, lunch traffic, evening crowd) and how that lines up with a coffee shop
- Direct competitors or complementary tenants worth naming
- Foot traffic / transit / parking signals from the data
- Two specific things the owner should personally verify on-site

Plain English, no consultant jargon, no filler ("it's important to note that…"). No emojis. Don't repeat the address back at the top. Lead with the insight.`
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id: candidateId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single()
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data: candidate } = await supabase
    .from("location_candidates")
    .select("id, plan_id, name, address, neighborhood, city, lat, lng")
    .eq("id", candidateId)
    .maybeSingle()

  if (!candidate) return Response.json({ error: "Candidate not found" }, { status: 404 })
  if (candidate.plan_id !== plan.id) return Response.json({ error: "Forbidden" }, { status: 403 })

  if (candidate.lat == null || candidate.lng == null) {
    return Response.json(
      { error: "Pick a suggestion from address autocomplete first so we know which block to analyze." },
      { status: 422 },
    )
  }

  const lat = Number(candidate.lat)
  const lng = Number(candidate.lng)

  // Pull the owner's concept (W1) from module_responses so the analysis
  // lines up with what they're trying to build.
  const { data: conceptRow } = await supabase
    .from("module_responses")
    .select("response_data")
    .eq("plan_id", plan.id)
    .eq("module_number", 1)
    .maybeSingle()

  const conceptSummary = (() => {
    const data = (conceptRow?.response_data ?? {}) as Record<string, unknown>
    const bits = ["one_liner", "concept", "target_customer", "differentiator"]
      .map((k) => data[k])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    return bits.length > 0 ? bits.join(" — ") : null
  })()

  const { items, counts } = await fetchNearby(lat, lng)

  const locationLine = [candidate.name, candidate.address].filter(Boolean).join(" — ")
  const prompt = buildPrompt(locationLine, candidate.city ?? null, counts, items, conceptSummary)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a knowledgeable real estate advisor for small coffee shops. Be direct and specific. Plain English, no consultant jargon. Do not use emojis.",
    })

    const block = response.content.find((b) => b.type === "text")
    const text = block && "text" in block ? block.text.trim() : ""

    if (!text) {
      return Response.json({ error: "Area analysis returned empty." }, { status: 502 })
    }

    await supabase
      .from("location_candidates")
      .update({ area_analysis: text, area_analysis_at: new Date().toISOString() })
      .eq("id", candidateId)

    const nearbyCount = Object.values(counts).reduce((a, b) => a + b, 0)
    return Response.json({ text, nearbyCount, generatedAt: new Date().toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Area analysis failed."
    return Response.json({ error: msg }, { status: 502 })
  }
}
