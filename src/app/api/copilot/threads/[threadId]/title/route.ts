// TIM-634 / TIM-618-E: Auto-title route. Drawer calls this after the 3rd message.
// Asks Claude for a ≤6-word title from the first user message and stores it.

export const runtime = "nodejs"
export const maxDuration = 30

import { NextResponse, type NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"

const TITLE_MODEL = "claude-haiku-4-5-20251001"
const MAX_WORDS = 6
const SYSTEM_PROMPT =
  "You title coffee-shop coaching conversations. Reply with the title only — at most six words, no quotes, no trailing punctuation, Title Case."

function clampToWords(value: string, maxWords: number): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/^["'`\s]+|["'`.?!\s]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ")
}

interface TitleBody {
  planId?: string
  firstUserMessage?: string
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await context.params
  if (!threadId) return NextResponse.json({ error: "threadId is required" }, { status: 400 })

  let body: TitleBody
  try {
    body = (await request.json()) as TitleBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const planId = body.planId
  const firstUserMessage = body.firstUserMessage?.trim()
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 })
  if (!firstUserMessage) {
    return NextResponse.json({ error: "firstUserMessage is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Confirm the thread exists and belongs to the caller (RLS enforces plan ownership).
  const { data: existing, error: lookupError } = await supabase
    .from("ai_conversations")
    .select("id, title")
    .eq("plan_id", planId)
    .eq("thread_id", threadId)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: "Thread not found" }, { status: 404 })

  // Idempotent: if a real title is already set, return it.
  if (existing.title && existing.title.trim().length > 0) {
    return NextResponse.json({ title: existing.title, regenerated: false })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Title model is unavailable." }, { status: 503 })
  }

  const anthropic = new Anthropic({ apiKey })

  let rawTitle = ""
  try {
    const response = await anthropic.messages.create({
      model: TITLE_MODEL,
      max_tokens: 40,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `First message:\n${firstUserMessage.slice(0, 2_000)}\n\nReturn just the title.`,
        },
      ],
    })
    for (const block of response.content) {
      if (block.type === "text") rawTitle += block.text
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Title generation failed."
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const title = clampToWords(rawTitle, MAX_WORDS)
  if (!title) return NextResponse.json({ error: "Empty title from model." }, { status: 502 })

  const { error: updateError } = await supabase
    .from("ai_conversations")
    .update({ title })
    .eq("id", existing.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ title, regenerated: true })
}
