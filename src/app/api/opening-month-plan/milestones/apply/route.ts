// TIM-2924: Apply-gate for AI-generated milestones. Called by the review
// modal's onApply after the user accepts (and optionally edits) the proposed
// milestone set. Replaces the pre-write that used to happen inside the generate
// route (Shape C fix). Pattern mirrors suggest-recipe/apply/route.ts.
import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { normalizeLaunchPlanConfig } from "@/lib/launch-plan"
import type { TrackKey, MilestoneStatus } from "@/lib/launch-plan"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 30

type MilestoneSpec = {
  title?: string
  description?: string | null
  track?: TrackKey
  target_date?: string | null
  status?: MilestoneStatus
  estimated_duration_days?: number | null
  critical_path?: boolean
  owner?: string | null
  ai_notes?: string | null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

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
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 })
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: { milestones?: MilestoneSpec[]; lastGeneratedAt?: string }
  try { body = await request.json() } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!Array.isArray(body.milestones) || body.milestones.length === 0) {
    return Response.json({ error: "milestones must be a non-empty array" }, { status: 400 })
  }

  const specs = body.milestones.filter(
    (m): m is MilestoneSpec => typeof m === "object" && m !== null && typeof m.title === "string" && m.title.trim().length > 0 && typeof m.track === "string",
  )

  if (specs.length === 0) {
    return Response.json({ error: "No valid milestones provided (title and track are required)" }, { status: 400 })
  }

  // Delete AI-generated milestones the user hasn't manually edited.
  // user_edited=true means the user touched this row; skip those.
  const { error: deleteErr } = await supabase
    .from("launch_milestones")
    .delete()
    .eq("plan_id", plan.id)
    .eq("user_edited", false)

  if (deleteErr) {
    console.error("milestones/apply delete error:", deleteErr)
    return Response.json({ error: "Failed to clear old milestones" }, { status: 500 })
  }

  // Get current count for order_index baseline (after deletion).
  const { count: remaining } = await supabase
    .from("launch_milestones")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", plan.id)

  const rows = specs.map((m, i) => ({
    plan_id: plan.id,
    title: (m.title ?? "Untitled Milestone").trim(),
    description: m.description ?? null,
    track: m.track!,
    target_date: m.target_date ?? null,
    status: (m.status ?? "not_started") as MilestoneStatus,
    estimated_duration_days: m.estimated_duration_days ?? null,
    critical_path: m.critical_path ?? false,
    owner: m.owner ?? "founder",
    ai_notes: m.ai_notes ?? null,
    user_edited: false,
    source: "ai_generated" as const,
    order_index: (remaining ?? 0) + i,
  }))

  const { data: inserted, error: insertErr } = await supabase
    .from("launch_milestones")
    .insert(rows)
    .select("*")
    .order("order_index", { ascending: true })

  if (insertErr) {
    console.error("milestones/apply insert error:", insertErr)
    return Response.json({ error: "Failed to insert milestones" }, { status: 500 })
  }

  // Update the config document with the new lastGeneratedAt.
  const lastGeneratedAt = body.lastGeneratedAt ?? new Date().toISOString()
  const { data: existing } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", plan.id)
    .eq("workspace_key", "opening_month_plan")
    .maybeSingle()

  const config = normalizeLaunchPlanConfig(existing?.content)
  ;(config as unknown as Record<string, unknown>).lastGeneratedAt = lastGeneratedAt

  await supabase
    .from("workspace_documents")
    .upsert(
      { plan_id: plan.id, workspace_key: "opening_month_plan", content: config },
      { onConflict: "plan_id,workspace_key" },
    )

  return Response.json({
    milestones: inserted ?? [],
    lastGeneratedAt,
  })
}
