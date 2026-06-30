// TIM-881: Single-field AI improvement endpoint.
// SSE stream — same event format as /api/copilot/stream (text, thinking, error, done).
// Does NOT create a thread record. Quota spend: 1 message unit per call.
// TIM-1382 normalization: server assembles fullText, normalizes via normalizeAIOutput(), and
// emits it as done.text. Client prefers done.text over locally-accumulated deltas.

export const runtime = "nodejs";
export const maxDuration = 60;

import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics";
import { streamScoutTurn } from "@/lib/ai/scout-adapter";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { composePlanSnapshot } from "@/lib/copilot/composePlanSnapshot";
import { normalizeAIOutput } from "@/lib/normalize";
import { isSubscriptionActive, hasWriteAccess } from "@/lib/access";
import { loadPlanContext } from "@/lib/plan-context";
import { rateLimit } from "@/lib/rate-limit";
import { notifyIfCreditBalanceLow } from "@/lib/email/credit-balance-low-callsite";
import { getPreferredLanguage, buildAiLanguageDirective } from "@/lib/account-settings";
import type { WorkspaceKey } from "@/types/supabase";
import type { NextRequest } from "next/server";

const TTFT_MS = 8_000;
const GAP_MS = 20_000;
const HEARTBEAT_MS = 15_000;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function paywallReason(status: string): "no_subscription" | "paused" | "expired" {
  if (status === "cancelled") return "paused";
  if (status === "expired") return "expired";
  return "no_subscription";
}

function buildImproveSystemPrompt(
  fieldKey: string,
  fieldLabel: string,
  workspaceKey: string,
  planSnapshot: string,
  onboarding: Record<string, unknown>,
  locationCountry: string | null,
  preferredLanguage?: string,
): string {
  const shopType = Array.isArray(onboarding?.shop_type)
    ? (onboarding.shop_type as string[]).join(", ")
    : String(onboarding?.shop_type ?? "not specified");

  return `You are an expert coffee shop business advisor helping a founder improve a specific section of their business plan.

## Your task
Improve or write the "${fieldLabel}" field for the "${workspaceKey.replace(/_/g, " ")}" section of their plan.
Return only the improved text for that field — no preamble, no explanation, no labels. Just the improved content.

## Founder profile
- Budget: ${String(onboarding?.budget ?? "not specified")}
- Location: ${locationCountry ?? "not specified"}
- Stage: ${String(onboarding?.stage ?? "not specified")}
- Shop type: ${shopType}

## Their full plan so far
${planSnapshot}

## Rules
- Write for the specific field: ${fieldLabel} (key: ${fieldKey})
- Be direct and specific — no filler or marketing language
- Match the voice: warm, operational, grounded in real coffee-shop experience
- 1–3 sentences unless more detail is genuinely needed
- NEVER use: actually, genuinely, honestly, unlock, elevate, leverage, embark, delve
- NEVER hallucinate prices, addresses, suppliers, or statistics
- Return only the improved field text, nothing else${preferredLanguage && preferredLanguage !== "en" ? `\n${buildAiLanguageDirective(preferredLanguage)}` : ""}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(
      sse("error", { code: "unauthorized", message: "Authentication required." }),
      { status: 401, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // TIM-2246: per-user cap on AI-improve to bound paid-API spend on a
  // runaway-loop client (improve fires on every "Write with AI" click).
  const rl = await rateLimit({ bucket: "copilot:improve", id: user.id, limit: 30, windowSec: 60 });
  if (!rl.ok) {
    return new Response(
      sse("error", { code: "rate_limited", retryAfterSec: rl.retryAfterSec }),
      { status: 429, headers: { "Content-Type": "text/event-stream", "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let planId: string;
  let workspaceKey: WorkspaceKey;
  let fieldKey: string;
  let draft: string;
  let instruction: string | null;

  try {
    const body = await request.json();
    planId = body.planId;
    workspaceKey = body.workspaceKey;
    fieldKey = body.fieldKey;
    draft = body.draft ?? "";
    instruction = body.instruction ?? null;
  } catch {
    return new Response(
      sse("error", { code: "bad_request", message: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  if (!planId || !workspaceKey || !fieldKey) {
    return new Response(
      sse("error", {
        code: "bad_request",
        message: "Missing required fields: planId, workspaceKey, fieldKey.",
      }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // ── Quota/billing gate ───────────────────────────────────────────────────────
  // TIM-1902: trialists with a card on file count as active here. Gating is
  // uniform across active and trial — both debit ai_credits_remaining.
  const { data: profile } = await supabase
    .from("users")
    .select(
      "ai_credits_remaining, subscription_tier, subscription_status, onboarding_data, trial_ends_at, beta_waiver_until",
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    return new Response(
      sse("error", { code: "quota", message: "Profile not found." }),
      { status: 404, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const hasAccess = hasWriteAccess({
    subscription_status: profile.subscription_status,
    trial_ends_at: profile.trial_ends_at,
  });

  if (!hasAccess) {
    return new Response(
      sse("error", {
        code: "paywall",
        reason: paywallReason(profile.subscription_status),
        tier_required: "starter",
      }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  if (profile.ai_credits_remaining < 1) {
    return new Response(
      sse("error", {
        code: "out_of_credits",
        message:
          "You're out of AI credits for this month. Top up credits or upgrade to keep planning.",
      }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // ── Build prompt ─────────────────────────────────────────────────────────────
  const svcClient = createServiceClient();
  const onboarding = (profile.onboarding_data as Record<string, unknown>) ?? {};

  // TIM-1418: Location now comes from the live plan_hiring_settings + location_candidates
  // tables instead of the frozen onboarding snapshot. Other onboarding fields below
  // (budget, stage, shop_type) have no live workspace equivalent and stay as-is.
  const [{ snapshot: planSnapshot }, planContext, preferredLanguage] = await Promise.all([
    composePlanSnapshot(planId, workspaceKey, svcClient),
    loadPlanContext(svcClient, user.id),
    getPreferredLanguage(supabase, user.id),
  ]);

  // Map fieldKey to a human-readable label (best-effort; the component passes fieldLabel separately)
  const fieldLabel = fieldKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const systemPrompt = buildImproveSystemPrompt(
    fieldKey,
    fieldLabel,
    workspaceKey,
    planSnapshot,
    onboarding,
    planContext.location_country,
    preferredLanguage,
  );

  // Build user message from draft + instruction.
  const userParts: string[] = [];
  if (draft.trim()) {
    userParts.push(`Current text:\n${draft.trim()}`);
  } else {
    userParts.push("There is no current text. Please write this field from scratch using the plan context.");
  }
  if (instruction) {
    userParts.push(`Additional instruction: ${instruction}`);
  }
  const userMessage = userParts.join("\n\n");

  // ── SSE stream ───────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      let closed = false;
      let firstToken = false;
      let fullText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let cacheCreateTokens = 0;
      let webSearchRequests = 0;
      let toolCalls = 0;
      let provider: "anthropic" | "deepseek" = "anthropic";
      let modelId = "";
      let latencyMs = 0;

      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let ttftTimer: ReturnType<typeof setTimeout> | null = null;
      let gapTimer: ReturnType<typeof setTimeout> | null = null;

      const clearTimers = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (ttftTimer) clearTimeout(ttftTimer);
        if (gapTimer) clearTimeout(gapTimer);
      };

      const logError = async (code: string, message: string, upstreamStatus?: number) => {
        await svcClient.from("ai_errors").insert({
          user_id: user.id,
          workspace_key: workspaceKey,
          error_code: code,
          upstream_status: upstreamStatus ?? null,
          details: { message, fieldKey, planId },
        });
      };

      const closeWithError = async (code: string, message: string, upstreamStatus?: number) => {
        if (closed) return;
        closed = true;
        clearTimers();
        send(sse("error", { code, message }));
        await logError(code, message, upstreamStatus);
        send(sse("done", {}));
        controller.close();
      };

      const resetGapTimer = () => {
        if (gapTimer) clearTimeout(gapTimer);
        gapTimer = setTimeout(() => {
          void closeWithError(
            "timeout",
            "AI stream stalled. No data for 20 seconds. Please try again.",
          );
        }, GAP_MS);
      };

      heartbeatTimer = setInterval(() => {
        if (!closed) send(`: ping\n\n`);
      }, HEARTBEAT_MS);

      ttftTimer = setTimeout(() => {
        if (!firstToken) {
          void closeWithError(
            "timeout",
            "No response from AI within 8 seconds. Please try again.",
          );
        }
      }, TTFT_MS);

      try {
        const t0 = Date.now();
        const stream = streamScoutTurn({
          lane: "chat_improve",
          systemBlocks: [{ text: systemPrompt }],
          messages: [{ role: "user", content: userMessage }],
          maxTokens: 1_024,
          userId: user.id,
          routeTag: "/api/copilot/improve",
        });

        for await (const event of stream) {
          if (closed) break;

          if (event.kind === "decision") {
            provider = event.provider;
            modelId = event.modelId;
          } else if (event.kind === "text_delta") {
            if (!firstToken) {
              firstToken = true;
              if (ttftTimer) clearTimeout(ttftTimer);
            }
            resetGapTimer();
            fullText += event.text;
            send(sse("text", { delta: event.text }));
          } else if (event.kind === "usage") {
            inputTokens = event.usage.inputTokensUncached;
            outputTokens = event.usage.outputTokens;
            cacheReadTokens = event.usage.inputTokensCachedRead;
            cacheCreateTokens = event.usage.inputTokensCacheCreate;
            webSearchRequests = event.usage.webSearchRequests;
            toolCalls = event.usage.toolCalls;
          }
        }
        latencyMs = Date.now() - t0;

        if (!closed) {
          clearTimers();
          closed = true;

          // TIM-1902: uniform credit debit for any access-holding account
          // (active or card-on-file trialist). Subscription_tier=free is no
          // longer reachable here — the gate above blocks it.
          const costPerInputM = 3;
          const costPerOutputM = 15;
          const costUsd =
            (inputTokens * costPerInputM + outputTokens * costPerOutputM) / 1_000_000;

          const postDebitBalance = Math.max(0, profile.ai_credits_remaining - 1);
          await supabase
            .from("users")
            .update({ ai_credits_remaining: postDebitBalance })
            .eq("id", user.id);

          await supabase.from("credit_transactions").insert({
            user_id: user.id,
            amount: -1,
            type: "usage",
            description: `AI Assist: ${workspaceKey}/${fieldKey}`,
          });
          // TIM-3023: fire credit-balance-low notice if this debit dropped
          // the user under the threshold (at most one per calendar month).
          void notifyIfCreditBalanceLow({ userId: user.id, postMutationBalance: postDebitBalance });
          // Log cost for internal tracking (best-effort).
          await svcClient.from("ai_errors").insert({
            user_id: user.id,
            workspace_key: workspaceKey,
            error_code: "cost_log",
            upstream_status: 200,
            details: { fieldKey, planId, costUsd, inputTokens, outputTokens, chars: fullText.length },
          }).then(() => {});

          // TIM-2509: per-turn telemetry into ai_turn_metrics (awaited before
          // controller close so Vercel doesn't freeze the insert).
          await recordTurnMetric(
            {
              async insert(row) {
                return svcClient.from("ai_turn_metrics").insert(row);
              },
            },
            {
              route: "/api/copilot/improve",
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
              lane: "chat_improve",
              latencyMs,
              fallbackUsed: false,
            },
          );

          send(sse("done", { text: normalizeAIOutput(fullText), modelUsed: modelId }));
          controller.close();
        }
      } catch (err: unknown) {
        const status =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status: number }).status)
            : undefined;
        await closeWithError(
          "upstream_error",
          "AI service temporarily unavailable. Please try again.",
          status,
        );
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
