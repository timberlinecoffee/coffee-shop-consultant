// TIM-1038: Supplies items — GET (list) + POST (create).

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  const { data, error } = await supabase
    .from("buildout_supplies_items")
    .select("*")
    .eq("plan_id", plan.id)
    .eq("archived", false)
    .order("position");

  if (error) return Response.json({ error: "Failed to fetch supplies" }, { status: 500 });
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

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { count } = await supabase
    .from("buildout_supplies_items")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("archived", false);

  const { data, error } = await supabase
    .from("buildout_supplies_items")
    .insert({
      plan_id: plan.id,
      section_id: (body.section_id as string | null) ?? null,
      name: toTitleCase((body.name as string | undefined) ?? "New Item"),
      vendor: body.vendor ? toTitleCase(body.vendor as string) : null,
      unit_type: (body.unit_type as string | undefined) ?? "unit",
      quantity: (body.quantity as number | undefined) ?? 1,
      unit_cost_cents: (body.unit_cost_cents as number | undefined) ?? 0,
      source: (body.source as string | undefined) ?? "user_added",
      notes: (body.notes as string | null | undefined) ?? null,
      position: typeof body.position === "number" ? body.position : (count ?? 0),
    })
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to create supplies item" }, { status: 500 });
  return Response.json(data, { status: 201 });
}
