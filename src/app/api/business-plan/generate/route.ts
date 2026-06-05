// TIM-1037: Business Plan executive summary AI generation — SSE stream.
// Builds a LivePlan-style executive summary from all suite data.
// TIM-1315: per-section quality specs + voice rules.

export const runtime = "nodejs";
export const maxDuration = 60;

import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
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
import { buildBpSectionPrompt } from "@/lib/business-plan-prompts";
import { buildPlanState, formatPlanStateForPrompt } from "@/lib/business-plan/plan-state";
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
    .select("id, plan_name")
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
    supabase.from("buildout_equipment_items").select("id, name, cost_usd, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents, status").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
  ]);

  // TIM-1694: menu→COGS sync for the Financials section (auto on generate).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);

  // TIM-1498: two-level taxonomy autoContent map. Subsections with no assembled
  // source data (Problem & Solution, Competition, Financing) feed an empty
  // string to the prompt so the model writes from the executive snapshot plus
  // founder context only.
  const sections: BusinessPlanSectionData[] = BUSINESS_PLAN_SECTIONS.map((meta) => ({
    key: meta.key,
    title: meta.title,
    sourceLabel: meta.sourceLabel,
    autoContent: ({
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
    } as Record<string, string>)[meta.key] ?? "",
    userContent: null,
    isVisible: meta.defaultVisible,
  }));

  const planSnapshot = buildPlanSnapshotForExecutiveSummary(sections);
  const shopName = plan.plan_name ?? "this coffee shop";
  const onboarding = (profile.onboarding_data ?? {}) as Record<string, unknown>;

  // TIM-1418: Pull location from the live tables instead of the frozen
  // onboarding snapshot. Budget / stage live nowhere else, so they stay on
  // onboarding_data for now.
  const planContext = await loadPlanContext(supabase, user.id);

  // TIM-2334: plan_state — single canonical state object holding every
  // quantitative figure. Computed from the SAME engine the financial tables
  // consume, then injected into the prompt as ground truth so narrative
  // numbers and table numbers can never describe two different businesses.
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
  });
  const planStateGroundTruth = formatPlanStateForPrompt(planState);

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
    planStateGroundTruth,
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

        for await (const event of response) {
          if (done) break;

          if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }

          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            fullText += chunk;
            controller.enqueue(enc.encode(sse("text", { text: chunk })));
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
        if (hasAccess && !isBetaWaived) {
          const svc = createServiceClient();
          await svc
            .from("users")
            .update({ ai_credits_remaining: Math.max(0, (profile.ai_credits_remaining ?? 0) - 1) })
            .eq("id", user.id);
        }

        controller.enqueue(enc.encode(sse("done", { text: normalizeAIOutput(fullText) })));
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
