// TIM-1038: Section PATCH + DELETE.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sectionId: string
) {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return null;

  const { data: section } = await supabase
    .from("buildout_list_sections")
    .select("id, plan_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section || section.plan_id !== plan.id) return null;

  return section;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
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

  const section = await getOwnedSection(supabase, user.id, id);
  if (!section) return Response.json({ error: "Section not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = toTitleCase(body.name);
  if (typeof body.position === "number") patch.position = body.position;
  if (typeof body.collapsed === "boolean") patch.collapsed = body.collapsed;
  if (Object.keys(patch).length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("buildout_list_sections")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to update section" }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
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

  const section = await getOwnedSection(supabase, user.id, id);
  if (!section) return Response.json({ error: "Section not found" }, { status: 404 });

  // Null out section_id on all items in this section (both equipment and supplies)
  await Promise.all([
    supabase.from("buildout_equipment_items").update({ section_id: null }).eq("section_id", id),
    supabase.from("buildout_supplies_items").update({ section_id: null }).eq("section_id", id),
  ]);

  const { error } = await supabase.from("buildout_list_sections").delete().eq("id", id);
  if (error) return Response.json({ error: "Failed to delete section" }, { status: 500 });
  return new Response(null, { status: 204 });
}
