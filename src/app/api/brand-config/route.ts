// TIM-2253: GET and PATCH for brand_config — shop name and brand colors.
// Logo upload/delete handled by the existing /api/brand/logo route (TIM-1700).

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

async function getAuthedPlan(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, plan: null };

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { user, plan };
}

export async function GET() {
  const supabase = await createClient();
  const { user, plan } = await getAuthedPlan(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  const { data: config } = await supabase
    .from("brand_config")
    .select("shop_name, primary_color, secondary_color, accent_color, logo_path")
    .eq("plan_id", plan.id)
    .maybeSingle();

  return Response.json({
    shopName: config?.shop_name ?? plan.plan_name ?? "",
    primaryColor: config?.primary_color ?? "#155e63",
    secondaryColor: config?.secondary_color ?? "#76b39d",
    accentColor: config?.accent_color ?? "#f59e0b",
    logoPath: config?.logo_path ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { user, plan } = await getAuthedPlan(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  let body: {
    shopName?: unknown;
    primaryColor?: unknown;
    secondaryColor?: unknown;
    accentColor?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate hex values before building the upsert payload.
  if (body.primaryColor !== undefined) {
    if (typeof body.primaryColor !== "string" || !HEX_RE.test(body.primaryColor)) {
      return Response.json({ error: "Invalid primaryColor hex value" }, { status: 422 });
    }
  }
  if (body.secondaryColor !== undefined) {
    if (typeof body.secondaryColor !== "string" || !HEX_RE.test(body.secondaryColor)) {
      return Response.json({ error: "Invalid secondaryColor hex value" }, { status: 422 });
    }
  }
  if (body.accentColor !== undefined) {
    if (typeof body.accentColor !== "string" || !HEX_RE.test(body.accentColor)) {
      return Response.json({ error: "Invalid accentColor hex value" }, { status: 422 });
    }
  }

  const upsertPayload = {
    plan_id: plan.id,
    updated_at: new Date().toISOString(),
    ...(typeof body.shopName === "string"
      ? { shop_name: body.shopName.slice(0, 80) }
      : {}),
    ...(typeof body.primaryColor === "string"
      ? { primary_color: body.primaryColor }
      : {}),
    ...(typeof body.secondaryColor === "string"
      ? { secondary_color: body.secondaryColor }
      : {}),
    ...(typeof body.accentColor === "string"
      ? { accent_color: body.accentColor }
      : {}),
  };

  const { error } = await supabase
    .from("brand_config")
    .upsert(upsertPayload, { onConflict: "plan_id" });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
