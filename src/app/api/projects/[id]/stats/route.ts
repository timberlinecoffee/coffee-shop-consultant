// TIM-2805: Returns dependent row count for /api/projects/:id/stats.
// Used by DeleteConfirmModal to surface "N saved records" before the user confirms.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Server-side owner check (Rule #2: never trust the browser)
  const { data: existing } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!existing) return Response.json({ error: "Project not found" }, { status: 404 })

  // Parallel HEAD queries — no rows fetched, just counts from Prefer: count=exact header
  const [
    r1, r2, r3, r4, r5, r6, r7,
    r8, r9, r10, r11, r12, r13,
  ] = await Promise.all([
    supabase.from("workspace_responses").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("ai_conversations").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("cost_tracker").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("milestones").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("launch_milestones").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("menu_items").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("buildout_equipment_items").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("location_candidates").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("hiring_plan_roles").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("vendor_candidates").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("launch_timeline_items").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("soft_open_plan_items").select("*", { count: "exact", head: true }).eq("plan_id", id),
    supabase.from("marketing_kickoff_items").select("*", { count: "exact", head: true }).eq("plan_id", id),
  ])

  const dependentRowCount = [
    r1, r2, r3, r4, r5, r6, r7,
    r8, r9, r10, r11, r12, r13,
  ].reduce((sum, { count }) => sum + (count ?? 0), 0)

  return Response.json({ dependentRowCount })
}
