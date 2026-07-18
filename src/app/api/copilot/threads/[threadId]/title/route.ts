// TIM-634 / TIM-618-E: Auto-title route. Drawer calls this after the 3rd message.
// Asks Claude for a ≤6-word title from the first user message and stores it.

export const runtime = "nodejs"
export const maxDuration = 30

import { NextResponse, type NextRequest } from "next/server"
import { runScoutTurn } from "@/lib/ai/scout-adapter"
import { createClient } from "@/lib/supabase/server"
import { normalizeAIOutput } from "@/lib/normalize"
import { enforceRateLimit } from "@/lib/rate-limit"

const ROUTE_PATH = "/api/copilot/threads/[threadId]/title"
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

  // Rule 4: rate-limit a paid-API route.
  const rateLimited = await enforceRateLimit({
    bucket: "copilot:thread-title",
    id: user.id,
    limit: 10,
    windowSec: 60,
  })
  if (rateLimited) return rateLimited

  // Confirm the thread exists and belongs to the caller (RLS enforces plan ownership).
  const { data: existing, error: lookupError } = await supabase
    .from("ai_conversations")
    .select("id, title")
    .eq("plan_id", planId)
    .eq("thread_id", threadId)
    .maybeSingle()

  if (lookupError) { console.error("[threads/title] DB lookup error:", lookupError); return NextResponse.json({ error: "Failed to load thread." }, { status: 500 }) }
  if (!existing) return NextResponse.json({ error: "Thread not found" }, { status: 404 })

  // Idempotent: if a real title is already set, return it.
  if (existing.title && existing.title.trim().length > 0) {
    return NextResponse.json({ title: existing.title, regenerated: false })
  }

  let rawTitle = ""
  try {
    const result = await runScoutTurn({
      lane: "chat_title",
      systemBlocks: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: "user",
          content: `First message:\n${firstUserMessage.slice(0, 2_000)}\n\nReturn just the title.`,
        },
      ],
      maxTokens: 40,
      userId: user.id,
      routeTag: ROUTE_PATH,
    })
    rawTitle = result.text
  } catch (err) {
    console.error("[threads/title] AI error:", err)
    return NextResponse.json({ error: "Title generation failed. Please try again." }, { status: 502 })
  }

  const title = normalizeAIOutput(clampToWords(rawTitle, MAX_WORDS))
  if (!title) return NextResponse.json({ error: "Empty title from model." }, { status: 502 })

  const { error: updateError } = await supabase
    .from("ai_conversations")
    .update({ title })
    .eq("id", existing.id)

  if (updateError) { console.error("[threads/title] DB update error:", updateError); return NextResponse.json({ error: "Failed to save title." }, { status: 500 }) }

  return NextResponse.json({ title, regenerated: true })
}
