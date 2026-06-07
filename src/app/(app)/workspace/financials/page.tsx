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

  const [modelResult, profileResult, menuItemsResult, equipmentResult, locationResult] = await Promise.all([
    supabase
      .from("financial_models")
      .select("*")
      .eq("plan_id", plan.id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used")
      .eq("id", user.id)
      .maybeSingle(),
    // TIM-1117: pull menu items so COGS lines can link to menu costing.
    // TIM-1168: also select name for the "How is this calculated?" reveal.
    // TIM-1799: select expected_popularity too — it (not the legacy numeric
    // expected_mix_pct, which the menu UI no longer sets) is what weights the
    // blend, so Beverages and every other priced category reach Financials.
    supabase
      .from("menu_items_with_cogs")
      .select("name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived")
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
    // TIM-2500: fetch location for the Taxes & Compliance callout.
    // Prefer signed candidate; fall back to first non-archived.
    supabase
      .from("location_candidates")
      .select("city, country, status, archived")
      .eq("plan_id", plan.id)
      .order("position", { ascending: true }),
  ]);

  let modelRow = modelResult.data;

  // Auto-create financial_models row if it doesn't exist.
  // TIM-2463: inherit users.currency_code + fiscal_year_start_month so the
  // Financials currency dropdown (and every downstream surface that reads
  // forecast_inputs.currency_code) reflects the user's selected currency
  // instead of always defaulting to USD.
  if (!modelRow) {
    const accountSettings = await getAccountSettings(supabase, user.id);
    const forecastInputs = defaultMonthlyProjections();
    forecastInputs.currency_code = accountSettings.currencyCode;
    forecastInputs.fiscal_year_start_month =
      accountSettings.localization.fiscalYearStartMonth;
    const { data: created } = await supabase
      .from("financial_models")
      .insert({
        plan_id: plan.id,
        forecast_inputs: forecastInputs,
        startup_costs: {},
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

  // TIM-2500: resolve location city + country for the Taxes & Compliance callout.
  const locationCandidates = locationResult.data ?? [];
  const chosenLocation =
    locationCandidates.find((c) => c.status === "signed") ??
    locationCandidates.find((c) => !c.archived) ??
    null;
  const locationCity = chosenLocation?.city ?? null;
  const locationCountry = chosenLocation?.country ?? null;
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
      locationCity={locationCity}
      locationCountry={locationCountry}
    />
  );
}
