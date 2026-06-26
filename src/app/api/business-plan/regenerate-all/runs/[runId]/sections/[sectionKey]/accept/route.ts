// TIM-3018: Accept a section draft from regenerate-all.
// Promotes draft_content to business_plan_sections.user_content and marks
// the draft accepted. Shape C invariant: user_content is ONLY mutated here,
// not by the SSE stream. Reject leaves user_content untouched.

export const dynamic = "force-dynamic";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ runId: string; sectionKey: string }> };

const BodySchema = z.object({
  finalValue: z.string().max(100_000),
});

const ParamsSchema = z.object({
  runId: z.string().uuid(),
  sectionKey: z.string().min(1).max(200),
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  const rawParams = await params;
  const paramsResult = ParamsSchema.safeParse(rawParams);
  if (!paramsResult.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { runId, sectionKey } = paramsResult.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4: rate-limit accepts — 60 per minute per user covers a full regen run
  // (up to ~21 sections) with headroom for retries.
  const rl = await enforceRateLimit({
    bucket: "bp-draft:accept",
    id: user.id,
    limit: 60,
    windowSec: 60,
  });
  if (rl) return rl;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { finalValue } = parsed.data;

  // Rule 2: verify the draft exists, is pending, and is owned by the authed user
  // (via RLS plan_id check). Fetch it with the user's auth client so RLS applies.
  // Also fetch estimated_claims_json so we can propagate it to business_plan_sections
  // (mirrors the legacy PATCH route at /api/business-plan/sections/[sectionKey]).
  const { data: draft, error: draftErr } = await supabase
    .from("business_plan_section_drafts")
    .select("id, plan_id, status, estimated_claims_json")
    .eq("run_id", runId)
    .eq("section_key", sectionKey)
    .maybeSingle();

  if (draftErr) return Response.json({ error: "Internal error" }, { status: 500 });
  if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
  if (draft.status !== "pending") {
    return Response.json({ error: `Draft already ${draft.status}` }, { status: 409 });
  }

  // Use service client for writes so they aren't constrained by the streaming
  // auth context. RLS ownership was verified above.
  const svc = createServiceClient();

  // 1. Promote draft to live section content. Write estimated_claims_json alongside
  // user_content so the export-gate modal sees the freshly-generated claims (not stale
  // ones from a prior generation). Mirrors the legacy PATCH at /api/business-plan/sections.
  const { error: upsertErr } = await svc
    .from("business_plan_sections")
    .upsert(
      {
        plan_id: draft.plan_id,
        section_key: sectionKey,
        user_content: finalValue,
        estimated_claims_json: draft.estimated_claims_json ?? [],
      },
      { onConflict: "plan_id,section_key" },
    );
  if (upsertErr) return Response.json({ error: upsertErr.message }, { status: 500 });

  // 2. Mark draft accepted.
  const { error: updateErr } = await svc
    .from("business_plan_section_drafts")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", draft.id);
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

  return Response.json({ ok: true });
}
