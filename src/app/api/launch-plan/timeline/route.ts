import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive } from "@/lib/access";
import type { NextRequest } from "next/server";

async function getAuthedPlanId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, planId: null, error: "Unauthorized", status: 401 };

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!plan) return { supabase, user, planId: null, error: "No plan found", status: 404 };
  return { supabase, user, planId: plan.id, error: null, status: 200 };
}

async function checkPaywall(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status")
    .eq("id", userId)
    .single();
  return profile && isSubscriptionActive(profile.subscription_status);
}

export async function GET() {
  const { supabase, planId, error, status } = await getAuthedPlanId();
  if (error) return Response.json({ error }, { status });

  const { data, error: dbErr } = await supabase
    .from("launch_timeline_items")
    .select("*")
    .eq("plan_id", planId!)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (dbErr) return Response.json({ error: "Failed to load" }, { status: 500 });
  return Response.json({ items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user, planId, error, status } = await getAuthedPlanId();
  if (error || !user) return Response.json({ error }, { status });

  if (!(await checkPaywall(supabase, user.id))) {
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { milestone, target_date, status: itemStatus, notes, depends_on, order_index } = body as {
    milestone?: string;
    target_date?: string | null;
    status?: string;
    notes?: string | null;
    depends_on?: string | null;
    order_index?: number;
  };

  if (!milestone) {
    return Response.json({ error: "milestone is required" }, { status: 400 });
  }
  if (!target_date) {
    return Response.json({ error: "target_date is required" }, { status: 400 });
  }

  const { count } = await supabase
    .from("launch_timeline_items")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", planId!);

  const { data, error: dbErr } = await supabase
    .from("launch_timeline_items")
    .insert({
      plan_id: planId!,
      milestone,
      target_date: target_date ?? null,
      status: (itemStatus as "pending" | "in_progress" | "done" | "at_risk") ?? "pending",
      notes: notes ?? null,
      depends_on: depends_on ?? null,
      order_index: typeof order_index === "number" ? order_index : (count ?? 0),
      digest: {},
    })
    .select("*")
    .single();

  if (dbErr) return Response.json({ error: "Failed to create" }, { status: 500 });
  return Response.json({ item: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, planId, error, status } = await getAuthedPlanId();
  if (error || !user) return Response.json({ error }, { status });

  if (!(await checkPaywall(supabase, user.id))) {
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { updates } = body as { updates?: Array<{ id: string; order_index: number }> };
  if (!Array.isArray(updates)) return Response.json({ error: "updates array required" }, { status: 400 });

  const results = await Promise.all(
    updates.map(({ id, order_index }) =>
      supabase
        .from("launch_timeline_items")
        .update({ order_index })
        .eq("id", id)
        .eq("plan_id", planId!)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return Response.json({ error: "Failed to reorder" }, { status: 500 });
  return Response.json({ ok: true });
}
