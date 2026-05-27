// TIM-1179: Admin CRUD for equipment_referrals — list + create.
// CTO-only: gated by APP_ADMIN_EMAIL env var.

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { NextRequest } from "next/server";
import type { EquipmentReferral } from "@/types/referral";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("equipment_referrals")
    .select("*")
    .order("brand", { ascending: true })
    .order("model", { ascending: true });

  if (error) return Response.json({ error: "Failed to fetch referrals" }, { status: 500 });
  return Response.json((data ?? []) as EquipmentReferral[]);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Partial<EquipmentReferral>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.brand?.trim() || !body.model?.trim() || !body.referral_url?.trim()) {
    return Response.json({ error: "brand, model, and referral_url are required" }, { status: 400 });
  }

  try {
    new URL(body.referral_url);
  } catch {
    return Response.json({ error: "referral_url must be a valid URL" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("equipment_referrals")
    .insert({
      brand: body.brand.trim(),
      model: body.model.trim(),
      category: body.category?.trim() ?? "",
      station: body.station?.trim() ?? "",
      referral_url: body.referral_url.trim(),
      partner_name: body.partner_name?.trim() ?? "",
      notes: body.notes?.trim() ?? "",
      active_flag: body.active_flag ?? true,
    })
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to create referral" }, { status: 500 });
  return Response.json(data as EquipmentReferral, { status: 201 });
}
