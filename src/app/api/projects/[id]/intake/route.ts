// TIM-3151: per-project onboarding interview save endpoint.
// POST  — saves trimmed intake answers (or dismiss flag) to coffee_shop_plans.onboarding_data.
// GET   — returns current onboarding_data for the plan (so the UI can check completion state).
//
// Standing Rules applied:
//   Rule 2 — ownership verified server-side; plan must belong to the authenticated user.
//             TIM-3274: Pro-tier gate applied server-side (effectivePlanForGating) — client
//             guards are UX only.
//   Rule 3 — all input validated with zod before DB write.
//   Rule 5 — no raw errors exposed to client.
import { createClient } from "@/lib/supabase/server"
import { effectivePlanForGating } from "@/lib/access"
import { z } from "zod"
import type { NextRequest } from "next/server"

// Accepted shapes:
//  { dismissed: true }           — user skipped + clicked "don't ask again"
//  { answers: { ... } }          — completed intake answers from the trimmed interview
//  { answers: { ... }, dismissed: false } — completed (dismissed=false is the default)
//
// Branch 1 uses Zod's default strip mode: extra keys (e.g. answers) are silently
// stripped, so { dismissed: true, answers: {...} } correctly resolves to branch 1
// and the answers are ignored (dismissed wins). Removing answers: z.undefined() from
// branch 1 is intentional — the undefined check prevented branch 1 from matching
// when extra keys were present, causing branch 2 to match and the handler to discard
// the answers with a silent ok: true (confirmed bug, TIM-3154 code-review).
const IntakeBody = z.union([
  z.object({
    dismissed: z.literal(true),
  }),
  z.object({
    dismissed: z.boolean().optional(),
    answers: z.record(z.unknown()).refine(
      (r) => Object.keys(r).length > 0,
      { message: "answers must not be empty" },
    ),
  }),
])

// Fetch the caller's profile fields needed for effectivePlanForGating.
async function requireProTier(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("subscription_status, subscription_tier, trial_ends_at, paused_from_tier")
    .eq("id", userId)
    .single()
  return !!data && effectivePlanForGating(data) === "pro"
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // TIM-3274: Rule 2 — server-side Pro-tier gate (client guard is UX only).
  if (!await requireProTier(supabase, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const { data: plan, error } = await supabase
    .from("coffee_shop_plans")
    .select("id, onboarding_data")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    console.error(`GET /api/projects/${id}/intake error:`, error.message)
    return Response.json({ error: "Failed to fetch intake state" }, { status: 500 })
  }
  if (!plan) return Response.json({ error: "Project not found" }, { status: 404 })

  const od = plan.onboarding_data as Record<string, unknown> | null

  // AC2 (TIM-3274): legacy Pro users completed onboarding via users.onboarding_data
  // before TIM-3151 introduced per-project storage. A NULL per-project column means
  // "no data yet" for new projects but "already done" for legacy users — disambiguate
  // by checking the old column before returning completed: false.
  if (od === null) {
    const { data: userRow } = await supabase
      .from("users")
      .select("onboarding_data")
      .eq("id", user.id)
      .single()
    if (userRow?.onboarding_data != null) {
      return Response.json({ completed: true, dismissed: false, onboardingData: null })
    }
  }

  return Response.json({
    completed: od !== null && !od?.dismissed,
    dismissed: od?.dismissed === true,
    onboardingData: od,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // TIM-3274: Rule 2 — server-side Pro-tier gate (client guard is UX only).
  if (!await requireProTier(supabase, user.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = IntakeBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  // Ownership check — RLS also enforces this, belt+suspenders per Rule 2.
  const { data: existing } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!existing) return Response.json({ error: "Project not found" }, { status: 404 })

  const newData: Record<string, unknown> =
    parsed.data.dismissed === true
      ? { dismissed: true }
      : { ...(parsed.data as { answers: Record<string, unknown> }).answers, dismissed: false }

  const { error } = await supabase
    .from("coffee_shop_plans")
    .update({ onboarding_data: newData })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) {
    console.error(`POST /api/projects/${id}/intake error:`, error.message)
    return Response.json({ error: "Failed to save intake answers" }, { status: 500 })
  }

  return Response.json({ ok: true })
}
