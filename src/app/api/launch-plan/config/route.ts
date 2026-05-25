// TIM-1040: Launch plan config (targetLaunchDate, lastGeneratedAt, viewPreference, sourcesSnapshotAt).
// Stored in workspace_documents with key 'launch_plan'.
import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { normalizeLaunchPlanConfig } from "@/lib/launch-plan"
import type { NextRequest } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content, updated_at")
    .eq("plan_id", plan.id)
    .eq("workspace_key", "launch_plan")
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

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  // Merge patch into existing config.
  const { data: existing } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", plan.id)
    .eq("workspace_key", "launch_plan")
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
      { plan_id: plan.id, workspace_key: "launch_plan", content: current },
      { onConflict: "plan_id,workspace_key" }
    )
    .select("id, updated_at")
    .single()

  if (error) return Response.json({ error: "Failed to save config" }, { status: 500 })
  return Response.json({ config: current, updated_at: data.updated_at })
}
