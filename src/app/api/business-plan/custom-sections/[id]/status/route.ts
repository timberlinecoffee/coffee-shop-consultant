// TIM-3575: Archive / restore a custom business plan section.
//
// Rule 2: server-side ownership check (custom section UUID → plan_id → user_id).
// Rule 3: zod-validated body.
// Rule 4: enforceRateLimit() — 30/min per user.
// Rule 5: sanitized 5xx.

export const dynamic = "force-dynamic";

import { z } from "zod";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

const PatchBodySchema = z.object({
  status: z.enum(["active", "archived"]),
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4: rate-limit.
  const ip = clientIp(request.headers);
  const rl = await enforceRateLimit({
    bucket: "bp:custom-section-status:write",
    id: `${user.id}:${ip}`,
    limit: 30,
    windowSec: 60,
  });
  if (rl) return rl;

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

  const isArchived = parsed.data.status === "archived";

  // Rule 2: ownership via plan_id → coffee_shop_plans.user_id. The RLS policy
  // already enforces this at the DB level; the explicit .eq("plan_id", ...) +
  // plan owner check below is the server-side redundant gate.
  const { data: customSection, error: fetchErr } = await supabase
    .from("business_plan_custom_sections")
    .select("id, plan_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !customSection) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  // Verify the plan belongs to the authenticated user.
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("id", customSection.plan_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("business_plan_custom_sections")
    .update({ is_archived: isArchived })
    .eq("id", id);

  if (error) {
    return Response.json({ error: "Could not update section status" }, { status: 500 });
  }

  return Response.json({ ok: true, status: parsed.data.status });
}
