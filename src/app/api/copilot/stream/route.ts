// Streaming co-pilot route with thinking, model routing, and SSE.
// TIM-866: unified usage messaging — free_trial gets 5 trial messages; paid gates on ai_credits_remaining.
// SSE event names: text | thinking | error | done
// Model routing (TIM-1272): haiku-4-5 default; sonnet-4-6 when snapshot >8000 tokens OR 3+ workspace mentions.
// Thinking is only enabled on the sonnet tier (haiku-4-5 does not support extended thinking).

export const runtime = "nodejs" // service-role writes (ai_errors) need node; Edge has no advantage here
export const maxDuration = 60

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { composePlanSnapshot } from "@/lib/copilot/composePlanSnapshot"
import { isSubscriptionActive, isBetaWaived, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access"
import type { WorkspaceKey } from "@/types/supabase"
import type { NextRequest } from "next/server"

// ── Constants ────────────────────────────────────────────────────────────────

const FREE_TRIAL_COPILOT_LIMIT = 5

const WORKSPACE_KEYS: WorkspaceKey[] = [
  "concept",
  "location_lease",
  "financials",
  "menu_pricing",
  "buildout_equipment",
  "launch_plan",
  "hiring",
  "marketing",
  "suppliers",
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
- NEVER use the words: actually, genuinely, honestly, leverage, synergy, curated, unlock, elevate, embark, delve.
- NEVER hallucinate specific prices, addresses, suppliers, or statistics.
- You know coffee deeply; use that knowledge to challenge and refine their thinking.
- If their plan conflicts with their budget or location, say so directly but kindly.

## Problem → Recommendation Rule (always)
Whenever you flag a problem, risk, weakness, or gap, you MUST also give:
1. **A recommendation** — what to change to fix or mitigate it. Concrete, with numbers when possible. No vague verbs ("consider", "explore", "look into").
2. **A next step** — the single, named thing the owner can do this week (e.g. "Update your menu price grid: lattes from $5.25 to $5.65", not "think about pricing").
3. **A short why** — one sentence on why the recommendation should work.
Pure problem-listing without a fix is not acceptable. If you don't have enough context to give a concrete recommendation, ask for the missing detail.`

// ── Helpers ──────────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function buildDynamicPrompt(
  onboarding: Record<string, unknown>,
  planSnapshot: string,
  // TIM-1149: null = general (workspace-less) conversation.
  currentWorkspace: WorkspaceKey | null,
): string {
  const shopType = Array.isArray(onboarding?.shop_type)
    ? (onboarding.shop_type as string[]).join(", ")
    : String(onboarding?.shop_type ?? "not specified")

  const workspaceLine = currentWorkspace
    ? `The user is working in: **${currentWorkspace.replace(/_/g, " ")}**`
    : `The user is in a **general** conversation, not bound to any specific workspace. Help them across the whole plan as needed.`

  return `## User Profile
- **Budget**: ${String(onboarding?.budget ?? "not specified")}
- **Location**: ${String(onboarding?.location ?? "not specified")}
- **Stage**: ${String(onboarding?.stage ?? "not specified")}
- **Motivation**: ${String(onboarding?.motivation ?? "not specified")}
- **Coffee experience**: ${String(onboarding?.coffee_experience ?? "not specified")}
- **Timeline**: ${String(onboarding?.timeline ?? "not specified")}
- **Shop type**: ${shopType}

## Current Workspace
${workspaceLine}

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
  // TIM-1149: workspaceKey may be null for general (workspace-less) conversations.
  let workspaceKey: WorkspaceKey | null
  let threadId: string | undefined
  let messages: Array<{ role: "user" | "assistant"; content: string }>

  try {
    const body = await request.json()
    planId = body.planId
    workspaceKey = body.workspaceKey ?? null
    threadId = body.threadId
    messages = body.messages
  } catch {
    return new Response(sse("error", { code: "bad_request", message: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  if (!planId || !messages?.length) {
    return new Response(
      sse("error", { code: "bad_request", message: "Missing required fields: planId, messages." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // ── Credit/billing gate ──────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("users")
    .select("ai_credits_remaining, copilot_trial_messages_used, subscription_tier, subscription_status, onboarding_data, beta_waiver_until")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return new Response(sse("error", { code: "quota", message: "Profile not found." }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  // Map subscription_status to a paywall reason clients can use to pick the right modal variant.
  function paywallReason(status: string): "no_subscription" | "paused" | "expired" {
    if (status === "cancelled") return "paused"
    if (status === "expired") return "expired"
    return "no_subscription"
  }

  // TIM-925: Beta waiver — bypass all paywall/credit gates for the beta window.
  const isWaived = isBetaWaived(profile.beta_waiver_until)

  const isTrial = profile.subscription_status === "free_trial"
  const isActive = isSubscriptionActive(profile.subscription_status)

  // Free trial: allow up to FREE_TRIAL_COPILOT_LIMIT messages before showing paywall.
  // Beta-waived accounts skip the trial gate.
  if (!isWaived && isTrial) {
    const used = profile.copilot_trial_messages_used ?? 0
    const remaining = FREE_TRIAL_COPILOT_LIMIT - used
    if (remaining <= 0) {
      return new Response(
        sse("error", {
          code: "trial_exhausted",
          message: "You've used your 5 trial messages — upgrade to keep planning with Copilot.",
          trialUsed: used,
          trialLimit: FREE_TRIAL_COPILOT_LIMIT,
        }),
        { status: 402, headers: { "Content-Type": "text/event-stream" } },
      )
    }
  } else if (!isWaived && !isActive) {
    // Cancelled or expired subscriptions: paywall without trial messaging.
    return new Response(
      sse("error", { code: "paywall", reason: paywallReason(profile.subscription_status), tier_required: "starter" }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    )
  } else if (!isWaived && profile.subscription_tier === "free") {
    // Active status but free tier — shouldn't normally occur; gate for safety.
    return new Response(
      sse("error", {
        code: "quota",
        message: "AI co-pilot requires a Starter, Growth, or Pro plan. Upgrade to start coaching.",
      }),
      { status: 403, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // Beta-waived accounts skip credit deduction. All paid tiers have a defined monthly cap.
  const isUnlimited = isWaived

  if (!isTrial && !isUnlimited && profile.subscription_tier !== "free" && profile.ai_credits_remaining < 1) {
    const tier = profile.subscription_tier as string
    const upgradeHint =
      tier === "starter"
        ? "Upgrade to Growth for 100 messages/month, or your credits reset next month."
        : tier === "growth"
          ? "Upgrade to Pro for 500 messages/month, or your credits reset next month."
          : "Your credits reset at the start of next month."
    return new Response(
      sse("error", {
        code: "quota",
        message: `You've used all your Copilot messages for this month. ${upgradeHint}`,
      }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // ── Build prompt ────────────────────────────────────────────────────────────
  const svcClient = createServiceClient()
  const onboarding = (profile.onboarding_data as Record<string, unknown>) ?? {}

  const { snapshot: planSnapshot, estimatedTokens: snapshotTokens } = await composePlanSnapshot(
    planId,
    workspaceKey,
    svcClient,
  )

  const dynamicPrompt = buildDynamicPrompt(onboarding, planSnapshot, workspaceKey)

  // ── Model routing ────────────────────────────────────────────────────────────
  // TIM-1272: align routing with cost model (cheap → haiku, complex → sonnet).
  // "Complex" = snapshot >8000 tokens OR user mentions 3+ workspaces in one turn.
  // Haiku 4.5 does not support extended thinking; thinking is only enabled for sonnet tier.
  const workspaceMentions = countWorkspaceMentions(messages)
  const useComplexModel = snapshotTokens > 8_000 || workspaceMentions >= 3
  const modelId = useComplexModel ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001"

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
      let cacheReadTokens = 0
      let cacheCreateTokens = 0

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

        // System prompt cached as a single prefix. The cache breakpoint must sit on the
        // LAST system block so the cached prefix covers identity + style + the plan
        // snapshot (~2–7K tokens). The stable block alone is ~424 tokens — below the
        // 1024-token minimum cacheable prefix for Sonnet/Opus, so a breakpoint there
        // caches nothing (TIM-1263). The dynamic block is identical across turns within a
        // conversation unless the plan is edited, so turns 2+ hit the cache; an edit just
        // forces one fresh write at the same cost as no caching — strictly net-positive.
        const systemBlocks: Array<Anthropic.TextBlockParam & { cache_control?: Anthropic.CacheControlEphemeral }> = [
          {
            type: "text",
            text: `${STABLE_IDENTITY}\n\n${STABLE_COACHING_STYLE}`,
          },
          {
            type: "text",
            text: dynamicPrompt,
            cache_control: { type: "ephemeral" },
          },
        ]

        const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const stream = anthropic.messages.stream({
          model: modelId,
          max_tokens: 16_000,
          // Extended thinking only available on sonnet and above (haiku-4-5 does not support it).
          ...(useComplexModel ? { thinking: { type: "enabled", budget_tokens: 4_000 } } : {}),
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
            cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0
            cacheCreateTokens = event.message.usage.cache_creation_input_tokens ?? 0
          }
        }

        if (!closed) {
          clearTimers()
          closed = true

          // Persist completed turn (only on clean stream close — dropped on disconnect).
          // TIM-1272: haiku-4-5 = $0.80/$4.00 per M; sonnet-4-6 = $3/$15 per M.
          // input_tokens already excludes cached tokens; cache reads bill at 0.1x and cache
          // writes at 1.25x the base input rate, so fold them in to keep cost_usd honest.
          const costPerInputM = useComplexModel ? 3 : 0.8
          const costPerOutputM = useComplexModel ? 15 : 4
          const costUsd =
            (inputTokens * costPerInputM +
              cacheReadTokens * costPerInputM * 0.1 +
              cacheCreateTokens * costPerInputM * 1.25 +
              outputTokens * costPerOutputM) /
            1_000_000
          const effectiveThreadId = threadId ?? crypto.randomUUID()

          const existingQuery = supabase
            .from("ai_conversations")
            .select("id, credits_used, cost_usd")
            .eq("plan_id", planId)
            .eq("thread_id", effectiveThreadId)
          const { data: existing } = await (workspaceKey === null
            ? existingQuery.is("workspace_key", null)
            : existingQuery.eq("workspace_key", workspaceKey)
          ).maybeSingle()

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
            })
          }

          if (isTrial && !isWaived) {
            await supabase
              .from("users")
              .update({ copilot_trial_messages_used: (profile.copilot_trial_messages_used ?? 0) + 1 })
              .eq("id", user.id)
          } else if (!isUnlimited) {
            await supabase
              .from("users")
              .update({ ai_credits_remaining: profile.ai_credits_remaining - 1 })
              .eq("id", user.id)

            await supabase.from("credit_transactions").insert({
              user_id: user.id,
              amount: -1,
              type: "usage",
              description: `Co-pilot: ${workspaceKey ?? "general"}`,
            })
          }

          const trialRemaining = (isTrial && !isWaived)
            ? FREE_TRIAL_COPILOT_LIMIT - ((profile.copilot_trial_messages_used ?? 0) + 1)
            : null

          send(sse("done", { threadId: effectiveThreadId, modelUsed: modelId, trialRemaining }))
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
