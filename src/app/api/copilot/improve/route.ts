// TIM-881: Single-field AI improvement endpoint.
// SSE stream — same event format as /api/copilot/stream (text, thinking, error, done).
// Does NOT create a thread record. Quota spend: 1 message unit per call.
// TIM-1365 normalization: pure stream — no server-side text assembly. Client normalizes the
// assembled field value via normalizeAIOutput() after stream ends. *.delta.text is exempt from the ESLint gate.

export const runtime = "nodejs";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { composePlanSnapshot } from "@/lib/copilot/composePlanSnapshot";
import { isSubscriptionActive } from "@/lib/access";
import { ensureTrialGrant } from "@/lib/credits/trial";
import { loadPlanContext } from "@/lib/plan-context";
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
- Return only the improved field text, nothing else`;
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
  const { data: profile } = await supabase
    .from("users")
    .select(
      "ai_credits_remaining, trial_credits_granted, subscription_tier, subscription_status, onboarding_data",
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    return new Response(
      sse("error", { code: "quota", message: "Profile not found." }),
      { status: 404, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  if (
    !isSubscriptionActive(profile.subscription_status) &&
    profile.subscription_tier !== "free"
  ) {
    return new Response(
      sse("error", {
        code: "paywall",
        reason: paywallReason(profile.subscription_status),
        tier_required: "starter",
      }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // TIM-1825: free trial now spends a one-time 15-credit grant (applied lazily
  // here), debited per-action like paid tiers — no more message counter.
  // `creditBalance` is the post-grant balance the debit below reads.
  const isFree = profile.subscription_tier === "free";
  let creditBalance = profile.ai_credits_remaining ?? 0;
  if (isFree) {
    creditBalance = await ensureTrialGrant(createServiceClient(), user.id, profile);
    if (creditBalance < 1) {
      return new Response(
        sse("error", {
          code: "trial_exhausted",
          message: "You've used your free trial credits — upgrade to keep planning with Copilot.",
        }),
        { status: 402, headers: { "Content-Type": "text/event-stream" } },
      );
    }
  }

  const isUnlimited = profile.subscription_tier === "pro";

  if (!isUnlimited && profile.subscription_tier !== "free" && profile.ai_credits_remaining < 1) {
    return new Response(
      sse("error", {
        code: "quota",
        message:
          "You've used all your AI credits for this month. Upgrade to Accelerator for unlimited coaching, or your credits reset next month.",
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
  const [{ snapshot: planSnapshot }, planContext] = await Promise.all([
    composePlanSnapshot(planId, workspaceKey, svcClient),
    loadPlanContext(svcClient, user.id),
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
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1_024,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const event of stream) {
          if (closed) break;

          if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              if (!firstToken) {
                firstToken = true;
                if (ttftTimer) clearTimeout(ttftTimer);
              }
              resetGapTimer();
              fullText += event.delta.text;
              send(sse("text", { delta: event.delta.text }));
            }
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? 0;
          } else if (event.type === "message_start" && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0;
          }
        }

        if (!closed) {
          clearTimers();
          closed = true;

          // TIM-1825: deduct 1 credit on successful completion for trial and
          // paid users alike (from the trial grant or the monthly allocation).
          // Unlimited (legacy pro) accounts spend nothing.
          const costPerInputM = 3;
          const costPerOutputM = 15;
          const costUsd =
            (inputTokens * costPerInputM + outputTokens * costPerOutputM) / 1_000_000;

          let creditsRemaining: number | null = null;
          if (!isUnlimited) {
            creditsRemaining = Math.max(0, creditBalance - 1);
            await supabase
              .from("users")
              .update({ ai_credits_remaining: creditsRemaining })
              .eq("id", user.id);

            await supabase.from("credit_transactions").insert({
              user_id: user.id,
              amount: -1,
              type: "usage",
              description: `AI Assist: ${workspaceKey}/${fieldKey}`,
            });
          }
          // Log cost for internal tracking (best-effort).
          await svcClient.from("ai_errors").insert({
            user_id: user.id,
            workspace_key: workspaceKey,
            error_code: "cost_log",
            upstream_status: 200,
            details: { fieldKey, planId, costUsd, inputTokens, outputTokens, chars: fullText.length },
          }).then(() => {});
          send(sse("done", { modelUsed: "claude-sonnet-4-6", creditsRemaining, cost_usd: costUsd }));
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
