// TIM-2331: Business Plan "Regenerate all" — SSE stream that regenerates every
// section of the founder's business plan from current platform data in one
// run. Reuses /generate's data-loading + prompt builder; charges one credit
// per section as each completes (NOT all up front) so a partial failure
// doesn't burn the whole quote.
//
// TIM-2360: parallelized with bounded concurrency (4 sections at a time) so
// total wall-clock ~75s instead of ~300s. Idempotent upsert to
// business_plan_sections before each section:complete so progress survives a
// Lambda kill. Per-section 60s AbortController timeout so one stalled section
// doesn't block the batch. Accepts optional { only: string[] } for resume.

export const runtime = "nodejs";
export const maxDuration = 300;

import pLimit from "p-limit";
import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics";
import { streamScoutTurn } from "@/lib/ai/scout-adapter";
import type { ScoutLane } from "@/lib/ai/scout-lane";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { hasWriteAccess } from "@/lib/access";
import { normalizeAIOutput } from "@/lib/normalize";
import { loadPlanContext, getActivePlanId } from "@/lib/plan-context";
import {
  buildPlanSnapshotForExecutiveSummary,
  BUSINESS_PLAN_SECTIONS,
  assembleCompanyConcept,
  assembleTargetMarket,
  assembleExecutionOperations,
  assembleExecutionMarketingSales,
  assembleOperationsLaunch,
  assembleTeamHiring,
  assembleFinancialPlan,
  // TIM-2341: lender-ready section assemblers — auto-content for these new
  // sections is computed from plan_state.lender_metrics so narrative and
  // tables read the same numbers.
  assembleUnitEconomicsSection,
  assembleBreakEvenSection,
  assembleSensitivitySection,
  assembleDscrSection,
  assembleCapexScheduleSection,
  assembleDepreciationScheduleSection,
  assembleWorkingCapitalSection,
  assembleRisksPlaceholderSection,
  toBpMarketingPlanning,
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpMenuItem,
  type BpLaunchItem,
  type BpHiringRole,
  type BusinessPlanSectionData,
} from "@/lib/business-plan";
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyIfCreditBalanceLow } from "@/lib/email/credit-balance-low-callsite";
import {
  buildBpSectionPrompt,
  BP_REGENERABLE_SECTION_KEYS,
} from "@/lib/business-plan-prompts";
import { getPreferredLanguage } from "@/lib/account-settings";
import { buildPlanState, formatPlanStateForPrompt } from "@/lib/business-plan/plan-state";
import { canonicalizeNarrative, unifySections } from "@/lib/business-plan/entities";
// TIM-2342: same source-marker pipeline as /generate — every regenerated
// section gets parsed, stripped, hedged, and surfaces its estimate-class
// claims to the export-gate modal via the section:complete payload.
import {
  SOURCE_MARKER_DIRECTIVE,
  parseSourceMarkers,
  extractEstimatedClaims,
} from "@/lib/business-plan/source-markers";
import { formatBenchmarksForPrompt } from "@/lib/business-plan/benchmarks";
// TIM-2343: per-section self-consistency proofreader (BP Quality J). Same
// pattern as /generate — run after each section streams, regen ONCE on hits,
// surface surviving pairs via section:complete + the final done summary.
import {
  runSelfConsistencyCheck,
  regenerateWithFixDirective,
} from "@/lib/business-plan/self-consistency-runner";
import type { BusinessPlanSectionKey } from "@/lib/business-plan";
import type { NextRequest } from "next/server";
import { z } from "zod";

const HEARTBEAT_MS = 15_000;
// TIM-2360: per-section timeout — 60s gives each section enough headroom even
// under brief Anthropic back-pressure without stalling the whole batch.
const PER_SECTION_TIMEOUT_MS = 60_000;
const CREDIT_COST_PER_SECTION = 1;
const SPARSE_AUTO_CONTENT_THRESHOLD = 120;
// TIM-2360: concurrency cap — 4 parallel Anthropic calls stays within rate
// limits on the Anthropic API Tier 2 plan while cutting wall-clock to ~75s.
const SECTION_CONCURRENCY = 4;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const RequestBodySchema = z.object({
  only: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 2 full regenerates per hour per user. A full regenerate is
  // expensive (13 Anthropic calls + ~13 credits); a tight bucket is the right
  // cap on top of credit balance.
  const rl = await enforceRateLimit({
    bucket: "business-plan:regenerate-all",
    id: user.id,
    limit: 2,
    windowSec: 3600,
  });
  if (rl) return rl;

  let rawBody: unknown;
  try {
    rawBody = await request.json().catch(() => ({}));
  } catch {
    rawBody = {};
  }
  const bodyParsed = RequestBodySchema.safeParse(rawBody);
  const onlyKeys = bodyParsed.success ? (bodyParsed.data.only ?? null) : null;

  const [{ data: profile }, preferredLanguage] = await Promise.all([
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, ai_credits_remaining, onboarding_data, beta_waiver_until, trial_ends_at")
      .eq("id", user.id)
      .maybeSingle(),
    getPreferredLanguage(supabase, user.id),
  ]);

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

  // TIM-2360: resume mode — if `only` is provided, limit to those keys.
  const allRegenerableKeys = BP_REGENERABLE_SECTION_KEYS as BusinessPlanSectionKey[];
  const sectionsToRegenerate = onlyKeys
    ? allRegenerableKeys.filter((k) => onlyKeys.includes(k))
    : allRegenerableKeys;

  const estimatedCredits = isBetaWaived
    ? 0
    : sectionsToRegenerate.length * CREDIT_COST_PER_SECTION;

  if (hasAccess && !isBetaWaived && (profile.ai_credits_remaining ?? 0) < CREDIT_COST_PER_SECTION) {
    return Response.json({ reason: "out_of_credits", tier_required: "pro" }, { status: 402 });
  }

  // TIM-3157 drive-by: use getActivePlanId (same cluster as TIM-2980/TIM-2965/TIM-2917).
  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan" }, { status: 404 });

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("plan_name, onboarding_data")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  // Load ALL platform data in parallel, once, before streaming.
  const [
    { data: conceptDoc },
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: launchRows },
    { data: hiringRows },
    { data: marketingDoc },
    { data: financialModel },
    planContext,
  ] = await Promise.all([
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes, city, country").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items").select("id, name, cost_local, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
    loadPlanContext(supabase, user.id),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);

  const shopName = plan.plan_name ?? "this coffee shop";
  // TIM-3151: merge per-project intake answers over user-level onboarding data.
  const userOnboarding = (profile.onboarding_data ?? {}) as Record<string, unknown>;
  const planOnboarding = (plan.onboarding_data as Record<string, unknown> | null) ?? {};
  const onboarding = { ...userOnboarding, ...planOnboarding };
  const founderBudget = String(onboarding?.budget ?? "not specified");
  const founderLocation = planContext.location_country ?? "not specified";
  const founderStage = String(onboarding?.stage ?? "not specified");
  // TIM-2466: shop_type — strongest persona signal when workspace modules
  // are empty. Without it /generate and /regenerate-all both collapsed to
  // a generic café (CQ-06 byte-identical content). Same array-or-string
  // normalization concept/review and copilot already use.
  const founderShopType = Array.isArray(onboarding?.shop_type)
    ? (onboarding.shop_type as string[]).join(", ")
    : String(onboarding?.shop_type ?? "café");

  // TIM-2334 + TIM-2341: compute plan_state ONCE up-front so it can seed both
  // the lender-ready autoContent assemblers below AND the ground-truth prompt
  // payload every AI section receives. Same engine slices, same currency,
  // same capital stack — narrative + tables read one source of truth.
  const planState = buildPlanState({
    shopName,
    financialModel,
    locationCandidates: (locationRows ?? []) as BpLocationCandidate[],
    equipment: (equipmentRows ?? []) as BpEquipmentItem[],
    hiringRoles: (hiringRows ?? []) as BpHiringRole[],
    menuBlendedCogsPct,
    // TIM-2339: country drives the region-aware tax rate + lender allowlist.
    locationCountry: planContext.location_country,
    // TIM-2340: competitors + city anchor the local-claim guardrails.
    competitors: planContext.competitors,
    noDirectCompetitorsIdentified: planContext.no_direct_competitors_identified,
    cityLabel: planContext.city_label,
  });
  const planStateGroundTruth = formatPlanStateForPrompt(planState);
  const currencyCode = planState.meta.currency_code;
  // TIM-2341: lender_metrics is null when the financial model is empty — the
  // assemblers render a "fill in the financial workspace" placeholder rather
  // than a misleading $0 table.
  const lenderMetrics = financialModel ? planState.lender_metrics : null;

  const sections: BusinessPlanSectionData[] = BUSINESS_PLAN_SECTIONS.map((meta) => ({
    key: meta.key,
    title: meta.title,
    sourceLabel: meta.sourceLabel,
    autoContent: ({
      "executive-summary": "",
      "opportunity-problem-solution": "",
      "opportunity-target-market": assembleTargetMarket(conceptDoc?.content),
      "opportunity-competition": "",
      "opportunity-risks": assembleRisksPlaceholderSection(),
      "execution-marketing-sales": assembleExecutionMarketingSales(
        (menuRows ?? []) as BpMenuItem[],
        toBpMarketingPlanning(marketingDoc?.content),
        currencyCode,
      ),
      "execution-operations": assembleExecutionOperations(
        (locationRows ?? []) as BpLocationCandidate[],
        (equipmentRows ?? []) as BpEquipmentItem[],
        financialModel,
        currencyCode,
      ),
      "execution-milestones-metrics": assembleOperationsLaunch(
        (launchRows ?? []) as BpLaunchItem[],
      ),
      "company-overview": assembleCompanyConcept(conceptDoc?.content),
      "company-team": assembleTeamHiring((hiringRows ?? []) as BpHiringRole[], currencyCode),
      "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct, currencyCode),
      "financial-plan-unit-economics": assembleUnitEconomicsSection(lenderMetrics, currencyCode),
      "financial-plan-break-even": assembleBreakEvenSection(lenderMetrics, currencyCode),
      "financial-plan-sensitivity": assembleSensitivitySection(lenderMetrics, currencyCode),
      "financial-plan-financing": "",
      "financial-plan-dscr": assembleDscrSection(lenderMetrics, currencyCode),
      "financial-plan-capex-schedule": assembleCapexScheduleSection(lenderMetrics, currencyCode),
      "financial-plan-depreciation": assembleDepreciationScheduleSection(lenderMetrics, currencyCode),
      "financial-plan-working-capital": assembleWorkingCapitalSection(lenderMetrics, currencyCode),
      "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPct, currencyCode),
      "appendix-monthly-statements": "",
    } as Record<string, string>)[meta.key] ?? "",
    userContent: null,
    isVisible: meta.defaultVisible,
  }));

  const planSnapshot = buildPlanSnapshotForExecutiveSummary(sections);

  // Sparse-section detection: assembled data ≤ threshold means the model
  // mostly improvises from founder context. Surface this in the estimate so
  // the user can cancel and fill those workspaces first.
  const sectionsByKey = new Map(sections.map((s) => [s.key, s]));
  const sparseSections = sectionsToRegenerate
    .filter((key) => {
      const auto = sectionsByKey.get(key)?.autoContent ?? "";
      return auto.length < SPARSE_AUTO_CONTENT_THRESHOLD;
    })
    .map((key) => ({
      key,
      title: sectionsByKey.get(key)?.title ?? key,
    }));

  // TIM-3468: lane per section. Both pinned to Anthropic in the router today.
  const laneForSection = (sectionKey: string): ScoutLane =>
    sectionKey === "executive-summary"
      ? "write_executive_summary"
      : "generate_business_plan_section";

  const stream = new ReadableStream({
    async start(controller) {
      // TIM-3018: one run_id per stream so the client can correlate accept/reject
      // calls to the draft rows written server-side as each section completes.
      const run_id = crypto.randomUUID();

      const enc = new TextEncoder();
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(enc.encode(sse(event, data)));
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };

      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(enc.encode(sse("heartbeat", {})));
      }, HEARTBEAT_MS);

      // Track running credit balance locally so we can refuse mid-stream if
      // the user runs out during the run (e.g. another tab burned credits).
      let creditsRemaining = profile.ai_credits_remaining ?? 0;
      // Mutex for credit debit — parallel sections must not race on this.
      let creditDebits = 0;

      send("estimate", {
        run_id,
        sections: sectionsToRegenerate.map((key) => ({
          key,
          title: sectionsByKey.get(key)?.title ?? key,
        })),
        estimated_credits: estimatedCredits,
        credits_remaining: creditsRemaining,
        sparse_sections: sparseSections,
        billing_mode: isBetaWaived ? "beta_waiver" : "credits",
      });

      const completed: Array<{ key: string; draft: string }> = [];
      const failed: Array<{ key: string; message: string }> = [];
      // Mutex to serialize DB credit writes and creditsRemaining updates.
      const creditLock = { locked: false };

      // TIM-2360: generate and emit a single section. Runs inside p-limit
      // so at most SECTION_CONCURRENCY sections run concurrently.
      const generateSection = async (sectionKey: BusinessPlanSectionKey) => {
        if (closed) return;

        const sectionMeta = sectionsByKey.get(sectionKey);
        if (!sectionMeta) return;

        if (!isBetaWaived && creditsRemaining - creditDebits < CREDIT_COST_PER_SECTION) {
          send("section:error", {
            sectionKey,
            sectionTitle: sectionMeta.title,
            message: "Out of credits. Top up to finish the remaining sections.",
            code: "out_of_credits",
          });
          failed.push({ key: sectionKey, message: "out_of_credits" });
          return;
        }

        send("section:start", {
          sectionKey,
          sectionTitle: sectionMeta.title,
        });

        const { systemPrompt, userMessage, maxTokens } = buildBpSectionPrompt({
          sectionKey,
          sectionTitle: sectionMeta.title,
          sectionAutoContent: sectionMeta.autoContent,
          shopName,
          planSnapshot,
          founderBudget,
          founderLocation,
          founderStage,
          founderShopType,
          planStateGroundTruth,
          // TIM-2342: source-marker rule + section-relevant industry benchmarks.
          sourceMarkerDirective: SOURCE_MARKER_DIRECTIVE,
          industryBenchmarks: formatBenchmarksForPrompt(sectionKey),
          preferredLanguage,
        });

        let fullText = "";
        let sectionError: string | null = null;

        // TIM-2360: per-section 60s hard timeout via AbortController.
        const sectionAbort = new AbortController();
        const timeoutId = setTimeout(() => {
          sectionAbort.abort();
        }, PER_SECTION_TIMEOUT_MS);

        // TIM-2509: per-section usage capture for ai_turn_metrics.
        // TIM-3468: provider/modelId/latencyMs captured from adapter events.
        const sectionLane = laneForSection(sectionKey);
        let sectionInputTokens = 0;
        let sectionOutputTokens = 0;
        let sectionCacheReadTokens = 0;
        let sectionCacheCreateTokens = 0;
        let sectionWebSearchRequests = 0;
        let sectionToolCalls = 0;
        let sectionProvider: "anthropic" | "deepseek" = "anthropic";
        let sectionModelId = "";
        const sectionT0 = Date.now();

        try {
          const response = streamScoutTurn({
            lane: sectionLane,
            systemBlocks: [{ text: systemPrompt }],
            messages: [{ role: "user", content: userMessage }],
            maxTokens,
            userId: user.id,
            routeTag: "/api/business-plan/regenerate-all",
          });

          // TIM-3468: AbortSignal on streamScoutTurn would need adapter support;
          // for now keep the same 60s timeout behavior by checking aborted flag.
          for await (const event of response) {
            if (closed) break;
            if (sectionAbort.signal.aborted) {
              throw Object.assign(new Error("aborted"), { name: "AbortError" });
            }
            if (event.kind === "decision") {
              sectionProvider = event.provider;
              sectionModelId = event.modelId;
            } else if (event.kind === "text_delta") {
              fullText += event.text;
            } else if (event.kind === "usage") {
              sectionInputTokens = event.usage.inputTokensUncached;
              sectionCacheReadTokens = event.usage.inputTokensCachedRead;
              sectionCacheCreateTokens = event.usage.inputTokensCacheCreate;
              sectionOutputTokens = event.usage.outputTokens;
              sectionWebSearchRequests = event.usage.webSearchRequests;
              sectionToolCalls = event.usage.toolCalls;
            }
          }
        } catch (err) {
          if ((err as { name?: string })?.name === "AbortError") {
            sectionError = "Section timed out (60s budget exceeded).";
          } else {
            sectionError = err instanceof Error ? err.message : "Unexpected error";
          }
        } finally {
          clearTimeout(timeoutId);
        }

        if (sectionError || !fullText.trim()) {
          send("section:error", {
            sectionKey,
            sectionTitle: sectionMeta.title,
            message: sectionError ?? "Empty response from model.",
            reason: sectionError ? "timeout" : "empty",
          });
          failed.push({ key: sectionKey, message: sectionError ?? "empty_response" });
          return;
        }

        // TIM-2509: emit one ai_turn_metrics row per successful section turn.
        // Awaited (Vercel freezes pending work post-response). Self-consistency
        // + regen calls below are not yet instrumented; the primary section
        // stream is the dominant token-cost driver.
        const telemetrySvc = createServiceClient();
        await recordTurnMetric(
          {
            async insert(row) {
              return telemetrySvc.from("ai_turn_metrics").insert(row);
            },
          },
          {
            route: "/api/business-plan/regenerate-all",
            model: sectionModelId,
            usage: {
              input_tokens: sectionInputTokens,
              output_tokens: sectionOutputTokens,
              cache_read_input_tokens: sectionCacheReadTokens,
              cache_creation_input_tokens: sectionCacheCreateTokens,
            },
            webSearchRequests: sectionWebSearchRequests,
            toolCalls: sectionToolCalls,
            userId: user.id,
            planTier: resolvePlanTier(profile),
            provider: sectionProvider,
            lane: sectionLane,
            latencyMs: Date.now() - sectionT0,
            fallbackUsed: false,
          },
        );

        // Debit credits NOW (only on successful completion). Serialize with
        // a simple reservation pattern to avoid races across parallel sections.
        if (!isBetaWaived) {
          creditDebits += CREDIT_COST_PER_SECTION;
          // Serialize the actual DB write — wait for any in-flight debit.
          while (creditLock.locked) {
            await new Promise<void>((r) => setTimeout(r, 10));
          }
          creditLock.locked = true;
          try {
            const svc = createServiceClient();
            const nextRemaining = Math.max(0, (profile.ai_credits_remaining ?? 0) - creditDebits);
            await svc
              .from("users")
              .update({ ai_credits_remaining: nextRemaining })
              .eq("id", user.id);
            creditsRemaining = nextRemaining;
            // TIM-3023: at-most-one credit-balance-low notice per month.
            void notifyIfCreditBalanceLow({ userId: user.id, postMutationBalance: nextRemaining, supabase: svc });
          } finally {
            creditLock.locked = false;
          }
        }

        // TIM-2337: per-section canonicalization — rewrite registry-known
        // aliases immediately so the user sees the corrected draft on first
        // arrival.
        let workingText = normalizeAIOutput(fullText);
        let draftCanon = canonicalizeNarrative(workingText, planState.entities);

        // TIM-2343: self-consistency proofread. Run on the canonicalized text.
        // On hits, regen ONCE with the explicit fix directive, then re-check.
        let contradictions = await runSelfConsistencyCheck({
          lane: sectionLane,
          userId: user.id,
          routeTag: "/api/business-plan/regenerate-all",
          sectionKey,
          sectionTitle: sectionMeta.title,
          sectionText: draftCanon.text,
        });
        let regenAttempted = false;
        if (contradictions.length > 0) {
          regenAttempted = true;
          const regen = await regenerateWithFixDirective({
            lane: sectionLane,
            userId: user.id,
            routeTag: "/api/business-plan/regenerate-all",
            baseSystemPrompt: systemPrompt,
            baseUserMessage: userMessage,
            contradictions,
            maxTokens,
          });
          if (regen) {
            workingText = normalizeAIOutput(regen);
            draftCanon = canonicalizeNarrative(workingText, planState.entities);
            contradictions = await runSelfConsistencyCheck({
              lane: sectionLane,
              userId: user.id,
              routeTag: "/api/business-plan/regenerate-all",
              sectionKey,
              sectionTitle: sectionMeta.title,
              sectionText: draftCanon.text,
            });
          }
        }

        // TIM-2342: parse source markers, strip them, prepend hedge prefixes.
        const parsed = parseSourceMarkers(draftCanon.text);
        const estimatedClaims = extractEstimatedClaims(sectionKey, draftCanon.text);
        const draft = parsed.rendered;

        // TIM-2924 Shape C fix: do not pre-write to business_plan_sections here.
        // The review modal is the Accept gate; the accept route writes finalValue
        // when the user confirms. Pre-writing caused Reject to be a no-op.
        //
        // TIM-3018: write to business_plan_section_drafts (NOT user_content) so
        // a Lambda kill mid-stream can be recovered via the pending draft rows.
        completed.push({ key: sectionKey, draft });
        const svc = createServiceClient();
        await svc.from("business_plan_section_drafts").upsert({
          plan_id: planId,
          run_id,
          section_key: sectionKey,
          draft_content: draft,
          source_markers_json: parsed.counts,
          estimated_claims_json: estimatedClaims,
          canon_substitutions_json: draftCanon.substitutions,
          consistency_contradictions_json: contradictions,
          status: "pending",
        }, { onConflict: "run_id,section_key" });

        send("section:complete", {
          run_id,
          sectionKey,
          sectionTitle: sectionMeta.title,
          draft,
          credits_remaining: creditsRemaining,
          canon_substitutions: draftCanon.substitutions,
          source_markers: parsed.counts,
          estimated_claims: estimatedClaims,
          // TIM-2343: contradictions surviving regen for this section.
          consistency_contradictions: contradictions,
          consistency_regen_attempted: regenAttempted,
        });
      };

      // TIM-2360: bounded fan-out — 4 sections run concurrently so total
      // wall-clock is ~3 batches × 25s ≈ 75s, well under maxDuration.
      const limit = pLimit(SECTION_CONCURRENCY);
      await Promise.all(
        sectionsToRegenerate.map((sectionKey) =>
          limit(() => generateSection(sectionKey as BusinessPlanSectionKey)),
        ),
      );

      // TIM-2337: cross-section unification. The per-section canonicalize
      // pass enforced the structured-data registry within each section, but
      // entities the model INVENTED (suppliers, advisors not entered in any
      // workspace) can still appear with two spellings across sections.
      // unifySections() clusters near-misses across the full set, picks the
      // most-frequent variant as canonical, and emits a section:revised event
      // for any section that changed.
      const completedSections = completed.map((c) => ({ key: c.key, text: c.draft }));
      const unified = unifySections(completedSections, planState.entities);
      const byKey = new Map(completed.map((c) => [c.key, c.draft]));
      let revisedCount = 0;
      for (const s of unified.sections) {
        const before = byKey.get(s.key);
        if (before != null && before !== s.text) {
          const title = sectionsByKey.get(s.key as BusinessPlanSectionKey)?.title ?? s.key;
          send("section:revised", {
            sectionKey: s.key,
            sectionTitle: title,
            draft: s.text,
          });
          revisedCount += 1;
        }
      }

      send("done", {
        completed_count: completed.length,
        failed_count: failed.length,
        revised_count: revisedCount,
        credits_remaining: creditsRemaining,
        unified_entities: unified.unified_entities.map((e) => ({
          canonical: e.canonical,
          type: e.type,
          aliases: e.aliases,
        })),
      });
      safeClose();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
