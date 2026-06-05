// TIM-2356: Plan Quality Check — standalone audit endpoint.
//
// POST /api/business-plan/audit
//   body: {}
//   returns: { report: AuditReport, cached: boolean }
//
// Aggregates current workspace state, runs the existing validator rule set
// (TIM-2336 reconciliation + Pass 2 critic + TIM-2340 local-claims + TIM-2343
// self-consistency) and TIM-2342 estimate-class claims, normalizes everything
// into the AuditFinding shape, then runs a per-finding Haiku synthesis pass
// to produce owner-facing plain-language fields.
//
// Caching keyed on sha256(canonical plan_state JSON + concatenated section text
// + voice-guide hash). A re-click without any workspace mutation returns the
// cached report instantly with `cached: true`. Any input change forces a
// recompute.
//
// Standing Rules:
//   Rule 1 — table RLS deny-by-default in migration (TIM-2356 cache).
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
  BUSINESS_PLAN_SECTIONS,
  assembleCompanyConcept,
  assembleTargetMarket,
  assembleExecutionOperations,
  assembleExecutionMarketingSales,
  assembleOperationsLaunch,
  assembleTeamHiring,
  assembleFinancialPlan,
  toBpMarketingPlanning,
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpMenuItem,
  type BpLaunchItem,
  type BpHiringRole,
} from "@/lib/business-plan";
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection";
import { buildPlanState } from "@/lib/business-plan/plan-state";
import { normalizeConceptV2 } from "@/lib/concept";
import {
  runReconciliation,
  runLocalClaimsChecks,
  parsePass2Response,
  buildPass2UserMessage,
  PASS2_SYSTEM_PROMPT,
  type ValidationReport,
  type ValidationEstimatedClaim,
} from "@/lib/business-plan/validate";
import { runSelfConsistencyCheck, type SelfConsistencyContradiction } from "@/lib/business-plan/self-consistency-runner";
import {
  buildAuditFindings,
  statsFromFindings,
  type AuditFinding,
  type AuditReport,
} from "@/lib/business-plan/audit";
import {
  synthesizeFinding,
  voiceGuideHash,
} from "@/lib/business-plan/audit-synthesis";

// Budgets — keep total time under maxDuration with slack.
const PASS2_MAX_TOKENS = 2_000;
const PASS2_TIMEOUT_MS = 25_000;
const SYNTHESIS_TIMEOUT_MS = 8_000;
// Each Haiku synthesis call runs concurrent with up to MAX_SYNTHESIS_CONCURRENCY
// peers. Cap total synth calls so a pathological report (50+ findings) can't
// blow the budget — the route synthesizes the top-priority findings first.
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

// Canonical state hash: stable JSON of plan_state plus alphabetized section
// text plus the voice-guide hash. Used as the cache key and surfaced on the
// report so the UI can prove staleness.
function computeStateHash(args: {
  planState: unknown;
  sectionTexts: Map<string, string>;
  voiceGuideHashStr: string;
}): string {
  const ordered = Array.from(args.sectionTexts.entries()).sort(([a], [b]) => a.localeCompare(b));
  const payload = JSON.stringify({
    ps: args.planState,
    s: ordered,
    g: args.voiceGuideHashStr,
  });
  return createHash("sha256").update(payload).digest("hex");
}

interface AuditCacheRow {
  state_hash: string;
  report_json: AuditReport;
}

export async function POST(request: NextRequest): Promise<Response> {
  void request;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4 — per-user rate limit. Audit is more expensive than validate
  // (multiple Anthropic calls per run); bucket conservatively.
  const rl = await enforceRateLimit({
    bucket: "business-plan:audit",
    id: user.id,
    limit: 6,
    windowSec: 60,
  });
  if (rl) return rl;

  // Rule 2 — server-side gate. Mirrors validate route: paid-API path, treat
  // same as /generate so non-paying users can't burn LLM tokens here.
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

  // ── Load workspace data (mirrors /validate route load order). ──────────────
  const [
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: hiringRows },
    { data: marketingDoc },
    { data: conceptDoc },
    { data: launchRows },
    { data: financialModel },
    { data: savedSections },
  ] = await Promise.all([
    supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes, city, country").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items").select("id, name, cost_usd, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents, status").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
    supabase.from("business_plan_sections").select("section_key, user_content, is_visible, estimated_claims_json").eq("plan_id", planId),
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

  type SavedSectionRow = {
    section_key: string;
    user_content: string | null;
    is_visible: boolean;
    estimated_claims_json: unknown;
  };
  const savedMap = new Map((savedSections ?? []).map((s: SavedSectionRow) => [s.section_key, s]));
  const autoContent: Record<string, string> = {
    "executive-summary": "",
    "opportunity-problem-solution": "",
    "opportunity-target-market": assembleTargetMarket(conceptDoc?.content),
    "opportunity-competition": "",
    "execution-marketing-sales": assembleExecutionMarketingSales(
      (menuRows ?? []) as BpMenuItem[],
      toBpMarketingPlanning(marketingDoc?.content),
    ),
    "execution-operations": assembleExecutionOperations(
      (locationRows ?? []) as BpLocationCandidate[],
      (equipmentRows ?? []) as BpEquipmentItem[],
      financialModel,
    ),
    "execution-milestones-metrics": assembleOperationsLaunch(
      (launchRows ?? []) as BpLaunchItem[],
    ),
    "company-overview": assembleCompanyConcept(conceptDoc?.content),
    "company-team": assembleTeamHiring((hiringRows ?? []) as BpHiringRole[]),
    "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct),
    "financial-plan-financing": "",
    "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct),
    "appendix-monthly-statements": "",
  };

  const sectionTexts = new Map<string, string>();
  const estimatedClaims: ValidationEstimatedClaim[] = [];
  for (const meta of BUSINESS_PLAN_SECTIONS) {
    const saved = savedMap.get(meta.key) as SavedSectionRow | undefined;
    if (saved && saved.is_visible === false) continue;
    const text = (saved?.user_content ?? autoContent[meta.key] ?? "").trim();
    if (text.length > 0) sectionTexts.set(meta.key, text);
    const rawClaims = saved?.estimated_claims_json;
    if (Array.isArray(rawClaims)) {
      for (const c of rawClaims) {
        if (!c || typeof c !== "object") continue;
        const o = c as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id : "";
        const content = typeof o.content === "string" ? o.content : "";
        if (!id || !content) continue;
        estimatedClaims.push({
          id,
          section_key: typeof o.section_key === "string" ? o.section_key : meta.key,
          content,
          hedge: typeof o.hedge === "string" ? o.hedge : "approximately",
          surrounding_sentence: typeof o.surrounding_sentence === "string" ? o.surrounding_sentence : "",
        });
      }
    }
  }

  // ── Cache lookup. ──────────────────────────────────────────────────────────
  let voiceGuide: string;
  try {
    voiceGuide = await loadVoiceGuide();
  } catch (err) {
    console.error("audit voice-guide load failed", { userId: user.id, err });
    return Response.json({ error: "Audit unavailable; please retry." }, { status: 500 });
  }
  const voiceGuideHashStr = voiceGuideHash(voiceGuide);
  const stateHash = computeStateHash({ planState, sectionTexts, voiceGuideHashStr });

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

  // ── Run validators. ────────────────────────────────────────────────────────
  let report: ValidationReport;
  try {
    report = runReconciliation({ planState, sections: sectionTexts });
  } catch (err) {
    console.error("audit runReconciliation failed", { userId: user.id, err });
    return Response.json({ error: "Audit failed; please retry." }, { status: 500 });
  }
  try {
    const localFindings = runLocalClaimsChecks({ sections: sectionTexts, planState });
    if (localFindings.length > 0) {
      report.qualitative_findings = [...report.qualitative_findings, ...localFindings];
    }
  } catch (err) {
    console.error("audit runLocalClaimsChecks failed", { userId: user.id, err });
  }

  const client = new Anthropic();
  // Pass 2 LLM critic — still advisory.
  if (sectionTexts.size > 0) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), PASS2_TIMEOUT_MS);
      try {
        const resp = await client.messages.create(
          {
            model: PLATFORM_AI_MODEL,
            max_tokens: PASS2_MAX_TOKENS,
            system: PASS2_SYSTEM_PROMPT,
            messages: [{ role: "user", content: buildPass2UserMessage(shopName, sectionTexts) }],
          },
          { signal: ac.signal },
        );
        const text = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        const qualitative = parsePass2Response(text);
        report.qualitative_findings = [...report.qualitative_findings, ...qualitative];
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.error("audit Pass 2 failed", { userId: user.id, err });
    }
  }
  report.estimated_claims = estimatedClaims;

  // Self-consistency: per-section. Best-effort, swallows errors.
  const selfConsistencyResults: SelfConsistencyContradiction[] = [];
  const sectionEntries = Array.from(sectionTexts.entries());
  // Run section-level consistency in batches so we don't burn parallel quota.
  for (let i = 0; i < sectionEntries.length; i += MAX_SYNTHESIS_CONCURRENCY) {
    const batch = sectionEntries.slice(i, i + MAX_SYNTHESIS_CONCURRENCY);
    const meta = new Map<string, string>(BUSINESS_PLAN_SECTIONS.map((m) => [m.key as string, m.title]));
    const results = await Promise.all(
      batch.map(([key, text]) =>
        runSelfConsistencyCheck({
          client,
          sectionKey: key,
          sectionTitle: meta.get(key) ?? key,
          sectionText: text,
        }),
      ),
    );
    for (const arr of results) selfConsistencyResults.push(...arr);
  }

  // ── Normalize to AuditFinding[]. ───────────────────────────────────────────
  const findings = buildAuditFindings({
    report,
    selfConsistencyContradictions: selfConsistencyResults,
  });

  // ── Plain-language synthesis (top N findings, concurrent batches). ─────────
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

  const auditReport: AuditReport = {
    generated_at: new Date().toISOString(),
    state_hash: stateHash,
    findings,
    stats: statsFromFindings(findings),
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
// recent cache row exists. Returns 404 when no cache exists.

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
