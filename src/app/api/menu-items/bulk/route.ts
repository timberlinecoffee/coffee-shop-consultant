import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set(["espresso", "drip", "specialty", "food", "retail", "other"]);

interface BulkItem {
  name: string;
  category: string;
  price_cents: number;
  cogs_cents: number;
  expected_mix_pct?: number;
  prep_time_seconds?: number | null;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { planId: string; items: BulkItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { planId, items } = body;

  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  }
  if (items.length > 100) {
    return NextResponse.json({ error: "Maximum 100 items per batch" }, { status: 400 });
  }

  // Validate each item server-side
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.name?.trim()) {
      return NextResponse.json({ error: `Row ${i + 1}: name is required` }, { status: 400 });
    }
    if (!VALID_CATEGORIES.has(item.category)) {
      return NextResponse.json({ error: `Row ${i + 1}: invalid category "${item.category}"` }, { status: 400 });
    }
    if (typeof item.price_cents !== "number" || item.price_cents < 0) {
      return NextResponse.json({ error: `Row ${i + 1}: price_cents must be a non-negative number` }, { status: 400 });
    }
    if (typeof item.cogs_cents !== "number" || item.cogs_cents < 0) {
      return NextResponse.json({ error: `Row ${i + 1}: cogs_cents must be a non-negative number` }, { status: 400 });
    }
  }

  // Verify plan ownership
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  // Get max current position
  const { data: maxRow } = await supabase
    .from("menu_items")
    .select("position")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const basePosition = (maxRow?.position ?? -1) + 1;

  const inserts = items.map((item, idx) => ({
    plan_id: planId,
    position: basePosition + idx,
    name: item.name.trim(),
    category: item.category,
    price_cents: item.price_cents,
    cogs_cents: item.cogs_cents,
    expected_mix_pct: item.expected_mix_pct ?? 0,
    prep_time_seconds: item.prep_time_seconds ?? null,
    notes: item.notes?.trim() ?? null,
  }));

  const { data: newItems, error } = await supabase
    .from("menu_items")
    .insert(inserts)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: newItems ?? [] }, { status: 201 });
}
