// TIM-736: Cross-workspace launch readiness check.
// POST /api/copilot/launch-readiness
// SSE events: thinking | result | error | done
// Composes compact snapshots from all 6 workspaces, asks Claude to grade each
// workspace Green/Yellow/Red, and returns a structured JSON verdict.
// Persists the latest result on coffee_shop_plans.latest_readiness_check.

export const runtime = "nodejs"
export const maxDuration = 60

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { composeAllWorkspacesSnapshot } from "@/lib/copilot/composePlanSnapshot"
import { isSubscriptionActive } from "@/lib/access"
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
  buildout_equipment: "Build-out & Equipment",
  launch_plan: "Launch Plan",
}

const SYSTEM_PROMPT = `You are a launch readiness auditor for coffee shop entrepreneurs using the My Coffee Shop Consultant platform. Analyze the provided workspace data across all 6 workspaces and produce a structured readiness report.

## Grading Rubric
- GREEN: Substantively complete. All critical elements are present and coherent.
- YELLOW: Core present but notable gaps that should be addressed before opening day.
- RED: Critical information is missing, the workspace is essentially empty, or there are blockers that will prevent launch.

## Workspace-Specific Criteria

**Concept**: GREEN if shop type, target customer, unique value proposition, and coffee experience level are defined.

**Location & Lease**: GREEN if a location is selected, lease terms are known, and signed lease or LOI is in progress. RED if no location.

**Financials**: GREEN if startup costs, monthly projections, and break-even analysis are filled in with realistic numbers. RED if costs or revenue are blank.

**Menu & Pricing**: GREEN if menu items are listed with prices and COGS set. RED if no items.

**Build-out & Equipment**: GREEN if equipment list is populated and build-out plan exists. RED if no equipment listed.

**Launch Plan**: GREEN if launch timeline has dated milestones, marketing channels defined, soft-open plan populated, and hiring plan covers key roles.

## Output Format
Output ONLY valid JSON — no markdown, no prose, no code fences — matching this exact schema:
{
  "overall": "green" | "yellow" | "red",
  "perWorkspace": [
    {
      "key": "concept" | "location_lease" | "financials" | "menu_pricing" | "buildout_equipment" | "launch_plan",
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
- perWorkspace: include ALL 6 workspace keys in this exact order: concept, location_lease, financials, menu_pricing, buildout_equipment, launch_plan.
- blockers: max 3 items per workspace. If workspace has "No data entered", use ["No data entered yet"].
- topNextActions: 2-3 specific, concrete next steps the entrepreneur should take.
- criticalPath: top 5 most time-sensitive or blocking actions across all workspaces, ordered by urgency.
- Output ONLY the JSON object. Nothing before or after it.`

// ── Helpers ───────────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
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
    .select("ai_credits_remaining, subscription_tier, subscription_status")
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
        message: "Launch readiness check requires a Starter, Growth, or Pro plan.",
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
  const { snapshots, totalChars } = await composeAllWorkspacesSnapshot(planId, svcClient)

  const estimatedTokens = Math.ceil(totalChars / 4)
  // Use opus for large snapshots; sonnet otherwise.
  const modelId = estimatedTokens > 6_000 ? "claude-opus-4-7" : "claude-sonnet-4-6"

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
          thinking: { type: "enabled", budget_tokens: 3_000 },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
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
            }
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
            parsed = JSON.parse(cleaned)
          } catch {
            send(sse("error", { code: "parse_error", message: "AI returned malformed JSON. Please try again." }))
            send(sse("done", {}))
            controller.close()
            return
          }

          // Persist to coffee_shop_plans
          await svcClient
            .from("coffee_shop_plans")
            .update({
              latest_readiness_check: parsed as import("@/types/supabase").Json,
              latest_readiness_check_at: new Date().toISOString(),
            })
            .eq("id", planId)

          // Deduct credit
          if (!isUnlimited) {
            await supabase
              .from("users")
              .update({ ai_credits_remaining: profile.ai_credits_remaining - 1 })
              .eq("id", user.id)

            await supabase.from("credit_transactions").insert({
              user_id: user.id,
              amount: -1,
              type: "usage",
              description: "Launch readiness check",
            })
          }

          send(sse("result", parsed))
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
