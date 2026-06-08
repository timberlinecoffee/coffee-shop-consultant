// TIM-972: Financial model GET + PATCH — forecast inputs in financial_models table.
// GET: returns or auto-creates the plan's financial_models row.
// PATCH: upserts monthly_projections, startup_costs, critique, needs_review_at.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import type { NextRequest } from "next/server";
import { defaultMonthlyProjections } from "@/lib/financial-projection";
import { getAccountSettings } from "@/lib/account-settings";
import { seededStartupCosts } from "@/lib/financials/seeded-startup-costs";
import { calibrateStartupCosts } from "@/lib/financials/startup-cost-calibration";
import { calibrateRevenue } from "@/lib/financials/revenue-calibration";
import { resolvePlanGeo, resolvePlanMinimumWage } from "@/lib/wages/resolve-plan-geo";

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

  // TIM-2463: Inherit the account's currency_code and fiscal_year_start_month
  // when first creating the plan's financial_models row. Without this, every
  // new model was hard-coded to USD regardless of the user's selected currency,
  // so the Financials currency dropdown (and every downstream surface that
  // reads forecast_inputs.currency_code) showed "$" for non-USD accounts.
  const [accountSettings, profileResult, planMinimumWage, planGeo] = await Promise.all([
    getAccountSettings(supabase, user.id),
    supabase.from("users").select("onboarding_data").eq("id", user.id).maybeSingle(),
    // TIM-2518: seed barista wage at-or-above the resolved local minimum.
    resolvePlanMinimumWage(supabase, plan.id),
    // TIM-2519: same (city, country) signal drives the startup-cost calibrator.
    resolvePlanGeo(supabase, plan.id),
  ]);
  const forecastInputs = defaultMonthlyProjections(planMinimumWage);
  forecastInputs.currency_code = accountSettings.currencyCode;
  forecastInputs.fiscal_year_start_month =
    accountSettings.localization.fiscalYearStartMonth;
  const shopTypes = Array.isArray(profileResult.data?.onboarding_data?.shop_type)
    ? (profileResult.data.onboarding_data.shop_type as string[])
    : [];
  // TIM-2519 (CQ-03): replace the single $244k template with a shop-type ×
  // city-tier calibration. Falls back to onboarding_data.location when the
  // plan has no signed location_candidate yet (resolvePlanGeo returns null).
  const onboardingLocation = (profileResult.data?.onboarding_data?.location ?? null) as
    | { city?: string | null; countryCode?: string | null }
    | null;
  forecastInputs.startup_costs = calibrateStartupCosts({
    shopTypes,
    city: planGeo.city ?? onboardingLocation?.city ?? null,
    countryCode: planGeo.countryCode ?? onboardingLocation?.countryCode ?? null,
  });
  // TIM-2521 (CQ-07): seed daily_flow + avg_ticket_cents from a shop-type
  // baseline (mid of CQ-07 spec range) and FX-convert the USD ticket into
  // the plan's currency. Default values seeded a single mid-size template
  // that projected 40-55% of realistic revenue for a large café.
  const calibratedRevenue = calibrateRevenue({
    shopTypes,
    currencyCode: forecastInputs.currency_code,
  });
  forecastInputs.daily_flow = calibratedRevenue.daily_flow;
  forecastInputs.avg_ticket_cents = calibratedRevenue.avg_ticket_cents;

  const { data: created, error } = await supabase
    .from("financial_models")
    .insert({
      plan_id: plan.id,
      forecast_inputs: forecastInputs,
      startup_costs: seededStartupCosts(shopTypes),
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
