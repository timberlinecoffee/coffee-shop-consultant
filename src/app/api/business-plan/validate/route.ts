// TIM-2336: Business Plan export-time validation suite.
//
// POST /api/business-plan/validate
//   body: { include_pass2?: boolean }  // default true
//   returns: ValidationReport (numeric + qualitative findings + blocking flag)
//
// Pass 1 = programmatic reconciliation against plan_state (always runs, fast).
// Pass 2 = critical-reader LLM (runs only when include_pass2=true; advisory).
//
// Standing Rule 4 applies — paid API (Anthropic) is rate-limited per user.
// Standing Rule 2 — re-checks plan tier + ownership server-side.
// Standing Rule 5 — boundary catch + sanitized error shape.

export const runtime = "nodejs";
export const maxDuration = 60;

import { PLATFORM_AI_MODEL } from "@/lib/ai/models";
import Anthropic from "@anthropic-ai/sdk";
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
} from "@/lib/business-plan/validate";
import type { NextRequest } from "next/server";

const PASS2_MAX_TOKENS = 2_000;
const PASS2_TIMEOUT_MS = 30_000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4 — per-user rate limit on paid-API path. Validation is much cheaper
  // than /generate (single non-streaming Anthropic call when Pass 2 runs), so
  // the bucket is generous; the credit balance is the hard cost cap.
  const rl = await enforceRateLimit({
    bucket: "business-plan:validate",
    id: user.id,
    limit: 20,
    windowSec: 60,
  });
  if (rl) return rl;

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, trial_ends_at, beta_waiver_until")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });

  // Rule 2 — server-side access gate. Validation is a paid-API path; treat
  // the same as /generate so non-paying users can't burn LLM tokens here.
  const hasAccess = hasWriteAccess({
    subscription_status: profile.subscription_status,
    trial_ends_at: profile.trial_ends_at,
  });
  const betaWaivedUntil = profile.beta_waiver_until ? new Date(profile.beta_waiver_until) : null;
  const isBetaWaived = betaWaivedUntil ? betaWaivedUntil > new Date() : false;
  if (!hasAccess && !isBetaWaived) {
    return Response.json({ reason: "no_subscription", tier_required: "starter" }, { status: 402 });
  }

  // Rule 3 — validated body. Defensive: an unparseable body or wrong shape
  // falls back to "run both passes" (the safer default) rather than throwing.
  const reqBody = await request.json().catch(() => ({})) as { include_pass2?: unknown };
  const includePass2 = reqBody.include_pass2 === undefined ? true : Boolean(reqBody.include_pass2);

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  const planId = plan.id;

  // Load every input plan_state needs + the persisted narrative sections.
  // Mirrors what /generate and the PDF dataLoader read so the validator sees
  // exactly the same data the export will render.
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
    supabase.from("buildout_equipment_items").select("id, name, cost_local, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents, status").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
    // TIM-2342: pull estimated_claims_json alongside user_content so the
    // export-gate modal can show the "Estimated claims to verify" panel.
    supabase.from("business_plan_sections").select("section_key, user_content, is_visible, estimated_claims_json").eq("plan_id", planId),
  ]);

  const shopName = plan.plan_name ?? "this coffee shop";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);
  // TIM-2340: pull competitors + no-direct toggle off the concept document so
  // the validator scopes Pass 2's geography check to the same city as the
  // narrative prompt and surfaces local_claims in plan_state.
  const concept = normalizeConceptV2(conceptDoc?.content);
  const competitors = (concept.competitors ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address ?? null,
    what_they_do_well: c.what_they_do_well ?? null,
    gaps: c.gaps ?? null,
  }));
  const noDirectCompetitorsIdentified = concept.no_direct_competitors_identified ?? false;
  // Resolve a city label from the chosen-or-first non-archived location.
  const locArr = (locationRows ?? []) as Array<{ city?: string | null; address?: string | null; status?: string | null; archived?: boolean | null }>;
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

  // Assemble the section text exactly as the PDF will render it: user_content
  // when present, else the auto-assembled fallback.
  // TIM-2342: estimated_claims_json now travels alongside user_content. We
  // gather it per visible section and attach to the report below.
  type SavedSectionRow = {
    section_key: string;
    user_content: string | null;
    is_visible: boolean;
    estimated_claims_json: unknown;
  };
  const savedMap = new Map(
    (savedSections ?? []).map((s: SavedSectionRow) => [s.section_key, s]),
  );
  const autoContent: Record<string, string> = {
    "executive-summary": "",
    "opportunity-problem-solution": "",
    "opportunity-target-market": assembleTargetMarket(conceptDoc?.content),
    "opportunity-competition": "",
    "execution-marketing-sales": assembleExecutionMarketingSales(
      (menuRows ?? []) as BpMenuItem[],
      toBpMarketingPlanning(marketingDoc?.content),
      planState.meta.currency_code,
    ),
    "execution-operations": assembleExecutionOperations(
      (locationRows ?? []) as BpLocationCandidate[],
      (equipmentRows ?? []) as BpEquipmentItem[],
      financialModel,
      planState.meta.currency_code,
    ),
    "execution-milestones-metrics": assembleOperationsLaunch(
      (launchRows ?? []) as BpLaunchItem[],
    ),
    "company-overview": assembleCompanyConcept(conceptDoc?.content),
    "company-team": assembleTeamHiring((hiringRows ?? []) as BpHiringRole[], planState.meta.currency_code),
    "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct, planState.meta.currency_code),
    "financial-plan-financing": "",
    "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct, planState.meta.currency_code),
    "appendix-monthly-statements": "",
  };

  const sectionTexts = new Map<string, string>();
  // TIM-2342: accumulate estimated_claims_json across visible sections so the
  // export-gate modal can list them. We trust the column shape (the PATCH
  // route validated it on write); defensive shape-check here in case a hand
  // import seeded the row.
  const estimatedClaims: Array<{ id: string; section_key: string; content: string; hedge: string; surrounding_sentence: string }> = [];
  for (const meta of BUSINESS_PLAN_SECTIONS) {
    const saved = savedMap.get(meta.key) as SavedSectionRow | undefined;
    // Hidden sections aren't exported, so they aren't validated either.
    if (saved && saved.is_visible === false) continue;
    const text = (saved?.user_content ?? autoContent[meta.key] ?? "").trim();
    if (text.length > 0) sectionTexts.set(meta.key, text);

    // estimated_claims travels per-section. Empty array if absent or wrong shape.
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

  // ── Pass 1 — programmatic reconciliation (always runs, fast, no network). ──
  let report: ValidationReport;
  try {
    report = runReconciliation({ planState, sections: sectionTexts });
  } catch (err) {
    // Rule 5 — sanitized boundary error.
    console.error("validate.runReconciliation failed", { userId: user.id, err });
    return Response.json({ error: "Validation failed; please retry." }, { status: 500 });
  }

  // ── TIM-2340: programmatic local-claims + geography pass (advisory). ──────
  // Runs even when Pass 2 LLM is degraded. Surfaces fabricated foot-traffic /
  // visitor counts and impossible neighborhood adjacencies as advisory
  // qualitative findings.
  try {
    const localFindings = runLocalClaimsChecks({ sections: sectionTexts, planState });
    if (localFindings.length > 0) {
      report.qualitative_findings = [...report.qualitative_findings, ...localFindings];
    }
  } catch (err) {
    console.error("validate.runLocalClaimsChecks failed", { userId: user.id, err });
    // Non-fatal — advisory pass, swallow and continue.
  }

  // ── Pass 2 — critical-reader LLM (advisory; failures degrade silently). ────
  if (includePass2 && sectionTexts.size > 0) {
    try {
      const client = new Anthropic();
      // AbortController bounds the call independently of maxDuration so a
      // hung Anthropic call can't keep the connection open.
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
        // TIM-2340: append rather than replace so the programmatic
        // local-claims / geography findings stay in the report.
        report.qualitative_findings = [...report.qualitative_findings, ...qualitative];
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      // Advisory pass — don't break the gate. Log the failure and surface
      // a single soft advisory note so the user knows the qualitative
      // review didn't run.
      console.error("validate Pass 2 failed", { userId: user.id, err });
      report.qualitative_findings = [
        ...report.qualitative_findings,
        {
          id: "pass2:degraded",
          section_key: "executive-summary",
          severity: "advisory",
          kind: "qualitative",
          category: "other",
          message: "Critical-reader review was unavailable on this run. Numeric reconciliation still applied.",
          quoted_text: null,
        },
      ];
    }
  }

  // TIM-2342: attach the AI-estimate-class claims gathered above. The
  // reconciliation pass left this empty; the route is the natural place to
  // join the persisted column onto the report.
  report.estimated_claims = estimatedClaims;

  return Response.json(report);
}
