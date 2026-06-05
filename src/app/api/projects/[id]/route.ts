// TIM-2377: Projects CRUD — PATCH (rename / activate) + DELETE.
// PATCH isActive:true sets users.current_plan_id (project switcher).
// DELETE refuses if sole project; reassigns current_plan_id to next-newest on delete.
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import type { NextRequest } from "next/server"

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  locationLabel: z.string().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine((b) => b.name !== undefined || b.locationLabel !== undefined || b.isActive !== undefined, {
  message: "At least one of name, locationLabel, or isActive must be provided",
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = PatchBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, locationLabel, isActive } = parsed.data

  // Owner-check: verify the plan belongs to this user (RLS also enforces, belt+suspenders)
  const { data: existing } = await supabase
    .from("coffee_shop_plans")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!existing) return Response.json({ error: "Project not found" }, { status: 404 })

  // Apply plan-level updates if any fields changed
  const planUpdates: Record<string, unknown> = {}
  if (name !== undefined) planUpdates.plan_name = name
  if (locationLabel !== undefined) planUpdates.location_label = locationLabel

  if (Object.keys(planUpdates).length > 0) {
    const { error } = await supabase
      .from("coffee_shop_plans")
      .update(planUpdates)
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("PATCH /api/projects/:id plan update error:", error.message)
      return Response.json({ error: "Failed to update project" }, { status: 500 })
    }
  }

  // isActive: true → set users.current_plan_id
  if (isActive === true) {
    const { error } = await supabase
      .from("users")
      .update({ current_plan_id: id })
      .eq("id", user.id)

    if (error) {
      console.error("PATCH /api/projects/:id activate error:", error.message)
      return Response.json({ error: "Failed to activate project" }, { status: 500 })
    }
  }

  const { data: updated } = await supabase
    .from("users")
    .select("current_plan_id")
    .eq("id", user.id)
    .maybeSingle()

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name, location_label, created_at")
    .eq("id", id)
    .maybeSingle()

  return Response.json({
    project: {
      id: plan?.id,
      name: plan?.plan_name,
      locationLabel: plan?.location_label ?? null,
      createdAt: plan?.created_at,
      isActive: updated?.current_plan_id === id,
    },
  })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Fetch all user's plans to check sole-project guard and find next-newest
  const { data: plans, error: listErr } = await supabase
    .from("coffee_shop_plans")
    .select("id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (listErr || !plans) {
    console.error("DELETE /api/projects list error:", listErr?.message)
    return Response.json({ error: "Failed to load projects" }, { status: 500 })
  }

  const target = plans.find((p) => p.id === id)
  if (!target) return Response.json({ error: "Project not found" }, { status: 404 })

  // Refuse deletion of the sole project
  if (plans.length === 1) {
    return Response.json({ error: "Cannot delete the only project" }, { status: 400 })
  }

  // If deleting the active project, reassign current_plan_id to next-newest
  const { data: userRow } = await supabase
    .from("users")
    .select("current_plan_id")
    .eq("id", user.id)
    .maybeSingle()

  if (userRow?.current_plan_id === id) {
    const nextPlan = plans.find((p) => p.id !== id)
    if (nextPlan) {
      await supabase
        .from("users")
        .update({ current_plan_id: nextPlan.id })
        .eq("id", user.id)
    }
  }

  const { error: delErr } = await supabase
    .from("coffee_shop_plans")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (delErr) {
    console.error("DELETE /api/projects/:id error:", delErr.message)
    return Response.json({ error: "Failed to delete project" }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
