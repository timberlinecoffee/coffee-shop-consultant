// TIM-1036: Digital Presence channels CRUD.
import { createClient } from "@/lib/supabase/server"
import { toTitleCase } from "@/lib/text"
import type { NextRequest } from "next/server"
import { DEFAULT_DIGITAL_CHANNELS } from "@/lib/marketing"

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

  const { data } = await supabase.from("marketing_digital_presence").select("*").eq("plan_id", planId).order("position", { ascending: true })
  if (!data || data.length === 0) {
    const seeds = DEFAULT_DIGITAL_CHANNELS.map((c) => ({ plan_id: planId, channel_name: c.channel_name, position: c.position, status: "not_started", is_system: true }))
    const { data: seeded } = await supabase.from("marketing_digital_presence").insert(seeds).select()
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

  const { data: existing } = await supabase.from("marketing_digital_presence").select("position").eq("plan_id", planId).order("position", { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabase.from("marketing_digital_presence").insert({ plan_id: planId, channel_name: toTitleCase(body.channel_name as string), status: "not_started", is_system: false, position: (existing?.position ?? -1) + 1 }).select().single()
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
  if (typeof rest.channel_name === "string") rest.channel_name = toTitleCase(rest.channel_name)

  const { data, error } = await supabase.from("marketing_digital_presence").update(rest).eq("id", id as string).eq("plan_id", planId).select().single()
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
  const { error } = await supabase.from("marketing_digital_presence").delete().eq("id", id).eq("plan_id", planId)
  if (error) return Response.json({ error: "Failed to delete" }, { status: 500 })
  return Response.json({ ok: true })
}
