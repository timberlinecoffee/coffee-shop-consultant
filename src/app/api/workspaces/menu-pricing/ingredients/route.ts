// TIM-967: CRUD for menu_ingredients.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { toTitleCase } from "@/lib/text"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const { data, error } = await supabase
    .from("menu_ingredients")
    .select("*")
    .eq("plan_id", planId)
    .order("name")

  if (error) return Response.json({ error: "Failed to fetch ingredients" }, { status: 500 })
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

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Missing required field: name" }, { status: 400 })
  }
  if (body.package_size === undefined || body.package_size === null) {
    return Response.json({ error: "Missing required field: package_size" }, { status: 400 })
  }
  if (!body.package_unit || typeof body.package_unit !== "string") {
    return Response.json({ error: "Missing required field: package_unit" }, { status: 400 })
  }

  // TIM-1002: ingredient name is label-shaped — enforce Title Case.
  // TIM-3861: validate category when provided
  const rawCategory = body.category as string | undefined | null
  if (rawCategory !== undefined && rawCategory !== null && rawCategory !== 'ingredient' && rawCategory !== 'supply') {
    return Response.json({ error: "category must be 'ingredient' or 'supply'" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("menu_ingredients")
    .insert({
      plan_id: planId,
      name: toTitleCase(body.name),
      package_size: body.package_size as number,
      package_unit: body.package_unit as string,
      package_cost_cents: (body.package_cost_cents as number | undefined) ?? 0,
      vendor_id: (body.vendor_id as string | undefined) ?? null,
      notes: (body.notes as string | undefined) ?? null,
      category: (rawCategory as 'ingredient' | 'supply' | null | undefined) ?? null,
    })
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to create ingredient" }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { id, ...rest } = body
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const allowed: Record<string, unknown> = {}
  const fields = ["name", "package_size", "package_unit", "package_cost_cents", "vendor_id", "notes", "category"]
  for (const f of fields) {
    if (f in rest) {
      const val = rest[f]
      if (f === "category" && val !== undefined && val !== null && val !== 'ingredient' && val !== 'supply') {
        return Response.json({ error: "category must be 'ingredient', 'supply', or null" }, { status: 400 })
      }
      allowed[f] = f === "name" && typeof val === "string" ? toTitleCase(val) : val
    }
  }

  const { data, error } = await supabase
    .from("menu_ingredients")
    .update(allowed)
    .eq("id", id as string)
    .eq("plan_id", planId)
    .select()
    .single()

  if (error) return Response.json({ error: "Failed to update ingredient" }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("menu_ingredients").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete ingredient" }, { status: 500 })
  return Response.json({ ok: true })
}
