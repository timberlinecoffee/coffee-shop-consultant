// TIM-2965: switched off the inline `coffee_shop_plans.eq(user_id).single()`
// resolver — that pattern 500s for any user with more than one plan because
// `.single()` rejects multi-row results. Use the canonical `getActivePlanId`
// (TIM-2377), which honors `users.current_plan_id` and falls back to the
// latest plan. Sibling routes in this suite already use the latest-by-created
// fallback; this aligns and goes one better by respecting active-project.
import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import { isSubscriptionActive } from "@/lib/access";
import type { NextRequest } from "next/server";

async function checkPaywall(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status")
    .eq("id", userId)
    .single();
  return profile && isSubscriptionActive(profile.subscription_status);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  const { data, error: dbErr } = await supabase
    .from("soft_open_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .order("day_offset", { ascending: true })
    .order("created_at", { ascending: true });

  if (dbErr) return Response.json({ error: "Failed to load" }, { status: 500 });
  return Response.json({ items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  if (!(await checkPaywall(supabase, user.id))) {
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { day_offset, task, owner, status: itemStatus, notes } = body as {
    day_offset?: number;
    task?: string;
    owner?: string | null;
    status?: string;
    notes?: string | null;
  };

  if (typeof day_offset !== "number" || !task) {
    return Response.json({ error: "day_offset and task are required" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase
    .from("soft_open_plan_items")
    .insert({
      plan_id: planId,
      day_offset,
      task,
      owner: owner ?? null,
      status: (itemStatus as "pending" | "in_progress" | "done" | "at_risk") ?? "pending",
      notes: notes ?? null,
    })
    .select("*")
    .single();

  if (dbErr) return Response.json({ error: "Failed to create" }, { status: 500 });
  return Response.json({ item: data }, { status: 201 });
}
