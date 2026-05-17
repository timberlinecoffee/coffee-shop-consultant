// TIM-634 / TIM-618-E: Single-thread fetch — returns the messages array
// so the drawer can replace history with initialMessages on selection.

export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { WorkspaceKey } from "@/types/supabase"

interface ThreadDetailRow {
  thread_id: string
  workspace_key: WorkspaceKey
  title: string | null
  last_message_at: string | null
  messages: unknown
}

interface PersistedMessage {
  role: "user" | "assistant"
  content: string
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await context.params
  if (!threadId) return NextResponse.json({ error: "threadId is required" }, { status: 400 })

  const planId = request.nextUrl.searchParams.get("planId")
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("thread_id, workspace_key, title, last_message_at, messages")
    .eq("plan_id", planId)
    .eq("thread_id", threadId)
    .maybeSingle<ThreadDetailRow>()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Thread not found" }, { status: 404 })

  const raw = Array.isArray(data.messages) ? (data.messages as unknown[]) : []
  const messages: PersistedMessage[] = raw
    .filter(
      (entry): entry is { role: unknown; content: unknown } =>
        typeof entry === "object" && entry !== null && "role" in entry && "content" in entry,
    )
    .filter((entry) => entry.role === "user" || entry.role === "assistant")
    .map((entry) => ({
      role: entry.role as "user" | "assistant",
      content: String(entry.content ?? ""),
    }))

  return NextResponse.json({
    id: data.thread_id,
    workspace_key: data.workspace_key,
    title: data.title,
    last_message_at: data.last_message_at,
    messages,
  })
}
