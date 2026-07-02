// TIM-3575: Archive / restore a standard business plan section.
//
// Rule 2: server-side plan-owner check on every request.
// Rule 3: zod-validated body.
// Rule 4: enforceRateLimit() — 30/min per user (cheap DB write, not a paid call).
// Rule 5: sanitized 5xx — no raw error bodies leak.

export const dynamic = "force-dynamic";

import { z } from "zod";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { BUSINESS_PLAN_SECTIONS } from "@/lib/business-plan";

type RouteContext = { params: Promise<{ sectionKey: string }> };

const PatchBodySchema = z.object({
  status: z.enum(["active", "archived"]),
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { sectionKey } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4: rate-limit.
  const ip = clientIp(request.headers);
  const rl = await enforceRateLimit({
    bucket: "bp:section-status:write",
    id: `${user.id}:${ip}`,
    limit: 30,
    windowSec: 60,
  });
  if (rl) return rl;

  // Reject archive attempts on locked sections (Executive Summary).
  const meta = BUSINESS_PLAN_SECTIONS.find((s) => s.key === sectionKey);
  if (meta?.isLocked) {
    return Response.json(
      { error: "Executive Summary cannot be archived" },
      { status: 400 },
    );
  }

  // Rule 3: validate body.
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

  // Rule 2: server-side ownership check via plan_id.
  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan" }, { status: 404 });

  const isArchived = parsed.data.status === "archived";

  // Upsert so the first archive of an auto-generated section creates the row.
  const { error } = await supabase
    .from("business_plan_sections")
    .upsert(
      { plan_id: planId, section_key: sectionKey, is_archived: isArchived },
      { onConflict: "plan_id,section_key" },
    );

  if (error) {
    // Rule 5: never leak raw Supabase error.
    return Response.json({ error: "Could not update section status" }, { status: 500 });
  }

  return Response.json({ ok: true, status: parsed.data.status });
}
