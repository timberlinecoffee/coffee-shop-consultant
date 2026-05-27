// TIM-972: Equipment items CRUD — GET (list) + POST (create).
// Reads/writes buildout_equipment_items table (not workspace_documents).

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    .from("buildout_equipment_items")
    .select("*")
    .eq("plan_id", plan.id)
    .eq("archived", false)
    .order("position");

  if (error) {
    console.error("buildout_equipment_items select error:", error);
    return Response.json({ error: "Failed to fetch equipment" }, { status: 500 });
  }

  return Response.json(data ?? []);
}

export async function POST(request: NextRequest) {
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

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Missing required field: name" }, { status: 400 });
  }

  // Count existing items to set position
  const { count } = await supabase
    .from("buildout_equipment_items")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("archived", false);

  // TIM-1002: name/vendor/model/supplier are label-shaped — enforce Title Case
  // at the boundary regardless of caller (seed, UI, AI suggester).
  const vendorRaw = body.vendor as string | undefined;
  const modelRaw = body.model as string | undefined;
  const supplierRaw = body.supplier as string | undefined;
  const { data, error } = await supabase
    .from("buildout_equipment_items")
    .insert({
      plan_id: plan.id,
      name: toTitleCase(body.name as string),
      category: (body.category as string | undefined) ?? "miscellaneous",
      vendor: vendorRaw ? toTitleCase(vendorRaw) : null,
      model: modelRaw ? toTitleCase(modelRaw) : null,
      supplier: supplierRaw ? toTitleCase(supplierRaw) : null,
      vendor_candidate_id: (body.vendor_candidate_id as string | null | undefined) ?? null,
      quantity: (body.quantity as number | undefined) ?? 1,
      unit_cost_cents: (body.unit_cost_cents as number | undefined) ?? 0,
      priority_tier: (body.priority_tier as string | undefined) ?? "must_have",
      financing_method: (body.financing_method as string | undefined) ?? "cash",
      source: (body.source as string | undefined) ?? "user_added",
      notes: (body.notes as string | undefined) ?? null,
      position: count ?? 0,
    })
    .select()
    .single();

  if (error) {
    console.error("buildout_equipment_items insert error:", error);
    return Response.json({ error: "Failed to create equipment item" }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}
