// TIM-1040: AI-generate launch milestones personalized to concept / location / equipment / hiring / financials.
// TIM-1057: Fix-forward — switched to streaming Anthropic call with TTFT (8s) and gap (25s) timers
// to prevent Lambda timeout leaving client in infinite-spinner state.
// TIM-1365 normalization: streaming route — tokens arrive as *.delta.text (ESLint exempt). JSON is
// assembled server-side; normalizeAIOutput/toTitleCase applied to text fields at persist-time (see inserts map).
export const runtime = "nodejs"
export const maxDuration = 60

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { normalizeAIOutput } from "@/lib/normalize"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { composeAllWorkspacesSnapshot } from "@/lib/copilot/composePlanSnapshot"
import { normalizeLaunchPlanConfig } from "@/lib/launch-plan"
import type { TrackKey } from "@/lib/launch-plan"
import type { NextRequest } from "next/server"
import { normalizeAIOutput, toTitleCase } from "@/lib/normalize"

const TTFT_MS = 8_000
const GAP_MS = 25_000
const HEARTBEAT_MS = 15_000

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

const SYSTEM_PROMPT = `You are an expert coffee shop launch consultant. Your job is to generate a personalized launch milestone plan for a new coffee shop owner, working backward from their target launch date.

Return ONLY a valid JSON array of milestone objects. No preamble, no explanation, no markdown fences. Just the raw JSON array.

Each milestone object must have exactly these fields:
- title: string (Title Case, concise, 3-8 words)
- description: string (plain shop-owner language, 1-2 sentences, success criteria or common gotchas)
- track: one of: legal_compliance | real_estate_buildout | equipment | brand_marketing | menu_operations | people_hiring | finance_admin | pre_launch_events | post_launch
- days_before_launch: integer (how many calendar days before launch this should be done by; use 0 for launch day; use negative numbers for post-launch)
- estimated_duration_days: integer (how long this task takes to complete)
- critical_path: boolean
- owner: string (usually "founder" but can be "gc", "accountant", "attorney", etc.)
- ai_notes: string (brief rationale for timing, 1 sentence)

Rules:
- Return 25-45 milestones total spread across the 9 tracks.
- Dates must be realistic for a real coffee shop opening.
- Equipment milestones must account for real lead times (espresso machines 8-16 weeks).
- Permit milestones must account for real city processing times (health permit 2-4 weeks, etc.).
- Conditionally include Roasting track items only if in-house roasting is enabled.
- Conditionally include drive-through items only if drive-through format.
- Heavier food permit items only if food program is flagged.
- Always include 2-3 post_launch milestones (day 30 review, feedback cycle, menu iteration).
- Title Case all titles.
- No emojis. Plain language only.`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(sse("error", { code: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  let planId: string
  let targetLaunchDate: string
  let existingMilestones: Array<{ id: string; user_edited: boolean }> = []

  try {
    const body = await request.json()
    planId = body.planId
    targetLaunchDate = body.targetLaunchDate
    existingMilestones = body.existingMilestones ?? []
  } catch {
    return new Response(sse("error", { code: "bad_request" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  if (!planId || !targetLaunchDate) {
    return new Response(sse("error", { code: "bad_request", message: "planId and targetLaunchDate required" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until, onboarding_data")
    .eq("id", user.id)
    .single()

  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return new Response(sse("error", { code: "paywall", reason: "no_subscription", tier_required: "starter" }), {
      status: 402,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  // Compose workspace context before opening the stream so errors here surface as HTTP errors.
  const svcClient = createServiceClient()
  const { snapshots } = await composeAllWorkspacesSnapshot(planId, svcClient)

  const contextParts: string[] = [
    `Target Launch Date: ${targetLaunchDate}`,
    `Today's Date: ${new Date().toISOString().slice(0, 10)}`,
    `Days Until Launch: ${Math.round((new Date(targetLaunchDate).getTime() - Date.now()) / 86_400_000)}`,
  ]

  for (const s of snapshots) {
    if (s.text && s.text !== "_no content yet_") {
      contextParts.push(`\n### ${s.key.replace(/_/g, " ")}\n${s.text}`)
    }
  }

  const userPrompt = contextParts.join("\n")

  console.log(`[launch-plan/generate] start plan=${planId} user=${user.id} contextChars=${userPrompt.length}`)

  const encoder = new TextEncoder()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const streamBody = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk))
      let done = false
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null
      let ttftTimer: ReturnType<typeof setTimeout> | null = null
      let gapTimer: ReturnType<typeof setTimeout> | null = null

      function cleanup() {
        done = true
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        if (ttftTimer) clearTimeout(ttftTimer)
        if (gapTimer) clearTimeout(gapTimer)
      }

      heartbeatTimer = setInterval(() => {
        if (!done) send(`: ping\n\n`)
      }, HEARTBEAT_MS)

      ttftTimer = setTimeout(() => {
        if (!done) {
          console.error("[launch-plan/generate] TTFT timeout")
          cleanup()
          send(sse("error", { code: "timeout", message: "Couldn't generate plan. Try again or contact support." }))
          send(sse("done", {}))
          controller.close()
        }
      }, TTFT_MS)

      try {
        const aiStream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 8_000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        })

        let fullText = ""

        for await (const event of aiStream) {
          if (done) break

          if (
            event.type === "content_block_start" ||
            (event.type === "content_block_delta" && event.delta.type === "text_delta")
          ) {
            if (ttftTimer) { clearTimeout(ttftTimer); ttftTimer = null }
            if (gapTimer) clearTimeout(gapTimer)
            gapTimer = setTimeout(() => {
              if (!done) {
                console.error("[launch-plan/generate] gap timer fired")
                cleanup()
                send(sse("error", { code: "timeout", message: "Couldn't generate plan. Try again or contact support." }))
                send(sse("done", {}))
                controller.close()
              }
            }, GAP_MS)
          }

          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text
          }
        }

        if (gapTimer) { clearTimeout(gapTimer); gapTimer = null }
        if (ttftTimer) { clearTimeout(ttftTimer); ttftTimer = null }

        if (done) return

        console.log(`[launch-plan/generate] AI done textLen=${fullText.length}`)

        let parsed: Array<{
          title: string
          description: string
          track: TrackKey
          days_before_launch: number
          estimated_duration_days: number
          critical_path: boolean
          owner: string
          ai_notes: string
        }>

        try {
          const trimmed = fullText.trim()
          const start = trimmed.indexOf("[")
          const end = trimmed.lastIndexOf("]")
          parsed = JSON.parse(trimmed.slice(start, end + 1))
        } catch {
          console.error("[launch-plan/generate] JSON parse failed")
          cleanup()
          send(sse("error", { code: "parse_error", message: "Couldn't generate plan. Try again or contact support." }))
          send(sse("done", {}))
          controller.close()
          return
        }

        const launch = new Date(targetLaunchDate)

        const userEditedIds = existingMilestones
          .filter((m) => m.user_edited)
          .map((m) => m.id)

        const toDelete = existingMilestones
          .filter((m) => !m.user_edited)
          .map((m) => m.id)

        if (toDelete.length > 0) {
          await supabase
            .from("launch_milestones")
            .delete()
            .in("id", toDelete)
            .eq("plan_id", planId)
        }

        const inserts = parsed.map((m, idx) => {
          const targetDate = new Date(launch)
          targetDate.setDate(targetDate.getDate() - (m.days_before_launch ?? 0))
          return {
            plan_id: planId,
            title: normalizeAIOutput(m.title ?? "Untitled Milestone"),
            description: m.description ? normalizeAIOutput(m.description) : null,
            track: m.track,
            target_date: targetDate.toISOString().slice(0, 10),
            status: "not_started" as const,
            estimated_duration_days: m.estimated_duration_days ?? null,
            depends_on_milestone_ids: [],
            critical_path: m.critical_path ?? false,
            owner: m.owner ?? "founder",
            ai_notes: m.ai_notes ? normalizeAIOutput(m.ai_notes) : null,
            user_edited: false,
            source: "ai_generated" as const,
            order_index: userEditedIds.length + idx,
          }
        })

        console.log(`[launch-plan/generate] inserting ${inserts.length} milestones`)

        const { data: inserted, error: insertErr } = await supabase
          .from("launch_milestones")
          .insert(inserts)
          .select("*")

        if (insertErr) {
          console.error("[launch-plan/generate] insert error:", insertErr.message)
          cleanup()
          send(sse("error", { code: "db_error", message: "Couldn't save the plan. Try again or contact support." }))
          send(sse("done", {}))
          controller.close()
          return
        }

        const now = new Date().toISOString()
        const { data: existingDoc } = await supabase
          .from("workspace_documents")
          .select("content")
          .eq("plan_id", planId)
          .eq("workspace_key", "opening_milestones")
          .maybeSingle()

        const config = normalizeLaunchPlanConfig(existingDoc?.content)
        config.lastGeneratedAt = now
        config.sourcesSnapshotAt = now

        await supabase
          .from("workspace_documents")
          .upsert(
            { plan_id: planId, workspace_key: "opening_milestones", content: config },
            { onConflict: "plan_id,workspace_key" }
          )

        console.log(`[launch-plan/generate] done inserted=${inserted?.length ?? 0} preserved=${userEditedIds.length}`)

        cleanup()
        send(sse("done", {
          inserted: inserted?.length ?? 0,
          preserved: userEditedIds.length,
          lastGeneratedAt: now,
          milestones: inserted ?? [],
        }))
        controller.close()
      } catch (err) {
        if (!done) {
          const msg = err instanceof Error ? err.message : "Unknown error"
          console.error("[launch-plan/generate] unhandled error:", msg)
          cleanup()
          send(sse("error", { code: "upstream_error", message: "Couldn't generate plan. Try again or contact support." }))
          send(sse("done", {}))
          controller.close()
        }
      }
    },
  })

  return new Response(streamBody, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
