// TIM-2331: Business Plan "Regenerate all" — SSE stream that regenerates every
// section of the founder's business plan from current platform data in one
// run. Reuses /generate's data-loading + prompt builder; charges one credit
// per section as each completes (NOT all up front) so a partial failure
// doesn't burn the whole quote.

export const runtime = "nodejs";
export const maxDuration = 300;

import { PLATFORM_AI_MODEL } from "@/lib/ai/models";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { hasWriteAccess } from "@/lib/access";
import { normalizeAIOutput } from "@/lib/normalize";
import { loadPlanContext } from "@/lib/plan-context";
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
import {
  buildBpSectionPrompt,
  BP_REGENERABLE_SECTION_KEYS,
} from "@/lib/business-plan-prompts";
import { buildPlanState, formatPlanStateForPrompt } from "@/lib/business-plan/plan-state";
import { canonicalizeNarrative, unifySections } from "@/lib/business-plan/entities";
import type { BusinessPlanSectionKey } from "@/lib/business-plan";

const HEARTBEAT_MS = 15_000;
const PER_SECTION_TTFT_MS = 12_000;
const PER_SECTION_GAP_MS = 30_000;
const CREDIT_COST_PER_SECTION = 1;
const SPARSE_AUTO_CONTENT_THRESHOLD = 120;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(): Promise<Response> {
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

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, subscription_tier, ai_credits_remaining, onboarding_data, beta_waiver_until, trial_ends_at")
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

  const sectionsToRegenerate = BP_REGENERABLE_SECTION_KEYS as BusinessPlanSectionKey[];
  const estimatedCredits = isBetaWaived
    ? 0
    : sectionsToRegenerate.length * CREDIT_COST_PER_SECTION;

  if (hasAccess && !isBetaWaived && (profile.ai_credits_remaining ?? 0) < CREDIT_COST_PER_SECTION) {
    return Response.json({ reason: "out_of_credits", tier_required: "pro" }, { status: 402 });
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
    supabase.from("buildout_equipment_items").select("id, name, cost_usd, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents, status").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
    loadPlanContext(supabase, user.id),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuBlendedCogsPct = computeMenuBlendedCogsPct((menuRows ?? []) as any[]);

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
  const founderBudget = String(onboarding?.budget ?? "not specified");
  const founderLocation = planContext.location_country ?? "not specified";
  const founderStage = String(onboarding?.stage ?? "not specified");

  // TIM-2334: compute plan_state ONCE up-front. Every section in this batch
  // sees the same ground-truth numbers (same engine, same currency, same
  // capital stack, same year-by-year P&L) so the regenerated narrative is
  // consistent across sections — not just between narrative and tables.
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

  const client = new Anthropic();

  const stream = new ReadableStream({
    async start(controller) {
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

      send("estimate", {
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

      for (const sectionKey of sectionsToRegenerate) {
        if (closed) break;

        const sectionMeta = sectionsByKey.get(sectionKey);
        if (!sectionMeta) continue;

        if (!isBetaWaived && creditsRemaining < CREDIT_COST_PER_SECTION) {
          send("section:error", {
            sectionKey,
            sectionTitle: sectionMeta.title,
            message: "Out of credits. Top up to finish the remaining sections.",
            code: "out_of_credits",
          });
          failed.push({ key: sectionKey, message: "out_of_credits" });
          continue;
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
          planStateGroundTruth,
        });

        let fullText = "";
        let sectionDone = false;
        let sectionError: string | null = null;

        // Per-section TTFT + gap timers so a stalled section doesn't take down
        // the whole run. On timeout we record the section as failed and move on.
        const ttftTimer = setTimeout(() => {
          if (!sectionDone) sectionError = sectionError ?? "Section timed out before first token.";
        }, PER_SECTION_TTFT_MS);
        let gapTimer: ReturnType<typeof setTimeout> | null = null;

        try {
          const response = await client.messages.stream({
            model: PLATFORM_AI_MODEL,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
          });

          clearTimeout(ttftTimer);

          for await (const event of response) {
            if (closed || sectionError) break;
            if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }

            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullText += event.delta.text;
            }

            gapTimer = setTimeout(() => {
              if (!sectionDone) sectionError = sectionError ?? "Section stream stalled.";
            }, PER_SECTION_GAP_MS);
          }
        } catch (err) {
          sectionError = err instanceof Error ? err.message : "Unexpected error";
        } finally {
          clearTimeout(ttftTimer);
          if (gapTimer) clearTimeout(gapTimer);
          sectionDone = true;
        }

        if (sectionError || !fullText.trim()) {
          send("section:error", {
            sectionKey,
            sectionTitle: sectionMeta.title,
            message: sectionError ?? "Empty response from model.",
          });
          failed.push({ key: sectionKey, message: sectionError ?? "empty_response" });
          continue;
        }

        // Debit credits NOW (only on successful completion). Service client
        // because anon RLS can't write to users.ai_credits_remaining.
        if (!isBetaWaived) {
          const svc = createServiceClient();
          const nextRemaining = Math.max(0, creditsRemaining - CREDIT_COST_PER_SECTION);
          await svc
            .from("users")
            .update({ ai_credits_remaining: nextRemaining })
            .eq("id", user.id);
          creditsRemaining = nextRemaining;
        }

        // TIM-2337: per-section canonicalization — rewrite registry-known
        // aliases ("La Marzocko" → "La Marzocco") immediately so the user
        // sees the corrected draft on first arrival. Cross-section
        // unification runs below once every section has streamed.
        const draftRaw = normalizeAIOutput(fullText);
        const draftCanon = canonicalizeNarrative(draftRaw, planState.entities);
        const draft = draftCanon.text;
        completed.push({ key: sectionKey, draft });
        send("section:complete", {
          sectionKey,
          sectionTitle: sectionMeta.title,
          draft,
          credits_remaining: creditsRemaining,
          canon_substitutions: draftCanon.substitutions,
        });
      }

      // TIM-2337: cross-section unification. The per-section canonicalize
      // pass enforced the structured-data registry within each section, but
      // entities the model INVENTED (suppliers, advisors not entered in any
      // workspace) can still appear with two spellings across sections —
      // exactly the "Whitehouse Farms" vs "Whitehorse Farms" case investor
      // flagged on TIM-2315 item #5. unifySections() clusters near-misses
      // across the full set, picks the most-frequent variant as canonical,
      // and emits a section:revised event for any section that changed.
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
