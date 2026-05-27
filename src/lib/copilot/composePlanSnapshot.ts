// TIM-618-C / TIM-619: Compose a plan-aware context snapshot for the AI co-pilot.
// Reads workspace_documents for the plan and renders a per-workspace digest.
// Concept gets structured bullet formatting so the AI can suggest precise edits;
// other workspaces fall back to truncated JSON until they ship their formatters.

import type { WorkspaceKey } from "@/types/supabase"
import type { SupabaseClient } from "@supabase/supabase-js"
import { formatConceptV2ForAI, normalizeConceptV2 } from "@/lib/concept"
import { formatMarketingPreLaunchForAI, normalizeMarketingPreLaunch } from "@/lib/marketing-pre-launch"

const TOKEN_CHARS = 4 // rough chars-per-token
const MAX_CHARS_PER_WORKSPACE = 600 * TOKEN_CHARS // ~600 tokens

const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  concept: "Concept",
  location_lease: "Location & Lease",
  financials: "Financials",
  menu_pricing: "Menu & Pricing",
  buildout_equipment: "Build-out & Equipment",
  launch_plan: "Launch Plan",
  hiring: "Hiring & Onboarding",
  marketing: "Marketing",
  suppliers: "Suppliers & Vendors",
  operations_playbook: "Operations Playbook",
  marketing_pre_launch: "Marketing & Pre-Launch",
}

function renderContent(workspaceKey: WorkspaceKey, content: unknown): string {
  if (workspaceKey === "concept") {
    return formatConceptV2ForAI(normalizeConceptV2(content))
  }
  if (workspaceKey === "marketing_pre_launch") {
    return formatMarketingPreLaunchForAI(normalizeMarketingPreLaunch(content))
  }
  const raw = JSON.stringify(content)
  if (!raw || raw === "{}" || raw === "null") return "_no content yet_"
  return raw.length > MAX_CHARS_PER_WORKSPACE
    ? raw.slice(0, MAX_CHARS_PER_WORKSPACE) + "… [truncated]"
    : raw
}

export async function composePlanSnapshot(
  planId: string,
  // TIM-1149: null = general conversation; no workspace is marked "current".
  currentWorkspace: WorkspaceKey | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ snapshot: string; estimatedTokens: number }> {
  const { data: docs } = await supabase
    .from("workspace_documents")
    .select("workspace_key, content")
    .eq("plan_id", planId)

  if (!docs || docs.length === 0) {
    return { snapshot: "No workspace documents yet.", estimatedTokens: 10 }
  }

  const sections: string[] = []
  for (const doc of docs) {
    const workspaceKey = doc.workspace_key as WorkspaceKey
    const isCurrent = workspaceKey === currentWorkspace
    const label = WORKSPACE_LABELS[workspaceKey] ?? workspaceKey
    const heading = isCurrent ? `### ${label} (current workspace)` : `### ${label}`
    const body = renderContent(workspaceKey, doc.content)
    sections.push(`${heading}\n${body}`)
  }

  const snapshot = sections.join("\n\n")
  return { snapshot, estimatedTokens: Math.ceil(snapshot.length / TOKEN_CHARS) }
}

export async function composeAllWorkspacesSnapshot(
  planId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ snapshots: { key: string; text: string }[]; totalChars: number }> {
  const { data: docs } = await supabase
    .from("workspace_documents")
    .select("workspace_key, content")
    .eq("plan_id", planId)

  if (!docs || docs.length === 0) {
    return { snapshots: [], totalChars: 0 }
  }

  const snapshots = docs.map((doc) => ({
    key: doc.workspace_key as string,
    text: renderContent(doc.workspace_key as WorkspaceKey, doc.content),
  }))

  const totalChars = snapshots.reduce((sum, s) => sum + s.text.length, 0)
  return { snapshots, totalChars }
}
