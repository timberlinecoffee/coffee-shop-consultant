// TIM-965: CRUD for staff_competencies (plan-level competency template).
// TIM-1299: extended with form_template_id support.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isProvidedString } from "@/lib/hiring"
import { toTitleCase } from "@/lib/text"
import type { NextRequest } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data, error } = await supabase
    .from("staff_competencies")
    .select("*")
    .eq("plan_id", planId)
    .order("order_index")

  if (error) return Response.json({ error: "Failed to fetch competencies" }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  // TIM-1217: allow blank skill (optimistic inline-edit row). See isProvidedString.
  if (!isProvidedString(body.skill)) {
    return Response.json({ error: "Missing required field: skill" }, { status: 400 })
  }

  // TIM-1002: scorecard skill name is label-shaped.
  const { data, error } = await supabase
    .from("staff_competencies")
    .insert({
      plan_id: planId,
      skill: toTitleCase(body.skill),
      rubric: (body.rubric as string | undefined) ?? "",
      required_for_role: (body.required_for_role as string | undefined) ?? null,
      form_template_id: (body.form_template_id as string | undefined) ?? null,
      weight: (body.weight as number | undefined) ?? 1,
      order_index: (body.order_index as number | undefined) ?? 0,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create competency" }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const id = body.id as string | undefined
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { id: _id, ...rest } = body
  if (typeof rest.skill === "string") rest.skill = toTitleCase(rest.skill)
  const { data, error } = await supabase
    .from("staff_competencies")
    .update(rest)
    .eq("id", id)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update competency" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("staff_competencies").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete competency" }, { status: 500 })
  return Response.json({ ok: true })
}
