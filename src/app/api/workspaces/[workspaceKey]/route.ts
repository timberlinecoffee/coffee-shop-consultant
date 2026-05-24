// TIM-643 / TIM-819: Workspace document read/write endpoint.
// GET is open (read-only preview). POST/PUT/PATCH require subscription_status === 'active'.
// Returns 402 { reason: 'no_subscription'|'paused'|'expired'|'past_due', tier_required: 'starter' } for inactive subscriptions.
// TIM-959: 'past_due' routes to a billing-failure modal variant distinct from 'no_subscription'.

import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive, isBetaWaived, MUTABLE_WORKSPACE_KEYS } from "@/lib/access"
import type { WorkspaceKey } from "@/types/supabase"
import type { NextRequest } from "next/server"

type RouteContext = { params: Promise<{ workspaceKey: string }> }

function isValidWorkspaceKey(key: string): key is WorkspaceKey {
  return MUTABLE_WORKSPACE_KEYS.has(key as WorkspaceKey)
}

function paywallReason(status: string): "no_subscription" | "paused" | "expired" | "past_due" {
  if (status === "cancelled") return "paused"
  if (status === "expired") return "expired"
  if (status === "past_due") return "past_due"
  return "no_subscription"
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { workspaceKey } = await params

  if (!isValidWorkspaceKey(workspaceKey)) {
    return Response.json({ error: "Invalid workspace key" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content, updated_at")
    .eq("plan_id", plan.id)
    .eq("workspace_key", workspaceKey)
    .maybeSingle()

  return Response.json({ content: doc?.content ?? null, updated_at: doc?.updated_at ?? null })
}

async function writeMutation(request: NextRequest, { params }: RouteContext) {
  const { workspaceKey } = await params

  if (!isValidWorkspaceKey(workspaceKey)) {
    return Response.json({ error: "Invalid workspace key" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Paywall gate — only active subscriptions (or beta-waived accounts) can mutate workspace data.
  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single()

  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return Response.json(
      { reason: paywallReason(profile?.subscription_status ?? "free_trial"), tier_required: "starter" },
      { status: 402 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (body.content === undefined) {
    return Response.json({ error: "Missing content" }, { status: 400 })
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data, error } = await supabase
    .from("workspace_documents")
    .upsert(
      { plan_id: plan.id, workspace_key: workspaceKey, content: body.content },
      { onConflict: "plan_id,workspace_key" }
    )
    .select("id, updated_at")
    .single()

  if (error) {
    console.error("workspace_documents upsert error:", error)
    return Response.json({ error: "Failed to save" }, { status: 500 })
  }

  // TIM-972: Stamp financial_models.needs_review_at when concept or menu_pricing change
  // so the Financials workspace can show a non-blocking review callout.
  if (workspaceKey === "concept" || workspaceKey === "menu_pricing") {
    await supabase
      .from("financial_models")
      .update({ needs_review_at: new Date().toISOString() })
      .eq("plan_id", plan.id)
  }

  return Response.json({ id: data.id, updated_at: data.updated_at })
}

export const POST = writeMutation
export const PUT = writeMutation
export const PATCH = writeMutation

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { workspaceKey } = await params

  if (!isValidWorkspaceKey(workspaceKey)) {
    return Response.json({ error: "Invalid workspace key" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single()

  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return Response.json(
      { reason: paywallReason(profile?.subscription_status ?? "free_trial"), tier_required: "starter" },
      { status: 402 }
    )
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  const { error } = await supabase
    .from("workspace_documents")
    .delete()
    .eq("plan_id", plan.id)
    .eq("workspace_key", workspaceKey)

  if (error) {
    console.error("workspace_documents delete error:", error)
    return Response.json({ error: "Failed to delete" }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
