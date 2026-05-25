// TIM-1059: Suppliers & Vendors — list current decision-log entries.
// Decisions are created from the candidates PATCH handler when status flips to
// `chosen`.  This route exposes the current set for the workspace UI and the
// Concept brief.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { isVendorCategoryKey, type VendorDecision } from "@/lib/suppliers";
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
    .from("vendor_decisions")
    .select("*")
    .eq("plan_id", plan.id)
    .eq("is_current", true)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: "Failed to fetch decisions" }, { status: 500 });
  return Response.json((data ?? []) as VendorDecision[]);
}

export async function PATCH(request: NextRequest) {
  // Update the reason on a current decision row.
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

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const category = body.category;
  if (!isVendorCategoryKey(category)) {
    return Response.json({ error: "Invalid category" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason : null;

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  const { data, error } = await supabase
    .from("vendor_decisions")
    .update({ reason })
    .eq("plan_id", plan.id)
    .eq("category", category)
    .eq("is_current", true)
    .select()
    .single();

  if (error || !data) return Response.json({ error: "Failed to update decision" }, { status: 500 });
  return Response.json(data as VendorDecision);
}
