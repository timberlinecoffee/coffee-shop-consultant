// TIM-1171: Inventory workspace — supplies list. Supplies moved from
// Build Out & Equipment (tab) to standalone workspace.
// TIM-1447: Pass currency_code so per-section + grand totals render in the
// founder's chosen currency, matching Build-Out & Equipment.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { normalizeCurrencyCode } from "@/lib/currency";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import { InventoryWorkspace } from "./inventory-workspace";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
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

  const [suppliesResult, sectionsResult, modelResult, profileResult] = await Promise.all([
    supabase
      .from("buildout_supplies_items")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("archived", false)
      .order("position"),
    supabase
      .from("buildout_list_sections")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("list_type", "supplies")
      .order("position"),
    supabase
      .from("financial_models")
      .select("forecast_inputs")
      .eq("plan_id", plan.id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const supplies = (suppliesResult.data ?? []) as SuppliesItem[];
  const sections = (sectionsResult.data ?? []) as ListSection[];
  const profile = profileResult.data;
  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCurrencyCode = (modelResult.data?.forecast_inputs as any)?.currency_code;
  const initialCurrencyCode = normalizeCurrencyCode(rawCurrencyCode ?? "USD");

  return (
    <InventoryWorkspace
      planId={plan.id}
      initialSupplies={supplies}
      initialSections={sections}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialCurrencyCode={initialCurrencyCode}
    />
  );
}
