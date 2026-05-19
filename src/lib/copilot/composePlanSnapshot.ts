// TIM-618-C / TIM-619: Compose a plan-aware context snapshot for the AI co-pilot.
// Reads workspace_documents for the plan and renders a per-workspace digest.
// Concept gets structured bullet formatting so the AI can suggest precise edits;
// other workspaces fall back to truncated JSON until they ship their formatters.

import type { WorkspaceKey } from "@/types/supabase"
import type { SupabaseClient } from "@supabase/supabase-js"
import { formatConceptForAI, normalizeConcept } from "@/lib/concept"

const TOKEN_CHARS = 4 // rough chars-per-token
const MAX_CHARS_PER_WORKSPACE = 600 * TOKEN_CHARS // ~600 tokens

const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  concept: "Concept",
  location_lease: "Location & Lease",
  financials: "Financials",
  menu_pricing: "Menu & Pricing",
  buildout_equipment: "Build-out & Equipment",
  launch_plan: "Launch Plan",
}

function renderContent(workspaceKey: WorkspaceKey, content: unknown): string {
  if (workspaceKey === "concept") {
    return formatConceptForAI(normalizeConcept(content))
  }
  const raw = JSON.stringify(content)
  if (!raw || raw === "{}" || raw === "null") return "_no content yet_"
  return raw.length > MAX_CHARS_PER_WORKSPACE
    ? raw.slice(0, MAX_CHARS_PER_WORKSPACE) + "… [truncated]"
    : raw
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
