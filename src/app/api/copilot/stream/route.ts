// Streaming co-pilot route with thinking, model routing, and SSE.
// TIM-866: unified usage messaging — free_trial gets 5 trial messages; paid gates on ai_credits_remaining.
// SSE event names: text | thinking | suggestions | error | done
// Model routing (TIM-1272): haiku-4-5 default; sonnet-4-6 when snapshot >8000 tokens OR 3+ workspace mentions.
// Thinking is only enabled on the sonnet tier (haiku-4-5 does not support extended thinking).
// TIM-1637: reorganize_equipment_list tool emits suggestions event when called.
// TIM-1638: timeline inconsistency — groundss answers in plan's targetLaunchDate; emits suggestions on mismatch.

export const runtime = "nodejs" // service-role writes (ai_errors) need node; Edge has no advantage here
export const maxDuration = 60

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { composePlanSnapshot } from "@/lib/copilot/composePlanSnapshot"
import { isSubscriptionActive, isBetaWaived, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access"
import { COPILOT_NAME } from "@/lib/copilot/branding"
import { normalizeAIOutput } from "@/lib/normalize"
import { loadPlanContext } from "@/lib/plan-context"
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
  "opening_month_plan",
  "hiring",
  "marketing",
  "suppliers",
]

const TTFT_MS = 8_000
const GAP_MS = 20_000
const HEARTBEAT_MS = 15_000

// Stable sections: cached with cache_control:ephemeral across the conversation.
const STABLE_IDENTITY = `You are ${COPILOT_NAME}, Timberline Coffee School's AI planning assistant. You are a knowledgeable friend who has helped dozens of people open successful coffee shops — not a professor, not a consultant charging by the hour.`

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
Pure problem-listing without a fix is not acceptable. If you don't have enough context to give a concrete recommendation, ask for the missing detail.

## Generative Requests (always fulfill)
When the user explicitly asks you to design, draft, write, generate, name, or come up with something concrete (a beverage or drink, a recipe, menu copy, a role description, a description, a checklist), produce a complete, ready-to-use version. Do not refuse, and do not tell the user to do it themselves. "Design it for me" is a core reason people use you, not something to push back on.
- Lead with the finished thing (the drink with its build and ingredients, the recipe with quantities, the copy), then a short note on the choices you made.
- Make reasonable assumptions from their plan and profile instead of stalling on a clarifying question. If a key detail is missing, pick a sensible default, say what you assumed, and offer to adjust.
- Keep your coffee judgment: if what you produced has a real weakness, flag it and give the fix per the Problem → Recommendation Rule.
- Generating is not applying. You present the result for the user to review; saving it into their plan stays a separate, explicit step they accept, edit, or reject.`

// ── Equipment reorganize types / helpers ─────────────────────────────────────

interface EquipmentItemCtx {
  id: string
  name: string
  section_id: string | null
  position: number
  category: string
}

interface SectionCtx {
  id: string
  name: string
  position: number
}

// Minimal SuggestionPayload — mirrors AIReviewModal.tsx (server-safe copy).
interface SuggestionPayload {
  id: string
  fieldId: string
  fieldLabel: string
  originalValue: string
  proposedValue: string
  isStructured?: boolean
}

function formatEquipmentContext(items: EquipmentItemCtx[], sections: SectionCtx[]): string {
  const sectionMap = new Map(sections.map((s) => [s.id, s]))
  const lines = [
    "Sections:",
    ...sections.map((s) => `  ${s.name} (id: ${s.id})`),
    "",
    "Items (ordered by position within their current section):",
    ...items.map((i) => {
      const station = i.section_id
        ? (sectionMap.get(i.section_id)?.name ?? "Unsectioned")
        : "Unsectioned"
      return `  - ${i.name} | category: ${i.category} | station: ${station} | section_id: ${i.section_id ?? "null"} | item_id: ${i.id} | position: ${i.position}`
    }),
  ]
  return lines.join("\n")
}

// fieldId encodes the proposed assignment so onApply can act on it without parsing free-text.
// Format: "equipment-item:{item_id}:{section_id|null}:{position}"
// UUIDs contain only hyphens, not colons, so split(":") gives exactly 4 segments.
function buildReorganizeSuggestions(
  proposed: { item_id: string; section_id: string | null; position: number }[],
  items: EquipmentItemCtx[],
  sections: SectionCtx[],
): SuggestionPayload[] {
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const sectionMap = new Map(sections.map((s) => [s.id, s]))
  const suggestions: SuggestionPayload[] = []

  for (const p of proposed) {
    const item = itemMap.get(p.item_id)
    if (!item) continue
    if (item.section_id === p.section_id && item.position === p.position) continue

    const oldStation = item.section_id
      ? (sectionMap.get(item.section_id)?.name ?? "Unsectioned")
      : "Unsectioned"
    const newStation = p.section_id
      ? (sectionMap.get(p.section_id)?.name ?? "Unknown station")
      : "Unsectioned"

    suggestions.push({
      id: `eq-reorg-${item.id}`,
      fieldId: `equipment-item:${item.id}:${p.section_id ?? "null"}:${p.position}`,
      fieldLabel: item.name,
      originalValue: `${oldStation} · Position ${item.position + 1}`,
      proposedValue: `${newStation} · Position ${p.position + 1}`,
      isStructured: false,
    })
  }

  return suggestions
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// TIM-1638: heuristic to detect whether the user's message is about opening
// timeline or launch date — triggers the cross-plan inconsistency modal.
function isTimelineQuestion(messages: Array<{ role: string; content: string }>): boolean {
  const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? ""
  return /\b(open(ing)?|launch(ing)?|timeline|when.{0,20}(open|start|launch)|target date|how (long|soon)|schedule|date|month|year)\b/i.test(lastUser)
}

// TIM-1638: also takes targetLaunchDate (authoritative, from opening_month_plan)
// so Scout answers timeline questions from the plan, not the stale onboarding field.
function buildDynamicPrompt(
  onboarding: Record<string, unknown>,
  planSnapshot: string,
  // TIM-1149: null = general (workspace-less) conversation.
  currentWorkspace: WorkspaceKey | null,
  locationCountry: string | null,
  targetLaunchDate: string | null,
): string {
  const shopType = Array.isArray(onboarding?.shop_type)
    ? (onboarding.shop_type as string[]).join(", ")
    : String(onboarding?.shop_type ?? "not specified")

  const workspaceLine = currentWorkspace
    ? `The user is working in: **${currentWorkspace.replace(/_/g, " ")}**`
    : `The user is in a **general** conversation, not bound to any specific workspace. Help them across the whole plan as needed.`

  // TIM-1638: surface the authoritative opening date prominently. The onboarding
  // "timeline" field is a stale categorical estimate from signup; the plan date is
  // what the user set in their Launch Plan and should always be preferred.
  const authoritativeDateLine = targetLaunchDate
    ? `**Target Opening Date (authoritative, from Launch Plan)**: ${targetLaunchDate}`
    : `**Target Opening Date (authoritative, from Launch Plan)**: not set — if the owner asks about their opening timeline, tell them to set it in their Launch Plan`

  return `## User Profile
- **Budget**: ${String(onboarding?.budget ?? "not specified")}
- **Location**: ${locationCountry ?? "not specified"}
- **Stage**: ${String(onboarding?.stage ?? "not specified")}
- **Motivation**: ${String(onboarding?.motivation ?? "not specified")}
- **Coffee experience**: ${String(onboarding?.coffee_experience ?? "not specified")}
- **Timeline (initial estimate from signup — may be stale)**: ${String(onboarding?.timeline ?? "not specified")}
- ${authoritativeDateLine}
- **Shop type**: ${shopType}

## Authoritative Data Rule
When asked about the opening timeline, target launch date, or when the shop will open:
- Use ONLY the "Target Opening Date" above — it is set by the owner in their Launch Plan.
- Do NOT answer from the stale "Timeline (initial estimate)" field.
- If the Target Opening Date conflicts with anything else in their plan, flag it clearly and recommend they reconcile it.

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
        message: `${COPILOT_NAME} requires a Starter, Growth, or Pro plan. Upgrade to start coaching.`,
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

  // TIM-1418: Location is read live from plan_hiring_settings + location_candidates
  // instead of the frozen onboarding snapshot. Other onboarding fields here
  // (budget, stage, motivation, coffee_experience, timeline, shop_type) have no
  // live workspace equivalent and stay on onboarding_data.
  const [snapshotResult, planContext] = await Promise.all([
    composePlanSnapshot(planId, workspaceKey, svcClient),
    loadPlanContext(svcClient, user.id),
  ])
  const { snapshot: planSnapshot, estimatedTokens: snapshotTokens, targetLaunchDate } = snapshotResult

  // TIM-1638: detect timeline mismatch between the authoritative plan date and
  // the stale onboarding estimate. Emit the inconsistency suggestion only when
  // the user's message is about opening timeline — avoids noise on every turn.
  const onboardingTimeline = String(onboarding?.timeline ?? "").trim()
  const hasMismatch =
    !!targetLaunchDate &&
    !!onboardingTimeline &&
    onboardingTimeline !== "not specified" &&
    onboardingTimeline !== "" &&
    isTimelineQuestion(messages)

  // ── Equipment reorganize context (TIM-1637) ───────────────────────────────────
  // Fetch current equipment items + sections when in the buildout_equipment workspace
  // so Scout can emit a reorganize_equipment_list tool call with valid item/section UUIDs.
  let equipmentItems: EquipmentItemCtx[] = []
  let equipmentSections: SectionCtx[] = []
  if (workspaceKey === "buildout_equipment") {
    const [eqResult, secResult] = await Promise.all([
      svcClient
        .from("buildout_equipment_items")
        .select("id, name, section_id, position, category")
        .eq("plan_id", planId)
        .eq("archived", false)
        .order("position"),
      svcClient
        .from("buildout_list_sections")
        .select("id, name, position")
        .eq("plan_id", planId)
        .eq("list_type", "equipment")
        .order("position"),
    ])
    equipmentItems = (eqResult.data ?? []) as EquipmentItemCtx[]
    equipmentSections = (secResult.data ?? []) as SectionCtx[]
  }

  const equipmentContextAddendum =
    workspaceKey === "buildout_equipment" && equipmentItems.length > 0
      ? `\n\n## Equipment List — Current Arrangement\nThe exact item IDs and section IDs below are required for the \`reorganize_equipment_list\` tool. Use them verbatim.\n\n${formatEquipmentContext(equipmentItems, equipmentSections)}\n\n**Action available:** \`reorganize_equipment_list\` — call it ONLY when the user explicitly asks to reorganize, sort, reorder, or rearrange the equipment list. Never call it proactively. When you do call it, first send a brief text message explaining your grouping approach, then call the tool with all items in their proposed arrangement.`
      : ""

  const dynamicPrompt =
    buildDynamicPrompt(onboarding, planSnapshot, workspaceKey, planContext.location_country, targetLaunchDate) +
    equipmentContextAddendum

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

      // TIM-1637: track in-flight tool_use block for reorganize_equipment_list.
      let activeToolName: string | null = null
      let toolInputBuffer = ""

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

        // TIM-1637: equipment reorganize tool — only registered when items exist.
        const equipmentTool: Anthropic.Tool | null =
          workspaceKey === "buildout_equipment" && equipmentItems.length > 0
            ? {
                name: "reorganize_equipment_list",
                description:
                  "Propose a new arrangement of equipment items across workstation sections. Only call this when the user explicitly asks to reorganize, sort, reorder, or rearrange the equipment list. Include ALL items in the output, even those not moving — this is a complete ordering.",
                input_schema: {
                  type: "object" as const,
                  properties: {
                    rationale: {
                      type: "string",
                      description: "1–2 sentences explaining the reorganization logic.",
                    },
                    items: {
                      type: "array",
                      description:
                        "Complete proposed arrangement. Position is 0-based within each section.",
                      items: {
                        type: "object",
                        properties: {
                          item_id: {
                            type: "string",
                            description: "Equipment item UUID — verbatim from the equipment list.",
                          },
                          section_id: {
                            type: ["string", "null"],
                            description: "Section UUID, or null for unsectioned.",
                          },
                          position: {
                            type: "integer",
                            description: "0-based position within the section.",
                          },
                        },
                        required: ["item_id", "section_id", "position"],
                      },
                    },
                  },
                  required: ["rationale", "items"],
                },
              }
            : null

        const stream = anthropic.messages.stream({
          model: modelId,
          max_tokens: 16_000,
          // Extended thinking only available on sonnet and above (haiku-4-5 does not support it).
          ...(useComplexModel ? { thinking: { type: "enabled", budget_tokens: 4_000 } } : {}),
          system: systemBlocks as Anthropic.TextBlockParam[],
          messages: anthropicMessages,
          ...(equipmentTool ? { tools: [equipmentTool], tool_choice: { type: "auto" } } : {}),
        })

        for await (const event of stream) {
          if (closed) break

          // TIM-1637: track tool_use block start/stop for equipment reorganization.
          if (event.type === "content_block_start") {
            const block = event.content_block
            if (block.type === "tool_use") {
              activeToolName = block.name
              toolInputBuffer = ""
            }
          } else if (event.type === "content_block_stop") {
            if (activeToolName === "reorganize_equipment_list" && toolInputBuffer) {
              try {
                const toolInput = JSON.parse(toolInputBuffer) as {
                  rationale: string
                  items: { item_id: string; section_id: string | null; position: number }[]
                }
                const suggestions = buildReorganizeSuggestions(
                  toolInput.items ?? [],
                  equipmentItems,
                  equipmentSections,
                )
                if (suggestions.length > 0) {
                  send(
                    sse("suggestions", {
                      suggestions,
                      context: {
                        workspace: "buildout_equipment",
                        section: toolInput.rationale,
                      },
                    }),
                  )
                }
              } catch {
                /* malformed tool JSON — skip silently */
              }
              activeToolName = null
              toolInputBuffer = ""
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "input_json_delta") {
              toolInputBuffer += event.delta.partial_json
            } else if (event.delta.type === "thinking_delta") {
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

          // Normalize at persist-time (TIM-1365): tokens are streamed raw; normalize the assembled text before storing.
          const updatedMessages = [...messages, { role: "assistant", content: normalizeAIOutput(fullText) }]

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

          // TIM-1638: emit a cross-plan inconsistency suggestion when the owner's
          // authoritative launch date and their stale onboarding timeline both exist
          // and the user's message is about opening timeline.
          if (hasMismatch && targetLaunchDate) {
            send(sse("suggestions", {
              suggestions: [
                {
                  id: `inconsistency-timeline-${crypto.randomUUID()}`,
                  fieldId: "timeline_mismatch",
                  fieldLabel: "Opening Timeline Mismatch",
                  originalValue: `Profile estimate (from signup): "${onboardingTimeline}"`,
                  proposedValue: `Launch Plan target date: ${targetLaunchDate}`,
                  isStructured: false,
                } satisfies SuggestionPayload,
              ],
              context: {
                workspace: "opening_month_plan",
                section: "Launch Configuration",
              },
            }))
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
