// TIM-965: CRUD for hiring_plan_roles (org structure).
// TIM-2968: Added order_index support; batch PATCH for drag reorder.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isProvidedString } from "@/lib/hiring"
import { toTitleCase } from "@/lib/text"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const jdId = request.nextUrl.searchParams.get("jd_id")
  if (jdId) {
    const { data, error } = await supabase
      .from("job_description_templates")
      .select("*")
      .eq("id", jdId)
      .maybeSingle()
    if (error) return Response.json({ error: "Failed to fetch JD" }, { status: 500 })
    return Response.json(data)
  }

  const { data, error } = await supabase
    .from("hiring_plan_roles")
    .select("*")
    .eq("plan_id", planId)
    .order("order_index")
    .order("created_at")

  if (error) return Response.json({ error: "Failed to fetch roles" }, { status: 500 })
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

  // TIM-1217: allow blank role_title (optimistic inline-edit row). See isProvidedString.
  if (!isProvidedString(body.role_title)) {
    return Response.json({ error: "Missing required field: role_title" }, { status: 400 })
  }

  // Assign order_index = max sibling + 1 within the parent group.
  const parentId = (body.parent_role_id as string | undefined) ?? null
  const siblingQuery = supabase
    .from("hiring_plan_roles")
    .select("order_index")
    .eq("plan_id", planId)
  const { data: siblings } = parentId
    ? await siblingQuery.eq("parent_role_id", parentId)
    : await siblingQuery.is("parent_role_id", null)
  const maxIdx = siblings && siblings.length > 0
    ? Math.max(...siblings.map((s) => (s.order_index ?? 0) as number))
    : -1

  // TIM-1002: role_title is label-shaped — enforce Title Case at the boundary.
  const { data, error } = await supabase
    .from("hiring_plan_roles")
    .insert({
      plan_id: planId,
      role_title: toTitleCase(body.role_title),
      headcount: (body.headcount as number | undefined) ?? 1,
      start_date: (body.start_date as string | undefined) ?? null,
      monthly_cost_cents: (body.monthly_cost_cents as number | undefined) ?? null,
      status: (body.status as string | undefined) ?? "planned",
      notes: (body.notes as string | undefined) ?? null,
      parent_role_id: parentId,
      jd_template_id: (body.jd_template_id as string | undefined) ?? null,
      order_index: maxIdx + 1,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create role" }, { status: 500 })
  return Response.json(data, { status: 201 })
}

type BatchItem = { id: string; parent_role_id: string | null; order_index: number }

function parseBatch(raw: unknown): BatchItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return null
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null
    const { id, parent_role_id, order_index } = item as Record<string, unknown>
    if (typeof id !== "string") return null
    if (parent_role_id !== null && typeof parent_role_id !== "string") return null
    if (typeof order_index !== "number" || !Number.isInteger(order_index) || order_index < 0) return null
  }
  return raw as BatchItem[]
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  // Batch reorder path: { batch: [{id, parent_role_id, order_index}] }
  if (body.batch !== undefined) {
    const batch = parseBatch(body.batch)
    if (!batch) {
      return Response.json({ error: "Invalid batch payload" }, { status: 400 })
    }
    // Verify all IDs belong to this plan before mutating.
    const ids = batch.map((r) => r.id)
    const { data: owned, error: ownerErr } = await supabase
      .from("hiring_plan_roles")
      .select("id")
      .eq("plan_id", planId)
      .in("id", ids)
    if (ownerErr) return Response.json({ error: "Failed to verify ownership" }, { status: 500 })
    const ownedIds = new Set((owned ?? []).map((r) => r.id))
    if (ids.some((id) => !ownedIds.has(id))) {
      return Response.json({ error: "One or more role IDs not found" }, { status: 404 })
    }
    // Apply updates sequentially (Supabase JS client has no true batch update).
    const updates = await Promise.all(
      batch.map(({ id, parent_role_id, order_index }) =>
        supabase
          .from("hiring_plan_roles")
          .update({ parent_role_id, order_index })
          .eq("id", id)
          .eq("plan_id", planId)
          .select()
          .single()
      )
    )
    const failed = updates.find((u) => u.error)
    if (failed?.error) return Response.json({ error: "Failed to update roles" }, { status: 500 })
    return Response.json(updates.map((u) => u.data))
  }

  const { id, jd, ...rest } = body
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  // JD upsert: create or update the job_description_templates row for this role
  if (jd && typeof jd === "object") {
    const jdFields = jd as Record<string, string>
    const { data: existingRole } = await supabase
      .from("hiring_plan_roles")
      .select("jd_template_id")
      .eq("id", id as string)
      .eq("plan_id", planId)
      .single()

    // TIM-1002: JD `title` is label-shaped (role name); summary/responsibilities/
    // requirements/comp are sentence-form copy.
    const jdTitle = jdFields.title ? toTitleCase(jdFields.title) : ""
    if (existingRole?.jd_template_id) {
      await supabase
        .from("job_description_templates")
        .update({
          title: jdTitle,
          summary: jdFields.summary ?? "",
          responsibilities: jdFields.responsibilities ?? "",
          requirements: jdFields.requirements ?? "",
          comp: jdFields.comp ?? "",
        })
        .eq("id", existingRole.jd_template_id)
    } else {
      const { data: newJd } = await supabase
        .from("job_description_templates")
        .insert({
          plan_id: planId,
          title: jdTitle,
          summary: jdFields.summary ?? "",
          responsibilities: jdFields.responsibilities ?? "",
          requirements: jdFields.requirements ?? "",
          comp: jdFields.comp ?? "",
          is_system: false,
        })
        .select()
        .single()
      if (newJd) {
        await supabase
          .from("hiring_plan_roles")
          .update({ jd_template_id: newJd.id })
          .eq("id", id as string)
          .eq("plan_id", planId)
      }
    }
    const { data: updated } = await supabase
      .from("hiring_plan_roles")
      .select("*")
      .eq("id", id as string)
      .single()
    return Response.json(updated)
  }

  // TIM-1002: enforce Title Case on label fields if present in the patch.
  const cleanedRest = { ...rest } as Record<string, unknown>
  if (typeof cleanedRest.role_title === "string") {
    cleanedRest.role_title = toTitleCase(cleanedRest.role_title)
  }

  const { data, error } = await supabase
    .from("hiring_plan_roles")
    .update(cleanedRest)
    .eq("id", id as string)
    .eq("plan_id", planId)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update role" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("hiring_plan_roles").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete role" }, { status: 500 })
  return Response.json({ ok: true })
}
