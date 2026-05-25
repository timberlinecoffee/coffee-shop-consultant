// TIM-1059: Suppliers & Vendors — list + create vendor candidates.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import {
  isVendorCategoryKey,
  isVendorStatus,
  type VendorCandidate,
} from "@/lib/suppliers";
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
    .from("vendor_candidates")
    .select("*")
    .eq("plan_id", plan.id)
    .order("category", { ascending: true })
    .order("position", { ascending: true });

  if (error) return Response.json({ error: "Failed to fetch candidates" }, { status: 500 });
  return Response.json((data ?? []) as VendorCandidate[]);
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

  const category = body.category;
  if (!isVendorCategoryKey(category)) {
    return Response.json({ error: "Invalid category" }, { status: 400 });
  }

  const status = body.status;
  const source = body.source === "ai_suggested" ? "ai_suggested" : "user_added";

  const { count } = await supabase
    .from("vendor_candidates")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("category", category);

  const rawName = typeof body.name === "string" ? body.name : "";
  const { data, error } = await supabase
    .from("vendor_candidates")
    .insert({
      plan_id: plan.id,
      category,
      name: rawName ? toTitleCase(rawName) : "",
      contact: (body.contact as string | null | undefined) ?? null,
      price_per_unit: (body.price_per_unit as string | null | undefined) ?? null,
      minimum_order: (body.minimum_order as string | null | undefined) ?? null,
      lead_time: (body.lead_time as string | null | undefined) ?? null,
      notes: (body.notes as string | null | undefined) ?? null,
      status: isVendorStatus(status) ? status : "researching",
      source,
      position: typeof body.position === "number" ? body.position : (count ?? 0),
    })
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to create candidate", detail: error.message }, { status: 500 });
  return Response.json(data as VendorCandidate, { status: 201 });
}
