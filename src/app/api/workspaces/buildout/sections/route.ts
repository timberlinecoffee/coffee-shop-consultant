// TIM-1038: Sections CRUD — GET (list) + POST (create).
// Shared by equipment and supplies lists.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";

async function getAuthedPlan(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return plan;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const listType = request.nextUrl.searchParams.get("list_type") ?? "equipment";

  const plan = await getAuthedPlan(supabase, user.id);
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  const { data, error } = await supabase
    .from("buildout_list_sections")
    .select("*")
    .eq("plan_id", plan.id)
    .eq("list_type", listType)
    .order("position");

  if (error) return Response.json({ error: "Failed to fetch sections" }, { status: 500 });

  return Response.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();

  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  const plan = await getAuthedPlan(supabase, user.id);
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listType = (body.list_type as string) ?? "equipment";
  if (!["equipment", "supplies"].includes(listType)) {
    return Response.json({ error: "Invalid list_type" }, { status: 400 });
  }

  // Auto-position: append to end
  const { count } = await supabase
    .from("buildout_list_sections")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("list_type", listType);

  const { data, error } = await supabase
    .from("buildout_list_sections")
    .insert({
      plan_id: plan.id,
      list_type: listType,
      name: toTitleCase((body.name as string) ?? "New Section"),
      position: typeof body.position === "number" ? body.position : (count ?? 0),
      collapsed: false,
    })
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to create section" }, { status: 500 });

  return Response.json(data, { status: 201 });
}
