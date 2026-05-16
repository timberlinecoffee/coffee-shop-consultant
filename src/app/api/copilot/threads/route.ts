// TIM-634 / TIM-618-E: Conversation thread browser — list endpoint.
// Returns one row per thread for the plan, across all workspaces.
// Auth via Supabase SSR session; plan ownership enforced by RLS.

export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { WorkspaceKey } from "@/types/supabase"

interface ThreadRow {
  thread_id: string | null
  workspace_key: WorkspaceKey | null
  title: string | null
  last_message_at: string | null
  messages: unknown
}

export interface ThreadListItem {
  id: string
  workspace_key: WorkspaceKey
  title: string | null
  last_message_at: string
  message_count: number
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const planId = request.nextUrl.searchParams.get("planId")
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 })

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("thread_id, workspace_key, title, last_message_at, messages")
    .eq("plan_id", planId)
    .not("thread_id", "is", null)
    .not("workspace_key", "is", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const threads: ThreadListItem[] = ((data ?? []) as ThreadRow[])
    .filter(
      (row): row is ThreadRow & { thread_id: string; workspace_key: WorkspaceKey } =>
        Boolean(row.thread_id) && Boolean(row.workspace_key),
    )
    .map((row) => ({
      id: row.thread_id,
      workspace_key: row.workspace_key,
      title: row.title,
      last_message_at: row.last_message_at ?? new Date(0).toISOString(),
      message_count: Array.isArray(row.messages) ? row.messages.length : 0,
    }))

  return NextResponse.json({ threads })
}
