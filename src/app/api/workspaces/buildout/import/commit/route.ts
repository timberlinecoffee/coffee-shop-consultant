// TIM-1176: Section F — commit parsed import rows into equipment table.
// POST /api/workspaces/buildout/import/commit

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";
import type { ParsedRow } from "../route";

export async function POST(request: NextRequest) {
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

  let body: { rows: ParsedRow[]; replaceExisting?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rows = (body.rows ?? []).filter((r) => !r.skip && r.name?.trim());
  if (rows.length === 0) {
    return Response.json({ inserted: 0 });
  }

  // TIM-3242: Write with AI "replace" mode — archive all existing items before inserting.
  if (body.replaceExisting) {
    const { error: archiveError } = await supabase
      .from("buildout_equipment_items")
      .update({ archived: true })
      .eq("plan_id", plan.id)
      .eq("archived", false);
    if (archiveError) {
      console.error("buildout archive-existing error:", archiveError);
      return Response.json({ error: "Failed to archive existing items" }, { status: 500 });
    }
  }

  // Collect unique station names
  const stationNames = [...new Set(rows.map((r) => r.section_name).filter(Boolean))];

  // Load existing sections for this plan
  const { data: existingSections } = await supabase
    .from("buildout_list_sections")
    .select("id, name")
    .eq("plan_id", plan.id)
    .eq("list_type", "equipment");

  const sectionByName = new Map<string, string>(
    (existingSections ?? []).map((s) => [s.name as string, s.id as string])
  );

  // Get current max position for sections
  const { count: sectionCount } = await supabase
    .from("buildout_list_sections")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("list_type", "equipment");

  let nextSectionPos = sectionCount ?? 0;

  // Create any missing sections
  for (const name of stationNames) {
    if (!sectionByName.has(name) && name) {
      const { data: newSec } = await supabase
        .from("buildout_list_sections")
        .insert({
          plan_id: plan.id,
          list_type: "equipment",
          name: toTitleCase(name),
          position: nextSectionPos++,
          collapsed: false,
        })
        .select("id, name")
        .single();
      if (newSec) sectionByName.set(name, newSec.id as string);
    }
  }

  // Get current max position for items
  const { count: itemCount } = await supabase
    .from("buildout_equipment_items")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("archived", false);

  let nextPos = itemCount ?? 0;

  const insertRows = rows.map((r) => ({
    plan_id: plan.id,
    section_id: sectionByName.get(r.section_name) ?? null,
    name: toTitleCase(r.name),
    category: r.category ?? "miscellaneous",
    vendor: r.vendor ? toTitleCase(r.vendor) : null,
    model: r.model || null,
    supplier: r.supplier ? toTitleCase(r.supplier) : null,
    vendor_candidate_id: null,
    quantity: typeof r.quantity === "number" && r.quantity > 0 ? r.quantity : 1,
    unit_cost_cents: typeof r.unit_cost_cents === "number" ? Math.round(r.unit_cost_cents) : 0,
    priority_tier: "must_have" as const,
    financing_method: "cash" as const,
    source: "user_added" as const,
    notes: r.notes || null,
    position: nextPos++,
    archived: false,
  }));

  const { data: inserted, error } = await supabase
    .from("buildout_equipment_items")
    .insert(insertRows)
    .select();

  if (error) {
    console.error("buildout_equipment_items bulk insert error:", error);
    return Response.json({ error: "Failed to insert equipment items" }, { status: 500 });
  }

  return Response.json({ inserted: inserted?.length ?? 0 });
}
