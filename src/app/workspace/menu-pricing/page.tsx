// TIM-967: Menu & Pricing workspace page.
// TIM-1020: Load concept context (location, identity, target customer) for AI price suggestion.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { MenuWorkspace } from "./menu-workspace";
import { normalizeConceptV2 } from "@/lib/concept";
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
    { data: conceptDoc },
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
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
  ]);

  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  // Extract concept context for price suggestion anchor
  let conceptContext: {
    shop_identity?: string;
    location?: string;
    target_customer?: string;
    vision?: string;
  } | undefined;

  if (conceptDoc?.content) {
    try {
      const raw = typeof conceptDoc.content === "string"
        ? JSON.parse(conceptDoc.content)
        : conceptDoc.content;
      const version = (raw as Record<string, unknown>)?.version;
      if (version === 2) {
        const doc = normalizeConceptV2(raw);
        const c = doc.components;
        conceptContext = {
          shop_identity: c.shop_identity?.content || undefined,
          location: c.location?.content || undefined,
          target_customer: c.target_customer?.content || undefined,
          vision: c.vision?.content || undefined,
        };
      } else {
        // V1 concept
        const v1 = raw as Record<string, string>;
        conceptContext = {
          shop_identity: v1.name || undefined,
          target_customer: v1.target_market || undefined,
          vision: v1.mission || undefined,
        };
      }
    } catch {
      // Concept parse failure is non-fatal — proceed without context
    }
  }

  return (
    <MenuWorkspace
      planId={planId}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialItems={(itemsData ?? []) as MenuItemWithCogs[]}
      initialIngredients={(ingredientsData ?? []) as MenuIngredient[]}
      initialItemIngredients={(itemIngredientsData ?? []) as MenuItemIngredient[]}
      conceptContext={conceptContext}
    />
  );
}
