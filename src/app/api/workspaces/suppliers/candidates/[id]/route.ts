// TIM-1059: Suppliers & Vendors — update + delete a single candidate.
// When status flips to "chosen" we also record a row in vendor_decisions.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import { isVendorStatus, type VendorCandidate } from "@/lib/suppliers";
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

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("vendor_candidates")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) return Response.json({ error: "Not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = toTitleCase(body.name);
  if ("contact" in body) update.contact = (body.contact as string | null) ?? null;
  if ("price_per_unit" in body) update.price_per_unit = (body.price_per_unit as string | null) ?? null;
  if ("minimum_order" in body) update.minimum_order = (body.minimum_order as string | null) ?? null;
  if ("lead_time" in body) update.lead_time = (body.lead_time as string | null) ?? null;
  if ("notes" in body) update.notes = (body.notes as string | null) ?? null;
  if (typeof body.position === "number") update.position = body.position;
  if (isVendorStatus(body.status)) update.status = body.status;

  const { data, error } = await supabase
    .from("vendor_candidates")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error || !data) return Response.json({ error: "Failed to update", detail: error?.message }, { status: 500 });

  // Decision capture: status flipped to "chosen" on this update.
  if (update.status === "chosen" && existing.status !== "chosen") {
    // Mark prior current decisions in this category as superseded.
    await supabase
      .from("vendor_decisions")
      .update({ is_current: false })
      .eq("plan_id", data.plan_id)
      .eq("category", data.category)
      .eq("is_current", true);

    const reason = typeof body.reason === "string" ? body.reason : null;
    await supabase.from("vendor_decisions").insert({
      plan_id: data.plan_id,
      category: data.category,
      candidate_id: data.id,
      vendor_name: data.name || "Unnamed Vendor",
      reason,
      is_current: true,
    });
  }

  // If a previously chosen row was demoted, retire its current decision row.
  if (existing.status === "chosen" && update.status && update.status !== "chosen") {
    await supabase
      .from("vendor_decisions")
      .update({ is_current: false })
      .eq("plan_id", data.plan_id)
      .eq("category", data.category)
      .eq("candidate_id", data.id)
      .eq("is_current", true);
  }

  return Response.json(data as VendorCandidate);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const auth = await authorize(supabase);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { error } = await supabase.from("vendor_candidates").delete().eq("id", id);
  if (error) return Response.json({ error: "Failed to delete" }, { status: 500 });
  return Response.json({ ok: true });
}
