// TIM-1038: Supplies seed — create default sections + items for a specialty coffee shop.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";

type SuppliesSeedItem = {
  name: string;
  vendor?: string;
  unit_type: string;
  unit_cost_cents: number;
  notes?: string;
};

type SuppliesSeedSection = {
  name: string;
  items: SuppliesSeedItem[];
};

const SUPPLIES_SEED: SuppliesSeedSection[] = [
  {
    name: "Coffee",
    items: [
      { name: "Espresso Blend Beans", unit_type: "lb", unit_cost_cents: 1800, notes: "Roasted fresh, reorder weekly" },
      { name: "Single Origin Filter Beans", unit_type: "lb", unit_cost_cents: 2200, notes: "Rotating origin" },
      { name: "Decaf Beans", unit_type: "lb", unit_cost_cents: 2000 },
    ],
  },
  {
    name: "Dairy & Alternatives",
    items: [
      { name: "Whole Milk", unit_type: "gallon", unit_cost_cents: 450 },
      { name: "Oat Milk", unit_type: "half-gallon", unit_cost_cents: 550, notes: "Barista edition" },
      { name: "Almond Milk", unit_type: "half-gallon", unit_cost_cents: 500 },
      { name: "Soy Milk", unit_type: "half-gallon", unit_cost_cents: 420 },
      { name: "Half-And-Half", unit_type: "quart", unit_cost_cents: 280 },
      { name: "Heavy Cream", unit_type: "quart", unit_cost_cents: 350 },
    ],
  },
  {
    name: "Syrups & Sauces",
    items: [
      { name: "Vanilla Syrup", unit_type: "750ml bottle", unit_cost_cents: 1200, notes: "Monin or house-made" },
      { name: "Caramel Syrup", unit_type: "750ml bottle", unit_cost_cents: 1200 },
      { name: "Hazelnut Syrup", unit_type: "750ml bottle", unit_cost_cents: 1200 },
      { name: "Lavender Syrup", unit_type: "750ml bottle", unit_cost_cents: 1400 },
      { name: "Simple Syrup", unit_type: "750ml bottle", unit_cost_cents: 900 },
      { name: "Chocolate Sauce", unit_type: "bottle", unit_cost_cents: 1100 },
      { name: "Caramel Sauce", unit_type: "bottle", unit_cost_cents: 1100 },
    ],
  },
  {
    name: "Tea & Other Beverages",
    items: [
      { name: "Loose Leaf Teas Assortment", unit_type: "tin", unit_cost_cents: 2500 },
      { name: "Matcha Powder", unit_type: "lb", unit_cost_cents: 3500, notes: "Ceremonial grade" },
      { name: "Hot Chocolate Mix", unit_type: "lb", unit_cost_cents: 1600 },
      { name: "Cold Brew Concentrate", unit_type: "64oz jug", unit_cost_cents: 1200 },
      { name: "Sparkling Water", unit_type: "case (24)", unit_cost_cents: 1800 },
    ],
  },
  {
    name: "Food Ingredients",
    items: [
      { name: "Baked Goods — Pastry Order", unit_type: "weekly order", unit_cost_cents: 0, notes: "Amount varies by bakery vendor" },
      { name: "Granola", unit_type: "lb", unit_cost_cents: 500 },
      { name: "Honey", unit_type: "lb jar", unit_cost_cents: 800 },
    ],
  },
  {
    name: "Packaging",
    items: [
      { name: "8oz Paper Cups", unit_type: "case (1,000)", unit_cost_cents: 5500 },
      { name: "12oz Paper Cups", unit_type: "case (1,000)", unit_cost_cents: 6500 },
      { name: "16oz Paper Cups", unit_type: "case (1,000)", unit_cost_cents: 7500 },
      { name: "Cup Lids — Hot", unit_type: "case (1,000)", unit_cost_cents: 3500 },
      { name: "Cold Cup Lids", unit_type: "case (1,000)", unit_cost_cents: 3500 },
      { name: "Cup Sleeves", unit_type: "case (1,000)", unit_cost_cents: 3000 },
      { name: "Takeaway Bags", unit_type: "case (500)", unit_cost_cents: 2500 },
      { name: "Napkins", unit_type: "case (3,000)", unit_cost_cents: 2000 },
      { name: "Wooden Stir Sticks", unit_type: "box (500)", unit_cost_cents: 800 },
      { name: "Straws — Compostable", unit_type: "case (500)", unit_cost_cents: 1500 },
    ],
  },
  {
    name: "Cleaning Supplies",
    items: [
      { name: "Espresso Machine Cleaner (Cafiza)", unit_type: "container", unit_cost_cents: 1800 },
      { name: "Grinder Cleaner (Grindz)", unit_type: "container", unit_cost_cents: 1200 },
      { name: "Bar Sanitizer Tablets", unit_type: "box (100)", unit_cost_cents: 900 },
      { name: "Dish Soap", unit_type: "gallon", unit_cost_cents: 600 },
      { name: "Paper Towels", unit_type: "case (12 rolls)", unit_cost_cents: 2500 },
      { name: "Trash Bags", unit_type: "box (100)", unit_cost_cents: 1800 },
      { name: "Milk Frother Cleaner", unit_type: "bottle", unit_cost_cents: 700 },
    ],
  },
  {
    name: "Office & Marketing",
    items: [
      { name: "Receipt Paper Rolls", unit_type: "case (50)", unit_cost_cents: 2500 },
      { name: "Business Cards — Reorder", unit_type: "250 cards", unit_cost_cents: 3500 },
      { name: "Loyalty Cards", unit_type: "100 cards", unit_cost_cents: 2000 },
      { name: "Menu Boards — Print Update", unit_type: "set", unit_cost_cents: 0, notes: "Cost varies per update" },
    ],
  },
];

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();
  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  // Archive existing ai_suggested supplies
  await supabase
    .from("buildout_supplies_items")
    .update({ archived: true })
    .eq("plan_id", plan.id)
    .eq("source", "ai_suggested");

  // Delete existing supplies sections
  await supabase
    .from("buildout_list_sections")
    .delete()
    .eq("plan_id", plan.id)
    .eq("list_type", "supplies");

  let totalSeeded = 0;

  for (let sIdx = 0; sIdx < SUPPLIES_SEED.length; sIdx++) {
    const section = SUPPLIES_SEED[sIdx];

    const { data: newSection, error: secErr } = await supabase
      .from("buildout_list_sections")
      .insert({
        plan_id: plan.id,
        list_type: "supplies",
        name: toTitleCase(section.name),
        position: sIdx,
        collapsed: false,
      })
      .select("id")
      .single();

    if (secErr || !newSection) continue;

    const rows = section.items.map((item, iIdx) => ({
      plan_id: plan.id,
      section_id: newSection.id,
      name: toTitleCase(item.name),
      vendor: item.vendor ? toTitleCase(item.vendor) : null,
      unit_type: item.unit_type,
      quantity: 1,
      unit_cost_cents: item.unit_cost_cents,
      source: "ai_suggested" as const,
      notes: item.notes ?? null,
      position: iIdx,
    }));

    const { data: inserted } = await supabase
      .from("buildout_supplies_items")
      .insert(rows)
      .select("id");

    totalSeeded += inserted?.length ?? 0;
  }

  return Response.json({ seeded: totalSeeded });
}
