// TIM-1872: Suite-level AI review for the Concept Suite.
// Mirrors the AI-assist pattern used by the Financial Suite (AI Assessment) and
// Business Plan suite: one suite-level control that reviews the whole concept and
// suggests improvements. Returns per-field proposed rewrites as a JSON array; the
// client routes them through the unified AIReviewModal for per-change
// accept/reject/edit. AI never auto-applies (TIM-1561).
//
// Non-streaming JSON (same shape contract as /api/workspaces/financials/critique).
// Quota: 1 message unit per review, gated identically to /api/copilot/improve.
// POST /api/workspaces/concept/review

export const runtime = "nodejs";
export const maxDuration = 45;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeAIOutput } from "@/lib/normalize";
import { isSubscriptionActive, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access";
import {
  CONCEPT_COMPONENTS_V2,
  formatConceptV2ForAI,
  normalizeConceptV2,
  type ConceptComponentId,
  type ConceptDocumentV2,
} from "@/lib/concept";

const anthropic = new Anthropic();

// Fields the suite-level review can rewrite: prose, multiline, and not the
// persona-driven target_customer (which has its own structured editor) or the
// single-line shop name.
const REVIEWABLE_IDS: ConceptComponentId[] = CONCEPT_COMPONENTS_V2.filter(
  (m) => m.multiline && m.id !== "target_customer",
).map((m) => m.id);

const LABEL_BY_ID = new Map(CONCEPT_COMPONENTS_V2.map((m) => [m.id, m.label]));

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { planId?: string; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const planId = body.planId;
  if (!planId) {
    return Response.json({ error: "Missing planId" }, { status: 400 });
  }

  const doc: ConceptDocumentV2 = normalizeConceptV2(body.content);

  // ── Quota / billing gate (mirrors /api/copilot/improve) ──────────────────────
  const { data: profile } = await supabase
    .from("users")
    .select(
      "ai_credits_remaining, copilot_trial_messages_used, subscription_tier, subscription_status, onboarding_data",
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  if (
    !isSubscriptionActive(profile.subscription_status) &&
    profile.subscription_tier !== "free"
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  const isFree = profile.subscription_tier === "free";
  const isUnlimited = profile.subscription_tier === "pro";

  if (isFree) {
    const used = profile.copilot_trial_messages_used ?? 0;
    if (used >= COPILOT_FREE_TRIAL_LIMIT) {
      return Response.json(
        { error: "Free trial AI sessions used up.", code: "trial_exhausted" },
        { status: 402 },
      );
    }
  } else if (!isUnlimited && (profile.ai_credits_remaining ?? 0) < 1) {
    return Response.json(
      { error: "You've used all your AI credits for this month.", code: "quota" },
      { status: 402 },
    );
  }

  // ── Eligible fields: prose fields that have content ──────────────────────────
  const targets = REVIEWABLE_IDS.filter(
    (id) => (doc.components[id]?.content ?? "").trim().length > 0,
  );

  if (targets.length === 0) {
    return Response.json(
      {
        error:
          "Fill in at least one concept section before running an AI review.",
        code: "nothing_to_review",
      },
      { status: 422 },
    );
  }

  const onboarding = (profile.onboarding_data as Record<string, unknown>) ?? {};
  const shopType = Array.isArray(onboarding?.shop_type)
    ? (onboarding.shop_type as string[]).join(", ")
    : String(onboarding?.shop_type ?? "not specified");

  const fieldsBlock = targets
    .map(
      (id) =>
        `### ${LABEL_BY_ID.get(id)} (key: ${id})\n${doc.components[id].content.trim()}`,
    )
    .join("\n\n");

  const prompt = `You are an expert coffee shop business advisor reviewing a founder's concept document. Your job is to make each section sharper, more specific, and more grounded — not longer, not more polished-sounding.

## Founder profile
- Budget: ${String(onboarding?.budget ?? "not specified")}
- Stage: ${String(onboarding?.stage ?? "not specified")}
- Shop type: ${shopType}

## The full concept so far
${formatConceptV2ForAI(doc)}

## Sections to review and improve
${fieldsBlock}

## Your task
For each section listed above, return an improved version of that section's text. Only include a section in your response if your version is a genuine improvement — if a section is already strong, omit it.

Rules for every rewrite:
- Keep the founder's specific facts, names, and details. Sharpen and tighten; never invent prices, addresses, suppliers, or statistics.
- Make it concrete and specific to THIS shop. Cut filler and generic marketing language.
- Match the existing voice: warm, operational, grounded in real coffee-shop experience.
- Keep roughly the same length unless the original is padded.
- NEVER use: actually, genuinely, honestly, unlock, elevate, leverage, embark, delve, curated, synergy, journey.
- No em dashes. No emojis. No section headings inside the text — return plain prose.

## Output format
Return ONLY a JSON object of this exact shape, no other text:
{"suggestions":[{"fieldId":"<section key>","proposedValue":"<improved text>"}]}
Valid fieldId values: ${targets.map((id) => `"${id}"`).join(", ")}.`;

  let parsed: { suggestions?: Array<{ fieldId?: string; proposedValue?: string }> };
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2_000,
      messages: [{ role: "user", content: prompt }],
    });
    const rawText =
      message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "No JSON in AI response" }, { status: 500 });
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("concept review error:", err);
    // Surface upstream/provider failures with the same cohesive message the
    // copilot routes use, rather than a bare "generation failed".
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : undefined;
    const isUpstream = typeof status === "number" && status >= 400;
    return Response.json(
      {
        error: isUpstream
          ? "AI service temporarily unavailable. Please try again."
          : "AI generation failed",
        code: isUpstream ? "upstream_error" : "parse_error",
      },
      { status: 502 },
    );
  }

  const targetSet = new Set<string>(targets);
  const suggestions = (parsed.suggestions ?? [])
    .filter(
      (s): s is { fieldId: string; proposedValue: string } =>
        typeof s?.fieldId === "string" &&
        typeof s?.proposedValue === "string" &&
        targetSet.has(s.fieldId),
    )
    .map((s) => {
      const fieldId = s.fieldId as ConceptComponentId;
      return {
        fieldId,
        fieldLabel: LABEL_BY_ID.get(fieldId) ?? fieldId,
        originalValue: doc.components[fieldId].content,
        proposedValue: normalizeAIOutput(s.proposedValue.trim()),
      };
    })
    // Drop no-op rewrites that came back identical to the original.
    .filter((s) => s.proposedValue.length > 0 && s.proposedValue !== s.originalValue.trim());

  if (suggestions.length === 0) {
    return Response.json({ suggestions: [], generated_at: new Date().toISOString() });
  }

  // ── Charge 1 unit (only when we have real suggestions to return) ─────────────
  const svcClient = createServiceClient();
  if (isFree) {
    await supabase
      .from("users")
      .update({ copilot_trial_messages_used: (profile.copilot_trial_messages_used ?? 0) + 1 })
      .eq("id", user.id);
  } else if (!isUnlimited) {
    await supabase
      .from("users")
      .update({ ai_credits_remaining: (profile.ai_credits_remaining ?? 0) - 1 })
      .eq("id", user.id);
    await svcClient.from("credit_transactions").insert({
      user_id: user.id,
      amount: -1,
      type: "usage",
      description: "AI Review: concept",
    });
  }

  return Response.json({
    suggestions,
    generated_at: new Date().toISOString(),
  });
}
