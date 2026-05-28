// TIM-1225: Business Plan cover settings — GET (read) and PATCH (upsert).

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";
import { COVER_TEMPLATES } from "@/lib/pdf/business-plan/covers";

const VALID_TEMPLATE_IDS = new Set(COVER_TEMPLATES.map((t) => t.id));
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

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
    .select("template_id, accent_color, logo_path, tagline, prepared_for, author_name")
    .eq("plan_id", plan.id)
    .maybeSingle();

  return Response.json(
    cover ?? {
      template_id: "classic",
      accent_color: null,
      logo_path: null,
      tagline: null,
      prepared_for: null,
      author_name: null,
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
    tagline?: string | null;
    prepared_for?: string | null;
    author_name?: string | null;
  };

  if (body.template_id !== undefined && !VALID_TEMPLATE_IDS.has(body.template_id as never)) {
    return Response.json({ error: "Invalid template_id" }, { status: 422 });
  }

  if (body.accent_color !== undefined && body.accent_color !== null && !HEX_RE.test(body.accent_color)) {
    return Response.json({ error: "accent_color must be #RRGGBB" }, { status: 422 });
  }

  const payload: Record<string, unknown> = {
    plan_id: plan.id,
  };
  if (body.template_id !== undefined) payload.template_id = body.template_id;
  if (body.accent_color !== undefined) payload.accent_color = body.accent_color;
  if (body.tagline !== undefined) payload.tagline = body.tagline ? toTitleCase(body.tagline) : body.tagline;
  if (body.prepared_for !== undefined) payload.prepared_for = body.prepared_for ? toTitleCase(body.prepared_for) : body.prepared_for;
  if (body.author_name !== undefined) payload.author_name = body.author_name ? toTitleCase(body.author_name) : body.author_name;

  const { error } = await supabase
    .from("business_plan_cover")
    .upsert(payload, { onConflict: "plan_id" });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
