// TIM-1299: CRUD + duplicate for interview_scorecards.
// duplicate action: POST { action: "duplicate", id } copies scorecard + all its questions with new ids.
import { createClient } from "@/lib/supabase/server"
import { isProvidedString } from "@/lib/hiring"
import { toTitleCase } from "@/lib/text"
import type { NextRequest } from "next/server"

async function getPlanId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const roleId = request.nextUrl.searchParams.get("role_id")

  let query = supabase
    .from("interview_scorecards")
    .select("*")
    .eq("plan_id", planId)
    .order("order_index")

  if (roleId === "null") {
    query = query.is("role_id", null)
  } else if (roleId) {
    query = query.eq("role_id", roleId)
  }

  const { data, error } = await query
  if (error) return Response.json({ error: "Failed to fetch scorecards" }, { status: 500 })
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

  // Duplicate action: copy scorecard + all its questions with new ids.
  if (body.action === "duplicate") {
    const sourceId = body.id as string | undefined
    if (!sourceId) return Response.json({ error: "Missing id for duplicate" }, { status: 400 })

    const { data: source } = await supabase
      .from("interview_scorecards")
      .select("*")
      .eq("id", sourceId)
      .eq("plan_id", planId)
      .single()
    if (!source) return Response.json({ error: "Scorecard not found" }, { status: 404 })

    const { data: copy, error: copyErr } = await supabase
      .from("interview_scorecards")
      .insert({
        plan_id: planId,
        role_id: source.role_id,
        name: toTitleCase(source.name + " Copy"),
        is_default: false,
        order_index: (source.order_index ?? 0) + 1,
      })
      .select()
      .single()
    if (copyErr || !copy) return Response.json({ error: "Failed to duplicate scorecard" }, { status: 500 })

    const { data: sourceQuestions } = await supabase
      .from("interview_questions")
      .select("*")
      .eq("scorecard_id", sourceId)
      .order("order_index")

    if (sourceQuestions && sourceQuestions.length > 0) {
      await supabase.from("interview_questions").insert(
        sourceQuestions.map((q) => ({
          plan_id: planId,
          role_id: q.role_id,
          scorecard_id: copy.id,
          prompt: q.prompt,
          weight: q.weight,
          order_index: q.order_index,
        }))
      )
    }

    return Response.json(copy, { status: 201 })
  }

  // Regular create.
  if (!isProvidedString(body.name)) {
    return Response.json({ error: "Missing required field: name" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("interview_scorecards")
    .insert({
      plan_id: planId,
      role_id: (body.role_id as string | undefined) ?? null,
      name: toTitleCase(body.name as string),
      is_default: (body.is_default as boolean | undefined) ?? false,
      order_index: (body.order_index as number | undefined) ?? 0,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create scorecard" }, { status: 500 })
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

  const id = body.id as string | undefined
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { id: _id, ...rest } = body
  if (typeof rest.name === "string") rest.name = toTitleCase(rest.name)

  const { data, error } = await supabase
    .from("interview_scorecards")
    .update(rest)
    .eq("id", id)
    .eq("plan_id", planId)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update scorecard" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getPlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase
    .from("interview_scorecards")
    .delete()
    .eq("id", id)
    .eq("plan_id", planId)

  if (error) return Response.json({ error: "Failed to delete scorecard" }, { status: 500 })
  return Response.json({ ok: true })
}
