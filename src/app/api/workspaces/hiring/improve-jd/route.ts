// TIM-965: AI improvement for job description fields.
// Returns {rewrite, gaps, competitorNote} — same shape as Concept workspace Improve panel.
// TIM-1104: Each gap now carries recommendation/next_step/why so consumers can
//           render the problem → fix → next step → reason shape required across
//           every AI consultant surface in Groundwork.

export const runtime = "nodejs";
export const maxDuration = 30;

import { runScoutTurn } from "@/lib/ai/scout-adapter";
import { createClient } from "@/lib/supabase/server";
import { normalizeAIOutput } from "@/lib/normalize";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { enforceRateLimit } from "@/lib/rate-limit";

const ROUTE_PATH = "/api/workspaces/hiring/improve-jd";

const JD_FIELD_LABELS: Record<string, string> = {
  summary:         "Role Summary",
  responsibilities: "Responsibilities",
  requirements:    "Requirements",
  comp:            "Compensation",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4: rate-limit a paid-API route.
  const rateLimited = await enforceRateLimit({
    bucket: "hiring:improve-jd",
    id: user.id,
    limit: 10,
    windowSec: 60,
  });
  if (rateLimited) return rateLimited;

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

  let body: { field: string; content: string; roleTitle: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { field, content, roleTitle } = body;
  if (!field || !roleTitle) {
    return Response.json({ error: "Missing required fields: field, roleTitle" }, { status: 400 });
  }

  const fieldLabel = JD_FIELD_LABELS[field] ?? field;

  const prompt = `You are a senior coffee shop consultant helping a new owner write a compelling job description for their ${roleTitle} role.

Review this "${fieldLabel}" section and improve it. Write from the perspective of an independent specialty coffee shop owner — warm, professional, not corporate.

Current content:
${content || "(empty — please draft a strong starting version)"}

Respond with a JSON object in this exact format (no markdown fences):
{
  "rewrite": "improved version of the content",
  "gaps": [
    {
      "gap": "specific missing element or weakness",
      "recommendation": "what to add or change to close the gap, concrete",
      "next_step": "a single named thing the owner can do this week",
      "why": "one sentence on why this fix works"
    }
  ],
  "competitorNote": "optional one-sentence note about how top coffee shops handle this, or null"
}

Rules:
- No emojis.
- Keep it concise and human — this is not a corporate HR document.
- "gaps" is an array of objects (max 3). Empty array if none. Every gap MUST carry recommendation, next_step, and why -- never list a gap without telling the owner exactly what to do.
- "competitorNote" is null if not useful.
- Voice: knowledgeable friend, not consultant. Plain English. Direct. NEVER use: leverage, synergy, curated, unlock, elevate, embark, delve, journey, seamlessly, robust, holistic, comprehensive, innovative, passionate about, actually, genuinely, honestly. NEVER use em dashes (—); use ( -- ) if you need a pause.`;

  try {
    const result = await runScoutTurn({
      lane: "hiring_improve_jd",
      systemBlocks: [],
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1024,
      userId: user.id,
      routeTag: ROUTE_PATH,
    });

    const parsed = JSON.parse(result.text);

    const gaps = Array.isArray(parsed.gaps)
      ? parsed.gaps.map((g: unknown) => {
          if (typeof g === "string") {
            // Older callers / responses may still emit flat strings.
            return { gap: normalizeAIOutput(g), recommendation: null, next_step: null, why: null };
          }
          if (g && typeof g === "object") {
            const r = g as Record<string, unknown>;
            return {
              gap: normalizeAIOutput(String(r.gap ?? "").trim()),
              recommendation: r.recommendation ? normalizeAIOutput(String(r.recommendation).trim()) : null,
              next_step: r.next_step ? normalizeAIOutput(String(r.next_step).trim()) : null,
              why: r.why ? normalizeAIOutput(String(r.why).trim()) : null,
            };
          }
          return null;
        }).filter((g: unknown) => g && typeof g === "object" && (g as { gap?: string }).gap)
      : [];

    return Response.json({
      rewrite: normalizeAIOutput(String(parsed.rewrite ?? "")),
      gaps,
      competitorNote: parsed.competitorNote ? normalizeAIOutput(String(parsed.competitorNote)) : null,
    });
  } catch {
    return Response.json({ error: "AI improvement failed" }, { status: 500 });
  }
}
