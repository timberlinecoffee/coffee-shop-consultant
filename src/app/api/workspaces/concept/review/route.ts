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

import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import { recordTurnMetric, resolvePlanTier } from "@/lib/ai/turn-metrics";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeAIOutput } from "@/lib/normalize";
import { isSubscriptionActive, hasWriteAccess } from "@/lib/access";
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
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  const hasAccess = hasWriteAccess({
    subscription_status: profile.subscription_status,
    trial_ends_at: profile.trial_ends_at,
  });

  if (!hasAccess) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  if ((profile.ai_credits_remaining ?? 0) < 1) {
    return Response.json(
      { error: "You're out of AI credits for this month.", code: "out_of_credits" },
      { status: 402 },
    );
  }
  void isSubscriptionActive;

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

  // TIM-2505: per-type framing so the AI does not suggest seating, neighborhood
  // integration, or fixed-location considerations for mobile/drive-through types.
  // Multi-select: if more than one type was selected, shopType is a comma-joined
  // string; we match on the first recognised segment.
  const SHOP_TYPE_CONTEXT: Record<string, string> = {
    "Mobile cart or pop-up": "The owner operates a mobile unit. Questions about fixed seating, neighborhood integration, and walk-in foot traffic do not apply. Focus on pitch location, vehicle/trailer setup, permit status, and how quality holds at speed and volume.",
    "Mobile cart or kiosk": "The owner operates a mobile unit. Questions about fixed seating, neighborhood integration, and walk-in foot traffic do not apply. Focus on pitch location, vehicle/trailer setup, permit status, and how quality holds at speed and volume.",
    "Drive-through": "The owner operates a drive-through or kiosk. The customer experience is measured in seconds. Focus on throughput, queue management, site visibility, and how quality holds at drive-through pace.",
    "Roastery cafe": "The owner runs a production roastery with a cafe component. Production scale, wholesale accounts, cupping program, and customer-facing roast visibility are central. The concept statement should reflect which revenue channel leads.",
    "Espresso bar (drinks only)": "The owner runs a drinks-only espresso bar. No food program. The concept statement should reflect what the drinks-only focus signals and how the bar earns the visit without a food anchor.",
    "Co-working / Hybrid space": "The owner operates a cafe designed for extended work sessions. Membership model, seating policy, noise policy, and power access are part of the product. The concept statement should describe the working environment as much as the coffee.",
  };
  const shopTypeNote =
    Object.entries(SHOP_TYPE_CONTEXT).find(([key]) =>
      shopType.includes(key),
    )?.[1] ?? "";

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
- Shop type: ${shopType}${shopTypeNote ? `\n- Shop type context: ${shopTypeNote}` : ""}

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
      model: PLATFORM_AI_MODEL,
      max_tokens: 2_000,
      messages: [{ role: "user", content: prompt }],
    });

    // TIM-2509: record per-turn telemetry into ai_turn_metrics on every
    // successful Anthropic call (whether or not parse succeeds below).
    const telemetrySvc = createServiceClient();
    await recordTurnMetric(
      {
        async insert(row) {
          return telemetrySvc.from("ai_turn_metrics").insert(row);
        },
      },
      {
        route: "/api/workspaces/concept/review",
        model: PLATFORM_AI_MODEL,
        usage: message.usage,
        userId: user.id,
        planTier: resolvePlanTier(profile),
      },
    );

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

  // ── Charge 1 credit (only when we have real suggestions to return) ────────────
  // TIM-1902: uniform debit — trialists are on the same credit balance as
  // paid users, so there is no separate trial counter to bump.
  const svcClient = createServiceClient();
  await supabase
    .from("users")
    .update({ ai_credits_remaining: Math.max(0, (profile.ai_credits_remaining ?? 0) - 1) })
    .eq("id", user.id);
  await svcClient.from("credit_transactions").insert({
    user_id: user.id,
    amount: -1,
    type: "usage",
    description: "AI Review: concept",
  });

  return Response.json({
    suggestions,
    generated_at: new Date().toISOString(),
  });
}
