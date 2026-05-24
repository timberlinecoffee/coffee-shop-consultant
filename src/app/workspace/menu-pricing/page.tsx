// TIM-967: Menu & Pricing workspace page.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { MenuWorkspace } from "./menu-workspace";
import type {
  MenuItemWithCogs,
  MenuIngredient,
  MenuItemIngredient,
} from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function MenuPricingWorkspacePage() {
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

  const planId = plan.id;

  const [
    { data: itemsData },
    { data: ingredientsData },
    { data: itemIngredientsData },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("menu_items_with_cogs")
      .select("*")
      .eq("plan_id", planId)
      .order("position", { ascending: true }),
    supabase
      .from("menu_ingredients")
      .select("*")
      .eq("plan_id", planId)
      .order("name", { ascending: true }),
    supabase.from("menu_item_ingredients").select("*"),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <MenuWorkspace
      planId={planId}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialItems={(itemsData ?? []) as MenuItemWithCogs[]}
      initialIngredients={(ingredientsData ?? []) as MenuIngredient[]}
      initialItemIngredients={(itemIngredientsData ?? []) as MenuItemIngredient[]}
    />
  );
}
