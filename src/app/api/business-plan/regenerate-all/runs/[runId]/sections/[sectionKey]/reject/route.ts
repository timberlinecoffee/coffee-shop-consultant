// TIM-3018: Reject a section draft from regenerate-all.
// Marks the draft rejected. business_plan_sections.user_content is NEVER
// touched here — this is the Shape C invariant from TIM-2924.

export const dynamic = "force-dynamic";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ runId: string; sectionKey: string }> };

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

  // Rule 4: same bucket as accept so both count against the same window.
  const rl = await enforceRateLimit({
    bucket: "bp-draft:accept",
    id: user.id,
    limit: 60,
    windowSec: 60,
  });
  if (rl) return rl;

  // Rule 2: verify draft exists, is pending, and is owned by the authed user
  // (RLS on business_plan_section_drafts enforces plan ownership via auth.uid()).
  const { data: draft, error: draftErr } = await supabase
    .from("business_plan_section_drafts")
    .select("id, status")
    .eq("run_id", runId)
    .eq("section_key", sectionKey)
    .maybeSingle();

  if (draftErr) return Response.json({ error: "Internal error" }, { status: 500 });
  if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
  if (draft.status !== "pending") {
    return Response.json({ error: `Draft already ${draft.status}` }, { status: 409 });
  }

  const svc = createServiceClient();

  // Mark draft rejected. DO NOT touch business_plan_sections.user_content —
  // Shape C invariant: the live plan column is never mutated by Reject.
  const { error: updateErr } = await svc
    .from("business_plan_section_drafts")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", draft.id);
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

  return Response.json({ ok: true });
}
