// TIM-1153: Bulk-update candidate status (shortlist / un-shortlist many at once).
// PATCH /api/workspaces/location-lease/candidates/bulk
//   body: { ids: string[], status: CandidateStatus }
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
