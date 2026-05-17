// TIM-618-C will replace the generic branch with full truncation, token counting, and per-workspace summaries.
// TIM-726 adds the buildout_equipment branch with structured data extraction + AI anchors.

import type { WorkspaceKey } from "@/types/supabase"
import type { SupabaseClient } from "@supabase/supabase-js"
import { classifyMenuProfile } from "@/lib/buildout/classifyMenuProfile"

const TOKEN_CHARS = 4
const MAX_CHARS_PER_WORKSPACE = 600 * TOKEN_CHARS

export async function composePlanSnapshot(
  planId: string,
  currentWorkspace: WorkspaceKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ snapshot: string; estimatedTokens: number; anchors?: string }> {
  if (currentWorkspace === 'buildout_equipment') {
    return composeBuildoutSnapshot(planId, supabase)
  }

  const { data: docs } = await supabase
    .from("workspace_documents")
    .select("workspace_key, content")
    .eq("plan_id", planId)

  if (!docs || docs.length === 0) {
    return { snapshot: "No workspace documents yet.", estimatedTokens: 10 }
  }

  const sections: string[] = []
  for (const doc of docs) {
    const isCurrent = doc.workspace_key === currentWorkspace
    const label = isCurrent
      ? `**${doc.workspace_key.replace(/_/g, " ")} (current workspace)**`
      : doc.workspace_key.replace(/_/g, " ")
    const raw = JSON.stringify(doc.content)
    const body =
      raw.length > MAX_CHARS_PER_WORKSPACE
        ? raw.slice(0, MAX_CHARS_PER_WORKSPACE) + "… [truncated]"
        : raw
    sections.push(`### ${label}\n${body}`)
  }

  const snapshot = sections.join("\n\n")
  return { snapshot, estimatedTokens: Math.ceil(snapshot.length / TOKEN_CHARS) }
}

// ── buildout_equipment branch ─────────────────────────────────────────────────

type RefRow = {
  name_canonical: string
  category: string
  must_have: boolean
  rationale: string | null
}

type EquipmentItem = {
  name: string
  category: string
  unit_cost_cents: number
  quantity: number
  priority_tier: string
}

type ContractorBid = {
  scope: string
  contractor_name: string
  bid_total_cents: number
  scheduled_start?: string
  scheduled_finish?: string
  status: string
}

type Jurisdiction = { city?: string; state_or_region?: string; country?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function composeBuildoutSnapshot(planId: string, supabase: SupabaseClient<any>): Promise<{ snapshot: string; estimatedTokens: number; anchors: string }> {
  const [menuProfile, docResult, equipResult] = await Promise.all([
    classifyMenuProfile(planId, supabase),
    supabase
      .from('workspace_documents')
      .select('content')
      .eq('plan_id', planId)
      .eq('workspace_key', 'buildout_equipment')
      .maybeSingle(),
    supabase
      .from('buildout_equipment_items')
      .select('name, category, unit_cost_cents, quantity, priority_tier')
      .eq('plan_id', planId)
      .eq('archived', false)
      .order('unit_cost_cents', { ascending: false })
      .limit(5),
  ])

  const content = ((docResult.data?.content ?? {}) as Record<string, unknown>)
  const digest = ((content._digest ?? {}) as Record<string, unknown>)
  const contractorBids = ((content.contractor_bids ?? []) as ContractorBid[])
  const permits = ((content.permits ?? {}) as Record<string, unknown>)
  const jurisdiction = (permits.jurisdiction ?? null) as Jurisdiction | null

  const lines: string[] = [
    `### buildout equipment (current workspace)`,
    `menu_profile: ${menuProfile}`,
    '',
  ]

  // _digest summary
  const digestKeys = Object.keys(digest)
  if (digestKeys.length > 0) {
    const parts: string[] = []
    if (digest.equipment_count != null) parts.push(`${digest.equipment_count} items`)
    if (digest.must_have_count != null) parts.push(`must_have: ${digest.must_have_count}`)
    if (digest.must_have_total_cents != null) parts.push(`must_have total: $${fmt(digest.must_have_total_cents as number)}`)
    if (digest.nice_to_have_total_cents != null) parts.push(`nice_to_have total: $${fmt(digest.nice_to_have_total_cents as number)}`)
    if (digest.buildout_bid_total_cents != null) parts.push(`bid total: $${fmt(digest.buildout_bid_total_cents as number)}`)
    if (digest.open_permits_count != null) parts.push(`open permits: ${digest.open_permits_count}`)
    if (digest.next_milestone != null) {
      const nm = digest.next_milestone as Record<string, string>
      parts.push(`next milestone: ${nm.key ?? ''}${nm.target_date ? ` (${nm.target_date})` : ''}`)
    }
    lines.push(`_digest: ${parts.join(' · ')}`)
  } else {
    lines.push(`_digest: (empty)`)
  }

  // Top 5 equipment by cost
  const equip = (equipResult.data ?? []) as EquipmentItem[]
  if (equip.length > 0) {
    lines.push('')
    lines.push('Top equipment by cost:')
    for (const item of equip) {
      const subtotal = item.unit_cost_cents * item.quantity
      lines.push(`- ${item.name}, qty ${item.quantity}, $${fmt(subtotal)} [${item.priority_tier}]`)
    }
  }

  // All non-rejected contractor bids
  const activeBids = contractorBids.filter(b => b.status !== 'rejected')
  if (activeBids.length > 0) {
    lines.push('')
    lines.push('Contractor bids:')
    for (const bid of activeBids) {
      const total = `$${fmt(bid.bid_total_cents)}`
      const dates = [bid.scheduled_start, bid.scheduled_finish].filter(Boolean).join('–')
      lines.push(`- ${bid.scope} / ${bid.contractor_name}: ${total} (${bid.status})${dates ? ` ${dates}` : ''}`)
    }
  }

  // Jurisdiction
  if (jurisdiction) {
    const jStr = [jurisdiction.city, jurisdiction.state_or_region, jurisdiction.country].filter(Boolean).join(', ')
    if (jStr) {
      lines.push('')
      lines.push(`Permits jurisdiction: ${jStr}`)
    }
  }

  const snapshot = lines.join('\n')

  // Fetch reference data for anchors
  const { data: refRows } = await supabase
    .from('standard_equipment_reference')
    .select('name_canonical, category, must_have, rationale')
    .eq('menu_profile', menuProfile)
    .order('must_have', { ascending: false })
    .order('category')

  const anchors = buildBuildoutAnchors(menuProfile, refRows as RefRow[] | null, jurisdiction)

  return { snapshot, estimatedTokens: Math.ceil(snapshot.length / TOKEN_CHARS), anchors }
}

function fmt(cents: number): string {
  return Math.round(cents / 100).toLocaleString()
}

function buildBuildoutAnchors(
  menuProfile: string,
  refRows: RefRow[] | null,
  jurisdiction: Jurisdiction | null,
): string {
  const parts: string[] = [
    '## Build-out & Equipment Coaching Anchors',
    '',
    `### Standard Equipment (menu_profile: ${menuProfile})`,
    '',
    "Cross-reference the user's equipment list against every item below. Name each must-have item missing from their list. Cite the rationale field verbatim — do not paraphrase. Do not invent equipment not in this list.",
    '',
  ]

  if (refRows && refRows.length > 0) {
    for (const row of refRows) {
      const flag = row.must_have ? 'MUST-HAVE' : 'optional'
      parts.push(`- ${row.name_canonical} [${row.category}, ${flag}]: ${row.rationale ?? ''}`)
    }
  } else {
    parts.push('(no reference data available for this menu profile)')
  }

  parts.push('')
  parts.push('### Permits Guidance')
  parts.push('')

  const jStr = jurisdiction
    ? [jurisdiction.city, jurisdiction.state_or_region, jurisdiction.country].filter(Boolean).join(', ')
    : null

  if (jStr) {
    parts.push(`For the user's jurisdiction (${jStr}), name the typical permit set (building, health, sign, food-handler, and if applicable liquor). You MUST include this disclaimer verbatim: "This is best-effort general guidance; confirm with the local jurisdiction." Do not fabricate specific filing fees, form numbers, or processing times.`)
  } else {
    parts.push("The user has not set their permits jurisdiction yet. Ask them for their city and state. When discussing permits, include this disclaimer verbatim: \"This is best-effort general guidance; confirm with the local jurisdiction.\" Do not fabricate specific filing fees, form numbers, or processing times.")
  }

  return parts.join('\n')
}
