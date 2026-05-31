// TIM-1037: Business Plan per-section "Improve with AI" — SSE stream.
// Rewrites a specific section for clarity, persuasiveness, and concision.
// TIM-1315: upgraded voice rules and quality spec enforcement.

export const runtime = "nodejs";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSubscriptionActive, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access";
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

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, subscription_tier, copilot_trial_messages_used, ai_credits_remaining, beta_waiver_until")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });

  const isActive = isSubscriptionActive(profile.subscription_status);
  const isFree = profile.subscription_tier === "free";
  const betaWaivedUntil = profile.beta_waiver_until ? new Date(profile.beta_waiver_until) : null;
  const isBetaWaived = betaWaivedUntil ? betaWaivedUntil > new Date() : false;

  if (!isActive && !isBetaWaived) {
    if (isFree) {
      const used = profile.copilot_trial_messages_used ?? 0;
      if (used >= COPILOT_FREE_TRIAL_LIMIT) {
        return Response.json({ reason: "trial_exhausted", tier_required: "starter" }, { status: 402 });
      }
    } else {
      return Response.json({ reason: "no_subscription", tier_required: "starter" }, { status: 402 });
    }
  }

  const body = await request.json() as {
    sectionKey: string;
    sectionTitle: string;
    currentContent: string;
    shopName?: string;
    userInstruction?: string;
  };

  const { sectionKey, sectionTitle, currentContent, shopName, userInstruction } = body;

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
${userInstruction ? `\nSpecific improvement request: ${userInstruction}\n` : ""}
Improve this section:
${currentContent}`;

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
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
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

        if (isActive && !isFree) {
          const svc = createServiceClient();
          await svc
            .from("users")
            .update({ ai_credits_remaining: Math.max(0, (profile.ai_credits_remaining ?? 0) - 1) })
            .eq("id", user.id);
        } else if (isFree) {
          const svc = createServiceClient();
          await svc
            .from("users")
            .update({ copilot_trial_messages_used: (profile.copilot_trial_messages_used ?? 0) + 1 })
            .eq("id", user.id);
        }

        controller.enqueue(enc.encode(sse("done", { text: fullText })));
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
