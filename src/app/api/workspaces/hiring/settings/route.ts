// TIM-1300: Hiring settings — marked country (plan_hiring_settings).
// GET returns { hiring_country, effective_country } where effective_country
// falls back to the signed location_candidate's country, then first non-archived.
// PATCH upserts the override (null clears it, restoring auto-detect).

import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"
import type { HiringCountry } from "@/lib/hiring"

const VALID_COUNTRIES: HiringCountry[] = ["US", "GB", "CA", "AU"]

async function getPlanId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

// Derive the effective country from location_candidates when no override is set.
// Priority: signed candidate > first non-archived candidate > null.
async function deriveCountryFromLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("location_candidates")
    .select("country, status, archived, position")
    .eq("plan_id", planId)
    .not("country", "is", null)
    .order("position", { ascending: true })

  if (!data || data.length === 0) return null
  const signed = data.find((c) => c.status === "signed")
  if (signed?.country) return signed.country

  const first = data.find((c) => !c.archived)
  return first?.country ?? null
}

// Map a free-text country string to a supported ISO-2 code, or null.
function normalizeToSupportedCountry(raw: string | null): HiringCountry | null {
  if (!raw) return null
  const upper = raw.toUpperCase().trim()
  if ((VALID_COUNTRIES as string[]).includes(upper)) return upper as HiringCountry
  // Common name mappings.
  const MAP: Record<string, HiringCountry> = {
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    "USA": "US",
    "UNITED KINGDOM": "GB",
    "UK": "GB",
    "GREAT BRITAIN": "GB",
    "ENGLAND": "GB",
    "SCOTLAND": "GB",
    "WALES": "GB",
    "CANADA": "CA",
    "AUSTRALIA": "AU",
  }
  return MAP[upper] ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data: settings } = await supabase
    .from("plan_hiring_settings")
    .select("hiring_country")
    .eq("plan_id", planId)
    .maybeSingle()

  const override = settings?.hiring_country ?? null

  let effectiveCountry: HiringCountry | null = override as HiringCountry | null
  if (!effectiveCountry) {
    const raw = await deriveCountryFromLocation(supabase, planId)
    effectiveCountry = normalizeToSupportedCountry(raw)
  }

  return Response.json({ hiring_country: override, effective_country: effectiveCountry })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const body = await request.json() as { hiring_country: string | null }
  const incoming = body.hiring_country

  if (incoming !== null) {
    const normalized = normalizeToSupportedCountry(incoming)
    if (!normalized) {
      return Response.json({ error: `Unsupported country code: ${incoming}` }, { status: 400 })
    }

    const { error } = await supabase
      .from("plan_hiring_settings")
      .upsert({ plan_id: planId, hiring_country: normalized }, { onConflict: "plan_id" })
    if (error) return Response.json({ error: "Failed to save settings" }, { status: 500 })

    return Response.json({ hiring_country: normalized, effective_country: normalized })
  }

  // null = clear override → auto-detect
  const { error } = await supabase
    .from("plan_hiring_settings")
    .upsert({ plan_id: planId, hiring_country: null }, { onConflict: "plan_id" })
  if (error) return Response.json({ error: "Failed to clear settings" }, { status: 500 })

  const raw = await deriveCountryFromLocation(supabase, planId)
  const effectiveCountry = normalizeToSupportedCountry(raw)
  return Response.json({ hiring_country: null, effective_country: effectiveCountry })
}
