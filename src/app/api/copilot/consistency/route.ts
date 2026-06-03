// TIM-1688: Cross-workspace consistency engine — detect + apply API.
//
// GET  → read each fact's value from its real home, run the pure engine, return
//        the conflicts plus AIReviewModal-shaped suggestions to surface them.
// POST → apply ONE owner-chosen canonical value to every writable home for a
//        fact. Never auto-applies: this only runs on an explicit, user-confirmed
//        POST after the review/confirm UX. Reuses the per-workspace homes (the
//        TIM-1648 apply path) rather than a bespoke writer.
//
// The detection/grouping/apply-plan logic lives in src/lib/cross-workspace-sync.ts
// (pure, unit-tested). This route is only the data layer: read each home, hand
// the engine FactReadings, and execute the ApplyOps it returns.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { normalizeMonthlyProjections } from "@/lib/financial-projection";
import { normalizeLaunchPlanConfig } from "@/lib/launch-plan";
import {
  detectConflicts,
  buildApplyPlan,
  conflictToSuggestion,
  getFact,
  parseFactValue,
  type FactReading,
  type FactValue,
} from "@/lib/cross-workspace-sync";
import type { NextRequest } from "next/server";

// Rent line in financial_models.forecast_inputs.forecast_lines[].
const RENT_LINE_KEY = "rent";

interface PlanCtx {
  planId: string;
}

async function resolvePlan(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; ctx: PlanCtx }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();
  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return { ok: false, status: 402, error: "Subscription required" };
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return { ok: false, status: 404, error: "No plan found" };

  return { ok: true, supabase, ctx: { planId: plan.id } };
}

// The lease candidate that represents the plan's chosen location: the signed one
// if present, else the highest-priority (lowest position) non-archived candidate.
async function loadChosenCandidate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<{ id: string; asking_rent_cents: number | null; sq_ft: number | null } | null> {
  const { data } = await supabase
    .from("location_candidates")
    .select("id, asking_rent_cents, sq_ft, status, position")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("position", { ascending: true });
  if (!data || data.length === 0) return null;
  const signed = data.find((c) => c.status === "signed");
  const chosen = signed ?? data[0];
  return { id: chosen.id, asking_rent_cents: chosen.asking_rent_cents, sq_ft: chosen.sq_ft };
}

async function loadRentFromFinancials(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", planId)
    .maybeSingle();
  if (!data?.forecast_inputs) return null;
  const projections = normalizeMonthlyProjections(data.forecast_inputs);
  const rent = projections.forecast_lines.find((l) => l.legacy_key === RENT_LINE_KEY);
  // Only comparable to a $/mo rent when modeled as a flat cents value.
  if (!rent || rent.mode !== "flat") return null;
  return typeof rent.value === "number" ? rent.value : null;
}

async function loadOpeningDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", planId)
    .eq("workspace_key", "opening_month_plan")
    .maybeSingle();
  if (!data?.content) return null;
  return normalizeLaunchPlanConfig(data.content).targetLaunchDate;
}

// Read every registered home into FactReadings. Also returns the chosen candidate
// id so apply can target the right lease row.
async function readAll(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<{ readings: FactReading[]; candidateId: string | null }> {
  const [candidate, financialsRent, openingDate] = await Promise.all([
    loadChosenCandidate(supabase, planId),
    loadRentFromFinancials(supabase, planId),
    loadOpeningDate(supabase, planId),
  ]);

  const readings: FactReading[] = [
    {
      locationId: "monthly_rent:location_lease",
      factId: "monthly_rent",
      value: candidate?.asking_rent_cents ?? null,
    },
    { locationId: "monthly_rent:financials", factId: "monthly_rent", value: financialsRent },
    {
      locationId: "square_footage:location_lease",
      factId: "square_footage",
      value: candidate?.sq_ft ?? null,
    },
    {
      locationId: "opening_date:opening_month_plan",
      factId: "opening_date",
      value: openingDate,
    },
  ];

  return { readings, candidateId: candidate?.id ?? null };
}

export async function GET() {
  const resolved = await resolvePlan();
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const { supabase, ctx } = resolved;
  const { readings } = await readAll(supabase, ctx.planId);
  const conflicts = detectConflicts(readings);
  return Response.json({
    conflicts,
    suggestions: conflicts.map((c) => conflictToSuggestion(c)),
  });
}

// Execute a single ApplyOp against its real home. Returns true on a successful
// write. Unknown/unsupported homes are a no-op (false).
async function executeOp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  candidateId: string | null,
  op: { locationId: string; workspaceKey: string; value: FactValue },
): Promise<boolean> {
  switch (op.locationId) {
    case "monthly_rent:location_lease": {
      if (!candidateId) return false;
      const { error } = await supabase
        .from("location_candidates")
        .update({ asking_rent_cents: Number(op.value) })
        .eq("id", candidateId)
        .eq("plan_id", planId);
      return !error;
    }
    case "square_footage:location_lease": {
      if (!candidateId) return false;
      const { error } = await supabase
        .from("location_candidates")
        .update({ sq_ft: Number(op.value) })
        .eq("id", candidateId)
        .eq("plan_id", planId);
      return !error;
    }
    case "monthly_rent:financials": {
      const { data } = await supabase
        .from("financial_models")
        .select("forecast_inputs")
        .eq("plan_id", planId)
        .maybeSingle();
      if (!data?.forecast_inputs) return false;
      const projections = normalizeMonthlyProjections(data.forecast_inputs);
      const rent = projections.forecast_lines.find((l) => l.legacy_key === RENT_LINE_KEY);
      if (!rent) return false;
      rent.mode = "flat";
      rent.value = Number(op.value);
      const { error } = await supabase
        .from("financial_models")
        .upsert({ plan_id: planId, forecast_inputs: projections }, { onConflict: "plan_id" });
      return !error;
    }
    case "opening_date:opening_month_plan": {
      const { data } = await supabase
        .from("workspace_documents")
        .select("content")
        .eq("plan_id", planId)
        .eq("workspace_key", "opening_month_plan")
        .maybeSingle();
      const config = normalizeLaunchPlanConfig(data?.content ?? null);
      config.targetLaunchDate = String(op.value);
      const { error } = await supabase
        .from("workspace_documents")
        .upsert(
          { plan_id: planId, workspace_key: "opening_month_plan", content: config },
          { onConflict: "plan_id,workspace_key" },
        );
      return !error;
    }
    default:
      return false;
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolvePlan();
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const { supabase, ctx } = resolved;

  let body: { factId?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const factId = body.factId;
  if (!factId || typeof factId !== "string" || !getFact(factId)) {
    return Response.json({ error: "Unknown or missing factId" }, { status: 400 });
  }
  const fact = getFact(factId)!;

  if (typeof body.value !== "string") {
    return Response.json({ error: "Missing canonical value" }, { status: 400 });
  }
  const canonical = parseFactValue(fact.unit, body.value);
  if (canonical === null) {
    return Response.json(
      { error: `Value "${body.value}" is not a valid ${fact.unit}` },
      { status: 400 },
    );
  }

  // Re-read fresh so the plan we write against reflects current state, never a
  // stale client snapshot.
  const { readings, candidateId } = await readAll(supabase, ctx.planId);
  const ops = buildApplyPlan(factId, canonical, readings);

  const applied: string[] = [];
  const failed: string[] = [];
  for (const op of ops) {
    const ok = await executeOp(supabase, ctx.planId, candidateId, op);
    (ok ? applied : failed).push(op.locationId);
  }

  if (failed.length > 0) {
    return Response.json(
      { error: "Some homes failed to update", applied, failed },
      { status: 500 },
    );
  }

  return Response.json({ factId, canonicalValue: canonical, applied });
}
