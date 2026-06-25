// TIM-2394 Plan Quality Check v2 — source-suite-only audit endpoint.
//
// POST /api/business-plan/audit
//   body: {}
//   returns: { report: AuditReport, cached: boolean }
//
// v2 audits the source suites (Financials, Hiring, Equipment, Menu, Launch,
// Lease) against each other and against industry benchmarks. It does NOT load
// or evaluate business-plan section text — the BP suite is a downstream
// narrative output of the source suites and auditing it against the source it
// was generated from is unhelpful. Correct flow is: edit source suites → run
// quality check → fix findings → THEN regenerate Business Plan from clean
// source.
//
// Caching keyed on sha256(canonical plan_state JSON + raw source rows JSON +
// voice-guide hash). A re-click without any source-suite mutation returns the
// cached report instantly with `cached: true`. The plan_revision is no longer
// part of the cache key — regenerating BP does not invalidate v2 audits.
//
// Standing Rules:
//   Rule 1 — table RLS deny-by-default in migration (reused from v1).
//   Rule 2 — re-checks ownership + plan tier server-side.
//   Rule 3 — input body validated; every string field passed to renderer
//            stripped via stripFindingTags at the audit-module boundary.
//   Rule 4 — per-user rate limit on the bucket; Anthropic calls capped at
//            MAX_SYNTHESIS_PER_AUDIT findings, oldest-first.
//   Rule 5 — single error boundary, sanitized 5xx shape.

export const runtime = "nodejs";
export const maxDuration = 60;

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { PLATFORM_AI_MODEL } from "@/lib/ai/models";
import { createClient } from "@/lib/supabase/server";
import { hasWriteAccess } from "@/lib/access";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpHiringRole,
} from "@/lib/business-plan";
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection";
import { buildPlanState } from "@/lib/business-plan/plan-state";
import { normalizeConceptV2 } from "@/lib/concept";
import {
  runSourceSuiteAudit,
  type SourceSuiteHiringRow,
  type SourceSuiteEquipmentRow,
  type SourceSuiteMenuRow,
  type SourceSuiteLaunchRow,
} from "@/lib/business-plan/source-suite-checks";
import {
  statsFromFindings,
  applyFallbackSynthesis,
  type AuditFinding,
  type AuditReport,
} from "@/lib/business-plan/audit";
import { stripFindingTags } from "@/lib/business-plan/sanitize-finding-text";
import {
  synthesizeFinding,
  voiceGuideHash,
} from "@/lib/business-plan/audit-synthesis";

// Budgets — keep total time under maxDuration with slack.
const SYNTHESIS_TIMEOUT_MS = 8_000;
const MAX_SYNTHESIS_CONCURRENCY = 4;
const MAX_SYNTHESIS_PER_AUDIT = 30;

// Best-effort voice-guide load. The file is in repo so this is local IO — but
// we cache the bytes in module scope so subsequent invocations skip the read.
let cachedGuideBytes: string | null = null;
async function loadVoiceGuide(): Promise<string> {
  if (cachedGuideBytes !== null) return cachedGuideBytes;
  const fullPath = path.join(process.cwd(), "src/lib/business-plan/audit-voice-guide.md");
  cachedGuideBytes = await readFile(fullPath, "utf8");
  return cachedGuideBytes;
}

// Canonical state hash: stable JSON of plan_state + raw source rows + voice-guide
// hash. Used as the cache key — surfaced on the report so the UI can prove
// staleness.
function computeStateHash(args: {
  planState: unknown;
  sourceRows: unknown;
  voiceGuideHashStr: string;
}): string {
  const payload = JSON.stringify({
    ps: args.planState,
    src: args.sourceRows,
    g: args.voiceGuideHashStr,
  });
  return createHash("sha256").update(payload).digest("hex");
}

interface AuditCacheRow {
  state_hash: string;
  report_json: AuditReport;
}

// Strip every string field on every finding through stripFindingTags so the UI
// never receives a stray template marker. Run once per finding, not per render.
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

export async function POST(request: NextRequest): Promise<Response> {
  void request;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4 — per-user rate limit. Audit is cheaper than v1 (no Pass 2 / no
  // self-consistency LLM call) but synthesis still hits Anthropic per finding.
  const rl = await enforceRateLimit({
    bucket: "business-plan:audit",
    id: user.id,
    limit: 12,
    windowSec: 60,
  });
  if (rl) return rl;

  // Rule 2 — server-side gate. Same as /validate and /generate.
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

  // Plan lookup. Audit always runs on the user's primary (most recent) plan.
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });
  const planId = plan.id;

  // ── Load source-suite data. business_plan_sections is intentionally NOT in
  // this list — v2 reads only source-of-truth workspaces.
  const [
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: hiringRows },
    { data: conceptDoc },
    { data: launchRows },
    { data: financialModel },
  ] = await Promise.all([
    supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes, city, country").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items").select("id, name, cost_local, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
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

  // ── Cache lookup. ──────────────────────────────────────────────────────────
  let voiceGuide: string;
  try {
    voiceGuide = await loadVoiceGuide();
  } catch (err) {
    console.error("audit voice-guide load failed", { userId: user.id, err });
    return Response.json({ error: "Audit unavailable; please retry." }, { status: 500 });
  }
  const voiceGuideHashStr = voiceGuideHash(voiceGuide);

  // Source rows captured in the hash so any source-suite mutation invalidates
  // the cache. Snapshot only the audited fields — keeps the hash stable when
  // an unrelated workspace column ships.
  const sourceRows = {
    hiring: (hiringRows ?? []).map((r) => ({
      id: r.id, role_title: r.role_title, headcount: r.headcount, start_date: r.start_date,
    })),
    equipment: (equipmentRows ?? []).map((r) => ({
      id: r.id, name: r.name, cost_local: r.cost_local,
    })),
    menu: (menuRows ?? []).map((r) => ({
      id: r.id, name: r.name, price_cents: r.price_cents, archived: r.archived,
      expected_mix_pct: r.expected_mix_pct, expected_popularity: r.expected_popularity,
    })),
    launch: (launchRows ?? []).map((r) => ({
      id: r.id, milestone: r.milestone, target_date: r.target_date, status: r.status,
    })),
  };
  const stateHash = computeStateHash({ planState, sourceRows, voiceGuideHashStr });

  const { data: cacheRow } = await supabase
    .from("plan_quality_audit_cache")
    .select("state_hash, report_json")
    .eq("user_id", user.id)
    .eq("plan_id", planId)
    .eq("state_hash", stateHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheRow) {
    const cached = cacheRow as AuditCacheRow;
    return Response.json({ report: cached.report_json, cached: true });
  }

  // ── Run source-suite audit. ────────────────────────────────────────────────
  const hiringIn: SourceSuiteHiringRow[] = (hiringRows ?? []).map((r) => ({
    id: r.id ?? "",
    role_title: r.role_title ?? null,
    headcount: r.headcount ?? null,
    start_date: r.start_date ?? null,
  }));
  const equipmentIn: SourceSuiteEquipmentRow[] = (equipmentRows ?? []).map((r) => ({
    id: r.id ?? "",
    name: r.name ?? null,
    cost_local: r.cost_local ?? null,
  }));
  const menuIn: SourceSuiteMenuRow[] = (menuRows ?? []).map((r) => ({
    id: r.id ?? "",
    name: r.name ?? null,
    price_cents: r.price_cents ?? null,
    expected_mix_pct: r.expected_mix_pct ?? null,
    expected_popularity: (r.expected_popularity ?? null) as SourceSuiteMenuRow["expected_popularity"],
    archived: r.archived ?? false,
  }));
  const launchIn: SourceSuiteLaunchRow[] = (launchRows ?? []).map((r) => ({
    id: r.id ?? "",
    milestone: r.milestone ?? null,
    target_date: r.target_date ?? null,
    status: r.status ?? null,
  }));

  let findings: AuditFinding[];
  try {
    findings = runSourceSuiteAudit({
      planState,
      hiring: hiringIn,
      equipment: equipmentIn,
      menu: menuIn,
      launch: launchIn,
    });
  } catch (err) {
    console.error("audit runSourceSuiteAudit failed", { userId: user.id, err });
    return Response.json({ error: "Audit failed; please retry." }, { status: 500 });
  }

  // Critical findings sort to the top. Severity bucket order is enforced by the
  // existing UI grouping; ensure we hand it findings in that same order so the
  // pre-flight gate's `findings[0]` is the most serious one.
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  // ── Plain-language synthesis (top N findings, concurrent batches). ─────────
  const client = new Anthropic();
  const synthTargets = findings.slice(0, MAX_SYNTHESIS_PER_AUDIT);
  for (let i = 0; i < synthTargets.length; i += MAX_SYNTHESIS_CONCURRENCY) {
    const batch = synthTargets.slice(i, i + MAX_SYNTHESIS_CONCURRENCY);
    const synths = await Promise.all(
      batch.map(async (f) => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), SYNTHESIS_TIMEOUT_MS);
        try {
          return await synthesizeFinding({
            client,
            model: PLATFORM_AI_MODEL,
            finding: f,
            voiceGuide,
            abortSignal: ac.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    batch.forEach((f, idx) => {
      const s = synths[idx];
      if (s) {
        f.issue = s.issue;
        f.why_it_matters = s.why_it_matters;
        f.suggested_fix = s.suggested_fix;
      }
    });
  }

  // Deterministic fallback for any finding the synthesis didn't reach. Every
  // card the UI renders must have all three plain-language fields populated.
  for (const f of findings) applyFallbackSynthesis(f);

  // Final defensive scrub at the route boundary — Rule 3.
  const sanitized = findings.map(sanitizeFinding);

  const auditReport: AuditReport = {
    generated_at: new Date().toISOString(),
    state_hash: stateHash,
    findings: sanitized,
    stats: statsFromFindings(sanitized),
  };

  // ── Persist cache. Best-effort — RLS scopes by user_id, owner_insert policy
  // allows it. Failures here don't break the response.
  void supabase
    .from("plan_quality_audit_cache")
    .insert({
      user_id: user.id,
      plan_id: planId,
      state_hash: stateHash,
      report_json: auditReport as unknown as Record<string, unknown>,
    })
    .then(({ error }) => {
      if (error) console.error("audit cache insert failed", { userId: user.id, err: error });
    });

  return Response.json({ report: auditReport, cached: false });
}

// ── GET: read cached report only ─────────────────────────────────────────────
// Lets the report screen render instantly without re-running the audit if a
// recent cache row exists. Returns { report: null } when no cache exists.

export async function GET(): Promise<Response> {
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

  const { data: cacheRow } = await supabase
    .from("plan_quality_audit_cache")
    .select("report_json, state_hash, created_at")
    .eq("user_id", user.id)
    .eq("plan_id", plan.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cacheRow) return Response.json({ report: null, cached: true });
  return Response.json({
    report: (cacheRow as { report_json: AuditReport }).report_json,
    cached: true,
  });
}

// Keep audit types reachable for the UI route bundle.
export type { AuditFinding };
