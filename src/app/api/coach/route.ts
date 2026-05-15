import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

function buildSystemPrompt(
  onboardingData: Record<string, unknown>,
  allResponses: Record<string, Record<string, unknown>>,
  sectionKey: string
): string {
  const budget = onboardingData?.budget ?? "not specified";
  const location = onboardingData?.location ?? "not specified";
  const stage = onboardingData?.stage ?? "not specified";
  const motivation = onboardingData?.motivation ?? "not specified";
  const coffeeExperience = onboardingData?.coffee_experience ?? "not specified";
  const timeline = onboardingData?.timeline ?? "not specified";
  const shopType = onboardingData?.shop_type;

  const priorWork = Object.entries(allResponses)
    .filter(([key]) => key !== sectionKey)
    .map(([key, data]) => `**${key.replace(/_/g, " ")}**: ${JSON.stringify(data)}`)
    .join("\n");

  return `You are the AI coach for Timberline Coffee School's My Coffee Shop Consultant platform. You are a knowledgeable friend who has helped dozens of people open successful coffee shops — not a professor, not a consultant charging by the hour.

## User Context
- **Budget**: ${budget}
- **Location**: ${location}
- **Stage**: ${stage}
- **Primary motivation**: ${motivation}
- **Coffee experience**: ${coffeeExperience}
- **Timeline**: ${timeline}
- **Initial shop type ideas**: ${Array.isArray(shopType) ? shopType.join(", ") : shopType ?? "not specified"}

## What They've Built So Far
${priorWork || "This is the first section they're working on."}

## Current Section
They are working on: **${sectionKey.replace(/_/g, " ")}**

## Your Coaching Style
- Warm, direct, conversational — think knowledgeable friend, not professor
- Use coffee-specific examples and real-world analogies
- Challenge assumptions constructively — push for specificity, don't accept vague answers
- Reference their specific situation (budget, location, experience) to make advice concrete
- 2-3 paragraphs max unless they ask for more
- End every response with a specific question or clear next step
- NEVER use the words: actually, genuinely, honestly
- NEVER hallucinate specific prices, addresses, suppliers, or statistics
- If they haven't filled out a section yet, work with what they've told you

## Critical Rules
- You know coffee deeply — use that knowledge to challenge and refine their thinking
- If their choice conflicts with their budget or location, say so directly but kindly
- Help them see blind spots they might not notice
- Your job is to make their concept stronger, not to validate every choice`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { planId, moduleNumber, sectionKey, messages, onboardingData, allResponses } = body;

  if (!planId || !moduleNumber || !sectionKey || !messages) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("ai_credits_remaining, subscription_tier")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return Response.json({ error: "Profile not found." }, { status: 404 });
  }

  if (profile.subscription_tier === "free") {
    return Response.json({ error: "AI coaching requires a Builder or Accelerator plan. Upgrade to start coaching." }, { status: 403 });
  }

  const isUnlimited = profile.subscription_tier === "accelerator";

  if (!isUnlimited && profile.ai_credits_remaining < 1) {
    return Response.json({ error: "You've used all your AI credits for this month. Upgrade to Accelerator for unlimited coaching, or wait for your monthly reset." }, { status: 402 });
  }

  const systemPrompt = buildSystemPrompt(onboardingData ?? {}, allResponses ?? {}, sectionKey);

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: systemPrompt,
      messages,
    }),
  });

  if (!anthropicResponse.ok) {
    const err = await anthropicResponse.text();
    console.error("Anthropic API error:", err);
    return Response.json({ error: "AI service temporarily unavailable" }, { status: 500 });
  }

  const aiData = await anthropicResponse.json();
  const assistantMessage: string = aiData.content[0].text;

  // Claude Sonnet 4.6 pricing: $3/M input tokens, $15/M output tokens
  const inputTokens: number = aiData.usage?.input_tokens ?? 0;
  const outputTokens: number = aiData.usage?.output_tokens ?? 0;
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  const updatedMessages = [...messages, { role: "assistant", content: assistantMessage }];

  const { data: existing } = await supabase
    .from("ai_conversations")
    .select("id, credits_used, cost_usd")
    .eq("plan_id", planId)
    .eq("module_number", moduleNumber)
    .eq("section_key", sectionKey)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("ai_conversations")
      .update({
        messages: updatedMessages,
        credits_used: existing.credits_used + 1,
        cost_usd: (Number(existing.cost_usd) || 0) + costUsd,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("ai_conversations").insert({
      plan_id: planId,
      module_number: moduleNumber,
      section_key: sectionKey,
      messages: updatedMessages,
      credits_used: 1,
      cost_usd: costUsd,
    });
  }

  if (!isUnlimited) {
    await supabase
      .from("users")
      .update({ ai_credits_remaining: profile.ai_credits_remaining - 1 })
      .eq("id", user.id);

    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: -1,
      type: "usage",
      description: `Module ${moduleNumber} coach — ${sectionKey}`,
    });
  }

  return Response.json({ message: assistantMessage });
}
