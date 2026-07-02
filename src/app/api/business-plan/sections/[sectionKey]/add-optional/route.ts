// TIM-3575: Add an optional section to the active plan (idempotent).
//
// Rejects non-optional keys with 400. Already-active sections return 200.
// Appends the key to business_plan_section_order via existing PATCH pattern.
//
// Rule 2: server-side plan-owner check.
// Rule 3: validates section_key is an isOptional entry.
// Rule 4: enforceRateLimit() — 30/min per user.
// Rule 5: sanitized 5xx.

export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { BUSINESS_PLAN_SECTIONS, DEFAULT_BUSINESS_PLAN_SECTION_ORDER } from "@/lib/business-plan";
import { resolveSectionOrder } from "@/lib/business-plan/default-section-order";

type RouteContext = { params: Promise<{ sectionKey: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { sectionKey } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4: rate-limit.
  const ip = clientIp(request.headers);
  const rl = await enforceRateLimit({
    bucket: "bp:add-optional:write",
    id: `${user.id}:${ip}`,
    limit: 30,
    windowSec: 60,
  });
  if (rl) return rl;

  // Rule 3: only isOptional keys may be added via this route.
  const meta = BUSINESS_PLAN_SECTIONS.find((s) => s.key === sectionKey);
  if (!meta?.isOptional) {
    return Response.json(
      { error: "Section is not optional or does not exist" },
      { status: 400 },
    );
  }

  // Rule 2: ownership.
  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan" }, { status: 404 });

  // Ensure the section row exists and is not archived (idempotent).
  const { error: upsertErr } = await supabase
    .from("business_plan_sections")
    .upsert(
      { plan_id: planId, section_key: sectionKey, is_archived: false },
      { onConflict: "plan_id,section_key" },
    );
  if (upsertErr) {
    return Response.json({ error: "Could not activate section" }, { status: 500 });
  }

  // Fetch current section order to append the key at the end (idempotent).
  const { data: planRow } = await supabase
    .from("coffee_shop_plans")
    .select("business_plan_section_order")
    .eq("id", planId)
    .maybeSingle();

  const rawOrder = (planRow as { business_plan_section_order?: unknown } | null)
    ?.business_plan_section_order;
  const persisted: string[] = Array.isArray(rawOrder)
    ? rawOrder.filter((v): v is string => typeof v === "string")
    : [];

  // If already in the order, return 200 without re-adding.
  const currentOrder = resolveSectionOrder(persisted, DEFAULT_BUSINESS_PLAN_SECTION_ORDER, []);
  if (currentOrder.includes(sectionKey)) {
    return Response.json({ ok: true, alreadyActive: true });
  }

  // Append the optional key at the end.
  const nextOrder = [...persisted, sectionKey];
  const { error: orderErr } = await supabase
    .from("coffee_shop_plans")
    .update({ business_plan_section_order: nextOrder })
    .eq("id", planId)
    .eq("user_id", user.id);

  if (orderErr) {
    return Response.json({ error: "Could not update section order" }, { status: 500 });
  }

  return Response.json({ ok: true, alreadyActive: false });
}
