// TIM-2416 — AI Companion v3 Benchmark mode.
//
// POST /api/companion/benchmark
//   body: { scope?: "financials" | "concept" | ... | null }
//   returns: { report: AuditReport }
//
// Uses the same `runBenchmarkChecks` engine as Plan Quality Check so cards
// render through the shared FindingCard. The endpoint returns only benchmark
// findings — cross-suite consistency checks live in /api/business-plan/audit
// (Check mode). When a non-null `scope` is supplied, findings are filtered to
// those whose `source.workspace` matches, so opening the companion from a
// source workspace surfaces only that workspace's benchmarks. `scope: null`
// (whole plan) returns every benchmark finding.
//
// Standing Rules:
//   Rule 2 — server-side ownership + plan-tier gate (mirrors /audit).
//   Rule 3 — body validated; finding strings sanitized through stripFindingTags.
//   Rule 4 — per-user rate limit on the bucket. No LLM calls in this path.
//   Rule 5 — single error boundary, sanitized 5xx shape.

export const runtime = "nodejs";
export const maxDuration = 30;

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasWriteAccess } from "@/lib/access";
import { enforceRateLimit } from "@/lib/rate-limit";
import type {
  BpLocationCandidate,
  BpEquipmentItem,
  BpHiringRole,
} from "@/lib/business-plan";
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection";
import { buildPlanState } from "@/lib/business-plan/plan-state";
import { normalizeConceptV2 } from "@/lib/concept";
import { runBenchmarkChecks } from "@/lib/business-plan/source-suite-checks";
import {
  statsFromFindings,
  applyFallbackSynthesis,
  type AuditFinding,
  type AuditReport,
} from "@/lib/business-plan/audit";
import { stripFindingTags } from "@/lib/business-plan/sanitize-finding-text";

const VALID_SCOPES = new Set([
  "concept",
  "location_lease",
  "financials",
  "menu_pricing",
  "buildout_equipment",
  "opening_month_plan",
  "hiring",
  "marketing",
  "suppliers",
  "operations_playbook",
]);

function sanitizeFinding(f: AuditFinding): AuditFinding {
  return {
    ...f,
    raw_message: stripFindingTags(f.raw_message),
    quoted_text: f.quoted_text ? stripFindingTags(f.quoted_text) : null,
    expected_text: f.expected_text ? stripFindingTags(f.expected_text) : null,
    suggested_replacement: f.suggested_replacement
      ? stripFindingTags(f.suggested_replacement)
      : null,
    issue: f.issue ? stripFindingTags(f.issue) : null,
    why_it_matters: f.why_it_matters ? stripFindingTags(f.why_it_matters) : null,
    suggested_fix: f.suggested_fix ? stripFindingTags(f.suggested_fix) : null,
  };
}

// Map our companion scope keys onto the AuditSourceRef.workspace string the
// benchmark checks emit. Benchmarks today live on "financials" (most metrics)
// and "lease" (rent %). Other scope values keep matching by direct equality.
function workspaceMatchesScope(workspace: string, scope: string): boolean {
  if (workspace === scope) return true;
  if (scope === "financials" && workspace === "financials") return true;
  if (scope === "location_lease" && (workspace === "lease" || workspace === "location_lease")) return true;
  return false;
}

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await enforceRateLimit({
    bucket: "companion:benchmark",
    id: user.id,
    limit: 20,
    windowSec: 60,
  });
  if (rl) return rl;

  let scope: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { scope?: unknown };
    if (typeof body.scope === "string" && VALID_SCOPES.has(body.scope)) {
      scope = body.scope;
    }
  } catch {
    // Empty body is fine — defaults to whole-plan scope.
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, trial_ends_at, beta_waiver_until")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });
  const hasAccess = hasWriteAccess({
    subscription_status: profile.subscription_status,
    trial_ends_at: profile.trial_ends_at,
  });
  const betaWaivedUntil = profile.beta_waiver_until ? new Date(profile.beta_waiver_until) : null;
  const isBetaWaived = betaWaivedUntil ? betaWaivedUntil > new Date() : false;
  if (!hasAccess && !isBetaWaived) {
    return Response.json({ reason: "no_subscription", tier_required: "starter" }, { status: 402 });
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });
  const planId = plan.id;

  const [
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: hiringRows },
    { data: conceptDoc },
    { data: financialModel },
  ] = await Promise.all([
    supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes, city, country").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items").select("id, name, cost_local, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents, status").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
  ]);

  const shopName = plan.plan_name ?? "this coffee shop";
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

  let findings: AuditFinding[];
  try {
    findings = runBenchmarkChecks({
      planState,
      hiring: [],
      equipment: [],
      menu: [],
      launch: [],
    });
  } catch (err) {
    console.error("companion benchmark runBenchmarkChecks failed", { userId: user.id, err });
    return Response.json({ error: "Benchmark unavailable; please retry." }, { status: 500 });
  }

  if (scope !== null) {
    findings = findings.filter((f) => workspaceMatchesScope(f.source.workspace, scope as string));
  }

  for (const f of findings) applyFallbackSynthesis(f);

  const sanitized = findings.map(sanitizeFinding);
  const report: AuditReport = {
    generated_at: new Date().toISOString(),
    state_hash: "",
    findings: sanitized,
    stats: statsFromFindings(sanitized),
  };

  return Response.json({ report });
}
