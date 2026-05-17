import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive } from "@/lib/access";
import type { NextRequest } from "next/server";

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

export async function GET() {
  const { supabase, user, planId } = await getAuthedPlanId();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  const { data, error } = await supabase
    .from("marketing_kickoff_items")
    .select("*")
    .eq("plan_id", planId)
    .order("launch_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: "Failed to load" }, { status: 500 });
  return Response.json({ items: data ?? [] });
}

export async function POST(request: NextRequest) {
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

  const { channel, asset, launch_date, status: itemStatus, responsible, notes } = body as {
    channel?: string;
    asset?: string;
    launch_date?: string | null;
    status?: string;
    responsible?: string | null;
    notes?: string | null;
  };

  if (!channel || !asset) {
    return Response.json({ error: "channel and asset are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("marketing_kickoff_items")
    .insert({
      plan_id: planId,
      channel,
      asset,
      launch_date: launch_date ?? null,
      status: (itemStatus as "pending" | "in_progress" | "done" | "at_risk") ?? "pending",
      responsible: responsible ?? null,
      notes: notes ?? null,
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: "Failed to create" }, { status: 500 });
  return Response.json({ item: data }, { status: 201 });
}
