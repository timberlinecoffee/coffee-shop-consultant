// TIM-1872: AI review endpoint for the Concept Suite.
// Mirrors the Financial Suite's /critique route (TIM-964): a senior coffee
// consultant reviews the whole concept and returns 4-6 strength / weakness /
// suggestion bullets, each fixable one carrying a recommendation, next_step,
// and why. Result is shaped like the Financial Suite's CritiqueResult so both
// suites present AI feedback identically. The client persists the result into
// the concept jsonb document (no migration).
// POST /api/workspaces/concept/assess

export const runtime = "nodejs";
export const maxDuration = 45;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { normalizeAIOutput } from "@/lib/normalize";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import {
  normalizeConceptV2,
  CONCEPT_COMPONENTS_V2,
  PERSONA_VISIT_FREQUENCY_LABELS,
  PERSONA_SPEND_LABELS,
  PERSONA_VALUE_LABELS,
  type ConceptDocumentV2,
} from "@/lib/concept";

const anthropic = new Anthropic();

function buildConceptSummary(doc: ConceptDocumentV2): string {
  const lines: string[] = [];
  for (const meta of CONCEPT_COMPONENTS_V2) {
    if (meta.id === "target_customer") continue; // personas formatted separately
    const content = doc.components[meta.id]?.content?.trim();
    if (content) lines.push(`## ${meta.label}\n${content}`);
  }

  const personas = doc.personas ?? [];
  if (personas.length > 0) {
    const block = personas
      .map((p) => {
        const bits: string[] = [];
        bits.push(`- **${p.name}**${p.isPrimary ? " (primary)" : ""}`);
        if (p.occupation) bits.push(`  - Occupation: ${p.occupation}`);
        if (p.whyTheyVisit?.trim()) bits.push(`  - Why they visit: ${p.whyTheyVisit.trim()}`);
        if (p.typicalOrder?.trim()) bits.push(`  - Typical order: ${p.typicalOrder.trim()}`);
        if (p.painPoints?.trim()) bits.push(`  - Pain points: ${p.painPoints.trim()}`);
        if (p.visitFrequency) bits.push(`  - Visits: ${PERSONA_VISIT_FREQUENCY_LABELS[p.visitFrequency]}`);
        if (p.spendPerVisit) bits.push(`  - Spend per visit: ${PERSONA_SPEND_LABELS[p.spendPerVisit]}`);
        if (p.values && p.values.length > 0)
          bits.push(`  - Values: ${p.values.map((v) => PERSONA_VALUE_LABELS[v]).join(", ")}`);
        return bits.join("\n");
      })
      .join("\n");
    lines.push(`## Target Customer Personas\n${block}`);
  }

  return lines.join("\n\n");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  let body: { concept?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const doc = normalizeConceptV2(body.concept);
  const shopName = doc.components.shop_identity.content.trim() || "this coffee shop";
  const summary = buildConceptSummary(doc);

  if (summary.trim().length === 0) {
    return Response.json(
      { error: "Add some concept details before requesting a review." },
      { status: 400 }
    );
  }

  const prompt = `You are a senior coffee shop consultant who has helped hundreds of independent operators sharpen their shop concept before they open. You give direct, specific, founder-to-founder feedback.

Review the concept below for ${shopName} and assess how clear, coherent, and differentiated it is. Look for: a vision that points at a real reason to exist; target personas that are specific enough to make menu/pricing/hours decisions for; differentiation a competitor cannot easily copy; a brand voice that is consistent with the rest; and an offering that fits the personas. Flag where pieces contradict each other (e.g. a premium craft positioning with a price-driven persona).

## Concept
${summary}

## Instructions
Return a JSON object with a "bullets" array containing 4-6 items. Each bullet has these fields:
- type: "strength" | "weakness" | "suggestion"
- text: a concise, specific observation (1-2 sentences). Quote the operator's actual words or choices from the concept above. Do NOT be generic; tie every point to something they wrote.
- recommendation: REQUIRED for "weakness" and "suggestion". OMIT for "strength". One sentence naming the concrete change to make. No vague verbs like "consider", "explore", "look into".
- next_step: REQUIRED for "weakness" and "suggestion". OMIT for "strength". One specific thing the owner can do this week (e.g. "Rewrite the vision to name the one customer moment you want to own, in a single sentence.").
- why: REQUIRED for "weakness" and "suggestion". OMIT for "strength". One short sentence explaining why the change helps.

Mix: typically 1-2 strengths, 2-3 weaknesses or suggestions. Be honest, not flattering. Never flag a problem without telling the owner exactly what to do about it.

Voice rules:
- Founder voice. Plain English. Direct.
- NEVER use: leverage, synergy, curated, unlock, elevate, embark, delve, journey, actually, genuinely, honestly.
- No em dashes. No emojis. No headings inside any field; these are flat strings.

Return ONLY the JSON object, no other text.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "No JSON in AI response" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      bullets: Array<{
        type: string;
        text: string;
        recommendation?: string;
        next_step?: string;
        why?: string;
      }>;
    };

    const bullets = (parsed.bullets ?? []).map((b) => {
      const type = (["strength", "weakness", "suggestion"].includes(b.type)
        ? b.type
        : "suggestion") as "strength" | "weakness" | "suggestion";
      const base = { type, text: normalizeAIOutput(String(b.text ?? "")) };
      if (type === "strength") return base;
      return {
        ...base,
        recommendation: normalizeAIOutput(String(b.recommendation ?? "").trim()) || undefined,
        next_step: normalizeAIOutput(String(b.next_step ?? "").trim()) || undefined,
        why: normalizeAIOutput(String(b.why ?? "").trim()) || undefined,
      };
    });

    return Response.json({
      bullets,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("concept assessment error:", err);
    return Response.json({ error: "AI generation failed" }, { status: 500 });
  }
}
