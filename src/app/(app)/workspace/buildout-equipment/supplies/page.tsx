// TIM-1458: Supplies page under the Equipment & Supplies suite.
// Founder reframe of TIM-1447: Inventory was folded back into the equipment
// suite as a sibling page to /workspace/buildout-equipment.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { normalizeCurrencyCode } from "@/lib/currency";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import { SuppliesWorkspace } from "./supplies-workspace";
import { getActivePlanId } from "@/lib/plan-context";

export const dynamic = "force-dynamic";

export default async function SuppliesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const showInventoryToast = params.from === "inventory";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) redirect("/onboarding");

  const [suppliesResult, sectionsResult, modelResult, profileResult] = await Promise.all([
    supabase
      .from("buildout_supplies_items")
      .select("*")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position"),
    supabase
      .from("buildout_list_sections")
      .select("*")
      .eq("plan_id", planId)
      .eq("list_type", "supplies")
      .order("position"),
    supabase
      .from("financial_models")
      .select("forecast_inputs")
      .eq("plan_id", planId)
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
    <SuppliesWorkspace
      planId={planId}
      initialSupplies={supplies}
      initialSections={sections}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialCurrencyCode={initialCurrencyCode}
      showInventoryToast={showInventoryToast}
    />
  );
}
