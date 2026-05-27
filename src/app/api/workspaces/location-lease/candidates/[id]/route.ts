// TIM-776 / TIM-620-B: Update + soft-archive a location candidate.
// TIM-1115: Title-case name + neighborhood on patch.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"
import { toTitleCase } from "@/lib/text"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  // Ownership check: candidate must belong to the user's plan.
  const { data: existing } = await supabase
    .from("location_candidates")
    .select("id, plan_id")
    .eq("id", id)
    .maybeSingle()

  if (!existing) return Response.json({ error: "Candidate not found" }, { status: 404 })
  if (existing.plan_id !== plan.id) return Response.json({ error: "Forbidden" }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const allowed = [
    "name", "address", "neighborhood", "sq_ft", "asking_rent_cents",
    "cam_cents", "listing_url", "broker_contact", "status", "notes", "position",
    // TIM-1145: address autocomplete + geo
    "lat", "lng", "city", "postal_code", "country",
  ] as const

  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }
  if (typeof patch.name === "string") {
    patch.name = patch.name.trim() ? toTitleCase(patch.name) : "Untitled"
  }
  if (typeof patch.neighborhood === "string") {
    patch.neighborhood = patch.neighborhood.trim() ? toTitleCase(patch.neighborhood) : null
  }
  if (typeof patch.city === "string") {
    patch.city = patch.city.trim() ? toTitleCase(patch.city) : null
  }
  // Picking a new address invalidates the cached area analysis.
  if ("lat" in patch || "lng" in patch || "address" in patch) {
    patch.area_analysis = null
    patch.area_analysis_at = null
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No updatable fields provided" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("location_candidates")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("location_candidates update error:", error)
    return Response.json({ error: "Failed to update candidate" }, { status: 500 })
  }

  return Response.json(data)
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data: existing } = await supabase
    .from("location_candidates")
    .select("id, plan_id")
    .eq("id", id)
    .maybeSingle()

  if (!existing) return Response.json({ error: "Candidate not found" }, { status: 404 })
  if (existing.plan_id !== plan.id) return Response.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await supabase
    .from("location_candidates")
    .update({ archived: true })
    .eq("id", id)

  if (error) {
    console.error("location_candidates archive error:", error)
    return Response.json({ error: "Failed to archive candidate" }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
