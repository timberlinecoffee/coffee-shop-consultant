// TIM-631 / TIM-618-B: Streaming co-pilot route with thinking, model routing, and SSE.
// Replaces /api/coach for workspace-keyed conversations.
// SSE event names: text | thinking | error | done
// Model routing: sonnet-4-6 default; opus-4-7 when snapshot >8000 tokens OR 3+ workspace mentions.

export const runtime = "nodejs" // service-role writes (ai_errors) need node; Edge has no advantage here
export const maxDuration = 60

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { composePlanSnapshot } from "@/lib/copilot/composePlanSnapshot"
import { isSubscriptionActive } from "@/lib/access"
import type { WorkspaceKey } from "@/types/supabase"
import type { NextRequest } from "next/server"

// ── Constants ────────────────────────────────────────────────────────────────

const WORKSPACE_KEYS: WorkspaceKey[] = [
  "concept",
  "location_lease",
  "financials",
  "menu_pricing",
  "buildout_equipment",
  "launch_plan",
]

const TTFT_MS = 8_000
const GAP_MS = 20_000
const HEARTBEAT_MS = 15_000

// Stable sections: cached with cache_control:ephemeral across the conversation.
const STABLE_IDENTITY = `You are the AI co-pilot for Timberline Coffee School's My Coffee Shop Consultant platform. You are a knowledgeable friend who has helped dozens of people open successful coffee shops, not a professor, not a consultant charging by the hour.`

const STABLE_COACHING_STYLE = `## Coaching Style
- Warm, direct, conversational. Knowledgeable friend, not professor.
- Use coffee-specific examples and real-world analogies.
- Challenge assumptions constructively; push for specificity, don't accept vague answers.
- Reference their specific situation (budget, location, experience) to make advice concrete.
- 2–3 paragraphs max unless they ask for more.
- End every response with a specific question or clear next step.
- NEVER use the words: actually, genuinely, honestly.
- NEVER hallucinate specific prices, addresses, suppliers, or statistics.
- You know coffee deeply; use that knowledge to challenge and refine their thinking.
- If their plan conflicts with their budget or location, say so directly but kindly.`

// ── Helpers ──────────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function buildDynamicPrompt(
  onboarding: Record<string, unknown>,
  planSnapshot: string,
  currentWorkspace: WorkspaceKey,
): string {
  const shopType = Array.isArray(onboarding?.shop_type)
    ? (onboarding.shop_type as string[]).join(", ")
    : String(onboarding?.shop_type ?? "not specified")

  return `## User Profile
- **Budget**: ${String(onboarding?.budget ?? "not specified")}
- **Location**: ${String(onboarding?.location ?? "not specified")}
- **Stage**: ${String(onboarding?.stage ?? "not specified")}
- **Motivation**: ${String(onboarding?.motivation ?? "not specified")}
- **Coffee experience**: ${String(onboarding?.coffee_experience ?? "not specified")}
- **Timeline**: ${String(onboarding?.timeline ?? "not specified")}
- **Shop type**: ${shopType}

## Current Workspace
The user is working in: **${currentWorkspace.replace(/_/g, " ")}**

## Their Plan So Far (all workspaces)
${planSnapshot}`
}

function countWorkspaceMentions(messages: Array<{ role: string; content: string }>): number {
  const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? ""
  const lower = lastUser.toLowerCase()
  return WORKSPACE_KEYS.filter(
    (k) => lower.includes(k.replace(/_/g, " ")) || lower.includes(k.replace(/_/g, "")),
  ).length
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response(sse("error", { code: "unauthorized", message: "Authentication required." }), {
      status: 401,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let planId: string
  let workspaceKey: WorkspaceKey
  let threadId: string | undefined
  let messages: Array<{ role: "user" | "assistant"; content: string }>

  try {
    const body = await request.json()
    planId = body.planId
    workspaceKey = body.workspaceKey
    threadId = body.threadId
    messages = body.messages
  } catch {
    return new Response(sse("error", { code: "bad_request", message: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  if (!planId || !workspaceKey || !messages?.length) {
    return new Response(
      sse("error", { code: "bad_request", message: "Missing required fields: planId, workspaceKey, messages." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // ── Credit/billing gate ──────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("users")
    .select("ai_credits_remaining, subscription_tier, subscription_status, onboarding_data")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return new Response(sse("error", { code: "quota", message: "Profile not found." }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  // TIM-643: subscription_status gate — copilot is a write action.
  // Inactive subscriptions (free_trial, cancelled, expired) get a 402 paywall.
  if (!isSubscriptionActive(profile.subscription_status)) {
    return new Response(
      sse("error", { code: "paywall", reason: "paywall", tier_required: "starter" }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  if (profile.subscription_tier === "free") {
    return new Response(
      sse("error", {
        code: "quota",
        message: "AI co-pilot requires a Starter, Growth, or Pro plan. Upgrade to start coaching.",
      }),
      { status: 403, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  const isUnlimited = profile.subscription_tier === "pro"

  if (!isUnlimited && profile.ai_credits_remaining < 1) {
    return new Response(
      sse("error", {
        code: "quota",
        message:
          "You've used all your AI credits for this month. Upgrade to Pro for unlimited coaching, or wait for your monthly reset.",
      }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // ── Build prompt ────────────────────────────────────────────────────────────
  const svcClient = createServiceClient()
  const onboarding = (profile.onboarding_data as Record<string, unknown>) ?? {}

  const { snapshot: planSnapshot, estimatedTokens: snapshotTokens, anchors } = await composePlanSnapshot(
    planId,
    workspaceKey,
    svcClient,
  )

  const dynamicPrompt = buildDynamicPrompt(onboarding, planSnapshot, workspaceKey)

  // ── Model routing ────────────────────────────────────────────────────────────
  const workspaceMentions = countWorkspaceMentions(messages)
  const useOpus = snapshotTokens > 8_000 || workspaceMentions >= 3
  const modelId = useOpus ? "claude-opus-4-7" : "claude-sonnet-4-6"

  // ── SSE stream ──────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const body = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk))
      let closed = false
      let firstToken = false
      let fullText = ""
      let inputTokens = 0
      let outputTokens = 0

      let heartbeatTimer: ReturnType<typeof setInterval> | null = null
      let ttftTimer: ReturnType<typeof setTimeout> | null = null
      let gapTimer: ReturnType<typeof setTimeout> | null = null

      const clearTimers = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        if (ttftTimer) clearTimeout(ttftTimer)
        if (gapTimer) clearTimeout(gapTimer)
      }

      const logError = async (code: string, message: string, upstreamStatus?: number) => {
        await svcClient.from("ai_errors").insert({
          user_id: user.id,
          workspace_key: workspaceKey,
          error_code: code,
          upstream_status: upstreamStatus ?? null,
          details: { message, modelId, planId },
        })
      }

      const closeWithError = async (code: string, message: string, upstreamStatus?: number) => {
        if (closed) return
        closed = true
        clearTimers()
        send(sse("error", { code, message }))
        await logError(code, message, upstreamStatus)
        send(sse("done", {}))
        controller.close()
      }

      const resetGapTimer = () => {
        if (gapTimer) clearTimeout(gapTimer)
        gapTimer = setTimeout(() => {
          closeWithError("timeout", "AI stream stalled. No data for 20 seconds. Please try again.")
        }, GAP_MS)
      }

      heartbeatTimer = setInterval(() => {
        if (!closed) send(`: ping\n\n`)
      }, HEARTBEAT_MS)

      ttftTimer = setTimeout(() => {
        if (!firstToken) {
          closeWithError("timeout", "No response from AI within 8 seconds. Please try again.")
        }
      }, TTFT_MS)

      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

        // System prompt: stable (cached) + dynamic plan context + optional workspace anchors
        const systemBlocks: Array<Anthropic.TextBlockParam & { cache_control?: Anthropic.CacheControlEphemeral }> = [
          {
            type: "text",
            text: `${STABLE_IDENTITY}\n\n${STABLE_COACHING_STYLE}`,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: dynamicPrompt,
          },
        ]

        if (anchors) {
          systemBlocks.push({ type: "text", text: anchors })
        }

        const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const stream = anthropic.messages.stream({
          model: modelId,
          max_tokens: 16_000,
          thinking: { type: "enabled", budget_tokens: 4_000 },
          system: systemBlocks as Anthropic.TextBlockParam[],
          messages: anthropicMessages,
        })

        for await (const event of stream) {
          if (closed) break

          if (event.type === "content_block_delta") {
            if (event.delta.type === "thinking_delta") {
              if (!firstToken) {
                firstToken = true
                if (ttftTimer) clearTimeout(ttftTimer)
              }
              resetGapTimer()
              send(sse("thinking", { delta: event.delta.thinking }))
            } else if (event.delta.type === "text_delta") {
              if (!firstToken) {
                firstToken = true
                if (ttftTimer) clearTimeout(ttftTimer)
              }
              resetGapTimer()
              fullText += event.delta.text
              send(sse("text", { delta: event.delta.text }))
            }
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? 0
          } else if (event.type === "message_start" && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0
          }
        }

        if (!closed) {
          clearTimers()
          closed = true

          // Persist completed turn (only on clean stream close — dropped on disconnect)
          const costPerInputM = useOpus ? 15 : 3
          const costPerOutputM = useOpus ? 75 : 15
          const costUsd = (inputTokens * costPerInputM + outputTokens * costPerOutputM) / 1_000_000
          const effectiveThreadId = threadId ?? crypto.randomUUID()

          const { data: existing } = await supabase
            .from("ai_conversations")
            .select("id, credits_used, cost_usd")
            .eq("plan_id", planId)
            .eq("workspace_key", workspaceKey)
            .eq("thread_id", effectiveThreadId)
            .maybeSingle()

          const updatedMessages = [...messages, { role: "assistant", content: fullText }]

          if (existing) {
            await supabase
              .from("ai_conversations")
              .update({
                messages: updatedMessages,
                credits_used: existing.credits_used + 1,
                cost_usd: (Number(existing.cost_usd) || 0) + costUsd,
                last_message_at: new Date().toISOString(),
                model_used: modelId,
              })
              .eq("id", existing.id)
          } else {
            await supabase.from("ai_conversations").insert({
              plan_id: planId,
              workspace_key: workspaceKey,
              thread_id: effectiveThreadId,
              messages: updatedMessages,
              credits_used: 1,
              cost_usd: costUsd,
              last_message_at: new Date().toISOString(),
              model_used: modelId,
              // Legacy fields required by schema until TIM-618-H drops them
              module_number: 0,
              section_key: workspaceKey,
            })
          }

          if (!isUnlimited) {
            await supabase
              .from("users")
              .update({ ai_credits_remaining: profile.ai_credits_remaining - 1 })
              .eq("id", user.id)

            await supabase.from("credit_transactions").insert({
              user_id: user.id,
              amount: -1,
              type: "usage",
              description: `Co-pilot: ${workspaceKey}`,
            })
          }

          send(sse("done", { threadId: effectiveThreadId, modelUsed: modelId }))
          controller.close()
        }
      } catch (err: unknown) {
        const status =
          err && typeof err === "object" && "status" in err ? Number((err as { status: number }).status) : undefined
        await closeWithError("upstream_error", "AI service temporarily unavailable. Please try again.", status)
      }
    },
  })

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
