// TIM-1483: Financial document visibility — GET list (registry merged with saved rows).

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { FINANCIAL_DOCUMENTS } from "@/lib/business-plan-financials";

export async function GET() {
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

  const { data: savedRows } = await supabase
    .from("business_plan_financial_documents")
    .select("document_key, is_visible")
    .eq("plan_id", plan.id);

  const savedMap = new Map(
    (savedRows ?? []).map((r: { document_key: string; is_visible: boolean }) => [r.document_key, r.is_visible])
  );

  const result = FINANCIAL_DOCUMENTS.map((doc) => ({
    key: doc.key,
    title: doc.title,
    source: doc.source,
    is_visible: savedMap.has(doc.key) ? savedMap.get(doc.key)! : doc.defaultVisible,
  }));

  return Response.json(result);
}
