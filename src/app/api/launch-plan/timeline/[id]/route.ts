import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive } from "@/lib/access";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

async function getAuthedPlanId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, planId: null };
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single();
  return { supabase, user, planId: plan?.id ?? null };
}

async function checkPaywall(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status")
    .eq("id", userId)
    .single();
  return profile && isSubscriptionActive(profile.subscription_status);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const { supabase, user, planId } = await getAuthedPlanId();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });
  if (!(await checkPaywall(supabase, user.id))) {
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("milestone" in body) patch.milestone = body.milestone;
  if ("target_date" in body) patch.target_date = body.target_date ?? null;
  if ("status" in body) patch.status = body.status;
  if ("notes" in body) patch.notes = body.notes ?? null;
  if ("depends_on" in body) patch.depends_on = body.depends_on ?? null;
  if ("order_index" in body) patch.order_index = body.order_index;

  const { data, error } = await supabase
    .from("launch_timeline_items")
    .update(patch)
    .eq("id", id)
    .eq("plan_id", planId)
    .select("*")
    .single();

  if (error) return Response.json({ error: "Failed to update" }, { status: 500 });
  return Response.json({ item: data });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const { supabase, user, planId } = await getAuthedPlanId();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });
  if (!(await checkPaywall(supabase, user.id))) {
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 });
  }

  const { error } = await supabase
    .from("launch_timeline_items")
    .delete()
    .eq("id", id)
    .eq("plan_id", planId);

  if (error) return Response.json({ error: "Failed to delete" }, { status: 500 });
  return new Response(null, { status: 204 });
}
