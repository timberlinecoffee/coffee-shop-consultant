// TIM-1007: Equipment seed endpoint — re-seeded from 115-item v1.0 catalog.
// Derives shop model code (FC/KI/DT/BO/MO/RC/DW) from concept text, then
// seeds all non-bundled reference items for that model into
// buildout_equipment_items as source=ai_suggested.
// Fund items (ceramics fund, to-go ware, etc.) are included with budget ranges.
// POST /api/workspaces/financials/seed

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { normalizeConceptV2 } from "@/lib/concept";
import { toTitleCase } from "@/lib/text";

type ModelCode = "FC" | "KI" | "DT" | "BO" | "MO" | "RC" | "DW";

function deriveModelCode(
  conceptContent: Record<string, unknown> | null,
  menuContent: Record<string, unknown> | null
): ModelCode {
  const concept = conceptContent ?? {};

  // Flatten the concept to a single searchable string
  const conceptText = JSON.stringify(concept).toLowerCase();
  const menuText = menuContent ? JSON.stringify(menuContent).toLowerCase() : "";
  const combined = `${conceptText} ${menuText}`;

  // Check offering component specifically for structured shop-type signals
  const offeringText = (() => {
    const v2 = concept as { version?: number; components?: { offering?: { content?: string } } };
    return typeof v2.components?.offering?.content === "string"
      ? v2.components.offering.content.toLowerCase()
      : "";
  })();

  const all = `${combined} ${offeringText}`;

  // Roastery signals (check before drive-thru to avoid false drive-thru match)
  if (all.includes("roastery") || all.includes("roasting")) return "RC";

  // Mobile / pop-up / cart
  if (
    all.includes("mobile") ||
    all.includes("pop-up") ||
    all.includes("pop up") ||
    all.includes("cart") ||
    all.includes("espresso cart")
  )
    return "MO";

  // Drive-thru + walk-up combo
  if (
    (all.includes("drive-thru") || all.includes("drive thru") || all.includes("drive through")) &&
    (all.includes("walk-up") || all.includes("walk up") || all.includes("walk in"))
  )
    return "DW";

  // Drive-thru only
  if (
    all.includes("drive-thru") ||
    all.includes("drive thru") ||
    all.includes("drive through") ||
    all.includes("drive-through")
  )
    return "DT";

  // Kiosk / espresso bar only
  if (
    all.includes("kiosk") ||
    all.includes("espresso bar only") ||
    all.includes("no seating") ||
    all.includes("espresso-bar-only")
  )
    return "KI";

  // Brew-method only (pour-over focused, minimal espresso)
  if (
    (all.includes("pour-over") || all.includes("pour over") || all.includes("batch brew")) &&
    !all.includes("espresso") &&
    !all.includes("food")
  )
    return "BO";

  // Full-service café with food signals
  const hasFood =
    all.includes("food") ||
    all.includes("pastry") ||
    all.includes("sandwich") ||
    all.includes("kitchen") ||
    all.includes("baking");

  if (
    hasFood &&
    (all.includes("cafe") ||
      all.includes("café") ||
      all.includes("coffee shop") ||
      all.includes("full service") ||
      all.includes("full-service") ||
      all.includes("seating"))
  )
    return "FC";

  // Default: full-service café
  return "FC";
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
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

  // Load concept + menu docs for model derivation
  const [{ data: conceptDoc }, { data: menuDoc }] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "menu_pricing")
      .maybeSingle(),
  ]);

  const conceptNormalized = conceptDoc?.content
    ? normalizeConceptV2(conceptDoc.content)
    : null;

  const modelCode = deriveModelCode(
    conceptNormalized as Record<string, unknown> | null,
    menuDoc?.content as Record<string, unknown> | null
  );

  // Fetch all non-bundled reference items for this model code
  const { data: refItems, error: refError } = await supabase
    .from("standard_equipment_reference")
    .select("id, category, name_canonical, type, notes, price_low, price_mid, price_high, budget_low, budget_mid, budget_high, must_have")
    .contains("models", [modelCode])
    .is("bundled_with", null)
    .order("sort_order");

  if (refError) {
    console.error("standard_equipment_reference select error:", refError);
    return Response.json({ error: "Failed to fetch equipment reference" }, { status: 500 });
  }

  if (!refItems || refItems.length === 0) {
    return Response.json({ seeded: 0, model_code: modelCode });
  }

  return upsertItems(supabase, plan.id, modelCode, refItems);
}

type RefItem = {
  category: string;
  name_canonical: string;
  type: string;
  notes: string;
  price_low: number | null;
  price_mid: number | null;
  price_high: number | null;
  budget_low: number | null;
  budget_mid: number | null;
  budget_high: number | null;
  must_have: boolean;
};

// TIM-1038: Workstation section definitions for equipment seed.
const EQUIPMENT_SECTIONS = [
  { name: "Espresso Bar",              position: 0 },
  { name: "Pour Over / Manual Brew",   position: 1 },
  { name: "Batch Brew",                position: 2 },
  { name: "Cold Beverage",             position: 3 },
  { name: "Point of Sale / Cashier",   position: 4 },
  { name: "Front of House / Service",  position: 5 },
  { name: "Kitchen / Food Prep",       position: 6 },
  { name: "Back of House",             position: 7 },
  { name: "Furniture & Seating",       position: 8 },
  { name: "Decor & Ambiance",          position: 9 },
  { name: "Smallwares",                position: 10 },
  { name: "Cleaning & Sanitation",     position: 11 },
];

function deriveSectionName(category: string, itemName: string): string {
  const name = itemName.toLowerCase();
  const cat = category.toLowerCase();

  // brew_platform — split pour-over vs batch by item name
  if (cat === "brew_platform" || cat === "brew_platform") {
    const isPourOver =
      name.includes("pour over") ||
      name.includes("pour-over") ||
      name.includes("v60") ||
      name.includes("chemex") ||
      name.includes("kettle") ||
      name.includes("gooseneck") ||
      name.includes("carafe") ||
      name.includes("scale") ||
      name.includes("server");
    return isPourOver ? "Pour Over / Manual Brew" : "Batch Brew";
  }

  const map: Record<string, string> = {
    espresso_platform: "Espresso Bar",
    milk_beverage_prep: "Espresso Bar",
    refrigeration: "Cold Beverage",
    pos_tech: "Point of Sale / Cashier",
    furniture_fixtures: "Furniture & Seating",
    signage_decor: "Decor & Ambiance",
    smallwares: "Smallwares",
    ceramics: "Smallwares",
    glassware: "Smallwares",
    to_go_ware: "Smallwares",
    plumbing_water: "Back of House",
    electrical: "Back of House",
    miscellaneous: "Smallwares",
    // legacy
    espresso: "Espresso Bar",
    grinder: "Espresso Bar",
    plumbing: "Back of House",
    furniture: "Furniture & Seating",
    pos: "Point of Sale / Cashier",
    signage: "Front of House / Service",
    other: "Smallwares",
  };
  return map[cat] ?? "Smallwares";
}

async function upsertItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  modelCode: ModelCode,
  refItems: RefItem[]
) {
  // Archive any existing ai_suggested items before re-seeding
  await supabase
    .from("buildout_equipment_items")
    .update({ archived: true })
    .eq("plan_id", planId)
    .eq("source", "ai_suggested");

  // TIM-1038: Recreate equipment sections
  await supabase
    .from("buildout_list_sections")
    .delete()
    .eq("plan_id", planId)
    .eq("list_type", "equipment");

  const { data: createdSections, error: secErr } = await supabase
    .from("buildout_list_sections")
    .insert(
      EQUIPMENT_SECTIONS.map((s) => ({
        plan_id: planId,
        list_type: "equipment",
        name: s.name,
        position: s.position,
        collapsed: false,
      }))
    )
    .select("id, name");

  if (secErr || !createdSections) {
    console.error("buildout_list_sections insert error:", secErr);
    // Fallback: insert without sections
  }

  const sectionByName = new Map<string, string>(
    (createdSections ?? []).map((s) => [s.name as string, s.id as string])
  );

  // TIM-1002: enforce Title Case at the API boundary.
  // Fund items use budget_mid as their unit_cost (lump-sum budget guidance).
  const rows = refItems.map((ref, idx) => {
    const isFund = ref.type === "fund";
    const unitCostCents = isFund
      ? (ref.budget_mid ?? 0) * 100
      : (ref.price_mid ?? 0) * 100;

    const sectionName = deriveSectionName(ref.category, ref.name_canonical);
    const sectionId = sectionByName.get(sectionName) ?? null;

    return {
      plan_id: planId,
      section_id: sectionId,
      name: toTitleCase(ref.name_canonical),
      category: ref.category,
      vendor: null,
      model: null,
      quantity: 1,
      unit_cost_cents: unitCostCents,
      priority_tier: (ref.must_have ? "must_have" : "nice_to_have") as "must_have" | "nice_to_have",
      financing_method: "cash" as const,
      source: "ai_suggested" as const,
      notes: ref.notes ?? null,
      position: idx,
    };
  });

  const { data, error } = await supabase
    .from("buildout_equipment_items")
    .insert(rows)
    .select();

  if (error) {
    console.error("buildout_equipment_items seed insert error:", error);
    return Response.json({ error: "Failed to seed equipment items" }, { status: 500 });
  }

  return Response.json({ seeded: data?.length ?? 0, model_code: modelCode });
}
