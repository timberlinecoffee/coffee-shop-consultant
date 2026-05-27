// TIM-1036: Marketing Budget lines CRUD + financials writeback.
import { createClient } from "@/lib/supabase/server"
import { toTitleCase } from "@/lib/text"
import type { NextRequest } from "next/server"
import { DEFAULT_BUDGET_CHANNELS } from "@/lib/marketing"

async function getPlanId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("coffee_shop_plans").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function writebackToFinancials(supabase: Awaited<ReturnType<typeof createClient>>, planId: string, totalCents: number) {
  const { data: model } = await supabase.from("financial_models").select("id, forecast_inputs").eq("plan_id", planId).maybeSingle()
  if (!model) return
  const inputs = (model.forecast_inputs as Record<string, unknown>) ?? {}
  await supabase.from("financial_models").update({ forecast_inputs: { ...inputs, marketing: { mode: "flat", pct: 0, flat_cents: totalCents } } }).eq("id", model.id)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data } = await supabase.from("marketing_budget_lines").select("*").eq("plan_id", planId).order("position", { ascending: true })
  if (!data || data.length === 0) {
    const seeds = DEFAULT_BUDGET_CHANNELS.map((c) => ({ plan_id: planId, channel_name: c.channel_name, monthly_cents: 0, is_system: true, position: c.position }))
    const { data: seeded } = await supabase.from("marketing_budget_lines").insert(seeds).select()
    return Response.json(seeded ?? [])
  }
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  if (!body.channel_name || typeof body.channel_name !== "string") return Response.json({ error: "Missing channel_name" }, { status: 400 })

  const { data: existing } = await supabase.from("marketing_budget_lines").select("position").eq("plan_id", planId).order("position", { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabase.from("marketing_budget_lines").insert({ plan_id: planId, channel_name: toTitleCase(body.channel_name as string), monthly_cents: (body.monthly_cents as number) ?? 0, is_system: false, position: (existing?.position ?? -1) + 1 }).select().single()
  if (error) return Response.json({ error: "Failed to create" }, { status: 500 })

  const { data: allLines } = await supabase.from("marketing_budget_lines").select("monthly_cents").eq("plan_id", planId)
  await writebackToFinancials(supabase, planId, (allLines ?? []).reduce((s: number, l: { monthly_cents: number }) => s + l.monthly_cents, 0))
  return Response.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  const { id, ...rest } = body
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })
  if (typeof rest.channel_name === "string") rest.channel_name = toTitleCase(rest.channel_name)

  const { data, error } = await supabase.from("marketing_budget_lines").update(rest).eq("id", id as string).eq("plan_id", planId).select().single()
  if (error) return Response.json({ error: "Failed to update" }, { status: 500 })

  const { data: allLines } = await supabase.from("marketing_budget_lines").select("monthly_cents").eq("plan_id", planId)
  await writebackToFinancials(supabase, planId, (allLines ?? []).reduce((s: number, l: { monthly_cents: number }) => s + l.monthly_cents, 0))
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })
  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  await supabase.from("marketing_budget_lines").delete().eq("id", id).eq("plan_id", planId)
  const { data: allLines } = await supabase.from("marketing_budget_lines").select("monthly_cents").eq("plan_id", planId)
  await writebackToFinancials(supabase, planId, (allLines ?? []).reduce((s: number, l: { monthly_cents: number }) => s + l.monthly_cents, 0))
  return Response.json({ ok: true })
}
