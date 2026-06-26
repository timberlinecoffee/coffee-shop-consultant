// TIM-1140: CRUD for menu_categories (per-plan, user-editable).
// TIM-3247: PATCH also accepts target_cogs_low_pct / target_cogs_high_pct for the preset picker.
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { toTitleCase } from "@/lib/text"
import { z } from "zod"
import type { NextRequest } from "next/server"

// TIM-3247: Standing Rule 3 — server-side Zod validation for COGS range fields.
const CogsRangePatchSchema = z.object({
  target_cogs_low_pct: z.number().min(0).max(100),
  target_cogs_high_pct: z.number().min(0).max(100),
}).refine((v) => v.target_cogs_low_pct < v.target_cogs_high_pct, {
  message: "Low must be less than high",
})

export const runtime = "nodejs"

const DEFAULT_SEED = [
  { name: "Espresso",      position: 0 },
  { name: "Brewed Coffee", position: 1 },
  { name: "Food",          position: 2 },
  { name: "Retail",        position: 3 },
  { name: "Seasonal",      position: 4 },
]

// Idempotent: ensure the plan has at least the default category set on first
// load (covers plans created before the migration backfill, or any future
// plan-creation path that forgets to seed).
async function ensureDefaults(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
) {
  const { data: existing } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("plan_id", planId)
    .limit(1)
  if (existing && existing.length > 0) return
  await supabase
    .from("menu_categories")
    .insert(
      DEFAULT_SEED.map((c) => ({
        plan_id: planId,
        name: c.name,
        position: c.position,
        is_default: true,
      })),
    )
}

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  await ensureDefaults(supabase, planId)

  const { data, error } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("plan_id", planId)
    .order("position")

  if (error) return Response.json({ error: "Failed to fetch categories" }, { status: 500 })
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

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "Missing required field: name" }, { status: 400 })
  }

  // Compute next position if not supplied.
  let position = body.position as number | undefined
  if (position === undefined) {
    const { data: existing } = await supabase
      .from("menu_categories")
      .select("position")
      .eq("plan_id", planId)
      .order("position", { ascending: false })
      .limit(1)
    position = (existing?.[0]?.position ?? -1) + 1
  }

  const { data, error } = await supabase
    .from("menu_categories")
    .insert({
      plan_id: planId,
      name: toTitleCase(body.name.trim()),
      position,
      is_default: false,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "A category with this name already exists" }, { status: 409 })
    }
    return Response.json({ error: "Failed to create category" }, { status: 500 })
  }
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

  // Bulk reorder: { reorder: [{ id, position }, ...] }
  if (Array.isArray(body.reorder)) {
    const rows = body.reorder as Array<{ id?: unknown; position?: unknown }>
    const updates = rows
      .filter((r) => typeof r.id === "string" && typeof r.position === "number")
      .map((r) =>
        supabase
          .from("menu_categories")
          .update({ position: r.position as number })
          .eq("id", r.id as string)
          .eq("plan_id", planId),
      )
    const results = await Promise.all(updates)
    const firstError = results.find((r) => r.error)
    if (firstError?.error) {
      return Response.json({ error: "Failed to reorder categories" }, { status: 500 })
    }
    return Response.json({ ok: true })
  }

  const { id, ...rest } = body
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const allowed: Record<string, unknown> = {}
  if ("name" in rest && typeof rest.name === "string" && rest.name.trim()) {
    allowed.name = toTitleCase(rest.name.trim())
  }
  if ("position" in rest && typeof rest.position === "number") {
    allowed.position = rest.position
  }

  // TIM-3247: COGS range update — Zod-validated pair (both fields required together).
  if ("target_cogs_low_pct" in rest || "target_cogs_high_pct" in rest) {
    const parsed = CogsRangePatchSchema.safeParse({
      target_cogs_low_pct: rest.target_cogs_low_pct,
      target_cogs_high_pct: rest.target_cogs_high_pct,
    })
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid COGS range" },
        { status: 400 },
      )
    }
    // Safety gate: never overwrite a range that is already set unless the caller
    // explicitly passes both values (the picker always does — this is belt-and-braces).
    allowed.target_cogs_low_pct  = parsed.data.target_cogs_low_pct
    allowed.target_cogs_high_pct = parsed.data.target_cogs_high_pct
  }

  const { data, error } = await supabase
    .from("menu_categories")
    .update(allowed)
    .eq("id", id as string)
    .eq("plan_id", planId)
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "A category with this name already exists" }, { status: 409 })
    }
    return Response.json({ error: "Failed to update category" }, { status: 500 })
  }
  return Response.json(data)
}

// DELETE ?id=<cat> [&moveToId=<otherCat>]
// If the category has items, the caller MUST supply moveToId so we can
// reparent before deleting (FK is ON DELETE RESTRICT — silent-delete would
// otherwise fail at the DB level).
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  const id = request.nextUrl.searchParams.get("id")
  const moveToId = request.nextUrl.searchParams.get("moveToId")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const { data: targetCat } = await supabase
    .from("menu_categories")
    .select("id, plan_id")
    .eq("id", id)
    .eq("plan_id", planId)
    .maybeSingle()
  if (!targetCat) return Response.json({ error: "Category not found" }, { status: 404 })

  const { count: itemCount } = await supabase
    .from("menu_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id)
    .eq("archived", false)

  if ((itemCount ?? 0) > 0) {
    if (!moveToId) {
      return Response.json(
        { error: "Category has items: supply moveToId to reparent before delete", itemCount },
        { status: 409 },
      )
    }
    const { data: dest } = await supabase
      .from("menu_categories")
      .select("id")
      .eq("id", moveToId)
      .eq("plan_id", planId)
      .maybeSingle()
    if (!dest) return Response.json({ error: "moveToId not found" }, { status: 404 })

    const { error: moveErr } = await supabase
      .from("menu_items")
      .update({ category_id: moveToId })
      .eq("category_id", id)
    if (moveErr) return Response.json({ error: "Failed to move items" }, { status: 500 })
  }

  const { error } = await supabase.from("menu_categories").delete().eq("id", id)
  if (error) return Response.json({ error: "Failed to delete category" }, { status: 500 })
  return Response.json({ ok: true })
}
