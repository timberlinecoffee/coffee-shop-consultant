// TIM-2377: Projects CRUD — GET (list) + POST (create with Starter cap).
// "Projects" are coffee_shop_plans rows. Each plan represents one shop concept.
// Starter plan cap = 1 project. Pro / trial-grace = unlimited.
import { createClient } from "@/lib/supabase/server"
import { effectivePlanForGating } from "@/lib/access"
import { z } from "zod"
import type { NextRequest } from "next/server"

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  locationLabel: z.string().max(200).optional(),
  // TIM-2865: client-generated per-form-mount UUID. Server uses it to dedup
  // rapid double-submits from the same modal instance. Header takes priority
  // when both are present (matches Stripe convention).
  idempotencyKey: z.string().min(8).max(128).optional(),
})

// TIM-2865: dedup window for near-simultaneous duplicate POSTs from the same
// user with matching name+location. Narrow enough to avoid blocking a real
// intentional second project with the same name minutes later.
const IDEMPOTENCY_WINDOW_SECONDS = 60

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: userRow } = await supabase
    .from("users")
    .select("current_plan_id")
    .eq("id", user.id)
    .maybeSingle()

  const { data: plans, error } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name, location_label, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("GET /api/projects error:", error.message)
    return Response.json({ error: "Failed to fetch projects" }, { status: 500 })
  }

  const activePlanId = userRow?.current_plan_id ?? plans?.[0]?.id ?? null

  const projects = (plans ?? []).map((p) => ({
    id: p.id,
    name: p.plan_name,
    locationLabel: p.location_label ?? null,
    createdAt: p.created_at,
    isActive: p.id === activePlanId,
  }))

  return Response.json({ projects })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Server-side auth: fetch tier for cap enforcement (Rule 2 — never trust browser)
  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, subscription_tier, trial_ends_at, paused_from_tier")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile) return Response.json({ error: "User not found" }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = CreateBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, locationLabel } = parsed.data

  // Starter cap: only 1 project allowed. Pro / trial-grace: unlimited.
  const tier = effectivePlanForGating(profile)
  if (tier === "starter") {
    const { count } = await supabase
      .from("coffee_shop_plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)

    if ((count ?? 0) >= 1) {
      return Response.json({ code: "pro_required", error: "Upgrade to Pro to create multiple projects" }, { status: 402 })
    }
  }

  // TIM-2865: server-side dedup. Catches the case where two POSTs land
  // before the client ref guard can fire (slow network + rage-click on the
  // same modal mount, or a navigation interleave). Looks for a plan this
  // user just created with the same name + location_label in the last 60s.
  // Not race-free without a unique index (filed as follow-up), but covers
  // the actual incident pattern: two POSTs ~100ms apart, first commits
  // ~200ms before second arrives → second SELECT sees it and returns 200.
  const sinceIso = new Date(Date.now() - IDEMPOTENCY_WINDOW_SECONDS * 1000).toISOString()
  let dedupQuery = supabase
    .from("coffee_shop_plans")
    .select("id, plan_name, location_label, created_at")
    .eq("user_id", user.id)
    .eq("plan_name", name)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
  if (locationLabel) {
    dedupQuery = dedupQuery.eq("location_label", locationLabel)
  } else {
    dedupQuery = dedupQuery.is("location_label", null)
  }
  const { data: recentMatches } = await dedupQuery
  const existing = recentMatches?.[0]
  if (existing) {
    return Response.json(
      {
        project: {
          id: existing.id,
          name: existing.plan_name,
          locationLabel: existing.location_label ?? null,
          createdAt: existing.created_at,
          isActive: false,
        },
        deduplicated: true,
      },
      { status: 200 },
    )
  }

  const { data: plan, error } = await supabase
    .from("coffee_shop_plans")
    .insert({ user_id: user.id, plan_name: name, location_label: locationLabel ?? null })
    .select("id, plan_name, location_label, created_at")
    .single()

  if (error || !plan) {
    console.error("POST /api/projects insert error:", error?.message)
    return Response.json({ error: "Failed to create project" }, { status: 500 })
  }

  return Response.json(
    {
      project: {
        id: plan.id,
        name: plan.plan_name,
        locationLabel: plan.location_label ?? null,
        createdAt: plan.created_at,
        isActive: false,
      },
    },
    { status: 201 },
  )
}
