// TIM-972: Financial model GET + PATCH — forecast inputs in financial_models table.
// GET: returns or auto-creates the plan's financial_models row.
// PATCH: upserts monthly_projections, startup_costs, critique, needs_review_at.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import type { NextRequest } from "next/server";
import { defaultMonthlyProjections } from "@/lib/financial-projection";

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

  const { data: existing } = await supabase
    .from("financial_models")
    .select("*")
    .eq("plan_id", plan.id)
    .maybeSingle();

  if (existing) return Response.json(existing);

  // Auto-create with defaults
  const { data: created, error } = await supabase
    .from("financial_models")
    .insert({
      plan_id: plan.id,
      forecast_inputs: defaultMonthlyProjections(),
      startup_costs: {},
    })
    .select()
    .single();

  if (error) {
    console.error("financial_models insert error:", error);
    return Response.json({ error: "Failed to create financial model" }, { status: 500 });
  }

  return Response.json(created);
}

export async function PATCH(request: NextRequest) {
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

  const allowed = [
    "forecast_inputs", "monthly_projections", "startup_costs", "revenue_scenarios",
    "break_even_analysis", "critique", "needs_review_at",
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("financial_models")
    .upsert(
      { plan_id: plan.id, ...patch },
      { onConflict: "plan_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("financial_models upsert error:", error);
    return Response.json({ error: "Failed to update financial model" }, { status: 500 });
  }

  return Response.json(data);
}
