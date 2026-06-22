// TIM-1038: Build Out & Equipment workspace — Equipment sections.
// TIM-1171: Supplies removed — now lives in /workspace/inventory.
// TIM-1325: Pass currency_code from financial_models so prices show the correct symbol.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { normalizeCurrencyCode } from "@/lib/currency";
import type { EquipmentItem } from "@/app/(app)/workspace/financials/financials-workspace";
import type { ListSection } from "@/types/buildout";
import { BuildoutEquipmentWorkspace } from "./buildout-workspace";
import { getActivePlanId } from "@/lib/plan-context";

export const dynamic = "force-dynamic";

export default async function BuildoutEquipmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) redirect("/onboarding");

  const [equipmentResult, sectionsResult, modelResult, profileResult] =
    await Promise.all([
      supabase
        .from("buildout_equipment_items")
        .select("*")
        .eq("plan_id", planId)
        .eq("archived", false)
        .order("position"),
      supabase
        .from("buildout_list_sections")
        .select("*")
        .eq("plan_id", planId)
        .eq("list_type", "equipment")
        .order("position"),
      supabase
        .from("financial_models")
        .select("updated_at, needs_review_at, forecast_inputs")
        .eq("plan_id", planId)
        .maybeSingle(),
      supabase
        .from("users")
        .select("subscription_status, subscription_tier, copilot_trial_messages_used")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  const equipment = (equipmentResult.data ?? []) as EquipmentItem[];
  const sections = (sectionsResult.data ?? []) as ListSection[];
  const modelRow = modelResult.data;
  const profile = profileResult.data;
  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCurrencyCode = (modelRow?.forecast_inputs as any)?.currency_code;
  const initialCurrencyCode = normalizeCurrencyCode(rawCurrencyCode ?? "USD");

  return (
    <BuildoutEquipmentWorkspace
      planId={planId}
      initialEquipment={equipment}
      initialSections={sections}
      initialModelUpdatedAt={modelRow?.updated_at ?? null}
      initialNeedsReviewAt={modelRow?.needs_review_at ?? null}
      initialModelUpdatedAtForReview={modelRow?.updated_at ?? null}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialCurrencyCode={initialCurrencyCode}
    />
  );
}
