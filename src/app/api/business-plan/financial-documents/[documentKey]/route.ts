// TIM-1483: Financial document visibility — PATCH upsert for a single document.

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { FINANCIAL_DOCUMENTS } from "@/lib/business-plan-financials";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ documentKey: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { documentKey } = await params;

  const validKeys = FINANCIAL_DOCUMENTS.map((d) => d.key);
  if (!validKeys.includes(documentKey as never)) {
    return Response.json({ error: "Unknown document key" }, { status: 400 });
  }

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

  const body = await request.json() as { is_visible: boolean };
  if (typeof body.is_visible !== "boolean") {
    return Response.json({ error: "is_visible must be boolean" }, { status: 400 });
  }

  const { error } = await supabase
    .from("business_plan_financial_documents")
    .upsert(
      {
        plan_id: plan.id,
        document_key: documentKey,
        is_visible: body.is_visible,
      },
      { onConflict: "plan_id,document_key" }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
