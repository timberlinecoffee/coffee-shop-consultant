// TIM-632 / TIM-618-C: Plan snapshot composer.
// Returns §3.3 system-prompt sections 2–4 (User snapshot, Plan snapshot,
// Current workspace) as a single string, plus metadata for model routing in B.

import type { WorkspaceKey } from "@/types/supabase"
import type { SupabaseClient } from "@supabase/supabase-js"

// Rough heuristic: ~4 chars/token. 600 token cap ≈ 2400 chars per workspace.
const TOKEN_CHARS = 4
const MAX_CHARS_PER_WORKSPACE = 600 * TOKEN_CHARS

export const WORKSPACE_KEYS: WorkspaceKey[] = [
  "concept",
  "location_lease",
  "financials",
  "menu_pricing",
  "buildout_equipment",
  "launch_plan",
]

const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  concept: "Concept",
  location_lease: "Location & Lease",
  financials: "Financials",
  menu_pricing: "Menu & Pricing",
  buildout_equipment: "Buildout & Equipment",
  launch_plan: "Launch Plan",
}

export interface PlanSnapshotMetadata {
  totalTokens: number
  workspacesIncluded: WorkspaceKey[]
  truncated: WorkspaceKey[]
}

export interface PlanSnapshotResult {
  snapshot: string
  metadata: PlanSnapshotMetadata
}

interface UserRow {
  full_name?: string | null
  target_opening_date?: string | null
  onboarding_data?: unknown
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_CHARS)
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true
  if (Array.isArray(v) && v.length === 0) return true
  if (typeof v === "object" && v !== null && Object.keys(v as object).length === 0) return true
  return false
}

export function renderJsonbAsMarkdown(content: unknown): string {
  if (isEmptyValue(content)) return "(empty)"
  if (typeof content !== "object") return String(content)

  if (Array.isArray(content)) {
    return content
      .map((v) => `- ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join("\n")
  }

  const entries = Object.entries(content as Record<string, unknown>).filter(
    ([, v]) => !isEmptyValue(v),
  )
  if (entries.length === 0) return "(empty)"

  return entries
    .map(([k, v]) => {
      const label = k.replace(/_/g, " ")
      const formatted = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)
      return `- **${label}**: ${formatted}`
    })
    .join("\n")
}

function renderUserSnapshot(user: UserRow): string {
  const onboarding = (user.onboarding_data ?? {}) as Record<string, unknown>
  const shopType = Array.isArray(onboarding.shop_type)
    ? (onboarding.shop_type as string[]).join(", ")
    : String(onboarding.shop_type ?? "not specified")

  return [
    `- **Name**: ${user.full_name ?? "not specified"}`,
    `- **Budget**: ${String(onboarding.budget ?? "not specified")}`,
    `- **Location**: ${String(onboarding.location ?? "not specified")}`,
    `- **Stage**: ${String(onboarding.stage ?? "not specified")}`,
    `- **Motivation**: ${String(onboarding.motivation ?? "not specified")}`,
    `- **Coffee experience**: ${String(onboarding.coffee_experience ?? "not specified")}`,
    `- **Timeline**: ${String(onboarding.timeline ?? "not specified")}`,
    `- **Shop type**: ${shopType}`,
    `- **Target opening date**: ${user.target_opening_date ?? "not specified"}`,
  ].join("\n")
}

export async function composePlanSnapshot(
  planId: string,
  currentWorkspace: WorkspaceKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<PlanSnapshotResult> {
  // ── 1. Plan → user_id, then users row ────────────────────────────────────
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("user_id, plan_name")
    .eq("id", planId)
    .single()

  let userRow: UserRow = {}
  if (plan?.user_id) {
    const { data: user } = await supabase
      .from("users")
      .select("full_name, target_opening_date, onboarding_data")
      .eq("id", plan.user_id)
      .single()
    if (user) userRow = user as UserRow
  }

  // ── 2. Workspace documents ───────────────────────────────────────────────
  const { data: docs } = await supabase
    .from("workspace_documents")
    .select("workspace_key, content")
    .eq("plan_id", planId)

  const docsByKey = new Map<WorkspaceKey, unknown>()
  for (const d of (docs ?? []) as Array<{ workspace_key: WorkspaceKey; content: unknown }>) {
    docsByKey.set(d.workspace_key, d.content)
  }

  // ── 3. Per-workspace digest with token-cap truncation ────────────────────
  const workspacesIncluded: WorkspaceKey[] = []
  const truncated: WorkspaceKey[] = []
  const workspaceSections: string[] = []

  for (const key of WORKSPACE_KEYS) {
    const isCurrent = key === currentWorkspace
    const heading = `### ${WORKSPACE_LABELS[key]}${isCurrent ? " (current workspace)" : ""}`

    if (!docsByKey.has(key)) {
      workspaceSections.push(`${heading}\n(not started)`)
      continue
    }

    const body = renderJsonbAsMarkdown(docsByKey.get(key))
    if (body === "(empty)") {
      workspaceSections.push(`${heading}\n(empty)`)
      continue
    }

    workspacesIncluded.push(key)
    let finalBody = body
    if (body.length > MAX_CHARS_PER_WORKSPACE) {
      finalBody = body.slice(0, MAX_CHARS_PER_WORKSPACE) + "\n_(truncated)_"
      truncated.push(key)
    }
    workspaceSections.push(`${heading}\n${finalBody}`)
  }

  // ── 4. Assemble sections 2–4 ─────────────────────────────────────────────
  const snapshot = [
    "## User Snapshot",
    renderUserSnapshot(userRow),
    "",
    "## Plan Snapshot (all workspaces)",
    workspaceSections.join("\n\n"),
    "",
    "## Current Workspace",
    `The user is working in: **${WORKSPACE_LABELS[currentWorkspace]}**`,
  ].join("\n")

  return {
    snapshot,
    metadata: {
      totalTokens: estimateTokens(snapshot),
      workspacesIncluded,
      truncated,
    },
  }
}
