// TIM-1414: Custom vendor categories — rename + delete.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import type { VendorCustomCategory } from "@/lib/suppliers";
import type { NextRequest } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function authorize(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();
  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return { error: Response.json({ error: "Subscription required" }, { status: 402 }) };
  }
  return { user };
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const auth = await authorize(supabase);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  let body: { label?: string; position?: number };
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.label === "string") {
    const trimmed = body.label.trim();
    if (!trimmed) return Response.json({ error: "Label required" }, { status: 400 });
    if (trimmed.length > 60) return Response.json({ error: "Label too long" }, { status: 400 });
    update.label = toTitleCase(trimmed);
  }
  if (typeof body.position === "number") update.position = body.position;

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("vendor_custom_categories")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) return Response.json({ error: "Failed to update", detail: error?.message }, { status: 500 });
  return Response.json(data as VendorCustomCategory);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const auth = await authorize(supabase);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  // Fetch the category so we know its key — candidates/decisions reference
  // category by key, not by FK. Cascading the cleanup keeps the data tidy.
  const { data: cat } = await supabase
    .from("vendor_custom_categories")
    .select("plan_id, key")
    .eq("id", id)
    .single();

  if (cat) {
    await supabase
      .from("vendor_candidates")
      .delete()
      .eq("plan_id", cat.plan_id)
      .eq("category", cat.key);
    await supabase
      .from("vendor_decisions")
      .delete()
      .eq("plan_id", cat.plan_id)
      .eq("category", cat.key);
  }

  const { error } = await supabase
    .from("vendor_custom_categories")
    .delete()
    .eq("id", id);
  if (error) return Response.json({ error: "Failed to delete" }, { status: 500 });
  return Response.json({ ok: true });
}
