// TIM-2426: Cross-Suite Conflict Resolver — data layer.
//
// GET  → enumerate every cross-suite conflict the resolver knows how to
//        surface (zone 1-5 payload), reading from the same source-of-truth
//        rows the source-suite audit (TIM-2394) uses. First detector wired
//        here is Hiring ↔ Financials (UX spec §11); follow-up issues plug
//        new pair detectors into the same RESOLVERS list.
//
// POST → execute an owner-confirmed set of changes from the AIReviewModal
//        handoff. The route never writes a "path" wholesale — it writes the
//        individual fields the owner accepted in the per-card review.
//
// Standing Rules referenced:
//   - Rule 1 (RLS): tables this route writes (hiring_plan_roles,
//     financial_models) already enable RLS and own-by-user policies.
//   - Rule 2 (server authz): plan ownership is reverified server-side before
//     any write; the browser cannot spoof a plan_id.
//   - Rule 3 (validate input): body is parsed through a narrow zod schema.
//   - Rule 4 (rate limit): both verbs go through enforceRateLimit().
//   - Rule 5 (sanitized errors): no raw exception bodies reach the client.

import { z } from "zod";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildPlanState } from "@/lib/business-plan/plan-state";
import { loadBenchmarks } from "@/lib/business-plan/benchmarks";
import { detectHiringFinancialsConflict } from "@/lib/cross-suite/hiring-financials";
import type { CrossSuiteConflict } from "@/lib/cross-suite/types";
import type {
  BpLocationCandidate,
  BpEquipmentItem,
  BpHiringRole,
} from "@/lib/business-plan";
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection";
import { normalizeConceptV2 } from "@/lib/concept";

interface PlanCtx {
  planId: string;
  userId: string;
}

async function resolvePlan(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; ctx: PlanCtx }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .maybeSingle();
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

  return { ok: true, supabase, ctx: { planId: plan.id, userId: user.id } };
}

// Read every input the registered resolvers need. A single pass keeps
// per-conflict queries from fanning out.
async function readAll(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
) {
  const [
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: hiringRows },
    { data: conceptDoc },
    { data: financialModel },
    { data: planRow },
  ] = await Promise.all([
    supabase.from("location_candidates")
      .select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes, city, country")
      .eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items")
      .select("id, name, cost_usd, category, notes")
      .eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs")
      .select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived")
      .eq("plan_id", planId).order("position"),
    supabase.from("hiring_plan_roles")
      .select("id, role_title, headcount, start_date, monthly_cost_cents, status")
      .eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents")
      .select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("financial_models")
      .select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
    supabase.from("coffee_shop_plans")
      .select("plan_name").eq("id", planId).maybeSingle(),
  ]);

  const shopName = planRow?.plan_name ?? "this coffee shop";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);
  const concept = normalizeConceptV2(conceptDoc?.content);
  const competitors = (concept.competitors ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address ?? null,
    what_they_do_well: c.what_they_do_well ?? null,
    gaps: c.gaps ?? null,
  }));
  const noDirectCompetitorsIdentified = concept.no_direct_competitors_identified ?? false;
  const locArr = (locationRows ?? []) as Array<{ city?: string | null; address?: string | null; status?: string | null }>;
  const cityCandidate = locArr.find((l) => l.status === "signed") ?? locArr[0] ?? null;
  const cityLabel = cityCandidate?.city?.trim() || null;

  const planState = buildPlanState({
    shopName,
    financialModel,
    locationCandidates: (locationRows ?? []) as BpLocationCandidate[],
    equipment: (equipmentRows ?? []) as BpEquipmentItem[],
    hiringRoles: (hiringRows ?? []) as BpHiringRole[],
    menuBlendedCogsPct,
    competitors,
    noDirectCompetitorsIdentified,
    cityLabel,
  });

  return {
    planState,
    hiringRows: (hiringRows ?? []) as Array<{
      id: string;
      role_title: string;
      headcount: number;
      start_date: string | null;
      monthly_cost_cents: number | null;
    }>,
  };
}

// Pull the labor benchmark band (28–35%) into the {min,max,source} the
// detector expects. Returns null when the dataset doesn't have a parseable
// labor entry — detector will then hide zone 3.
function laborPctBand() {
  const ds = loadBenchmarks();
  const b = ds.benchmarks.find((x) => x.key === "coffee_shop_labor_pct");
  if (!b) return null;
  const m = b.value_range.replace(/%/g, "").match(/(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const minRaw = Number(m[1]);
  const maxRaw = Number(m[2]);
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return null;
  return {
    min: Math.min(minRaw, maxRaw) / 100,
    max: Math.max(minRaw, maxRaw) / 100,
    source: b.source ?? "Industry benchmark",
  };
}

// Run every registered resolver against the gathered inputs. Each resolver
// either returns one CrossSuiteConflict or null (no contradiction → no
// surface). Returning null is normal: the modal only fires when there's a
// real conflict to walk the owner through.
function runResolvers(
  args: Awaited<ReturnType<typeof readAll>>,
): CrossSuiteConflict[] {
  const out: CrossSuiteConflict[] = [];

  // Hiring ↔ Financials — first pair (UX spec §11 / TIM-2426 immediate scope).
  // Y1 annual revenue → monthly. plan_state.years is empty until the engine
  // ran a forecast; fall back to 0 → benchmark hidden by detector.
  const y1AnnualCents = args.planState.years?.[0]?.revenue_cents ?? 0;
  const monthlyRevenueCents = Math.round(y1AnnualCents / 12);
  const hf = detectHiringFinancialsConflict({
    hiringRoles: args.hiringRows.map((r) => ({
      id: r.id,
      role_title: r.role_title ?? "Untitled role",
      headcount: r.headcount ?? 0,
      monthly_cost_cents: r.monthly_cost_cents ?? null,
      start_date: r.start_date ?? null,
    })),
    financialsLabor: {
      total_headcount: args.planState.labor.total_headcount,
      monthly_loaded_cost_cents: args.planState.labor.monthly_loaded_cost_cents,
    },
    monthlyRevenueCents,
    laborPctBand: laborPctBand(),
    currencyCode: args.planState.meta.currency_code || "USD",
  });
  if (hf) out.push(hf);

  return out;
}

export async function GET() {
  const resolved = await resolvePlan();
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const rl = await enforceRateLimit({
    bucket: "cross_suite_resolver:get",
    id: resolved.ctx.userId,
    limit: 60,
    windowSec: 60,
  });
  if (rl) return rl;

  try {
    const reads = await readAll(resolved.supabase, resolved.ctx.planId);
    const conflicts = runResolvers(reads);
    return Response.json({ conflicts });
  } catch (err) {
    console.error("cross-suite-resolver GET failed", { userId: resolved.ctx.userId, err });
    return Response.json({ error: "Could not load cross-suite conflicts" }, { status: 500 });
  }
}

// ── Apply (POST) ─────────────────────────────────────────────────────────────
//
// Body shape: { conflictId, pathId, changes: [{ fieldId, finalValue }] }
// fieldId conventions are emitted by hiring-financials.ts:
//   cross_suite:<conflictId>:<pathId>:<suiteKey>:<recordId>:<column>
// Decoded server-side and dispatched to the right table.

const ChangeSchema = z.object({
  fieldId: z.string().min(1).max(200),
  finalValue: z.string().min(0).max(200),
});

const ApplyBodySchema = z.object({
  conflictId: z.string().min(1).max(80),
  pathId: z.string().min(1).max(80),
  changes: z.array(ChangeSchema).min(1).max(20),
});

interface DecodedField {
  conflictId: string;
  pathId: string;
  suiteKey: string;
  recordId: string;
  column: string;
}

function decodeFieldId(raw: string): DecodedField | null {
  const parts = raw.split(":");
  if (parts.length !== 6 || parts[0] !== "cross_suite") return null;
  return {
    conflictId: parts[1],
    pathId: parts[2],
    suiteKey: parts[3],
    recordId: parts[4],
    column: parts[5],
  };
}

async function applyHiringChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  field: DecodedField,
  finalValue: string,
): Promise<boolean> {
  // Authorize: hiring_plan_roles row must belong to the caller's plan.
  const { data: row } = await supabase
    .from("hiring_plan_roles")
    .select("id, plan_id")
    .eq("id", field.recordId)
    .maybeSingle();
  if (!row || row.plan_id !== planId) return false;

  if (field.column === "headcount") {
    const n = Number(finalValue);
    if (!Number.isFinite(n) || n < 0) return false;
    const { error } = await supabase
      .from("hiring_plan_roles")
      .update({ headcount: Math.floor(n) })
      .eq("id", field.recordId)
      .eq("plan_id", planId);
    return !error;
  }
  if (field.column === "start_date") {
    // Accept YYYY-MM-DD only.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finalValue)) return false;
    const { error } = await supabase
      .from("hiring_plan_roles")
      .update({ start_date: finalValue })
      .eq("id", field.recordId)
      .eq("plan_id", planId);
    return !error;
  }
  return false;
}

// Path B raise_budget → bump the financial_models.forecast_inputs.personnel
// rows so monthly_loaded_cost_cents matches the proposed payroll budget.
// Simplest writable change: scale every existing personnel row's pay
// proportionally. The shell exposes one "Monthly payroll budget" card; this
// translates that single accept into a coherent set of personnel edits.
async function applyFinancialsPayrollChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  finalValue: string,
): Promise<boolean> {
  // Parse "$21,700" / "USD 21,700" → cents.
  const cleaned = finalValue.replace(/[^\d.-]/g, "");
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars <= 0) return false;
  const targetCents = Math.round(dollars * 100);

  const { data: fm } = await supabase
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", planId)
    .maybeSingle();
  if (!fm?.forecast_inputs) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fi = fm.forecast_inputs as any;
  const personnel = Array.isArray(fi.personnel) ? fi.personnel : [];
  if (personnel.length === 0) return false;

  // Compute existing monthly loaded cost (rough — same as plan-state's
  // monthlyLoadedCost helper) to derive a scale factor.
  let currentCents = 0;
  for (const p of personnel) {
    const head = Math.max(0, Number(p.headcount ?? 0));
    let base = 0;
    if (p.pay_basis === "monthly") base = Number(p.pay_amount_cents ?? 0);
    else if (p.pay_basis === "annual") base = Math.round(Number(p.pay_amount_cents ?? 0) / 12);
    else base = Math.round((Number(p.pay_amount_cents ?? 0) * Number(p.hours_per_week ?? 0) * 52) / 12);
    const benefits = Math.round((base * Number(p.benefits_pct ?? 0)) / 100) + Number(p.benefits_fixed_cents ?? 0);
    currentCents += (base + benefits) * head;
  }
  if (currentCents <= 0) return false;

  const scale = targetCents / currentCents;
  fi.personnel = personnel.map((p: Record<string, unknown>) => ({
    ...p,
    pay_amount_cents: Math.round(Number(p.pay_amount_cents ?? 0) * scale),
  }));

  const { error } = await supabase
    .from("financial_models")
    .upsert({ plan_id: planId, forecast_inputs: fi }, { onConflict: "plan_id" });
  return !error;
}

// TIM-2452 (Path B sync) — bump financials personnel headcount so the total
// headcount line on the financial plan matches the target. We scale every
// existing personnel row's headcount proportionally; rows are integer-valued
// so we apply the scale first, then nudge the longest-running role to absorb
// any remaining delta. Preserves per-row pay assumptions (the sibling
// payroll-budget suggestion handles dollar changes).
async function applyFinancialsHeadcountChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  finalValue: string,
): Promise<boolean> {
  const target = Number(finalValue.replace(/[^\d]/g, ""));
  if (!Number.isFinite(target) || target <= 0 || target > 500) return false;

  const { data: fm } = await supabase
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", planId)
    .maybeSingle();
  if (!fm?.forecast_inputs) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fi = fm.forecast_inputs as any;
  const personnel = Array.isArray(fi.personnel) ? fi.personnel : [];
  if (personnel.length === 0) return false;

  const currentTotal = personnel.reduce(
    (acc: number, p: Record<string, unknown>) => acc + Math.max(0, Number(p.headcount ?? 0)),
    0,
  );
  if (currentTotal <= 0) return false;

  const scale = target / currentTotal;
  const scaled = personnel.map((p: Record<string, unknown>) => ({
    ...p,
    headcount: Math.max(0, Math.round(Number(p.headcount ?? 0) * scale)),
  }));
  let scaledTotal = scaled.reduce(
    (acc: number, p: Record<string, unknown>) => acc + Math.max(0, Number(p.headcount ?? 0)),
    0,
  );
  // Resolve any rounding drift by nudging the row with the largest current
  // headcount one unit at a time until totals match. Bounded loop: at most
  // |personnel.length| iterations under integer scaling of small fleets.
  let safety = personnel.length * 2 + 5;
  while (scaledTotal !== target && safety-- > 0) {
    const diff = target - scaledTotal;
    let idx = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (Number(scaled[i].headcount ?? 0) > Number(scaled[idx].headcount ?? 0)) idx = i;
    }
    scaled[idx].headcount = Math.max(0, Number(scaled[idx].headcount ?? 0) + Math.sign(diff));
    scaledTotal += Math.sign(diff);
  }

  fi.personnel = scaled;
  const { error } = await supabase
    .from("financial_models")
    .upsert({ plan_id: planId, forecast_inputs: fi }, { onConflict: "plan_id" });
  return !error;
}

export async function POST(request: NextRequest) {
  const resolved = await resolvePlan();
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const rl = await enforceRateLimit({
    bucket: "cross_suite_resolver:post",
    id: resolved.ctx.userId,
    limit: 30,
    windowSec: 60,
  });
  if (rl) return rl;

  let body: z.infer<typeof ApplyBodySchema>;
  try {
    body = ApplyBodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const applied: string[] = [];
  const failed: string[] = [];

  try {
    for (const change of body.changes) {
      const field = decodeFieldId(change.fieldId);
      if (!field || field.conflictId !== body.conflictId || field.pathId !== body.pathId) {
        failed.push(change.fieldId);
        continue;
      }
      let ok = false;
      if (field.suiteKey === "hiring") {
        ok = await applyHiringChange(resolved.supabase, resolved.ctx.planId, field, change.finalValue);
      } else if (field.suiteKey === "financials" && field.recordId === "payroll" && field.column === "monthly_cents") {
        ok = await applyFinancialsPayrollChange(resolved.supabase, resolved.ctx.planId, change.finalValue);
      } else if (field.suiteKey === "financials" && field.recordId === "personnel" && field.column === "headcount") {
        ok = await applyFinancialsHeadcountChange(resolved.supabase, resolved.ctx.planId, change.finalValue);
      }
      (ok ? applied : failed).push(change.fieldId);
    }
  } catch (err) {
    console.error("cross-suite-resolver POST failed", { userId: resolved.ctx.userId, err });
    return Response.json({ error: "Some changes could not be saved", applied, failed }, { status: 500 });
  }

  if (failed.length > 0) {
    return Response.json({ error: "Some changes could not be saved", applied, failed }, { status: 500 });
  }
  return Response.json({ applied });
}
