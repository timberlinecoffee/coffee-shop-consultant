// TIM-2434: Document Import — apply accepted changes to suite stores.
//
// POST { importId, accepted: [{ fieldId, finalValue }] }
//
// Routes each accepted change to the right suite store:
//   business_plan:* → business_plan_sections (plan_id, section_key)
//   financials:*    → financial_models.forecast_inputs[fieldKey]
//   concept_brand:* → workspace_documents.content where workspace_key='concept'
//
// AI never auto-applies (TIM-1638): every change here was already
// individually accepted in the unified AIReviewModal client-side.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  importId: z.string().uuid(),
  accepted: z
    .array(
      z.object({
        fieldId: z.string().min(1),
        finalValue: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(200),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const user = auth.user;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { data: session } = await supabase
    .from("document_imports")
    .select("id, user_id, plan_id, status")
    .eq("id", parsed.data.importId)
    .single();
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: "Import not found." }, { status: 404 });
  }

  let bpApplied = 0;
  let finApplied = 0;
  let conceptApplied = 0;

  // Bucket changes by suite + accumulate financials/concept patches first.
  const finPatch: Record<string, string> = {};
  const conceptPatch: Record<string, string> = {};

  for (const c of parsed.data.accepted) {
    const colon = c.fieldId.indexOf(":");
    if (colon < 0) continue;
    const suite = c.fieldId.slice(0, colon);
    const fieldKey = c.fieldId.slice(colon + 1);
    if (suite === "business_plan") {
      const { error } = await supabase
        .from("business_plan_sections")
        .upsert(
          {
            plan_id: session.plan_id,
            section_key: fieldKey,
            user_content: c.finalValue,
          },
          { onConflict: "plan_id,section_key" },
        );
      if (!error) bpApplied += 1;
    } else if (suite === "financials") {
      finPatch[fieldKey] = c.finalValue;
    } else if (suite === "concept_brand") {
      conceptPatch[fieldKey] = c.finalValue;
    }
  }

  if (Object.keys(finPatch).length > 0) {
    const { data: fm } = await supabase
      .from("financial_models")
      .select("id, forecast_inputs")
      .eq("plan_id", session.plan_id)
      .single();
    if (fm) {
      const merged = {
        ...((fm.forecast_inputs as Record<string, unknown>) ?? {}),
        ...finPatch,
      };
      const { error } = await supabase
        .from("financial_models")
        .update({ forecast_inputs: merged })
        .eq("id", fm.id);
      if (!error) finApplied = Object.keys(finPatch).length;
    }
  }

  if (Object.keys(conceptPatch).length > 0) {
    const { data: doc } = await supabase
      .from("workspace_documents")
      .select("id, content")
      .eq("plan_id", session.plan_id)
      .eq("workspace_key", "concept")
      .maybeSingle();
    const baseContent =
      (doc?.content as Record<string, unknown>) ?? {};
    const merged = { ...baseContent, ...conceptPatch };
    if (doc) {
      const { error } = await supabase
        .from("workspace_documents")
        .update({ content: merged })
        .eq("id", doc.id);
      if (!error) conceptApplied = Object.keys(conceptPatch).length;
    } else {
      const { error } = await supabase.from("workspace_documents").insert({
        plan_id: session.plan_id,
        workspace_key: "concept",
        content: merged,
      });
      if (!error) conceptApplied = Object.keys(conceptPatch).length;
    }
  }

  await supabase
    .from("document_imports")
    .update({ status: "applied" })
    .eq("id", session.id);

  return NextResponse.json({
    importId: session.id,
    applied: {
      business_plan: bpApplied,
      financials: finApplied,
      concept_brand: conceptApplied,
    },
  });
}
