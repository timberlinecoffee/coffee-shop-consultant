// TIM-618-C will replace this body with full truncation, token counting, and per-workspace summaries.
// This stub reads workspace_documents for the plan and returns a compact markdown digest.
// TIM-781: location_lease section now served from relational tables instead of workspace_documents.

import type { WorkspaceKey } from "@/types/supabase"
import type { SupabaseClient } from "@supabase/supabase-js"

const TOKEN_CHARS = 4 // rough chars-per-token
const MAX_CHARS_PER_WORKSPACE = 600 * TOKEN_CHARS // ~600 tokens

const RUBRIC_FACTOR_LABELS: Record<string, string> = {
  foot_traffic: "Foot Traffic",
  parking_transit: "Parking/Transit",
  visibility: "Visibility",
  neighborhood_fit: "Neighborhood Fit",
  buildout_cost_estimate: "Buildout Cost",
  lease_terms: "Lease Terms",
}

function fmtDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function composeLocationLeaseSection(planId: string, supabase: SupabaseClient<any>): Promise<string> {
  const { data: candidates } = await supabase
    .from("location_candidates")
    .select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("position")

  if (!candidates?.length) {
    return "No location candidates added yet."
  }

  const candidateIds = candidates.map((c: { id: string }) => c.id)

  const [{ data: rubricScores }, { data: leaseTerms }] = await Promise.all([
    supabase
      .from("location_rubric_scores")
      .select("candidate_id, factor_key, score_1_5")
      .in("candidate_id", candidateIds),
    supabase
      .from("location_lease_terms")
      .select(
        "candidate_id, base_rent_cents, rent_escalation_pct, personal_guarantee, exit_clauses, term_months, ti_allowance_cents",
      )
      .in("candidate_id", candidateIds),
  ])

  // Build lookup maps
  const rubricByCand = new Map<string, Array<{ factor_key: string; score_1_5: number | null }>>()
  for (const score of rubricScores ?? []) {
    const arr = rubricByCand.get(score.candidate_id) ?? []
    arr.push(score)
    rubricByCand.set(score.candidate_id, arr)
  }

  type LeaseRow = {
    base_rent_cents: number | null
    rent_escalation_pct: number | null
    personal_guarantee: string | null
    exit_clauses: string | null
    term_months: number | null
    ti_allowance_cents: number | null
  }
  const leaseByCand = new Map<string, LeaseRow>()
  for (const lt of leaseTerms ?? []) {
    leaseByCand.set(lt.candidate_id, lt)
  }

  const sections: string[] = []

  for (const c of candidates) {
    const sorted = (rubricByCand.get(c.id) ?? [])
      .filter((s: { score_1_5: number | null }) => s.score_1_5 !== null)
      .sort(
        (a: { score_1_5: number | null }, b: { score_1_5: number | null }) =>
          (b.score_1_5 ?? 0) - (a.score_1_5 ?? 0),
      )

    const strengths = sorted.slice(0, 3)
    const strengthKeys = new Set(strengths.map((s: { factor_key: string }) => s.factor_key))
    const weaknesses = sorted
      .slice()
      .reverse()
      .slice(0, 3)
      .filter((s: { factor_key: string }) => !strengthKeys.has(s.factor_key))

    const lease = leaseByCand.get(c.id)

    const lines: string[] = [
      `#### ${c.name}`,
      `- Address: ${c.address ?? "not set"}`,
      `- Neighborhood: ${c.neighborhood ?? "not set"}`,
      `- Size: ${c.sq_ft != null ? `${c.sq_ft} sq ft` : "not set"}`,
      `- Asking Rent: ${c.asking_rent_cents != null ? `${fmtDollars(c.asking_rent_cents)}/mo` : "not set"}`,
      `- Status: ${c.status}`,
    ]

    if (strengths.length > 0) {
      lines.push(
        `- Top Strengths: ${strengths.map((s: { factor_key: string; score_1_5: number | null }) => `${RUBRIC_FACTOR_LABELS[s.factor_key] ?? s.factor_key} (${s.score_1_5}/5)`).join(", ")}`,
      )
    }
    if (weaknesses.length > 0) {
      lines.push(
        `- Top Weaknesses: ${weaknesses.map((s: { factor_key: string; score_1_5: number | null }) => `${RUBRIC_FACTOR_LABELS[s.factor_key] ?? s.factor_key} (${s.score_1_5}/5)`).join(", ")}`,
      )
    }

    if (lease) {
      const hasExitClause = (lease.exit_clauses ?? "").trim().length > 0
      lines.push(
        `- Base Rent: ${lease.base_rent_cents != null ? `${fmtDollars(lease.base_rent_cents)}/mo` : "not set"}`,
        `- Escalation: ${lease.rent_escalation_pct != null ? `${lease.rent_escalation_pct}%/yr` : "not set"}`,
        `- PG: ${lease.personal_guarantee ?? "not set"}${hasExitClause ? "" : " (no exit clause)"}`,
        `- Term: ${lease.term_months != null ? `${lease.term_months} months` : "not set"}`,
        `- TI Allowance: ${lease.ti_allowance_cents != null ? fmtDollars(lease.ti_allowance_cents) : "not set"}`,
      )
    }

    sections.push(lines.join("\n"))
  }

  return sections.join("\n\n")
}

export async function composePlanSnapshot(
  planId: string,
  currentWorkspace: WorkspaceKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ snapshot: string; estimatedTokens: number }> {
  const { data: docs } = await supabase
    .from("workspace_documents")
    .select("workspace_key, content")
    .eq("plan_id", planId)

  const sections: string[] = []

  // Process workspace_documents; skip location_lease — served from relational tables below.
  for (const doc of docs ?? []) {
    if (doc.workspace_key === "location_lease") continue
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

  // Always inject location_lease from relational tables.
  const leaseIsCurrent = currentWorkspace === "location_lease"
  const leaseLabel = leaseIsCurrent
    ? `**location lease (current workspace)**`
    : `location lease`
  const leaseContent = await composeLocationLeaseSection(planId, supabase)
  sections.push(`### ${leaseLabel}\n${leaseContent}`)

  if (sections.length === 0) {
    return { snapshot: "No workspace documents yet.", estimatedTokens: 10 }
  }

  const snapshot = sections.join("\n\n")
  return { snapshot, estimatedTokens: Math.ceil(snapshot.length / TOKEN_CHARS) }
}
