// TIM-1038: Supplies item PATCH + DELETE.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string
) {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return null;

  const { data: item } = await supabase
    .from("buildout_supplies_items")
    .select("id, plan_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.plan_id !== plan.id) return null;
  return item;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
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

  const item = await getOwnedItem(supabase, user.id, id);
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allowed = ["name", "vendor", "unit_type", "quantity", "unit_cost_cents", "notes", "position", "section_id"] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      const val = body[key];
      if (key === "name" && typeof val === "string") patch[key] = toTitleCase(val);
      else if (key === "vendor") patch[key] = val ? toTitleCase(val as string) : null;
      else patch[key] = val;
    }
  }

  if (Object.keys(patch).length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("buildout_supplies_items")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to update item" }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
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

  const item = await getOwnedItem(supabase, user.id, id);
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });

  const { error } = await supabase
    .from("buildout_supplies_items")
    .update({ archived: true })
    .eq("id", id);
  if (error) return Response.json({ error: "Failed to delete item" }, { status: 500 });
  return new Response(null, { status: 204 });
}
