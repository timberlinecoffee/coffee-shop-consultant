// TIM-2924: Apply-gate for AI-generated milestones. Called by the review
// modal's onApply after the user accepts (and optionally edits) the proposed
// milestone set. Replaces the pre-write that used to happen inside the generate
// route (Shape C fix). Pattern mirrors suggest-recipe/apply/route.ts.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
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

  // TIM-2924: use getActivePlanId (canonical resolver) not latest-by-created_at
  // which returns the wrong plan when the user has activated a non-latest plan.
  const resolvedPlanId = await getActivePlanId(supabase, user.id)
  if (!resolvedPlanId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: { milestones?: MilestoneSpec[]; lastGeneratedAt?: string; planId?: string }
  try { body = await request.json() } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // If the client passed the planId it generated for, verify it belongs to this user
  // and use it; otherwise fall back to the canonical active plan.
  // TIM-2924: pinning planId prevents wrong-plan writes for multi-plan accounts.
  let planId: string
  if (typeof body.planId === "string" && body.planId) {
    const { data: verifiedPlan } = await supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("id", body.planId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!verifiedPlan) return Response.json({ error: "Plan not found" }, { status: 404 })
    planId = verifiedPlan.id
  } else {
    planId = resolvedPlanId
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

  // Snapshot existing milestones to compute order_index and collect IDs to delete.
  // Read first so INSERT can run before DELETE — if INSERT fails nothing is lost.
  const { data: existingMilestones } = await supabase
    .from("launch_milestones")
    .select("id, user_edited")
    .eq("plan_id", planId)

  const toDeleteIds = (existingMilestones ?? [])
    .filter((m): m is { id: string; user_edited: boolean } => !m.user_edited)
    .map((m) => m.id)
  const userEditedCount = (existingMilestones ?? []).filter((m) => m.user_edited).length

  const rows = specs.map((m, i) => ({
    plan_id: planId,
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
    order_index: userEditedCount + i,
  }))

  // INSERT first — if this fails, old milestones are still in the DB (no data loss).
  const { data: inserted, error: insertErr } = await supabase
    .from("launch_milestones")
    .insert(rows)
    .select("*")
    .order("order_index", { ascending: true })

  if (insertErr) {
    console.error("milestones/apply insert error:", insertErr)
    return Response.json({ error: "Failed to insert milestones" }, { status: 500 })
  }

  // DELETE old AI milestones only after INSERT succeeds. A delete failure leaves
  // duplicates (old + new), which the user can recover by regenerating; a missing
  // insert cannot be recovered.
  if (toDeleteIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from("launch_milestones")
      .delete()
      .in("id", toDeleteIds)
    if (deleteErr) {
      console.error("milestones/apply delete error (insert already succeeded):", deleteErr)
      // Non-fatal: user sees duplicates until next generation; inserts are durable.
    }
  }

  // Return only newly inserted rows (not any surviving duplicates from a delete failure).
  const { data: finalMilestones } = await supabase
    .from("launch_milestones")
    .select("*")
    .eq("plan_id", planId)
    .not("id", "in", `(${toDeleteIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
    .order("order_index", { ascending: true })

  // Update the config document with the new lastGeneratedAt.
  const lastGeneratedAt = body.lastGeneratedAt ?? new Date().toISOString()
  const { data: existing } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", planId)
    .eq("workspace_key", "opening_month_plan")
    .maybeSingle()

  const config = normalizeLaunchPlanConfig(existing?.content)
  ;(config as unknown as Record<string, unknown>).lastGeneratedAt = lastGeneratedAt

  await supabase
    .from("workspace_documents")
    .upsert(
      { plan_id: planId, workspace_key: "opening_month_plan", content: config },
      { onConflict: "plan_id,workspace_key" },
    )

  return Response.json({
    milestones: finalMilestones ?? inserted ?? [],
    lastGeneratedAt,
  })
}
