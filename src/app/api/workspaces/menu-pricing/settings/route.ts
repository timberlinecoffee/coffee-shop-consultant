// TIM-1471: Menu & Pricing workspace settings.
// Currently just the target_gross_margin (default 0.75) that drives the MSRP
// readout in the Cost of Goods tab. Persisted on coffee_shop_plans so it can
// be reused by other workspaces later (e.g. the Insights matrix).
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

async function getPlan(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const planId = await getActivePlanId(supabase, userId)
  if (!planId) return null
  const { data } = await supabase
    .from("coffee_shop_plans")
    .select("id, target_gross_margin")
    .eq("id", planId)
    .maybeSingle()
  return data
}

function normalizeMargin(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string") {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const plan = await getPlan(supabase, user.id)
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  return Response.json({
    target_gross_margin: normalizeMargin(plan.target_gross_margin) ?? 0.75,
  })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { target_gross_margin?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const target = normalizeMargin(body.target_gross_margin)
  // Mirror the DB check constraint: open interval (0, 1).
  if (target === null || target <= 0 || target >= 1) {
    return Response.json(
      { error: "target_gross_margin must be a number strictly between 0 and 1" },
      { status: 400 },
    )
  }

  const plan = await getPlan(supabase, user.id)
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data, error } = await supabase
    .from("coffee_shop_plans")
    .update({ target_gross_margin: target })
    .eq("id", plan.id)
    .eq("user_id", user.id)
    .select("target_gross_margin")
    .single()

  if (error) return Response.json({ error: "Failed to update settings" }, { status: 500 })
  return Response.json({
    target_gross_margin: normalizeMargin(data.target_gross_margin) ?? target,
  })
}
