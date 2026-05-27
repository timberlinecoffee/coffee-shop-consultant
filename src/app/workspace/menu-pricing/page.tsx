// TIM-967: Menu & Pricing workspace page.
// TIM-1020: Load concept context (location, identity, target customer) for AI price suggestion.
// TIM-1140: Load editable categories and category-default ingredients; auto-seed
// defaults if the plan has none.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { MenuWorkspace } from "./menu-workspace";
import { normalizeConceptV2 } from "@/lib/concept";
import type {
  MenuItemWithCogs,
  MenuIngredient,
  MenuItemIngredient,
  MenuCategory,
  CategoryDefaultIngredient,
} from "@/lib/menu";

export const dynamic = "force-dynamic";

const DEFAULT_CATEGORIES = [
  { name: "Espresso", position: 0 },
  { name: "Brewed Coffee", position: 1 },
  { name: "Food", position: 2 },
  { name: "Retail", position: 3 },
  { name: "Seasonal", position: 4 },
];

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

  // Auto-seed default categories if this plan has none yet. Belt-and-braces:
  // the migration seeded all plans that existed at the time, this covers any
  // plan created after the migration but before plan-creation gets updated.
  {
    const { data: existing } = await supabase
      .from("menu_categories")
      .select("id")
      .eq("plan_id", planId)
      .limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from("menu_categories").insert(
        DEFAULT_CATEGORIES.map((c) => ({
          plan_id: planId,
          name: c.name,
          position: c.position,
          is_default: true,
        })),
      );
    }
  }

  const [
    { data: itemsData },
    { data: ingredientsData },
    { data: itemIngredientsData },
    { data: categoriesData },
    { data: defaultsData },
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
      .from("menu_categories")
      .select("*")
      .eq("plan_id", planId)
      .order("position", { ascending: true }),
    // category_default_ingredients RLS lives on the category join — pull
    // every default for the plan in one shot.
    supabase
      .from("category_default_ingredients")
      .select(
        "id, category_id, ingredient_id, amount, unit, position, created_at, menu_categories!inner(plan_id)",
      )
      .eq("menu_categories.plan_id", planId),
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

  // Strip the join-only field from defaults rows before passing to the client.
  const cleanedDefaults: CategoryDefaultIngredient[] =
    (defaultsData ?? []).map(({ menu_categories: _mc, ...rest }) => rest as CategoryDefaultIngredient);

  return (
    <MenuWorkspace
      planId={planId}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialItems={(itemsData ?? []) as MenuItemWithCogs[]}
      initialIngredients={(ingredientsData ?? []) as MenuIngredient[]}
      initialItemIngredients={(itemIngredientsData ?? []) as MenuItemIngredient[]}
      initialCategories={(categoriesData ?? []) as MenuCategory[]}
      initialCategoryDefaults={cleanedDefaults}
      conceptContext={conceptContext}
    />
  );
}
