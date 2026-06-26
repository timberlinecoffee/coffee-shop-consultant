// TIM-1040: Launch plan milestones — list and create.
// TIM-2980: switched off inline latest-by-created plan resolver — use canonical
// getActivePlanId (TIM-2377) so plan ID agrees with users.current_plan_id.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import type { NextRequest } from "next/server"
import type { TrackKey, MilestoneStatus } from "@/lib/launch-plan"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data, error: dbErr } = await supabase
    .from("launch_milestones")
    .select("*")
    .eq("plan_id", planId!)
    .order("order_index", { ascending: true })
    .order("target_date", { ascending: true })

  if (dbErr) return Response.json({ error: "Failed to load milestones" }, { status: 500 })
  return Response.json({ milestones: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const planId = await getActivePlanId(supabase, user.id)
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

  const {
    title, description, track, target_date, status: mStatus,
    estimated_duration_days, depends_on_milestone_ids,
    critical_path, owner, ai_notes, user_edited, source, order_index,
  } = body as {
    title?: string
    description?: string | null
    track?: TrackKey
    target_date?: string | null
    status?: MilestoneStatus
    estimated_duration_days?: number | null
    depends_on_milestone_ids?: string[]
    critical_path?: boolean
    owner?: string
    ai_notes?: string | null
    user_edited?: boolean
    source?: 'ai_generated' | 'user_added'
    order_index?: number
  }

  if (!title?.trim()) return Response.json({ error: "title is required" }, { status: 400 })
  if (!track) return Response.json({ error: "track is required" }, { status: 400 })

  const { count } = await supabase
    .from("launch_milestones")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", planId!)

  const { data, error: dbErr } = await supabase
    .from("launch_milestones")
    .insert({
      plan_id: planId!,
      title: title.trim(),
      description: description ?? null,
      track,
      target_date: target_date ?? null,
      status: mStatus ?? "not_started",
      estimated_duration_days: estimated_duration_days ?? null,
      depends_on_milestone_ids: depends_on_milestone_ids ?? [],
      critical_path: critical_path ?? false,
      owner: owner ?? "founder",
      ai_notes: ai_notes ?? null,
      user_edited: user_edited ?? false,
      source: source ?? "user_added",
      order_index: typeof order_index === "number" ? order_index : (count ?? 0),
    })
    .select("*")
    .single()

  if (dbErr) return Response.json({ error: "Failed to create milestone" }, { status: 500 })
  return Response.json({ milestone: data }, { status: 201 })
}
