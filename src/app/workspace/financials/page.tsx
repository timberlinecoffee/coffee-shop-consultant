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
} from "@/lib/financial-projection";
import type { CritiqueResult } from "@/lib/financials";
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
      .select("subscription_status, subscription_tier, copilot_trial_messages_used")
      .eq("id", user.id)
      .maybeSingle(),
    // TIM-1117: pull menu items so COGS lines can link to menu costing.
    // TIM-1168: also select name for the "How is this calculated?" reveal.
    supabase
      .from("menu_items_with_cogs")
      .select("name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, archived")
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

  // Auto-create financial_models row if it doesn't exist
  if (!modelRow) {
    const { data: created } = await supabase
      .from("financial_models")
      .insert({
        plan_id: plan.id,
        forecast_inputs: defaultMonthlyProjections(),
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
  const menuBlendedCogsPct = computeMenuBlendedCogsPct(rawMenuItems);

  // TIM-1168: per-item breakdown for "How is this calculated?" reveal.
  const menuCogsItems = rawMenuItems
    .filter(
      (it) =>
        !it.archived &&
        typeof it.price_cents === "number" &&
        it.price_cents > 0 &&
        typeof it.expected_mix_pct === "number" &&
        it.expected_mix_pct > 0
    )
    .map((it) => {
      const effectiveCogs =
        typeof it.computed_cogs_cents === "number"
          ? it.computed_cogs_cents
          : typeof it.cogs_cents === "number"
          ? it.cogs_cents
          : 0;
      return {
        name: it.name as string,
        price_cents: it.price_cents as number,
        cogs_cents: effectiveCogs,
        expected_mix_pct: it.expected_mix_pct as number,
        cogs_pct: it.price_cents ? (effectiveCogs / (it.price_cents as number)) * 100 : 0,
      };
    });

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
    />
  );
}
