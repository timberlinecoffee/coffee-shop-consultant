// TIM-716 / TIM-621-CHARTS — "Save as scenario" endpoint.
// Appends the current sensitivity-adjusted inputs to
// financial_models.revenue_scenarios so the user can come back to them.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive } from "@/lib/access";
import type { NextRequest } from "next/server";

type ScenarioPayload = {
  planId?: string;
  adjustments?: Record<string, number>;
  adjustedInputs?: Record<string, number>;
  savedAt?: string;
  label?: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status")
    .eq("id", user.id)
    .single();

  if (!profile || !isSubscriptionActive(profile.subscription_status)) {
    return Response.json(
      { reason: "paywall", tier_required: "starter" },
      { status: 402 },
    );
  }

  let body: ScenarioPayload;
  try {
    body = (await request.json()) as ScenarioPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.planId) {
    return Response.json({ error: "Missing planId" }, { status: 400 });
  }

  // Verify the plan belongs to this user before writing.
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("id", body.planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "Plan not found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("financial_models")
    .select("revenue_scenarios")
    .eq("plan_id", plan.id)
    .maybeSingle();

  const previous = isRecord(existing?.revenue_scenarios)
    ? (existing.revenue_scenarios as Record<string, unknown>)
    : {};
  const previousList = Array.isArray(previous.scenarios) ? previous.scenarios : [];

  const entry = {
    id: crypto.randomUUID(),
    label: body.label ?? `Scenario ${previousList.length + 1}`,
    adjustments: body.adjustments ?? {},
    adjustedInputs: body.adjustedInputs ?? {},
    savedAt: body.savedAt ?? new Date().toISOString(),
  };

  const nextRevenueScenarios = {
    ...previous,
    scenarios: [...previousList, entry],
  };

  const { error } = await supabase
    .from("financial_models")
    .upsert(
      { plan_id: plan.id, revenue_scenarios: nextRevenueScenarios },
      { onConflict: "plan_id" },
    );

  if (error) {
    console.error("financial_models scenario upsert error:", error);
    return Response.json({ error: "Failed to save scenario" }, { status: 500 });
  }

  return Response.json({ scenario: entry });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
