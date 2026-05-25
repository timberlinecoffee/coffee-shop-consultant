// TIM-1040: AI-generate launch milestones personalized to concept / location / equipment / hiring / financials.
// Streams JSON milestone objects via SSE. Preserves user_edited milestones on regenerate.
export const runtime = "nodejs"
export const maxDuration = 60

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { composeAllWorkspacesSnapshot } from "@/lib/copilot/composePlanSnapshot"
import { normalizeLaunchPlanConfig } from "@/lib/launch-plan"
import type { TrackKey } from "@/lib/launch-plan"
import type { NextRequest } from "next/server"

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

  const svcClient = createServiceClient()
  const { snapshots } = await composeAllWorkspacesSnapshot(planId, svcClient)

  const contextParts: string[] = [
    `Target Launch Date: ${targetLaunchDate}`,
    `Today's Date: ${new Date().toISOString().slice(0, 10)}`,
    `Days Until Launch: ${Math.round((new Date(targetLaunchDate).getTime() - Date.now()) / 86_400_000)}`,
  ]

  for (const s of snapshots) {
    if (s.text && s.text !== "_no content yet_") {
      contextParts.push(`\n### ${s.key.replace(/_/g, ' ')}\n${s.text}`)
    }
  }

  const userPrompt = contextParts.join("\n")

  const encoder = new TextEncoder()

  const body = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk))
      let heartbeat: ReturnType<typeof setInterval> | null = null
      heartbeat = setInterval(() => send(`: ping\n\n`), 15_000)

      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 8_000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        })

        if (heartbeat) clearInterval(heartbeat)

        const rawText = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { type: "text"; text: string }).text)
          .join("")

        // Parse the JSON array
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
          const trimmed = rawText.trim()
          const start = trimmed.indexOf("[")
          const end = trimmed.lastIndexOf("]")
          parsed = JSON.parse(trimmed.slice(start, end + 1))
        } catch {
          send(sse("error", { code: "parse_error", message: "AI returned invalid JSON" }))
          send(sse("done", {}))
          controller.close()
          return
        }

        const launch = new Date(targetLaunchDate)

        // Delete non-user-edited AI milestones, keep user_edited ones.
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

        // Insert new AI milestones.
        const inserts = parsed.map((m, idx) => {
          const targetDate = new Date(launch)
          targetDate.setDate(targetDate.getDate() - (m.days_before_launch ?? 0))
          return {
            plan_id: planId,
            title: m.title ?? "Untitled Milestone",
            description: m.description ?? null,
            track: m.track,
            target_date: targetDate.toISOString().slice(0, 10),
            status: "not_started" as const,
            estimated_duration_days: m.estimated_duration_days ?? null,
            depends_on_milestone_ids: [],
            critical_path: m.critical_path ?? false,
            owner: m.owner ?? "founder",
            ai_notes: m.ai_notes ?? null,
            user_edited: false,
            source: "ai_generated" as const,
            order_index: userEditedIds.length + idx,
          }
        })

        const { data: inserted, error: insertErr } = await supabase
          .from("launch_milestones")
          .insert(inserts)
          .select("*")

        if (insertErr) {
          send(sse("error", { code: "db_error", message: "Failed to save milestones" }))
          send(sse("done", {}))
          controller.close()
          return
        }

        // Update config: stamp lastGeneratedAt and sourcesSnapshotAt.
        const now = new Date().toISOString()
        const { data: existingDoc } = await supabase
          .from("workspace_documents")
          .select("content")
          .eq("plan_id", planId)
          .eq("workspace_key", "launch_plan")
          .maybeSingle()

        const config = normalizeLaunchPlanConfig(existingDoc?.content)
        config.lastGeneratedAt = now
        config.sourcesSnapshotAt = now

        await supabase
          .from("workspace_documents")
          .upsert(
            { plan_id: planId, workspace_key: "launch_plan", content: config },
            { onConflict: "plan_id,workspace_key" }
          )

        send(sse("done", {
          inserted: inserted?.length ?? 0,
          preserved: userEditedIds.length,
          lastGeneratedAt: now,
          milestones: inserted ?? [],
        }))
        controller.close()
      } catch (err) {
        if (heartbeat) clearInterval(heartbeat)
        const msg = err instanceof Error ? err.message : "Unknown error"
        send(sse("error", { code: "upstream_error", message: msg }))
        send(sse("done", {}))
        controller.close()
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
