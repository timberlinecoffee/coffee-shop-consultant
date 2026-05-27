// TIM-776 / TIM-620-B: List + create location candidates for the user's plan.
// TIM-1115: Title-case candidate name + neighborhood at the API boundary.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"
import { toTitleCase } from "@/lib/text"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data, error } = await supabase
    .from("location_candidates")
    .select("*")
    .eq("plan_id", plan.id)
    .eq("archived", false)
    .order("position")

  if (error) {
    console.error("location_candidates select error:", error)
    return Response.json({ error: "Failed to fetch candidates" }, { status: 500 })
  }

  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Missing required field: name" }, { status: 400 })
  }

  const rawNeighborhood = body.neighborhood as string | undefined
  const { data, error } = await supabase
    .from("location_candidates")
    .insert({
      plan_id: plan.id,
      name: toTitleCase(body.name),
      address: (body.address as string | undefined) ?? null,
      neighborhood: rawNeighborhood ? toTitleCase(rawNeighborhood) : null,
      sq_ft: (body.sq_ft as number | undefined) ?? null,
      asking_rent_cents: (body.asking_rent_cents as number | undefined) ?? null,
      cam_cents: (body.cam_cents as number | undefined) ?? null,
      listing_url: (body.listing_url as string | undefined) ?? null,
      broker_contact: (body.broker_contact as string | undefined) ?? null,
      status: (body.status as string | undefined) ?? "shortlisted",
      notes: (body.notes as string | undefined) ?? null,
      position: (body.position as number | undefined) ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error("location_candidates insert error:", error)
    return Response.json({ error: "Failed to create candidate" }, { status: 500 })
  }

  return Response.json(data, { status: 201 })
}
