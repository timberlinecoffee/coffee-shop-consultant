// TIM-1449: Opening Month Plan workspace config (targetLaunchDate, lastGeneratedAt,
// viewPreference, sourcesSnapshotAt). Stored in workspace_documents with key
// 'opening_month_plan' (collapsed from the short-lived opening_milestones split in TIM-1411).
// TIM-2980: switched off inline latest-by-created plan resolver — use canonical
// getActivePlanId (TIM-2377) so plan ID agrees with users.current_plan_id.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { normalizeLaunchPlanConfig } from "@/lib/launch-plan"
import type { NextRequest } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content, updated_at")
    .eq("plan_id", planId)
    .eq("workspace_key", "opening_month_plan")
    .maybeSingle()

  return Response.json({ config: normalizeLaunchPlanConfig(doc?.content), updated_at: doc?.updated_at ?? null })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

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

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  // Merge patch into existing config.
  const { data: existing } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", planId)
    .eq("workspace_key", "opening_month_plan")
    .maybeSingle()

  const current = normalizeLaunchPlanConfig(existing?.content)
  const allowed = ["targetLaunchDate", "lastGeneratedAt", "viewPreference", "sourcesSnapshotAt"]
  const mutable = current as unknown as Record<string, unknown>
  for (const k of allowed) {
    if (k in body) mutable[k] = body[k]
  }

  const { data, error } = await supabase
    .from("workspace_documents")
    .upsert(
      { plan_id: planId, workspace_key: "opening_month_plan", content: current },
      { onConflict: "plan_id,workspace_key" }
    )
    .select("id, updated_at")
    .single()

  if (error) return Response.json({ error: "Failed to save config" }, { status: 500 })
  return Response.json({ config: current, updated_at: data.updated_at })
}
