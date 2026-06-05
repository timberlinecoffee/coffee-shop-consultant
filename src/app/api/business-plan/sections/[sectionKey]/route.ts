// TIM-1037: Business Plan section upsert — save user edits and visibility toggles.
// TIM-2342: accept estimated_claims_json so the export-gate modal can read the
// AI-estimate-class claims surfaced by the narrative LLM's <num src="estimate">
// markers (stored separately from user_content so the founder edits clean prose).

export const dynamic = "force-dynamic";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ sectionKey: string }> };

// Rule 3 — server-side body schema. user_content is capped at 100 KB (~25 000 words).
const PatchBodySchema = z.object({
  user_content: z.string().max(100_000).nullable().optional(),
  is_visible: z.boolean().optional(),
  estimated_claims_json: z.unknown().optional(),
});

// Defensive validator — only accept arrays of the EstimatedClaim shape. An
// unknown blob is silently dropped (better than rejecting the whole PATCH).
// Caps array length at 100 and string lengths at 1KB to keep the column tidy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeEstimatedClaims(raw: any): unknown[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Record<string, unknown>[] = [];
  for (const item of raw.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    out.push({
      id: typeof o.id === "string" ? o.id.slice(0, 200) : "",
      section_key: typeof o.section_key === "string" ? o.section_key.slice(0, 100) : "",
      content: typeof o.content === "string" ? o.content.slice(0, 1024) : "",
      hedge: typeof o.hedge === "string" ? o.hedge.slice(0, 64) : "approximately",
      surrounding_sentence: typeof o.surrounding_sentence === "string"
        ? o.surrounding_sentence.slice(0, 1024)
        : "",
    });
  }
  return out;
}

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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = PatchBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const body = parsed.data;

  // Rule 3 — server-side validation. Drop unknown shapes silently rather
  // than rejecting the PATCH, so a stale client can still save user_content.
  const sanitizedClaims = body.estimated_claims_json !== undefined
    ? sanitizeEstimatedClaims(body.estimated_claims_json)
    : undefined;

  const { error } = await supabase
    .from("business_plan_sections")
    .upsert(
      {
        plan_id: plan.id,
        section_key: sectionKey,
        ...(body.user_content !== undefined ? { user_content: body.user_content } : {}),
        ...(body.is_visible !== undefined ? { is_visible: body.is_visible } : {}),
        ...(sanitizedClaims !== undefined ? { estimated_claims_json: sanitizedClaims } : {}),
      },
      { onConflict: "plan_id,section_key" }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
