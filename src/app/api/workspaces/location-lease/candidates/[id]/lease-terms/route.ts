// TIM-776 / TIM-620-B: Upsert lease terms for a location candidate (1:1 per candidate).
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id: candidateId } = await params

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
  const { data: candidate } = await supabase
    .from("location_candidates")
    .select("id, plan_id")
    .eq("id", candidateId)
    .maybeSingle()

  if (!candidate) return Response.json({ error: "Candidate not found" }, { status: 404 })
  if (candidate.plan_id !== plan.id) return Response.json({ error: "Forbidden" }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("location_lease_terms")
    .upsert(
      {
        candidate_id: candidateId,
        base_rent_cents: (body.base_rent_cents as number | undefined) ?? null,
        rent_escalation_pct: (body.rent_escalation_pct as number | undefined) ?? null,
        security_deposit_cents: (body.security_deposit_cents as number | undefined) ?? null,
        ti_allowance_cents: (body.ti_allowance_cents as number | undefined) ?? null,
        term_months: (body.term_months as number | undefined) ?? null,
        options_text: (body.options_text as string | undefined) ?? null,
        personal_guarantee: (body.personal_guarantee as string | undefined) ?? null,
        exit_clauses: (body.exit_clauses as string | undefined) ?? null,
      },
      { onConflict: "candidate_id" }
    )
    .select()
    .single()

  if (error) {
    console.error("location_lease_terms upsert error:", error)
    return Response.json({ error: "Failed to upsert lease terms" }, { status: 500 })
  }

  return Response.json(data)
}
