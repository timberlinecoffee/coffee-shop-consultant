// TIM-1179: Admin CRUD for equipment_referrals — get / update / delete.
// CTO-only: gated by APP_ADMIN_EMAIL env var.

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { NextRequest } from "next/server";
import type { EquipmentReferral } from "@/types/referral";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("equipment_referrals")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(data as EquipmentReferral);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: Partial<EquipmentReferral>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.referral_url !== undefined) {
    try {
      new URL(body.referral_url);
    } catch {
      return Response.json({ error: "referral_url must be a valid URL" }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.brand !== undefined) patch.brand = body.brand.trim();
  if (body.model !== undefined) patch.model = body.model.trim();
  if (body.category !== undefined) patch.category = body.category.trim();
  if (body.station !== undefined) patch.station = body.station.trim();
  if (body.referral_url !== undefined) patch.referral_url = body.referral_url.trim();
  if (body.partner_name !== undefined) patch.partner_name = body.partner_name.trim();
  if (body.notes !== undefined) patch.notes = body.notes.trim();
  if (body.active_flag !== undefined) patch.active_flag = body.active_flag;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("equipment_referrals")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) return Response.json({ error: "Update failed" }, { status: 500 });
  return Response.json(data as EquipmentReferral);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const svc = createServiceClient();
  const { error } = await svc.from("equipment_referrals").delete().eq("id", id);

  if (error) return Response.json({ error: "Delete failed" }, { status: 500 });
  return new Response(null, { status: 204 });
}
