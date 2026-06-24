// TIM-1040: Launch plan milestone — update and delete by ID.
// TIM-2980: Resolve via `getActivePlanId` so update/delete operate on the same
// plan the rest of the launch-plan suite sees (mirrors TIM-2965 / TIM-2377).
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import type { NextRequest } from "next/server"

type RouteCtx = { params: Promise<{ id: string }> }

async function getAuthedPlan() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, planId: null }

  const planId = await getActivePlanId(supabase, user.id)
  return { supabase, user, planId }
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const { id } = await params
  const { supabase, user, planId } = await getAuthedPlan()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single()

  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Only allow safe fields; always mark user_edited=true when user edits.
  const allowed = [
    "title", "description", "track", "target_date", "actual_date",
    "status", "estimated_duration_days", "depends_on_milestone_ids",
    "critical_path", "owner", "ai_notes", "user_edited", "order_index",
  ]
  const patch: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) patch[k] = body[k]
  }

  // If any field other than status is changed and user_edited not explicitly set,
  // mark as user_edited so regenerate won't overwrite it.
  const nonStatusFields = allowed.filter((k) => k !== "status" && k !== "user_edited")
  if (nonStatusFields.some((k) => k in body) && !("user_edited" in body)) {
    patch.user_edited = true
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("launch_milestones")
    .update(patch)
    .eq("id", id)
    .eq("plan_id", planId)
    .select("*")
    .single()

  if (error) return Response.json({ error: "Failed to update" }, { status: 500 })
  return Response.json({ milestone: data })
}

export async function DELETE(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params
  const { supabase, user, planId } = await getAuthedPlan()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single()

  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 })
  }

  const { error } = await supabase
    .from("launch_milestones")
    .delete()
    .eq("id", id)
    .eq("plan_id", planId)

  if (error) return Response.json({ error: "Failed to delete" }, { status: 500 })
  return new Response(null, { status: 204 })
}
