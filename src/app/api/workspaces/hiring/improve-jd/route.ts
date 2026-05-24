// TIM-965: AI improvement for job description fields.
// Returns {rewrite, gaps, competitorNote} — same shape as Concept workspace Improve panel.

export const runtime = "nodejs";
export const maxDuration = 30;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";

const anthropic = new Anthropic();

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
  "gaps": ["specific gap or missing element", "another gap if applicable"],
  "competitorNote": "optional one-sentence note about how top coffee shops handle this, or null"
}

Rules:
- No emojis.
- Keep it concise and human — this is not a corporate HR document.
- "gaps" should be actionable and specific. Max 3 items. Empty array if none.
- "competitorNote" is null if not useful.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);

    return Response.json({
      rewrite: parsed.rewrite ?? "",
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      competitorNote: parsed.competitorNote ?? null,
    });
  } catch {
    return Response.json({ error: "AI improvement failed" }, { status: 500 });
  }
}
