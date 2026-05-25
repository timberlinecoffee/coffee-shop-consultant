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

  // TIM-1002: enforce Title Case at the API boundary.
  // Fund items use budget_mid as their unit_cost (lump-sum budget guidance).
  const rows = refItems.map((ref, idx) => {
    const isFund = ref.type === "fund";
    // For fund items, store the mid-range budget as unit_cost_cents (in dollars × 100)
    const unitCostCents = isFund
      ? (ref.budget_mid ?? 0) * 100
      : (ref.price_mid ?? 0) * 100;

    return {
      plan_id: planId,
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
