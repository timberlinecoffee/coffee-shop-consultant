// TIM-1036: Marketing Brand upsert (one row per plan).
import { createClient } from "@/lib/supabase/server"
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
  const { data } = await supabase.from("marketing_brand").select("*").eq("plan_id", planId).maybeSingle()
  return Response.json(data ?? null)
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const allowed = ["positioning_statement", "brand_pillar_1", "brand_pillar_2", "brand_pillar_3", "do_say", "dont_say"]
  const patch: Record<string, unknown> = {}
  for (const k of allowed) { if (k in body) patch[k] = body[k] }

  const { data, error } = await supabase
    .from("marketing_brand")
    .upsert({ plan_id: planId, ...patch }, { onConflict: "plan_id" })
    .select().single()
  if (error) return Response.json({ error: "Failed to save" }, { status: 500 })
  return Response.json(data)
}
