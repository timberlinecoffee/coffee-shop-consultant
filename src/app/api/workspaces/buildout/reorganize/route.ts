// TIM-1637: Bulk section-assignment + position update for equipment items.
// Called by CoPilotDrawer's onApply after Scout's reorganize_equipment_list tool is accepted.

import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import type { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single()

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 })
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: { items: { item_id: string; section_id: string | null; position: number }[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return Response.json({ error: "items array is required" }, { status: 400 })
  }

  const itemIds = body.items.map((i) => i.item_id)

  // Ownership check — all items must belong to this plan.
  const { data: owned } = await supabase
    .from("buildout_equipment_items")
    .select("id")
    .eq("plan_id", plan.id)
    .in("id", itemIds)

  const ownedIds = new Set((owned ?? []).map((r) => r.id))
  const unauthorized = body.items.filter((i) => !ownedIds.has(i.item_id))
  if (unauthorized.length > 0) {
    return Response.json({ error: "Some items do not belong to this plan" }, { status: 403 })
  }

  const updates = await Promise.all(
    body.items.map((item) =>
      supabase
        .from("buildout_equipment_items")
        .update({ section_id: item.section_id, position: item.position })
        .eq("id", item.item_id)
        .eq("plan_id", plan.id),
    ),
  )

  const failed = updates.filter((u) => u.error)
  if (failed.length > 0) {
    console.error("reorganize: some items failed to update", failed.map((u) => u.error))
    return Response.json({ error: "Some items failed to update" }, { status: 500 })
  }

  return Response.json({ updated: body.items.length })
}
