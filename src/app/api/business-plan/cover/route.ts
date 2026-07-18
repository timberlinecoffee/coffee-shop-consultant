// TIM-1225: Business Plan cover settings — GET (read) and PATCH (upsert).

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";
import { COVER_TEMPLATES } from "@/lib/pdf/business-plan/covers";

const VALID_TEMPLATE_IDS = new Set(COVER_TEMPLATES.map((t) => t.id));
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const VALID_BODY_FONTS = new Set(["inter", "dm-sans", "lato", "source-serif-4", "libre-baskerville", "nunito"]);
const VALID_COLOR_PACK_IDS = new Set(["coastal", "espresso", "slate", "ember", "sage", "midnight", "berry", "terracotta", "steel", "mauve"]);

async function getAuthedPlan(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, plan: null };

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
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

  const { data: cover } = await supabase
    .from("business_plan_cover")
    .select("template_id, accent_color, color_pack_id, logo_path, tagline, prepared_for, author_name, body_font")
    .eq("plan_id", plan.id)
    .maybeSingle();

  return Response.json(
    cover ?? {
      template_id: "classic",
      accent_color: null,
      color_pack_id: null,
      logo_path: null,
      tagline: null,
      prepared_for: null,
      author_name: null,
      body_font: null,
    }
  );
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { user, plan } = await getAuthedPlan(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  const body = await request.json() as {
    template_id?: string;
    accent_color?: string | null;
    color_pack_id?: string | null;
    tagline?: string | null;
    prepared_for?: string | null;
    author_name?: string | null;
    body_font?: string | null;
  };

  if (body.template_id !== undefined && !VALID_TEMPLATE_IDS.has(body.template_id as never)) {
    return Response.json({ error: "Invalid template_id" }, { status: 422 });
  }

  if (body.accent_color !== undefined && body.accent_color !== null && !HEX_RE.test(body.accent_color)) {
    return Response.json({ error: "accent_color must be #RRGGBB" }, { status: 422 });
  }

  if (body.body_font !== undefined && body.body_font !== null && !VALID_BODY_FONTS.has(body.body_font)) {
    return Response.json({ error: "Invalid body_font" }, { status: 422 });
  }

  if (body.color_pack_id !== undefined && body.color_pack_id !== null && !VALID_COLOR_PACK_IDS.has(body.color_pack_id)) {
    return Response.json({ error: "Invalid color_pack_id" }, { status: 422 });
  }

  const payload: Record<string, unknown> = {
    plan_id: plan.id,
  };
  if (body.template_id !== undefined) payload.template_id = body.template_id;
  if (body.accent_color !== undefined) payload.accent_color = body.accent_color;
  if (body.color_pack_id !== undefined) payload.color_pack_id = body.color_pack_id;
  if (body.tagline !== undefined) payload.tagline = body.tagline ? toTitleCase(body.tagline) : body.tagline;
  if (body.prepared_for !== undefined) payload.prepared_for = body.prepared_for ? toTitleCase(body.prepared_for) : body.prepared_for;
  if (body.author_name !== undefined) payload.author_name = body.author_name ? toTitleCase(body.author_name) : body.author_name;
  if (body.body_font !== undefined) payload.body_font = body.body_font;

  const { error } = await supabase
    .from("business_plan_cover")
    .upsert(payload, { onConflict: "plan_id" });

  if (error) { console.error("[route] DB error:", error); return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 }); }

  return Response.json({ ok: true });
}
