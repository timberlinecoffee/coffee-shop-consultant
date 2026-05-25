// TIM-972: Equipment item PATCH (update) + DELETE (soft-archive).

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";

// TIM-1002: equipment label-shaped fields; PATCH boundary enforces Title Case.
const TITLE_CASE_EQUIPMENT_FIELDS = new Set(["name", "vendor", "model"]);

type RouteContext = { params: Promise<{ id: string }> };

async function getPlanAndOwnership(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, itemId: string) {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return { plan: null, item: null };

  const { data: item } = await supabase
    .from("buildout_equipment_items")
    .select("id, plan_id")
    .eq("id", itemId)
    .maybeSingle();

  return { plan, item };
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  const { plan, item } = await getPlanAndOwnership(supabase, user.id, id);
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });
  if (item.plan_id !== plan.id) return Response.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const allowed = [
    "name", "category", "vendor", "model", "supplier", "quantity",
    "unit_cost_cents", "priority_tier", "financing_method", "notes", "position",
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      const val = body[key];
      patch[key] =
        TITLE_CASE_EQUIPMENT_FIELDS.has(key) && typeof val === "string"
          ? toTitleCase(val)
          : val;
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("buildout_equipment_items")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("buildout_equipment_items update error:", error);
    return Response.json({ error: "Failed to update item" }, { status: 500 });
  }

  return Response.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  const { plan, item } = await getPlanAndOwnership(supabase, user.id, id);
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });
  if (item.plan_id !== plan.id) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("buildout_equipment_items")
    .update({ archived: true })
    .eq("id", id);

  if (error) {
    console.error("buildout_equipment_items archive error:", error);
    return Response.json({ error: "Failed to delete item" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
