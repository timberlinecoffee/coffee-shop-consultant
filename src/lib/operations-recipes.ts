// TIM-1416: Read-only recipe view sourced from the Menu workspace for the
// Operations Playbook. The Operations Playbook never stores recipe data
// itself — it consumes what the owner already maintains in Menu.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OperationsRecipeIngredient {
  ingredient_name: string;
  amount: number;
  unit: string;
}

export interface OperationsRecipeCard {
  menu_item_id: string;
  name: string;
  category_name: string | null;
  // The free-form prep/method notes the owner entered on the menu item.
  notes: string | null;
  ingredients: OperationsRecipeIngredient[];
}

type MenuItemRow = {
  id: string;
  name: string | null;
  notes: string | null;
  category_name: string | null;
  position: number | null;
};

type IngredientRow = {
  menu_item_id: string;
  amount: number;
  unit: string;
  menu_ingredients: { name: string | null } | { name: string | null }[] | null;
};

export async function loadOperationsRecipeCards(
  supabase: SupabaseClient,
  planId: string,
): Promise<OperationsRecipeCard[]> {
  const { data: itemsRaw, error: itemsError } = await supabase
    .from("menu_items_with_cogs")
    .select("id, name, notes, category_name, position")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("position", { ascending: true })
    .limit(200);

  if (itemsError || !itemsRaw || itemsRaw.length === 0) {
    return [];
  }

  const items = itemsRaw as MenuItemRow[];
  const itemIds = items.map((it) => it.id);

  const { data: ingredientRows } = await supabase
    .from("menu_item_ingredients")
    .select("menu_item_id, amount, unit, menu_ingredients(name)")
    .in("menu_item_id", itemIds);

  const ingredientsByItem = new Map<string, OperationsRecipeIngredient[]>();
  for (const raw of (ingredientRows ?? []) as IngredientRow[]) {
    const linked = raw.menu_ingredients;
    const ingredient = Array.isArray(linked) ? linked[0] : linked;
    const ingredientName = ingredient?.name ?? null;
    if (!ingredientName) continue;
    const list = ingredientsByItem.get(raw.menu_item_id) ?? [];
    list.push({
      ingredient_name: ingredientName,
      amount: typeof raw.amount === "number" ? raw.amount : Number(raw.amount),
      unit: raw.unit,
    });
    ingredientsByItem.set(raw.menu_item_id, list);
  }

  return items
    .filter((it): it is MenuItemRow & { name: string } => typeof it.name === "string" && it.name.length > 0)
    .map((it) => ({
      menu_item_id: it.id,
      name: it.name,
      category_name: it.category_name,
      notes: it.notes && it.notes.trim().length > 0 ? it.notes : null,
      ingredients: (ingredientsByItem.get(it.id) ?? []).sort((a, b) =>
        a.ingredient_name.localeCompare(b.ingredient_name),
      ),
    }));
}

export function recipeCardHasContent(card: OperationsRecipeCard): boolean {
  return card.ingredients.length > 0 || (card.notes !== null && card.notes.length > 0);
}

export function groupRecipeCardsByCategory(
  cards: OperationsRecipeCard[],
): { category: string; cards: OperationsRecipeCard[] }[] {
  const map = new Map<string, OperationsRecipeCard[]>();
  for (const card of cards) {
    const cat = card.category_name ?? "Other";
    const list = map.get(cat) ?? [];
    list.push(card);
    map.set(cat, list);
  }
  return Array.from(map.entries()).map(([category, list]) => ({ category, cards: list }));
}
