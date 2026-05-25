// TIM-1036: Marketing Campaigns CRUD.
import { createClient } from "@/lib/supabase/server"
import { toTitleCase } from "@/lib/text"
import type { NextRequest } from "next/server"

async function getPlanId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("coffee_shop_plans").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  return data?.id ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })
  const { data, error } = await supabase.from("marketing_campaigns").select("*").eq("plan_id", planId).order("created_at", { ascending: true })
  if (error) return Response.json({ error: "Failed to fetch" }, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  if (!body.name || typeof body.name !== "string") return Response.json({ error: "Missing name" }, { status: 400 })

  const { data, error } = await supabase.from("marketing_campaigns").insert({
    plan_id: planId, name: toTitleCase(body.name as string),
    objective: (body.objective as string) ?? "awareness", channels: (body.channels as string[]) ?? [],
    start_date: (body.start_date as string | null) ?? null, end_date: (body.end_date as string | null) ?? null,
    budget_cents: (body.budget_cents as number) ?? 0, actual_spend_cents: (body.actual_spend_cents as number) ?? 0,
    status: (body.status as string) ?? "planned", key_results: (body.key_results as string) ?? "",
  }).select().single()
  if (error) return Response.json({ error: "Failed to create" }, { status: 500 })
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
  if (typeof rest.name === "string") rest.name = toTitleCase(rest.name)

  const { data, error } = await supabase.from("marketing_campaigns").update(rest).eq("id", id as string).eq("plan_id", planId).select().single()
  if (error) return Response.json({ error: "Failed to update" }, { status: 500 })
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
  await supabase.from("marketing_campaigns").delete().eq("id", id).eq("plan_id", planId)
  return Response.json({ ok: true })
}
