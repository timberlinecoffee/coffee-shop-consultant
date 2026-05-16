import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const planId = request.nextUrl.searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

  // Verify the plan belongs to this user
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const { data: items, error } = await supabase
    .from("menu_items")
    .select("*")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: items ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { planId, name, category, price_cents, cogs_cents, expected_mix_pct, prep_time_seconds, notes } = body;

  if (!planId || !name || !category) {
    return NextResponse.json({ error: "planId, name, and category are required" }, { status: 400 });
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  // Get max position for ordering
  const { data: maxPositionRow } = await supabase
    .from("menu_items")
    .select("position")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (maxPositionRow?.position ?? -1) + 1;

  const { data: item, error } = await supabase
    .from("menu_items")
    .insert({
      plan_id: planId,
      position,
      name: name.trim(),
      category,
      price_cents: price_cents ?? 0,
      cogs_cents: cogs_cents ?? 0,
      expected_mix_pct: expected_mix_pct ?? 0,
      prep_time_seconds: prep_time_seconds ?? null,
      notes: notes?.trim() ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ item }, { status: 201 });
}
