// TIM-972: Equipment seed endpoint — uses standard_equipment_reference instead of Claude.
// Derives menu_profile from concept + menu workspace docs, then seeds all must_have=true
// rows into buildout_equipment_items as source=ai_suggested.
// POST /api/workspaces/financials/seed

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { normalizeConceptV2 } from "@/lib/concept";

type MenuProfile = "espresso_focused" | "espresso_plus_brew" | "full_drip" | "full_food";

function deriveMenuProfile(
  conceptContent: Record<string, unknown> | null,
  menuContent: Record<string, unknown> | null
): MenuProfile {
  const concept = conceptContent ?? {};
  const conceptType = String(concept.business_type ?? concept.type ?? "").toLowerCase();
  const conceptStyle = String(concept.service_style ?? concept.style ?? "").toLowerCase();

  // Check menu content for food signals
  const hasFood = menuContent
    ? JSON.stringify(menuContent).toLowerCase().includes("food")
    : false;

  // Check for drive-through / kiosk signals → espresso_focused
  const isDriveThru =
    conceptType.includes("drive") ||
    conceptType.includes("kiosk") ||
    conceptStyle.includes("drive");

  if (isDriveThru) return "espresso_focused";

  // Full café with food
  if (hasFood && (conceptType.includes("cafe") || conceptType.includes("café"))) {
    return "full_food";
  }

  // Espresso bar with some filter/drip
  if (
    conceptType.includes("espresso") ||
    conceptStyle.includes("espresso") ||
    conceptType.includes("specialty")
  ) {
    return "espresso_plus_brew";
  }

  // Default: espresso_plus_brew for a typical specialty coffee shop
  return "espresso_plus_brew";
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

  // Load concept + menu docs for profile derivation
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

  const menuProfile = deriveMenuProfile(
    conceptNormalized as Record<string, unknown> | null,
    menuDoc?.content as Record<string, unknown> | null
  );

  // Fetch must_have reference items for this profile
  const { data: refItems, error: refError } = await supabase
    .from("standard_equipment_reference")
    .select("id, category, name_canonical, must_have, rationale")
    .eq("menu_profile", menuProfile)
    .eq("must_have", true)
    .order("category");

  if (refError) {
    console.error("standard_equipment_reference select error:", refError);
    return Response.json({ error: "Failed to fetch equipment reference" }, { status: 500 });
  }

  if (!refItems || refItems.length === 0) {
    // Fallback: fetch any profile's must_have items
    const { data: fallback } = await supabase
      .from("standard_equipment_reference")
      .select("id, category, name_canonical, must_have, rationale")
      .eq("must_have", true)
      .limit(20);

    if (!fallback || fallback.length === 0) {
      return Response.json({ seeded: 0, menu_profile: menuProfile });
    }

    return upsertItems(supabase, plan.id, menuProfile, fallback);
  }

  return upsertItems(supabase, plan.id, menuProfile, refItems);
}

async function upsertItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  menuProfile: MenuProfile,
  refItems: Array<{ category: string; name_canonical: string; rationale: string }>
) {
  // Remove any existing ai_suggested items before re-seeding
  await supabase
    .from("buildout_equipment_items")
    .update({ archived: true })
    .eq("plan_id", planId)
    .eq("source", "ai_suggested");

  const rows = refItems.map((ref, idx) => ({
    plan_id: planId,
    name: ref.name_canonical,
    category: ref.category,
    vendor: null,
    model: null,
    quantity: 1,
    unit_cost_cents: 0,
    priority_tier: "must_have" as const,
    financing_method: "cash" as const,
    source: "ai_suggested" as const,
    notes: ref.rationale,
    position: idx,
  }));

  const { data, error } = await supabase
    .from("buildout_equipment_items")
    .insert(rows)
    .select();

  if (error) {
    console.error("buildout_equipment_items seed insert error:", error);
    return Response.json({ error: "Failed to seed equipment items" }, { status: 500 });
  }

  return Response.json({ seeded: data?.length ?? 0, menu_profile: menuProfile });
}
