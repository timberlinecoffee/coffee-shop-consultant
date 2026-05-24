// TIM-964: AI critique endpoint for the Financial Suite.
// Reads projections data and generates a benchmarked critique.
// POST /api/workspaces/financials/critique

export const runtime = "nodejs";
export const maxDuration = 45;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import type { FinancialProjections } from "@/lib/financials";
import { formatCurrency } from "@/lib/financials";

const anthropic = new Anthropic();

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

  let body: { projections: FinancialProjections; concept_summary?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projections, concept_summary } = body;
  if (!projections) {
    return Response.json({ error: "Missing projections" }, { status: 400 });
  }

  const { year1, year3, year5 } = projections;
  const gm1 = year1.revenue > 0 ? ((year1.gross_margin / year1.revenue) * 100).toFixed(1) : "0";
  const ebitda1Pct = year1.revenue > 0 ? ((year1.ebitda / year1.revenue) * 100).toFixed(1) : "0";
  const laborPct = year1.revenue > 0 ? ((year1.labor / year1.revenue) * 100).toFixed(1) : "0";
  const rentPct = year1.revenue > 0 ? ((year1.rent / year1.revenue) * 100).toFixed(1) : "0";

  const prompt = `You are a senior coffee shop consultant who has reviewed hundreds of independent coffee shop business plans. You have deep knowledge of industry benchmarks for small-format espresso bars and cafes in North American markets.

Review these Year 1 / Year 3 / Year 5 financial projections for a new coffee shop and provide a benchmarked critique.

## Projections
**Year 1**
- Revenue: ${formatCurrency(year1.revenue)}
- COGS: ${formatCurrency(year1.cogs)} (${gm1}% gross margin)
- Labor: ${formatCurrency(year1.labor)} (${laborPct}% of revenue)
- Rent: ${formatCurrency(year1.rent)} (${rentPct}% of revenue)
- EBITDA: ${formatCurrency(year1.ebitda)} (${ebitda1Pct}% margin)
- Net Income: ${formatCurrency(year1.net_income)}

**Year 3**
- Revenue: ${formatCurrency(year3.revenue)}
- EBITDA: ${formatCurrency(year3.ebitda)}
- Net Income: ${formatCurrency(year3.net_income)}

**Year 5**
- Revenue: ${formatCurrency(year5.revenue)}
- EBITDA: ${formatCurrency(year5.ebitda)}
- Net Income: ${formatCurrency(year5.net_income)}

**Startup Equipment Total:** ${formatCurrency(projections.startup_equipment_total)}

${concept_summary ? `## Concept Context\n${concept_summary}` : ""}

## Industry Benchmarks (independent coffee shops, North America)
- Gross margin: 60–70% is healthy; below 55% is concerning
- Labor: 30–38% of revenue is typical; above 40% is a red flag
- Rent: under 10% of revenue is ideal; 10–15% is acceptable; above 15% is risky
- EBITDA: 10–18% is a healthy mature shop; year 1 breakeven or slight loss is normal
- Revenue growth year-over-year: 10–20% is realistic for an established shop

## Instructions
Return a JSON object with a "bullets" array containing 4-5 items. Each bullet must have:
- type: "strength", "weakness", or "suggestion"
- text: a concise, specific observation (1-2 sentences max). Reference actual numbers. Do NOT be generic.

Mix of types: typically 1-2 strengths, 2-3 weaknesses or suggestions.
Be direct and specific. Owners need honest feedback, not cheerleading.

Return ONLY the JSON object, no other text.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "No JSON in AI response" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      bullets: Array<{ type: string; text: string }>;
    };

    const bullets = (parsed.bullets ?? []).map((b) => ({
      type: (["strength", "weakness", "suggestion"].includes(b.type)
        ? b.type
        : "suggestion") as "strength" | "weakness" | "suggestion",
      text: String(b.text ?? ""),
    }));

    return Response.json({
      bullets,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("financials critique error:", err);
    return Response.json({ error: "AI generation failed" }, { status: 500 });
  }
}
