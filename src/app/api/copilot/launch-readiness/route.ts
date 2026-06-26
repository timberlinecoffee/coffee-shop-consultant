// TIM-736: Cross-workspace launch readiness check.
// TIM-1104: Every blocker must be matched by a paired recommended next action.
// POST /api/copilot/launch-readiness
// SSE events: thinking | result | error | done
// Composes compact snapshots from all 6 workspaces, asks Claude to grade each
// workspace Green/Yellow/Red, and returns a structured JSON verdict.
// Persists the latest result on coffee_shop_plans.latest_readiness_check.
// TIM-1365 normalization: streaming route; JSON assembled server-side after stream ends.
// normalizeAIOutput/toTitleCase applied to text fields in normalizedParsed before persist and send.

export const runtime = "nodejs"
export const maxDuration = 60

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { composeAllWorkspacesSnapshot } from "@/lib/copilot/composePlanSnapshot"
import { isSubscriptionActive } from "@/lib/access"
import { normalizeAIOutput, toTitleCase } from "@/lib/normalize"
import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics"
import { rateLimit } from "@/lib/rate-limit"
import { notifyIfCreditBalanceLow } from "@/lib/email/credit-balance-low-callsite"
import type { NextRequest } from "next/server"

// ── Constants ─────────────────────────────────────────────────────────────────

const TTFT_MS = 10_000
const GAP_MS = 25_000
const HEARTBEAT_MS = 15_000

const WORKSPACE_LABELS: Record<string, string> = {
  concept: "Concept",
  location_lease: "Location & Lease",
  financials: "Financials",
  menu_pricing: "Menu & Pricing",
  buildout_equipment: "Equipment & Supplies",
  opening_month_plan: "Launch Plan",
}

const SYSTEM_PROMPT = `You are a launch readiness auditor for coffee shop entrepreneurs using the My Coffee Shop Consultant platform. Analyze the provided workspace data across the six workspaces below and produce a structured readiness report.

## Grading Rubric
- GREEN: Substantively complete. All critical elements are present and coherent.
- YELLOW: Core present but notable gaps that should be addressed before opening day.
- RED: Critical information is missing, the workspace is essentially empty, or there are blockers that will prevent launch.

## Workspace-Specific Criteria

**Concept**: GREEN if shop type, target customer, unique value proposition, and coffee experience level are defined.

**Location & Lease**: GREEN if a location is selected, lease terms are known, and signed lease or LOI is in progress. RED if no location.

**Financials**: GREEN if startup costs, monthly projections, and break-even analysis are filled in with realistic numbers. RED if costs or revenue are blank.

**Menu & Pricing**: GREEN if menu items are listed with prices and ingredient costs (COGS) set. RED if no items.

**Equipment & Supplies**: GREEN if equipment list is populated and build-out plan exists. RED if no equipment listed.

**Launch Plan**: GREEN when BOTH halves are populated: (a) dated gating milestones across the tracks (lease, permits, build-out, equipment, hiring, training, soft-open dates) with owners and target dates, AND (b) the tactical playbook covers pre-open weeks, opening week, and the first 30 days with specific tasks, owners, and dates (training schedule, supplier first-orders, friends-and-family soft open, grand-open staffing, daily/weekly rituals). YELLOW if only one half is populated. RED if both are empty.

## Output Format
Output ONLY valid JSON — no markdown, no prose, no code fences — matching this exact schema:
{
  "overall": "green" | "yellow" | "red",
  "perWorkspace": [
    {
      "key": "concept" | "location_lease" | "financials" | "menu_pricing" | "buildout_equipment" | "opening_month_plan",
      "status": "green" | "yellow" | "red",
      "blockers": ["string (max 3)"],
      "topNextActions": ["string (2-3 concrete actions)"]
    }
  ],
  "criticalPath": [
    {
      "action": "string",
      "owner": "string (e.g. Owner, Lawyer, Contractor, Accountant)",
      "dueBy": "string | null"
    }
  ]
}

Rules:
- overall: red if ANY workspace is red; yellow if any is yellow but none are red; green only if ALL are green.
- perWorkspace: include ALL 6 workspace keys in this exact order: concept, location_lease, financials, menu_pricing, buildout_equipment, opening_month_plan.
- blockers: max 3 items per workspace. If workspace has "No data entered", use ["No data entered yet"]. Name the specific gap — not a generic phrase.
- topNextActions: 2-3 entries. EVERY blocker you listed must be matched by at least one specific next action here that fixes it. Each action is concrete: a single, named thing the owner can do this week, with a target ("Email landlord X about a 6-month TI allowance" — not "consider talking to the landlord"). No vague verbs ("consider", "explore", "look into").
- criticalPath: top 5 most time-sensitive or blocking actions across all workspaces, ordered by urgency. Each action: who does it (owner) and a target due date if implied by the data.
- Never list a blocker without a paired recommended action. Pure problem-listing is not acceptable.
- Voice: knowledgeable friend, not consultant. Plain English. NEVER use: leverage, synergy, curated, unlock, elevate, embark, delve, journey, seamlessly, robust, holistic, comprehensive, innovative, passionate about, actually, genuinely, honestly. NEVER use em dashes (—); use ( -- ) if you need a pause. No emojis. Title case for headings; sentence case for body.
- Plain-English rule: when referencing financial ratios in blockers or next actions, use plain English on first reference: "ingredient cost (COGS)" not "COGS", "what you keep after ingredients (gross margin)" not "gross margin."
- Output ONLY the JSON object. Nothing before or after it.`

// ── Helpers ───────────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// Normalize the user-facing string fields of the readiness verdict at the
// generation boundary (blockers, next actions, critical-path action/owner).
// Status/key enums and dates are left untouched.
function normalizeStrings(arr: unknown): unknown {
  return Array.isArray(arr) ? arr.map((s) => (typeof s === "string" ? normalizeAIOutput(s) : s)) : arr
}
function normalizeReadiness(value: unknown): unknown {
  if (!value || typeof value !== "object") return value
  const v = value as Record<string, unknown>
  const out: Record<string, unknown> = { ...v }
  if (Array.isArray(v.perWorkspace)) {
    out.perWorkspace = v.perWorkspace.map((w) => {
      if (!w || typeof w !== "object") return w
      const ws = w as Record<string, unknown>
      return { ...ws, blockers: normalizeStrings(ws.blockers), topNextActions: normalizeStrings(ws.topNextActions) }
    })
  }
  if (Array.isArray(v.criticalPath)) {
    out.criticalPath = v.criticalPath.map((c) => {
      if (!c || typeof c !== "object") return c
      const cp = c as Record<string, unknown>
      return {
        ...cp,
        action: typeof cp.action === "string" ? normalizeAIOutput(cp.action) : cp.action,
        owner: typeof cp.owner === "string" ? normalizeAIOutput(cp.owner) : cp.owner,
      }
    })
  }
  return out
}

// ── Route ─────────────────────────────────────────────────────────────────────

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

  // TIM-2246: paid-API spend cap. Launch-readiness is full-plan synthesis,
  // so a tight per-user cap protects us from a runaway client.
  const rl = await rateLimit({ bucket: "copilot:launch-readiness", id: user.id, limit: 10, windowSec: 60 })
  if (!rl.ok) {
    return new Response(
      sse("error", { code: "rate_limited", retryAfterSec: rl.retryAfterSec }),
      { status: 429, headers: { "Content-Type": "text/event-stream", "Retry-After": String(rl.retryAfterSec) } },
    )
  }

  let planId: string
  try {
    const body = await request.json()
    planId = body.planId
  } catch {
    return new Response(sse("error", { code: "bad_request", message: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  if (!planId) {
    return new Response(sse("error", { code: "bad_request", message: "Missing required field: planId." }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  // ── Credit/billing gate ───────────────────────────────────────────────────

  const { data: profile } = await supabase
    .from("users")
    .select("ai_credits_remaining, subscription_tier, subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return new Response(sse("error", { code: "quota", message: "Profile not found." }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

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
        message: "Launch readiness check requires a Starter or Pro plan.",
      }),
      { status: 403, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  const isUnlimited = profile.subscription_tier === "pro"

  if (!isUnlimited && profile.ai_credits_remaining < 1) {
    return new Response(
      sse("error", {
        code: "quota",
        message: "You've used all your AI credits for this month. Upgrade to Pro for unlimited coaching.",
      }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // ── Build cross-workspace snapshot ────────────────────────────────────────

  const svcClient = createServiceClient()
  const { snapshots } = await composeAllWorkspacesSnapshot(planId, svcClient)

  // TIM-1897: all platform AI runs on Claude Haiku (src/lib/ai/models.ts).
  const modelId = PLATFORM_AI_MODEL

  const workspaceDataSection = snapshots
    .map((s) => `### ${WORKSPACE_LABELS[s.key] ?? s.key}\n${s.text}`)
    .join("\n\n")

  const userMessage = `## Plan Workspace Data\n\n${workspaceDataSection}\n\nAnalyze all 6 workspaces and produce the launch readiness JSON.`

  // ── SSE stream ────────────────────────────────────────────────────────────

  const encoder = new TextEncoder()

  const body = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk))
      let closed = false
      let firstToken = false
      let fullText = ""

      let heartbeatTimer: ReturnType<typeof setInterval> | null = null
      let ttftTimer: ReturnType<typeof setTimeout> | null = null
      let gapTimer: ReturnType<typeof setTimeout> | null = null

      const clearTimers = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        if (ttftTimer) clearTimeout(ttftTimer)
        if (gapTimer) clearTimeout(gapTimer)
      }

      const closeWithError = async (code: string, message: string) => {
        if (closed) return
        closed = true
        clearTimers()
        send(sse("error", { code, message }))
        send(sse("done", {}))
        controller.close()
      }

      const resetGapTimer = () => {
        if (gapTimer) clearTimeout(gapTimer)
        gapTimer = setTimeout(() => {
          void closeWithError("timeout", "AI stream stalled. Please try again.")
        }, GAP_MS)
      }

      heartbeatTimer = setInterval(() => {
        if (!closed) send(`: ping\n\n`)
      }, HEARTBEAT_MS)

      ttftTimer = setTimeout(() => {
        if (!firstToken) {
          void closeWithError("timeout", "No response from AI within 10 seconds. Please try again.")
        }
      }, TTFT_MS)

      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

        const stream = anthropic.messages.stream({
          model: modelId,
          max_tokens: 4_000,
          // TIM-1897: no `thinking` — Haiku 4.5 does not support extended thinking.
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        })

        // TIM-2509: capture per-turn usage for ai_turn_metrics.
        let inputTokens = 0
        let outputTokens = 0
        let cacheReadTokens = 0
        let cacheCreateTokens = 0

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
            }
          } else if (event.type === "message_start" && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0
            cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0
            cacheCreateTokens = event.message.usage.cache_creation_input_tokens ?? 0
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? 0
          }
        }

        if (!closed) {
          clearTimers()
          closed = true

          // Parse the accumulated JSON text
          let parsed: unknown
          try {
            // Strip any accidental markdown fences
            const cleaned = fullText.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "")
            parsed = normalizeReadiness(JSON.parse(cleaned))
          } catch {
            send(sse("error", { code: "parse_error", message: "AI returned malformed JSON. Please try again." }))
            send(sse("done", {}))
            controller.close()
            return
          }

          const normalizedParsed = {
            ...(parsed as Record<string, unknown>),
            perWorkspace: ((parsed as Record<string, unknown>).perWorkspace as Array<Record<string, unknown>> ?? []).map((ws) => ({
              ...ws,
              blockers: (ws.blockers as string[] ?? []).map((b: string) => normalizeAIOutput(b)),
              topNextActions: (ws.topNextActions as string[] ?? []).map((a: string) => normalizeAIOutput(a)),
            })),
            criticalPath: ((parsed as Record<string, unknown>).criticalPath as Array<Record<string, unknown>> ?? []).map((cp) => ({
              ...cp,
              action: normalizeAIOutput(String(cp.action ?? "")),
              owner: toTitleCase(String(cp.owner ?? "")),
            })),
          }

          // Persist to coffee_shop_plans
          await svcClient
            .from("coffee_shop_plans")
            .update({
              latest_readiness_check: normalizedParsed as import("@/types/supabase").Json,
              latest_readiness_check_at: new Date().toISOString(),
            })
            .eq("id", planId)

          // Deduct credit
          if (!isUnlimited) {
            const postDebitBalance = profile.ai_credits_remaining - 1
            await supabase
              .from("users")
              .update({ ai_credits_remaining: postDebitBalance })
              .eq("id", user.id)

            await supabase.from("credit_transactions").insert({
              user_id: user.id,
              amount: -1,
              type: "usage",
              description: "Launch readiness check",
            })
            // TIM-3023: at-most-one credit-balance-low notice per month.
            void notifyIfCreditBalanceLow({ userId: user.id, postMutationBalance: postDebitBalance })
          }

          // TIM-2509: per-turn telemetry into ai_turn_metrics (awaited before
          // controller close so Vercel doesn't freeze the insert).
          await recordTurnMetric(
            {
              async insert(row) {
                return svcClient.from("ai_turn_metrics").insert(row)
              },
            },
            {
              route: "/api/copilot/launch-readiness",
              model: modelId,
              usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cache_read_input_tokens: cacheReadTokens,
                cache_creation_input_tokens: cacheCreateTokens,
              },
              userId: user.id,
              planTier: resolvePlanTier(profile),
            },
          )

          send(sse("result", normalizedParsed))
          send(sse("done", { modelUsed: modelId }))
          controller.close()
        }
      } catch (err: unknown) {
        const message =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: string }).message)
            : "AI service temporarily unavailable."
        await closeWithError("upstream_error", message)
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
