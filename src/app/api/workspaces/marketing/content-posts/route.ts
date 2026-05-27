// TIM-1036: Content Calendar posts CRUD.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

async function getPlanId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("coffee_shop_plans").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  return data?.id ?? null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const year  = request.nextUrl.searchParams.get("year")
  const month = request.nextUrl.searchParams.get("month")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase.from("marketing_content_posts").select("*").eq("plan_id", planId).order("post_date", { ascending: true })
  if (year && month) {
    const y = parseInt(year, 10), m = parseInt(month, 10)
    const from = `${y}-${String(m).padStart(2, "0")}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    query = query.gte("post_date", from).lte("post_date", to)
  }
  const { data, error } = await query
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
  if (!body.post_date) return Response.json({ error: "Missing post_date" }, { status: 400 })

  const { data, error } = await supabase.from("marketing_content_posts").insert({
    plan_id: planId, post_date: body.post_date as string, channels: (body.channels as string[]) ?? [],
    theme: (body.theme as string) ?? "", format: (body.format as string) ?? "photo",
    caption_draft: (body.caption_draft as string) ?? "", status: (body.status as string) ?? "planned",
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

  const { data, error } = await supabase.from("marketing_content_posts").update(rest).eq("id", id as string).eq("plan_id", planId).select().single()
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
  await supabase.from("marketing_content_posts").delete().eq("id", id).eq("plan_id", planId)
  return Response.json({ ok: true })
}
