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
  groupMenuItemsByCategory,
} from "@/lib/financial-projection";
import type { CritiqueResult } from "@/lib/financials";
import { getAccountSettings } from "@/lib/account-settings";
import { seededStartupCosts } from "@/lib/financials/seeded-startup-costs";
import { calibrateStartupCosts } from "@/lib/financials/startup-cost-calibration";
import { calibrateRevenue } from "@/lib/financials/revenue-calibration";
import {
  calibrateRent,
  applyCalibratedRentToForecastLines,
} from "@/lib/financials/rent-calibration";
import { calibrateFundingSources } from "@/lib/financials/funding-source-calibration";
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

  const [modelResult, profileResult, menuItemsResult, equipmentResult, coverResult] = await Promise.all([
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
      // TIM-3733: id, category_id, category_name needed for groupMenuItemsByCategory (COGS sync section).
      .select("id, name, category_id, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_popularity, archived")
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
    // TIM-2755: load BP accent color so financial charts render in brand palette.
    supabase
      .from("business_plan_cover")
      .select("accent_color")
      .eq("plan_id", plan.id)
      .maybeSingle(),
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
    // TIM-2521 (CQ-07): replace the single 107-cust/day × $7.50 template
    // with a shop-type baseline (mid of CQ-07 spec range), FX-converting
    // the USD ticket into the plan's currency.
    const calibratedRevenue = calibrateRevenue({
      shopTypes,
      currencyCode: forecastInputs.currency_code,
    });
    forecastInputs.daily_flow = calibratedRevenue.daily_flow;
    forecastInputs.avg_ticket_cents = calibratedRevenue.avg_ticket_cents;
    // TIM-2522 (CQ-08): seed Rent from a shop-type × city-tier USD baseline,
    // FX-converted into the plan's currency. Default $4,500/mo was wrong for
    // 4 of 6 onboarded geographies.
    const calibratedRentCents = calibrateRent({
      shopTypes,
      city: planGeo.city ?? onboardingLocation?.city ?? null,
      countryCode: planGeo.countryCode ?? onboardingLocation?.countryCode ?? null,
      currencyCode: forecastInputs.currency_code,
    });
    applyCalibratedRentToForecastLines(forecastInputs.forecast_lines, calibratedRentCents);
    // TIM-2557: seed Funding Sources from the same shop-type × city-tier
    // signal as startup costs, FX-converted to plan currency. Replaces the
    // flat $10M loan + $15M founder default that produced byte-identical
    // Year-1 Interest ($598,491) across every persona in BP review.
    forecastInputs.funding_sources = calibrateFundingSources({
      shopTypes,
      city: planGeo.city ?? onboardingLocation?.city ?? null,
      countryCode: planGeo.countryCode ?? onboardingLocation?.countryCode ?? null,
      currencyCode: forecastInputs.currency_code,
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
  const initialAccentColor = coverResult.data?.accent_color ?? null;

  // TIM-1168: per-item breakdown for "How is this calculated?" reveal.
  // TIM-1799: built via the shared recompute so it reflects ALL priced items
  // (incl. Beverages), weighting by popularity when no numeric mix is set.
  const menuCogsItems = buildMenuCogsBreakdown(rawMenuItems);
  // TIM-3733: category grouping for the Finance COGS sync section (seeds liveMenuCogsByCategory).
  const menuCogsByCategory = groupMenuItemsByCategory(rawMenuItems);

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
      menuCogsByCategory={menuCogsByCategory}
      minimumWage={planMinimumWage}
      initialAccentColor={initialAccentColor}
    />
  );
}
