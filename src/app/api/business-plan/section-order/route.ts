// TIM-3490: PATCH/DELETE the per-plan top-level Business Plan section order.
//
// PATCH body  -> { order: string[] }  Persist the new order.
// DELETE      -> Reset to the default order (clears the persisted array).
//
// The order array contains stable identifiers (standard section keys + custom
// section UUIDs). Server-side validation re-checks that every entry is a known
// standard key OR a custom-section UUID owned by the caller's plan, so a
// client cannot smuggle a foreign UUID into their order.

export const dynamic = "force-dynamic";

import { z } from "zod";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import {
  DEFAULT_BUSINESS_PLAN_SECTION_ORDER,
} from "@/lib/business-plan";
import {
  MAX_SECTION_ORDER_ENTRIES,
  isPlausibleSectionOrderEntry,
} from "@/lib/business-plan/default-section-order";

const STANDARD_KEYS = new Set<string>(DEFAULT_BUSINESS_PLAN_SECTION_ORDER);

const PatchBodySchema = z.object({
  order: z
    .array(z.string())
    .min(0)
    .max(MAX_SECTION_ORDER_ENTRIES)
    .refine((arr) => arr.every(isPlausibleSectionOrderEntry), {
      message: "Each entry must be a known section key or a UUID",
    }),
});

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rule 4: rate-limit. 30/min per user is generous for a UI that PATCHes
  // once per drop; bursty enough to absorb double-fires and React Strict
  // Mode duplicates, tight enough to throttle a runaway client loop.
  const ip = clientIp(request.headers);
  const rl = await enforceRateLimit({
    bucket: "bp:section-order:write",
    id: `${user.id}:${ip}`,
    limit: 30,
    windowSec: 60,
  });
  if (rl) return rl;

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) {
    return Response.json({ error: "No plan" }, { status: 404 });
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

  // Resolve which entries are real for THIS plan: standard keys are global;
  // UUIDs must belong to this plan's custom sections.
  const incoming = parsed.data.order;

  const uuidEntries = incoming.filter((e) => !STANDARD_KEYS.has(e));
  let ownedCustomIds = new Set<string>();
  if (uuidEntries.length > 0) {
    const { data: customRows, error: customErr } = await supabase
      .from("business_plan_custom_sections")
      .select("id")
      .eq("plan_id", planId)
      .in("id", uuidEntries);
    if (customErr) {
      return Response.json(
        { error: "Could not validate custom sections" },
        { status: 500 },
      );
    }
    ownedCustomIds = new Set<string>(
      (customRows ?? []).map((r) => r.id as string),
    );
  }

  // De-dupe + filter to known-good entries. Anything unknown is silently
  // dropped — the resolveSectionOrder fallback in the workspace UI will
  // backfill missing standard keys at the tail.
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const entry of incoming) {
    if (seen.has(entry)) continue;
    if (STANDARD_KEYS.has(entry) || ownedCustomIds.has(entry)) {
      seen.add(entry);
      sanitized.push(entry);
    }
  }

  const { error: updateErr } = await supabase
    .from("coffee_shop_plans")
    .update({ business_plan_section_order: sanitized })
    .eq("id", planId)
    .eq("user_id", user.id);

  if (updateErr) {
    // Rule 5: never leak the inner Supabase error.
    return Response.json(
      { error: "Could not save section order" },
      { status: 500 },
    );
  }

  return Response.json({ order: sanitized });
}

export async function DELETE(request: NextRequest) {
  // Reset to default order. Same auth + rate-limit profile as PATCH; clears
  // the persisted array so the workspace UI falls back to the default in
  // src/lib/business-plan.ts.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(request.headers);
  const rl = await enforceRateLimit({
    bucket: "bp:section-order:write",
    id: `${user.id}:${ip}`,
    limit: 30,
    windowSec: 60,
  });
  if (rl) return rl;

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) {
    return Response.json({ error: "No plan" }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("coffee_shop_plans")
    .update({ business_plan_section_order: [] })
    .eq("id", planId)
    .eq("user_id", user.id);

  if (updateErr) {
    return Response.json(
      { error: "Could not reset section order" },
      { status: 500 },
    );
  }

  return Response.json({ order: [] });
}
