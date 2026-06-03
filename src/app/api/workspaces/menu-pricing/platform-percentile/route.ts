// TIM-1692: Cross-user price percentile read path.
// Returns real percentile data from menu_price_aggregates once the item/region
// has >= REAL_DATA_MIN_COUNT data points. Below that threshold, returns null
// so the caller falls back to the AI-estimated benchmark.
//
// Threshold: 20 data points per (item_name_normalized, region_bucket).
// This constant must match the HAVING clause in the menu_price_percentiles view.
// To change the threshold, update both this file AND the migration view.

import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive, isBetaWaived, effectivePlanForGating } from "@/lib/access"

export const runtime = "nodejs"
export const maxDuration = 10

// Minimum data points before real percentiles replace AI estimate.
export const REAL_DATA_MIN_COUNT = 20

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("users")
    .select(
      "subscription_status, subscription_tier, paused_from_tier, trial_ends_at, beta_waiver_until",
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

  // TIM-1955: real-cohort percentile is the Pro Coffee Shop World data path.
  if (
    !isBetaWaived(profile.beta_waiver_until) &&
    effectivePlanForGating(profile) !== "pro"
  ) {
    return Response.json(
      { error: "Pro plan required", code: "pro_required" },
      { status: 402 },
    )
  }

  const url = new URL(request.url)
  const rawName = url.searchParams.get("item_name")
  const regionBucket = url.searchParams.get("region_bucket") ?? null

  if (!rawName) {
    return Response.json({ error: "Missing required param: item_name" }, { status: 400 })
  }

  const itemNameNormalized = normalizeItemName(rawName)

  // Query the percentile view via service client (authenticated users cannot
  // read menu_price_aggregates directly due to RLS).
  const serviceClient = createServiceClient()
  let query = serviceClient
    .from("menu_price_percentiles")
    .select("data_point_count, p25_cents, p50_cents, p75_cents, min_cents, max_cents, avg_cents")
    .eq("item_name_normalized", itemNameNormalized)

  if (regionBucket) {
    query = query.eq("region_bucket", regionBucket)
  } else {
    query = query.is("region_bucket", null)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error("platform-percentile query error:", error.message)
    return Response.json({ error: "Query failed" }, { status: 500 })
  }

  if (!data) {
    // Fewer than REAL_DATA_MIN_COUNT points — fall back to AI estimate.
    return Response.json({
      available: false,
      threshold: REAL_DATA_MIN_COUNT,
      source: "ai_estimated",
    })
  }

  return Response.json({
    available: true,
    source: "platform_data",
    data_point_count: data.data_point_count,
    threshold: REAL_DATA_MIN_COUNT,
    p25_cents: data.p25_cents,
    p50_cents: data.p50_cents,
    p75_cents: data.p75_cents,
    min_cents: data.min_cents,
    max_cents: data.max_cents,
    avg_cents: data.avg_cents,
  })
}
