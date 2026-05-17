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

  const { data, error } = await supabase
    .from("hiring_plan_roles")
    .update({
      role_title: body.role_title as string | undefined,
      headcount: body.headcount as number | undefined,
      start_date: body.start_date as string | null | undefined,
      monthly_cost_cents: body.monthly_cost_cents as number | null | undefined,
      status: body.status as "planned" | "posted" | "interviewing" | "hired" | undefined,
      notes: body.notes as string | null | undefined,
    })
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
    .from("hiring_plan_roles")
    .delete()
    .eq("id", id)
    .eq("plan_id", planId);

  if (error) return Response.json({ error: "Failed to delete" }, { status: 500 });
  return new Response(null, { status: 204 });
}
