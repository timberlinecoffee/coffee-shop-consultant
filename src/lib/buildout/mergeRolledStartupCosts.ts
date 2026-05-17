// TIM-727: Helper that injects two derived rows into the startup_costs array,
// pulling live totals from the buildout_equipment workspace _digest.
//
// TODO(TIM-621): Call this helper from the Financials workspace loader once
// TIM-621-DATA/TIM-621-UI ship. The W3 QA child (TIM-621-QA) should verify
// the integration end-to-end.

import type { SupabaseClient } from "@supabase/supabase-js"

export interface StartupCostRow {
  key?: string
  label: string
  amount_cents: number
  _derived?: boolean
  [key: string]: unknown
}

// Returns a new array — does not mutate the input.
// Appends two _derived rows sourced from buildout_equipment._digest:
//   1. "Equipment (from Build-out & Equipment)"  → equipment_total_cents
//   2. "Build-out (from contractor bids)"         → buildout_bid_total_cents
//
// If the workspace document is absent or the digest is empty, both rows are
// appended with amount_cents = 0 so callers get a consistent shape.
export async function mergeRolledStartupCosts(
  planId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  existingStartupCosts: StartupCostRow[],
): Promise<StartupCostRow[]> {
  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", planId)
    .eq("workspace_key", "buildout_equipment")
    .maybeSingle()

  const content = (doc?.content ?? {}) as Record<string, unknown>
  const digest = (content._digest ?? {}) as Record<string, unknown>

  const equipment_total_cents = (digest.equipment_total_cents as number) ?? 0
  const buildout_bid_total_cents =
    (digest.buildout_bid_total_cents as number) ?? 0

  const derived: StartupCostRow[] = [
    {
      key: "_rolled_equipment",
      label: "Equipment (from Build-out & Equipment)",
      amount_cents: equipment_total_cents,
      _derived: true,
    },
    {
      key: "_rolled_buildout",
      label: "Build-out (from contractor bids)",
      amount_cents: buildout_bid_total_cents,
      _derived: true,
    },
  ]

  return [...existingStartupCosts, ...derived]
}
