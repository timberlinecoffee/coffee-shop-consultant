// TIM-1037: Business Plan section upsert — save user edits and visibility toggles.

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ sectionKey: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { sectionKey } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  const body = await request.json() as {
    user_content?: string | null;
    is_visible?: boolean;
  };

  const { error } = await supabase
    .from("business_plan_sections")
    .upsert(
      {
        plan_id: plan.id,
        section_key: sectionKey,
        ...(body.user_content !== undefined ? { user_content: body.user_content } : {}),
        ...(body.is_visible !== undefined ? { is_visible: body.is_visible } : {}),
      },
      { onConflict: "plan_id,section_key" }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
