// TIM-1037: Business Plan per-section "Write with AI" (renamed TIM-2899) — SSE stream.
// Rewrites a specific section for clarity, persuasiveness, and concision.
// TIM-1315: upgraded voice rules and quality spec enforcement.

export const runtime = "nodejs";
export const maxDuration = 60;

import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics";
import { streamScoutTurn } from "@/lib/ai/scout-adapter";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSubscriptionActive, hasWriteAccess } from "@/lib/access";
import { normalizeAIOutput } from "@/lib/normalize";
import { notifyIfCreditBalanceLow } from "@/lib/email/credit-balance-low-callsite";
import { enforceRateLimit } from "@/lib/rate-limit";
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

  // Rule 4: rate-limit a paid-API route.
  const rateLimited = await enforceRateLimit({
    bucket: "business-plan:improve",
    id: user.id,
    limit: 10,
    windowSec: 60,
  });
  if (rateLimited) return rateLimited;

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, subscription_tier, ai_credits_remaining, beta_waiver_until, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });

  // TIM-1902: trialists with a card on file count as active here — they're
  // gated on ai_credits_remaining (75 grant), same as paid users.
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

  const body = await request.json() as {
    sectionKey: string;
    sectionTitle: string;
    currentContent: string;
    shopName?: string;
  };

  const { sectionKey, sectionTitle, currentContent, shopName } = body;

  if (!sectionKey || !currentContent) {
    return Response.json({ error: "sectionKey and currentContent required" }, { status: 400 });
  }

  const systemPrompt = `You are an expert coffee shop business advisor rewriting a section of a founder's business plan. Write in the founder's direct, plain voice -- confident and operational, not corporate or AI-sounding.

Rules:
- Return only the improved section text -- no preamble, no labels, no explanation.
- Keep coffee-specific vocabulary (espresso, pour-over, barista, daypart, CAM, neighborhood traffic).
- Remove filler phrases and make every sentence earn its place.
- Improve clarity, flow, and persuasiveness without changing the substance or inventing new facts.
- Match the length of the original unless shorter is clearly better.
- No em dashes anywhere. Use a regular dash with spaces ( -- ) if you need a pause.
- No AI vocabulary: leverage, unlock, embark, elevate, delve, seamlessly, robust, comprehensive, innovative, holistic, synergy, passionate.
- No filler phrases: "high-quality experience," "welcoming space," "wide variety," "we pride ourselves on," "is committed to."
- Title case for named items (role titles, equipment names, drink names, persona names). Body prose is sentence case.
- Where the original has terse data summaries (bullet lists of raw numbers with no prose), rewrite them as complete sentences and paragraphs.`;

  const userMessage = `Section: ${sectionTitle}
Shop: ${shopName ?? "this coffee shop"}

Improve this section:
${currentContent}`;

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
        const t0 = Date.now();
        const response = streamScoutTurn({
          lane: "generate_business_plan_section",
          systemBlocks: [{ text: systemPrompt }],
          messages: [{ role: "user", content: userMessage }],
          maxTokens: 1024,
          userId: user.id,
          routeTag: "/api/business-plan/improve",
        });

        if (ttftTimer) { clearTimeout(ttftTimer); ttftTimer = null; }

        let fullText = "";
        // TIM-2509: capture per-turn usage for ai_turn_metrics.
        // TIM-3468: provider/modelId from the adapter decision event.
        let provider: "anthropic" | "deepseek" = "anthropic";
        let modelId = "";
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreateTokens = 0;
        let webSearchRequests = 0;
        let toolCalls = 0;

        for await (const event of response) {
          if (done) break;

          if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }

          if (event.kind === "decision") {
            provider = event.provider;
            modelId = event.modelId;
          } else if (event.kind === "text_delta") {
            const chunk = event.text;
            fullText += chunk;
            controller.enqueue(enc.encode(sse("text", { text: chunk })));
          } else if (event.kind === "usage") {
            inputTokens = event.usage.inputTokensUncached;
            cacheReadTokens = event.usage.inputTokensCachedRead;
            cacheCreateTokens = event.usage.inputTokensCacheCreate;
            outputTokens = event.usage.outputTokens;
            webSearchRequests = event.usage.webSearchRequests;
            toolCalls = event.usage.toolCalls;
          }

          gapTimer = setTimeout(() => {
            if (!done) {
              cleanup();
              controller.enqueue(enc.encode(sse("error", { message: "Stream stalled. Please try again." })));
              controller.close();
            }
          }, GAP_MS);
        }
        const latencyMs = Date.now() - t0;

        cleanup();

        // TIM-1902: debit one credit on every AI run for any access-holding
        // account (active or card-on-file trialist). Beta-waived skips billing.
        // TIM-2509: also record per-turn telemetry to ai_turn_metrics.
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
            route: "/api/business-plan/improve",
            model: modelId,
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_read_input_tokens: cacheReadTokens,
              cache_creation_input_tokens: cacheCreateTokens,
            },
            webSearchRequests,
            toolCalls,
            userId: user.id,
            planTier: resolvePlanTier(profile),
            provider,
            lane: "generate_business_plan_section",
            latencyMs,
            fallbackUsed: false,
          },
        );
        void isActive; // referenced for future per-status billing; keeps lint happy.

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
