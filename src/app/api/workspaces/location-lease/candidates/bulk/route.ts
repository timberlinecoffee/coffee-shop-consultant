// TIM-1153: Bulk-update candidate status (shortlist / un-shortlist many at once).
// TIM-3686: Add bulk DELETE handler (soft-archive with ownership + UUID validation).
// PATCH /api/workspaces/location-lease/candidates/bulk
//   body: { ids: string[], status: CandidateStatus }
// DELETE /api/workspaces/location-lease/candidates/bulk
//   body: { ids: string[] }
// TIM-2868: getActivePlanId() — see candidates/route.ts header.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"
import { getActivePlanId } from "@/lib/plan-context"

const ALLOWED_STATUSES = new Set([
  "shortlisted",
  "viewing_scheduled",
  "lease_review",
  "passed",
  "signed",
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BULK = 100

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const ids = body.ids
  const status = body.status
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
    return Response.json({ error: "ids must be a non-empty array of strings" }, { status: 400 })
  }
  if (typeof status !== "string" || !ALLOWED_STATUSES.has(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 })
  }

  // Ownership check: every candidate must belong to this user's plan.
  const { data: rows, error: lookupErr } = await supabase
    .from("location_candidates")
    .select("id, plan_id")
    .in("id", ids as string[])

  if (lookupErr) {
    return Response.json({ error: "Failed to load candidates" }, { status: 500 })
  }
  if (!rows || rows.length !== ids.length) {
    return Response.json({ error: "One or more candidates not found" }, { status: 404 })
  }
  if (rows.some((r) => r.plan_id !== planId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("location_candidates")
    .update({ status })
    .in("id", ids as string[])
    .select()

  if (error) {
    console.error("location_candidates bulk update error:", error)
    return Response.json({ error: "Failed to update candidates" }, { status: 500 })
  }

  return Response.json({ updated: data?.length ?? 0, candidates: data ?? [] })
}

// TIM-3686: Bulk soft-delete (archive) location candidates.
// Standing Rules: §2 server-side ownership, §3 UUID validation + max cap, §5 no stack traces.
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const rawIds = body.ids
  if (
    !Array.isArray(rawIds) ||
    rawIds.length === 0 ||
    !rawIds.every((x) => typeof x === "string" && UUID_RE.test(x))
  ) {
    return Response.json(
      { error: `ids must be a non-empty array of valid UUIDs` },
      { status: 400 }
    )
  }
  // Deduplicate and normalise to lowercase so Postgres text comparison always matches.
  const ids = [...new Set((rawIds as string[]).map((x) => x.toLowerCase()))]
  if (ids.length > MAX_BULK) {
    return Response.json(
      { error: `ids must contain at most ${MAX_BULK} distinct UUIDs` },
      { status: 400 }
    )
  }

  // Rule 2: Re-verify ownership — every candidate must belong to this user's plan.
  const { data: rows, error: lookupErr } = await supabase
    .from("location_candidates")
    .select("id, plan_id")
    .in("id", ids as string[])

  if (lookupErr) {
    console.error("location_candidates bulk delete lookup error:", lookupErr)
    return Response.json({ error: "Failed to load candidates" }, { status: 500 })
  }
  if (!rows || rows.length !== ids.length) {
    return Response.json({ error: "One or more candidates not found" }, { status: 404 })
  }
  if (rows.some((r) => r.plan_id !== planId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabase
    .from("location_candidates")
    .update({ archived: true })
    .in("id", ids as string[])

  if (error) {
    console.error("location_candidates bulk delete error:", error)
    return Response.json({ error: "Failed to delete candidates" }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
