// TIM-618-C + TIM-735: Workspace snapshot composer with launch_plan branch.
// Generic workspaces read workspace_documents; launch_plan queries structured tables directly.

import type { WorkspaceKey } from "@/types/supabase"
import type { SupabaseClient } from "@supabase/supabase-js"

const TOKEN_CHARS = 4 // rough chars-per-token
const MAX_CHARS_PER_WORKSPACE = 600 * TOKEN_CHARS // ~600 tokens

export type LaunchMeta = {
  launchDate: string | null
  today: string
  tMinus: number | null
  standardMilestoneTitles: string[]
}

export async function composePlanSnapshot(
  planId: string,
  currentWorkspace: WorkspaceKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ snapshot: string; estimatedTokens: number; launchMeta?: LaunchMeta }> {
  if (currentWorkspace === "launch_plan") {
    return composeLaunchPlanSnapshot(planId, supabase)
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function composeLaunchPlanSnapshot(
  planId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ snapshot: string; estimatedTokens: number; launchMeta: LaunchMeta }> {
  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: timelineItems },
    { data: softItems },
    { data: mktItems },
    { data: hiringRoles },
    { data: stdMilestones },
  ] = await Promise.all([
    supabase
      .from("launch_timeline_items")
      .select("milestone, target_date, status, order_index")
      .eq("plan_id", planId)
      .order("order_index", { ascending: true }),
    supabase
      .from("soft_open_plan_items")
      .select("day_offset, status")
      .eq("plan_id", planId),
    supabase
      .from("marketing_kickoff_items")
      .select("channel, asset, status")
      .eq("plan_id", planId),
    supabase
      .from("hiring_plan_roles")
      .select("role_title, headcount, status, monthly_cost_cents")
      .eq("plan_id", planId),
    supabase
      .from("standard_launch_milestones")
      .select("title, day_offset")
      .order("day_offset", { ascending: true }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const milestones: any[] = timelineItems ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const softOpenItems: any[] = softItems ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marketingItems: any[] = mktItems ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles: any[] = hiringRoles ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stdTitles: string[] = (stdMilestones ?? []).map((m: any) => m.title as string)

  // Planned launch date: latest non-null target_date across all timeline milestones
  // (Day 0 / opening day is typically the last milestone to reach).
  const datedMilestones = milestones.filter((m) => m.target_date)
  const launchDate: string | null =
    datedMilestones.length > 0
      ? datedMilestones.reduce(
          (max: string, m: { target_date: string }) => (m.target_date > max ? m.target_date : max),
          datedMilestones[0].target_date as string,
        )
      : null

  const tMinus =
    launchDate !== null
      ? Math.ceil((new Date(launchDate).getTime() - new Date(today).getTime()) / 86_400_000)
      : null

  // Milestone status counts
  const statusCounts: Record<string, number> = {}
  for (const m of milestones) {
    statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1
  }

  // Next 3 upcoming: not done, soonest target_date first
  const upcoming = milestones
    .filter((m) => m.status !== "done" && m.target_date)
    .sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
    .slice(0, 3)

  // At-risk: explicitly flagged OR target_date past with status≠done
  const atRisk = milestones.filter(
    (m) => m.status === "at_risk" || (m.target_date && m.target_date < today && m.status !== "done"),
  )

  // Soft-open counts by bucket (mirrors SoftOpenPlanCard buckets)
  const BUCKETS = [
    { label: "Pre-open (D-7..D-1)", min: -7, max: -1 },
    { label: "Day 0", min: 0, max: 0 },
    { label: "Week 1 (D+1..D+7)", min: 1, max: 7 },
    { label: "Month 1 (D+8..D+30)", min: 8, max: 30 },
  ]
  const bucketLines: string[] = []
  for (const b of BUCKETS) {
    const matching = softOpenItems.filter((i) => i.day_offset >= b.min && i.day_offset <= b.max)
    if (matching.length === 0) continue
    const done = matching.filter((i) => i.status === "done").length
    bucketLines.push(`- ${b.label}: ${done}/${matching.length} done`)
  }

  // Marketing: unique channels + status counts
  const channels = [...new Set(marketingItems.map((i) => i.channel as string))]
  const mktStatusCounts: Record<string, number> = {}
  for (const i of marketingItems) {
    mktStatusCounts[i.status] = (mktStatusCounts[i.status] ?? 0) + 1
  }

  // Hiring: open roles (not yet hired) + monthly payroll subtotal
  const openRoles = roles.filter((r) => r.status !== "hired")
  const payrollCents = roles.reduce((sum: number, r) => sum + (r.monthly_cost_cents ?? 0), 0)

  // Missing milestones vs standard reference (case-insensitive title match)
  const milestoneLower = new Set(milestones.map((m) => (m.milestone as string).toLowerCase()))
  const missing = stdTitles.filter((t) => !milestoneLower.has(t.toLowerCase()))

  // Assemble snapshot markdown
  const lines: string[] = ["## Launch Plan Snapshot"]

  lines.push(`\n### Timeline (${milestones.length} items)`)
  if (Object.keys(statusCounts).length > 0) {
    lines.push(`Status: ${Object.entries(statusCounts).map(([k, v]) => `${k} ${v}`).join(" · ")}`)
  } else {
    lines.push("No milestones yet.")
  }
  if (upcoming.length > 0) {
    lines.push("Upcoming:")
    for (const m of upcoming) {
      lines.push(`- ${m.milestone} — ${m.target_date} [${m.status}]`)
    }
  }
  if (atRisk.length > 0) {
    lines.push(`⚠ At-risk / overdue (${atRisk.length}):`)
    for (const m of atRisk.slice(0, 5)) {
      lines.push(`- ${m.milestone} — target ${m.target_date ?? "no date"} [${m.status}]`)
    }
  }

  lines.push(`\n### Soft-Open Plan (${softOpenItems.length} items)`)
  if (bucketLines.length > 0) {
    lines.push(...bucketLines)
  } else {
    lines.push("No items yet.")
  }

  lines.push(`\n### Marketing Kickoff (${marketingItems.length} items)`)
  if (channels.length > 0) lines.push(`Channels: ${channels.join(", ")}`)
  if (Object.keys(mktStatusCounts).length > 0) {
    lines.push(`Status: ${Object.entries(mktStatusCounts).map(([k, v]) => `${k} ${v}`).join(" · ")}`)
  } else {
    lines.push("No items yet.")
  }

  lines.push(`\n### Hiring Plan (${roles.length} roles)`)
  if (roles.length > 0) {
    lines.push(
      `Open (${openRoles.length}): ${
        openRoles.length > 0
          ? openRoles.map((r) => `${r.role_title as string} ×${r.headcount as number}`).join(", ")
          : "none"
      }`,
    )
    lines.push(
      `Monthly payroll: $${(payrollCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
    )
  } else {
    lines.push("No roles yet.")
  }

  if (missing.length > 0) {
    lines.push(`\n### Missing vs Standard Milestones`)
    for (const t of missing.slice(0, 6)) {
      lines.push(`- ${t}`)
    }
    if (missing.length > 6) lines.push(`(+${missing.length - 6} more)`)
  }

  const snapshot = lines.join("\n")
  return {
    snapshot,
    estimatedTokens: Math.ceil(snapshot.length / TOKEN_CHARS),
    launchMeta: { launchDate, today, tMinus, standardMilestoneTitles: stdTitles },
  }
}
