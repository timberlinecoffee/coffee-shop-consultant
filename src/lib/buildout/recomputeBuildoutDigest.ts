// TIM-727: Server-side cost rollup for the buildout_equipment workspace.
// Recomputes _digest fields from buildout_equipment_items and contractor_bids,
// then merges the result into workspace_documents.content._digest without
// disturbing other user-authored fields.

import type { SupabaseClient } from "@supabase/supabase-js"

export interface BuildoutDigest {
  equipment_total_cents: number
  must_have_total_cents: number
  nice_to_have_total_cents: number
  buildout_bid_total_cents: number
  open_permits_count: number
  next_milestone?: { key: string; target_date?: string } | null
}

type EquipmentRow = {
  quantity: number
  unit_cost_cents: number
  priority_tier: string
}

type ContractorBid = {
  bid_total_cents: number
  status: string
}

type PermitItem = {
  completed?: boolean | string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recomputeBuildoutDigest(
  planId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<BuildoutDigest | null> {
  const [itemsResult, docResult] = await Promise.all([
    supabase
      .from("buildout_equipment_items")
      .select("quantity, unit_cost_cents, priority_tier")
      .eq("plan_id", planId)
      .eq("archived", false),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "buildout_equipment")
      .maybeSingle(),
  ])

  // No document yet — nothing to update
  if (!docResult.data) return null

  const items = (itemsResult.data ?? []) as EquipmentRow[]

  const equipment_total_cents = items.reduce(
    (acc, i) => acc + i.quantity * i.unit_cost_cents,
    0,
  )
  const must_have_total_cents = items
    .filter((i) => i.priority_tier === "must_have")
    .reduce((acc, i) => acc + i.quantity * i.unit_cost_cents, 0)
  const nice_to_have_total_cents = items
    .filter((i) => i.priority_tier === "nice_to_have")
    .reduce((acc, i) => acc + i.quantity * i.unit_cost_cents, 0)

  const content = (docResult.data.content ?? {}) as Record<string, unknown>
  const contractorBids = (content.contractor_bids ?? []) as ContractorBid[]
  const permits = (content.permits ?? {}) as Record<string, unknown>
  const permitItems = (permits.items ?? []) as PermitItem[]

  const buildout_bid_total_cents = contractorBids
    .filter((b) => b.status === "received" || b.status === "accepted")
    .reduce((acc, b) => acc + b.bid_total_cents, 0)

  const open_permits_count = permitItems.filter(
    (p) => p.completed !== true && p.completed !== "true",
  ).length

  const existingDigest = (content._digest ?? {}) as Record<string, unknown>
  const next_milestone = (existingDigest.next_milestone ?? null) as
    | { key: string; target_date?: string }
    | null

  const digest: BuildoutDigest = {
    equipment_total_cents,
    must_have_total_cents,
    nice_to_have_total_cents,
    buildout_bid_total_cents,
    open_permits_count,
    next_milestone,
  }

  // Merge _digest — preserve user fields in content and any extra fields in
  // the existing digest (e.g. next_milestone set by the timeline card).
  const { error } = await supabase
    .from("workspace_documents")
    .update({
      content: {
        ...content,
        _digest: { ...existingDigest, ...digest },
      },
    })
    .eq("plan_id", planId)
    .eq("workspace_key", "buildout_equipment")

  if (error) {
    console.error("recomputeBuildoutDigest: update failed", error)
    return null
  }

  return digest
}
