// TIM-972: Financial Suite workspace page.
// TIM-1029: Equipment moved to Build Out & Equipment; this page loads forecast only.
// TIM-1253: Also fetches buildout_equipment_items for shared-read capex sync.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import {
  normalizeMonthlyProjections,
  defaultMonthlyProjections,
  computeMenuBlendedCogsPct,
  buildMenuCogsBreakdown,
} from "@/lib/financial-projection";
import type { CritiqueResult } from "@/lib/financials";
import { getAccountSettings } from "@/lib/account-settings";
import { seededStartupCosts } from "@/lib/financials/seeded-startup-costs";
import { calibrateStartupCosts } from "@/lib/financials/startup-cost-calibration";
import { resolvePlanGeo, resolvePlanMinimumWage } from "@/lib/wages/resolve-plan-geo";
import { FinancialsWorkspace } from "./financials-workspace";
import type { EquipmentItem } from "./financials-workspace";

export const dynamic = "force-dynamic";

export default async function FinancialsWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/onboarding");

  const [modelResult, profileResult, menuItemsResult, equipmentResult] = await Promise.all([
    supabase
      .from("financial_models")
      .select("*")
      .eq("plan_id", plan.id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used, onboarding_data")
      .eq("id", user.id)
      .maybeSingle(),
    // TIM-1117: pull menu items so COGS lines can link to menu costing.
    // TIM-1168: also select name for the "How is this calculated?" reveal.
    // TIM-2491: popularity is the sole weight signal — the legacy numeric
    // `expected_mix_pct` is deprecated and no longer selected here. See
    // menuItemMixWeight() in financial-projection.ts for the canon.
    supabase
      .from("menu_items_with_cogs")
      .select("name, price_cents, cogs_cents, computed_cogs_cents, expected_popularity, archived")
      .eq("plan_id", plan.id)
      .eq("archived", false),
    // TIM-1253: fetch equipment items for shared-read capex sync — each item
    // becomes a synthetic capex ForecastLine in the financial projections.
    supabase
      .from("buildout_equipment_items")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("archived", false)
      .order("position"),
  ]);

  let modelRow = modelResult.data;

  // Auto-create financial_models row if it doesn't exist.
  // TIM-2463: inherit users.currency_code + fiscal_year_start_month so the
  // Financials currency dropdown (and every downstream surface that reads
  // forecast_inputs.currency_code) reflects the user's selected currency
  // instead of always defaulting to USD.
  // TIM-2518: also resolved upfront so the personnel editor can warn on
  // sub-minimum entries the user types after the row exists.
  const planMinimumWage = await resolvePlanMinimumWage(supabase, plan.id);

  if (!modelRow) {
    const profileData = profileResult.data;
    const shopTypes = Array.isArray(profileData?.onboarding_data?.shop_type)
      ? (profileData.onboarding_data.shop_type as string[])
      : [];
    const accountSettings = await getAccountSettings(supabase, user.id);
    // TIM-2518: seed barista wage at-or-above the resolved local minimum so a
    // brand-new Seattle plan never starts with the $17 default (below the
    // $19.97 Seattle 2026 floor).
    const forecastInputs = defaultMonthlyProjections(planMinimumWage);
    forecastInputs.currency_code = accountSettings.currencyCode;
    forecastInputs.fiscal_year_start_month =
      accountSettings.localization.fiscalYearStartMonth;
    // TIM-2519 (CQ-03): swap the legacy $244k template for shop-type ×
    // city-tier calibration. Falls back to onboarding_data.location when no
    // signed location_candidate exists yet.
    const planGeo = await resolvePlanGeo(supabase, plan.id);
    const onboardingLocation = (profileData?.onboarding_data?.location ?? null) as
      | { city?: string | null; countryCode?: string | null }
      | null;
    forecastInputs.startup_costs = calibrateStartupCosts({
      shopTypes,
      city: planGeo.city ?? onboardingLocation?.city ?? null,
      countryCode: planGeo.countryCode ?? onboardingLocation?.countryCode ?? null,
    });
    const { data: created } = await supabase
      .from("financial_models")
      .insert({
        plan_id: plan.id,
        forecast_inputs: forecastInputs,
        startup_costs: seededStartupCosts(shopTypes),
      })
      .select()
      .single();
    modelRow = created;
  }

  const initialProjections = normalizeMonthlyProjections(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (modelRow as any)?.forecast_inputs ?? modelRow?.monthly_projections
  );
  const initialCritique = (modelRow?.critique as CritiqueResult | null) ?? null;
  const initialModelUpdatedAt = modelRow?.updated_at ?? null;
  const initialNeedsReviewAt = modelRow?.needs_review_at ?? null;

  const profile = profileResult.data;
  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  const initialEquipmentItems = (equipmentResult.data ?? []) as EquipmentItem[];
  const rawMenuItems = menuItemsResult.data ?? [];
  const menuBlendedCogsPct = computeMenuBlendedCogsPct(rawMenuItems);

  // TIM-1168: per-item breakdown for "How is this calculated?" reveal.
  // TIM-1799: built via the shared recompute so it reflects ALL priced items
  // (incl. Beverages), weighting by popularity when no numeric mix is set.
  const menuCogsItems = buildMenuCogsBreakdown(rawMenuItems);

  return (
    <FinancialsWorkspace
      planId={plan.id}
      initialProjections={initialProjections}
      initialModelUpdatedAt={initialModelUpdatedAt}
      initialCritique={initialCritique}
      initialNeedsReviewAt={initialNeedsReviewAt}
      initialModelUpdatedAtForReview={initialModelUpdatedAt}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialEquipmentItems={initialEquipmentItems}
      menuBlendedCogsPct={menuBlendedCogsPct}
      menuCogsItems={menuCogsItems}
      minimumWage={planMinimumWage}
    />
  );
}
