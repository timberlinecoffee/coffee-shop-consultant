// TIM-1414: Custom vendor categories — list + create.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import {
  customCategoryKey,
  slugifyCategoryLabel,
  type VendorCustomCategory,
} from "@/lib/suppliers";
import type { NextRequest } from "next/server";

async function loadPlan(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return { error: Response.json({ error: "No plan found" }, { status: 404 }) };
  return { user, plan };
}

export async function GET() {
  const supabase = await createClient();
  const auth = await loadPlan(supabase);
  if ("error" in auth) return auth.error;

  const { data, error } = await supabase
    .from("vendor_custom_categories")
    .select("*")
    .eq("plan_id", auth.plan.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: "Failed to fetch custom categories" }, { status: 500 });
  return Response.json((data ?? []) as VendorCustomCategory[]);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await loadPlan(supabase);
  if ("error" in auth) return auth.error;

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", auth.user.id)
    .single();
  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  let body: { label?: string };
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawLabel = typeof body.label === "string" ? body.label.trim() : "";
  if (!rawLabel) return Response.json({ error: "Label required" }, { status: 400 });
  if (rawLabel.length > 60) return Response.json({ error: "Label too long" }, { status: 400 });

  const label = toTitleCase(rawLabel);
  let slug = slugifyCategoryLabel(rawLabel);

  // Ensure uniqueness — append a short suffix if collision.
  const { data: existing } = await supabase
    .from("vendor_custom_categories")
    .select("key")
    .eq("plan_id", auth.plan.id);
  const taken = new Set<string>((existing ?? []).map((c) => c.key as string));
  if (taken.has(customCategoryKey(slug))) {
    let i = 2;
    while (taken.has(customCategoryKey(`${slug}_${i}`))) i++;
    slug = `${slug}_${i}`;
  }

  const { count } = await supabase
    .from("vendor_custom_categories")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", auth.plan.id);

  const { data, error } = await supabase
    .from("vendor_custom_categories")
    .insert({
      plan_id: auth.plan.id,
      key: customCategoryKey(slug),
      label,
      position: count ?? 0,
    })
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to create category", detail: error.message }, { status: 500 });
  return Response.json(data as VendorCustomCategory, { status: 201 });
}
