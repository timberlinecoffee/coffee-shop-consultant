// TIM-618-C will replace this body with full truncation, token counting, and per-workspace summaries.
// This stub reads workspace_documents for the plan and returns a compact markdown digest.

import type { WorkspaceKey } from "@/types/supabase"
import type { SupabaseClient } from "@supabase/supabase-js"

const TOKEN_CHARS = 4 // rough chars-per-token
const MAX_CHARS_PER_WORKSPACE = 600 * TOKEN_CHARS // ~600 tokens

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
