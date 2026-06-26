// TIM-1037: Business Plan executive summary AI generation — SSE stream.
// Builds a LivePlan-style executive summary from all suite data.
// TIM-1315: per-section quality specs + voice rules.

export const runtime = "nodejs";
export const maxDuration = 60;

import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSubscriptionActive, hasWriteAccess } from "@/lib/access";
import { normalizeAIOutput } from "@/lib/normalize";
import { loadPlanContext } from "@/lib/plan-context";
import { buildPlanSnapshotForExecutiveSummary, BUSINESS_PLAN_SECTIONS } from "@/lib/business-plan";
import {
  assembleCompanyConcept,
  assembleTargetMarket,
  assembleExecutionOperations,
  assembleExecutionMarketingSales,
  assembleOperationsLaunch,
  assembleTeamHiring,
  assembleFinancialPlan,
  // TIM-2341: lender-ready section assemblers.
  assembleUnitEconomicsSection,
  assembleBreakEvenSection,
  assembleSensitivitySection,
  assembleDscrSection,
  assembleCapexScheduleSection,
  assembleDepreciationScheduleSection,
  assembleWorkingCapitalSection,
  assembleRisksPlaceholderSection,
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpMenuItem,
  type BpLaunchItem,
  type BpHiringRole,
  toBpMarketingPlanning,
  type BusinessPlanSectionData,
} from "@/lib/business-plan";
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyIfCreditBalanceLow } from "@/lib/email/credit-balance-low-callsite";
import { buildBpSectionPrompt } from "@/lib/business-plan-prompts";
import { buildPlanState, formatPlanStateForPrompt } from "@/lib/business-plan/plan-state";
import { canonicalizeNarrative } from "@/lib/business-plan/entities";
// TIM-2342: source-marker directive + parser + curated industry benchmarks.
// Every numeric claim the narrative emits is wrapped in <num src="…">…</num>;
// the parser strips markers, attaches a hedge prefix to estimate-class claims,
// and surfaces them to the export-gate modal for review.
import {
  SOURCE_MARKER_DIRECTIVE,
  parseSourceMarkers,
  extractEstimatedClaims,
} from "@/lib/business-plan/source-markers";
import { formatBenchmarksForPrompt } from "@/lib/business-plan/benchmarks";
// TIM-2343: per-section self-consistency check (BP Quality J). After the
// narrative streams, a lightweight LLM proofreader extracts every claim and
// flags pairs within the same section that cannot both be true (owner-draws
// contradiction was the prompt — see TIM-2315 investor critique). One regen
// attempt is allowed if the first pass contradicts itself; surviving
// contradictions surface to the export-gate modal as advisory.
import {
  runSelfConsistencyCheck,
  regenerateWithFixDirective,
} from "@/lib/business-plan/self-consistency-runner";
import type { NextRequest } from "next/server";

const TTFT_MS = 8_000;
const GAP_MS = 20_000;
const HEARTBEAT_MS = 15_000;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // TIM-2246: per-user paid-API rate limit. Credit balance is the hard
  // cost cap; this just keeps a runaway client from churning credits faster
  // than a human ever would.
  const rl = await enforceRateLimit({
    bucket: "business-plan:generate",
    id: user.id,
    limit: 10,
    windowSec: 60,
  });
  if (rl) return rl;

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, subscription_tier, ai_credits_remaining, onboarding_data, beta_waiver_until, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });

  // TIM-1902: trialists count as active here — gated on ai_credits_remaining.
  const isActive = isSubscriptionActive(profile.subscription_status);
  const hasAccess = hasWriteAccess({
    subscription_status: profile.subscription_status,
    trial_ends_at: profile.trial_ends_at,
  });
  const betaWaivedUntil = profile.beta_waiver_until ? new Date(profile.beta_waiver_until) : null;
  const isBetaWaived = betaWaivedUntil ? betaWaivedUntil > new Date() : false;

  if (!hasAccess && !isBetaWaived) {
    return Response.json({ reason: "no_subscription", tier_required: "starter" }, { status: 402 });
  }
  if (hasAccess && !isBetaWaived && (profile.ai_credits_remaining ?? 0) < 1) {
    return Response.json({ reason: "out_of_credits", tier_required: "pro" }, { status: 402 });
  }
  void isActive;

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name, onboarding_data")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  const reqBody = await request.json().catch(() => ({})) as { sectionKey?: string };
  const sectionKey = reqBody.sectionKey ?? "executive-summary";

  const planId = plan.id;

  const [
    { data: conceptDoc },
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: launchRows },
    { data: hiringRows },
    { data: marketingDoc },
    { data: financialModel },
  ] = await Promise.all([
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes, city, country").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items").select("id, name, cost_local, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
  ]);

  // TIM-1694: menu→COGS sync for the Financials section (auto on generate).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);

  const shopName = plan.plan_name ?? "this coffee shop";
  // TIM-3151: merge per-project intake answers over user-level onboarding data.
  // Project-scoped fields (stage, shop_type, location, shop_vision, etc.) from
  // the new-project interview override the signup snapshot when present.
  const userOnboarding = (profile.onboarding_data ?? {}) as Record<string, unknown>;
  const planOnboarding = (plan.onboarding_data as Record<string, unknown> | null) ?? {};
  const onboarding = { ...userOnboarding, ...planOnboarding };

  // TIM-1418: Pull location from the live tables instead of the frozen
  // onboarding snapshot. Budget / stage live nowhere else, so they stay on
  // onboarding_data for now.
  const planContext = await loadPlanContext(supabase, user.id);

  // TIM-2334: plan_state — single canonical state object holding every
  // quantitative figure. Computed from the SAME engine the financial tables
  // consume, then injected into the prompt as ground truth so narrative
  // numbers and table numbers can never describe two different businesses.
  // TIM-2341: lender_metrics on plan_state seeds the lender-ready section
  // auto-content below so the same numbers reach the AI's prompt and the UI.
  const planState = buildPlanState({
    shopName,
    financialModel,
    locationCandidates: (locationRows ?? []) as BpLocationCandidate[],
    equipment: (equipmentRows ?? []) as BpEquipmentItem[],
    hiringRoles: (hiringRows ?? []) as BpHiringRole[],
    menuBlendedCogsPct,
    // TIM-2339: pass country so plan_state can pick a region-aware tax rate
    // and lender list (no SBA in Canadian plans, etc.).
    locationCountry: planContext.location_country,
    // TIM-2340: pass user-entered competitors + city label so the narrative
    // prompt forbids fabricated foot traffic / competitor specifics and the
    // geography validator scopes to the resolved city.
    competitors: planContext.competitors,
    noDirectCompetitorsIdentified: planContext.no_direct_competitors_identified,
    cityLabel: planContext.city_label,
  });
  const planStateGroundTruth = formatPlanStateForPrompt(planState);
  const currencyCode = planState.meta.currency_code;
  const lenderMetrics = financialModel ? planState.lender_metrics : null;

  // TIM-1498: two-level taxonomy autoContent map. Subsections with no assembled
  // source data (Problem & Solution, Competition, Financing) feed an empty
  // string to the prompt so the model writes from the executive snapshot plus
  // founder context only.
  // TIM-2341: lender-ready sections plug into plan_state.lender_metrics so
  // the prompt's auto-content shows the EXACT same tables the workspace UI
  // and the exported PDF will render below the AI narrative.
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

  const targetSection = sections.find((s) => s.key === sectionKey);
  const sectionAutoContent = targetSection?.autoContent ?? "";
  const sectionTitle = targetSection?.title ?? sectionKey;

  const { systemPrompt, userMessage, maxTokens } = buildBpSectionPrompt({
    sectionKey,
    sectionTitle,
    sectionAutoContent,
    shopName,
    planSnapshot,
    founderBudget: String(onboarding?.budget ?? "not specified"),
    founderLocation: planContext.location_country ?? "not specified",
    founderStage: String(onboarding?.stage ?? "not specified"),
    // TIM-2466: shop_type — strongest persona signal when workspace modules
    // are empty. Without it the prompt collapsed to a generic café and every
    // persona rendered byte-identical content (CQ-06). Same array-or-string
    // normalization the concept/review and copilot routes already use.
    founderShopType: Array.isArray(onboarding?.shop_type)
      ? (onboarding.shop_type as string[]).join(", ")
      : String(onboarding?.shop_type ?? "café"),
    planStateGroundTruth,
    // TIM-2342: tell the LLM to source-tag every numeric claim, and surface
    // the section-relevant subset of the curated industry benchmark dataset.
    sourceMarkerDirective: SOURCE_MARKER_DIRECTIVE,
    industryBenchmarks: formatBenchmarksForPrompt(sectionKey),
  });

  const client = new Anthropic();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let ttftTimer: ReturnType<typeof setTimeout> | null = null;
      let gapTimer: ReturnType<typeof setTimeout> | null = null;
      let done = false;

      function cleanup() {
        done = true;
        if (heartbeat) clearInterval(heartbeat);
        if (ttftTimer) clearTimeout(ttftTimer);
        if (gapTimer) clearTimeout(gapTimer);
      }

      heartbeat = setInterval(() => {
        if (!done) controller.enqueue(enc.encode(sse("heartbeat", {})));
      }, HEARTBEAT_MS);

      ttftTimer = setTimeout(() => {
        if (!done) {
          cleanup();
          controller.enqueue(enc.encode(sse("error", { message: "Response timed out. Please try again." })));
          controller.close();
        }
      }, TTFT_MS);

      try {
        const response = await client.messages.stream({
          model: PLATFORM_AI_MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });

        if (ttftTimer) { clearTimeout(ttftTimer); ttftTimer = null; }

        let fullText = "";
        // TIM-2509: capture per-turn usage for ai_turn_metrics.
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreateTokens = 0;

        for await (const event of response) {
          if (done) break;

          if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }

          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            fullText += chunk;
            controller.enqueue(enc.encode(sse("text", { text: chunk })));
          } else if (event.type === "message_start" && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0;
            cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
            cacheCreateTokens = event.message.usage.cache_creation_input_tokens ?? 0;
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? 0;
          }

          gapTimer = setTimeout(() => {
            if (!done) {
              cleanup();
              controller.enqueue(enc.encode(sse("error", { message: "Stream stalled. Please try again." })));
              controller.close();
            }
          }, GAP_MS);
        }

        cleanup();

        // TIM-1902: debit one credit on any access-holding account (active or
        // card-on-file trialist). Beta-waived skips billing.
        // TIM-2509: also record per-turn telemetry to ai_turn_metrics on every
        // section turn (regardless of beta-waive — analytics include free runs).
        // Self-consistency check + regen calls in this route are not yet
        // instrumented; primary section stream is the dominant cost driver.
        const svcForTelemetry = createServiceClient();
        if (hasAccess && !isBetaWaived) {
          const postDebitBalance = Math.max(0, (profile.ai_credits_remaining ?? 0) - 1);
          await svcForTelemetry
            .from("users")
            .update({ ai_credits_remaining: postDebitBalance })
            .eq("id", user.id);
          // TIM-3023: at-most-one credit-balance-low notice per month.
          void notifyIfCreditBalanceLow({ userId: user.id, postMutationBalance: postDebitBalance, supabase: svcForTelemetry });
        }
        await recordTurnMetric(
          {
            async insert(row) {
              return svcForTelemetry.from("ai_turn_metrics").insert(row);
            },
          },
          {
            route: "/api/business-plan/generate",
            model: PLATFORM_AI_MODEL,
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_read_input_tokens: cacheReadTokens,
              cache_creation_input_tokens: cacheCreateTokens,
            },
            userId: user.id,
            planTier: resolvePlanTier(profile),
          },
        );

        // TIM-2337: post-generation canonicalization pass — rewrite known
        // aliases ("La Marzocko" → "La Marzocco") and Levenshtein ≤ 2
        // near-misses against the plan_state.entities registry so the saved
        // draft is internally consistent before the founder ever opens it.
        let workingText = normalizeAIOutput(fullText);
        let canon = canonicalizeNarrative(workingText, planState.entities);

        // TIM-2343: per-section self-consistency — proofreader call on the
        // canonicalized (but still source-marker-laden) text. We run BEFORE
        // stripping markers so the proofreader sees the original prose as
        // close to what the LLM emitted as possible; markers are XML-style
        // and a careful proofreader can read through them. If contradictions
        // appear, regenerate ONCE with the explicit fix directive, then
        // re-check. Any surviving contradictions surface to the modal as
        // advisory.
        let contradictions = await runSelfConsistencyCheck({
          client,
          sectionKey,
          sectionTitle,
          sectionText: canon.text,
        });
        let regenAttempted = false;
        if (contradictions.length > 0) {
          regenAttempted = true;
          const regen = await regenerateWithFixDirective({
            client,
            baseSystemPrompt: systemPrompt,
            baseUserMessage: userMessage,
            contradictions,
            maxTokens,
          });
          if (regen) {
            workingText = normalizeAIOutput(regen);
            canon = canonicalizeNarrative(workingText, planState.entities);
            contradictions = await runSelfConsistencyCheck({
              client,
              sectionKey,
              sectionTitle,
              sectionText: canon.text,
            });
          }
        }

        // TIM-2342: parse the <num src="…">…</num> markers the LLM emitted.
        // Acceptance #4: no markers leak past this boundary — parseSourceMarkers
        // strips every marker and prepends a hedge prefix to estimate-class
        // claims that didn't already open with one. The estimated_claims
        // array surfaces to the export-gate modal for human review.
        const parsed = parseSourceMarkers(canon.text);
        const estimatedClaims = extractEstimatedClaims(sectionKey, canon.text);

        controller.enqueue(enc.encode(sse("done", {
          text: parsed.rendered,
          canon_substitutions: canon.substitutions,
          source_markers: parsed.counts,
          estimated_claims: estimatedClaims,
          // TIM-2343: contradictions surviving regen. Empty array means the
          // first pass was clean, or the regen successfully resolved every
          // flagged pair. consistency_regen_attempted lets the client tell
          // the difference for telemetry.
          consistency_contradictions: contradictions,
          consistency_regen_attempted: regenAttempted,
        })));
        controller.close();
      } catch (err) {
        cleanup();
        const msg = err instanceof Error ? err.message : "Unexpected error";
        controller.enqueue(enc.encode(sse("error", { message: msg })));
        controller.close();
      }
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
