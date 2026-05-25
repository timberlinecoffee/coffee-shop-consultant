// TIM-1038: Build Out & Equipment workspace — Equipment + Supplies tabs with sections.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import type { EquipmentItem } from "@/app/workspace/financials/financials-workspace";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import { BuildoutEquipmentWorkspace } from "./buildout-workspace";

export const dynamic = "force-dynamic";

export default async function BuildoutEquipmentPage() {
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

  const [equipmentResult, suppliesResult, sectionsResult, modelResult, profileResult] =
    await Promise.all([
      supabase
        .from("buildout_equipment_items")
        .select("*")
        .eq("plan_id", plan.id)
        .eq("archived", false)
        .order("position"),
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
        .order("position"),
      supabase
        .from("financial_models")
        .select("updated_at, needs_review_at")
        .eq("plan_id", plan.id)
        .maybeSingle(),
      supabase
        .from("users")
        .select("subscription_status, subscription_tier, copilot_trial_messages_used")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  const equipment = (equipmentResult.data ?? []) as EquipmentItem[];
  const supplies = (suppliesResult.data ?? []) as SuppliesItem[];
  const sections = (sectionsResult.data ?? []) as ListSection[];
  const modelRow = modelResult.data;
  const profile = profileResult.data;
  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <BuildoutEquipmentWorkspace
      planId={plan.id}
      initialEquipment={equipment}
      initialSupplies={supplies}
      initialSections={sections}
      initialModelUpdatedAt={modelRow?.updated_at ?? null}
      initialNeedsReviewAt={modelRow?.needs_review_at ?? null}
      initialModelUpdatedAtForReview={modelRow?.updated_at ?? null}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
