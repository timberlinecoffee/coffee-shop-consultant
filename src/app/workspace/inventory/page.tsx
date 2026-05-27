// TIM-1171: Inventory workspace — supplies list. Supplies moved from
// Build Out & Equipment (tab) to standalone workspace.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
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

  const [suppliesResult, sectionsResult, profileResult] = await Promise.all([
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

  return (
    <InventoryWorkspace
      planId={plan.id}
      initialSupplies={supplies}
      initialSections={sections}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
