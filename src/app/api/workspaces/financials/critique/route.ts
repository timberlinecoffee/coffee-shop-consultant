// TIM-964: AI assessment endpoint for the Financial Suite.
// TIM-1004: Updated to include itemized opex and out-of-range category flagging.
// TIM-1100: User-facing term is now "AI Assessment" (route path retained for compat).
// TIM-1101: Multi-currency — request body may include currencyCode (ISO 4217);
//   prompt + formatted figures use the selected currency.
// TIM-1104: Every weakness or suggestion must include recommendation, next_step,
//   and why. Pure problem-listing without a fix is no longer acceptable.
// TIM-1121: Pre-flagged "Ratios outside healthy benchmark" block ensures the
//   consultant always ties Ratios-tab red flags into the broader advice.
// POST /api/workspaces/financials/critique

export const runtime = "nodejs";
export const maxDuration = 45;

import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { normalizeAIOutput } from "@/lib/normalize";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import type { FinancialProjections } from "@/lib/financial-projection";
import { formatCurrency } from "@/lib/financial-projection";
import { getCurrencyMeta, normalizeCurrencyCode } from "@/lib/currency";

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

  let body: {
    projections: FinancialProjections;
    concept_summary?: string;
    currencyCode?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projections, concept_summary } = body;
  if (!projections) {
    return Response.json({ error: "Missing projections" }, { status: 400 });
  }

  const currencyCode = normalizeCurrencyCode(body.currencyCode);
  const currencyMeta = getCurrencyMeta(currencyCode);
  const fc = (n: number) => formatCurrency(n, currencyCode);

  const { year1, year3, year5 } = projections;

  function pct(numerator: number, denominator: number): string {
    return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "0%";
  }

  const gm1 = pct(year1.gross_profit, year1.revenue);
  const laborPct1 = pct(year1.labor, year1.revenue);
  const rentPct1 = pct(year1.rent, year1.revenue);
  const marketingPct1 = pct(year1.marketing, year1.revenue);
  const utilitiesPct1 = pct(year1.utilities, year1.revenue);
  const insurancePct1 = pct(year1.insurance, year1.revenue);
  const techPct1 = pct(year1.tech, year1.revenue);
  const opIncPct1 = pct(year1.operating_income, year1.revenue);
  const netPct1 = pct(year1.net_income, year1.revenue);
  const totalOpexPct1 = pct(year1.total_opex, year1.revenue);

  // TIM-1121: Pre-flagged ratio red flags. Keeps thresholds aligned with the
  // Ratios tab so anything that shows red there is named here for the
  // consultant to address.
  type RatioFlag = { label: string; value: string; healthy: string; severity: "red" | "amber" };
  const flagged: RatioFlag[] = [];
  if (year1.revenue > 0) {
    const gmVal = (year1.gross_profit / year1.revenue) * 100;
    const laborVal = (year1.labor / year1.revenue) * 100;
    const rentVal = (year1.rent / year1.revenue) * 100;
    const primeCostVal = ((year1.cogs + year1.labor) / year1.revenue) * 100;
    const netVal = (year1.net_income / year1.revenue) * 100;

    if (primeCostVal > 70) flagged.push({ label: "Prime Cost", value: `${primeCostVal.toFixed(1)}%`, healthy: "55–65%", severity: "red" });
    else if (primeCostVal > 65) flagged.push({ label: "Prime Cost", value: `${primeCostVal.toFixed(1)}%`, healthy: "55–65%", severity: "amber" });

    if (gmVal < 55) flagged.push({ label: "Gross Margin", value: `${gmVal.toFixed(1)}%`, healthy: "60–70%", severity: "red" });
    else if (gmVal < 60) flagged.push({ label: "Gross Margin", value: `${gmVal.toFixed(1)}%`, healthy: "60–70%", severity: "amber" });

    if (laborVal > 40) flagged.push({ label: "Labor", value: `${laborVal.toFixed(1)}%`, healthy: "28–35%", severity: "red" });
    else if (laborVal > 35) flagged.push({ label: "Labor", value: `${laborVal.toFixed(1)}%`, healthy: "28–35%", severity: "amber" });

    if (rentVal > 15) flagged.push({ label: "Rent (Occupancy)", value: `${rentVal.toFixed(1)}%`, healthy: "≤10% ideal, 10–15% acceptable", severity: "red" });
    else if (rentVal > 10) flagged.push({ label: "Rent (Occupancy)", value: `${rentVal.toFixed(1)}%`, healthy: "≤10% ideal, 10–15% acceptable", severity: "amber" });

    if (netVal < 0) flagged.push({ label: "Net Margin", value: `${netVal.toFixed(1)}%`, healthy: "Year 1 ≥0%; mature 3–15%", severity: "red" });
  }

  const ratioFlagsBlock = flagged.length > 0
    ? `## Ratios Outside Healthy Benchmark (Year 1) — must address in your bullets\n${flagged
        .map((f) => `- ${f.severity === "red" ? "🔴" : "🟡"} ${f.label}: ${f.value} (healthy: ${f.healthy})`)
        .join("\n")}\n`
    : `## Ratios — all within healthy benchmarks for Year 1.\n`;

  const prompt = `You are a senior coffee shop consultant who has reviewed hundreds of independent coffee shop business plans. You have deep knowledge of industry benchmarks for small-format espresso bars and cafes.

The operator's currency is **${currencyMeta.code} (${currencyMeta.name})**. Any monetary value you cite in your bullets must use this currency — never substitute "$" or "USD" unless the operator's currency code is USD. Quote figures the same way they appear below (e.g. "${fc(50000)}", "${fc(1200000)}").

Review these Year 1 / Year 3 / Year 5 financial projections for a new coffee shop and provide a benchmarked assessment.

## Year 1 Projections (Detailed)
- Revenue: ${fc(year1.revenue)}
- COGS: ${fc(year1.cogs)} → Gross Profit: ${fc(year1.gross_profit)} (${gm1} gross margin)

Operating Expenses:
- Labor: ${fc(year1.labor)} (${laborPct1} of revenue)
- Rent: ${fc(year1.rent)} (${rentPct1} of revenue)
- Marketing: ${fc(year1.marketing)} (${marketingPct1} of revenue)
- Utilities: ${fc(year1.utilities)} (${utilitiesPct1} of revenue)
- Insurance: ${fc(year1.insurance)} (${insurancePct1} of revenue)
- Tech & Software: ${fc(year1.tech)} (${techPct1} of revenue)
- Maintenance + Supplies + Other: ${fc(year1.maintenance + year1.supplies + year1.other_misc)}
- Total Operating Expenses: ${fc(year1.total_opex)} (${totalOpexPct1} of revenue)

- Operating Income: ${fc(year1.operating_income)} (${opIncPct1} of revenue)
- Net Income: ${fc(year1.net_income)} (${netPct1} of revenue)

## Year 3
- Revenue: ${fc(year3.revenue)} | Operating Income: ${fc(year3.operating_income)} | Net Income: ${fc(year3.net_income)}

## Year 5
- Revenue: ${fc(year5.revenue)} | Operating Income: ${fc(year5.operating_income)} | Net Income: ${fc(year5.net_income)}

**Startup Equipment Total:** ${fc(projections.startup_equipment_total)}

${ratioFlagsBlock}
${concept_summary ? `## Concept Context\n${concept_summary}` : ""}

## Industry Benchmarks (independent coffee shops, North America)
- Gross margin: 60–70% healthy; below 55% concerning
- Labor: 28–32% of revenue is typical for a well-run shop; 32–38% is acceptable; above 40% is a red flag
- Rent: under 10% of revenue ideal; 10–15% acceptable; above 15% risky (rent trap)
- Marketing: 1–3% typical; below 0.5% may indicate under-investment
- Utilities: 2–4% typical for an espresso bar
- Operating income: 10–18% is a healthy mature shop; year 1 breakeven or slight loss is normal for a startup
- Net income year 1: small loss or breakeven is realistic; year 3+ should trend toward 8–12%

## Instructions
Return a JSON object with a "bullets" array containing 4–6 items. Each bullet has these fields:
- type: "strength" | "weakness" | "suggestion"
- text: a concise, specific observation (1–2 sentences). Reference the actual numbers and % from the projections above. For any category outside the typical range, call it out explicitly with the actual % and the benchmark range (e.g. "Labor at 45% of revenue is above the typical 28–32% range for a full-service café."). Do NOT be generic.
- recommendation: REQUIRED for "weakness" and "suggestion". OMIT for "strength". One sentence naming what to change to fix it. Be concrete with numbers when possible (e.g. "Raise espresso drink prices by ~7% to drop COGS toward 28% of revenue."). No vague verbs like "consider", "explore", "look into".
- next_step: REQUIRED for "weakness" and "suggestion". OMIT for "strength". One sentence the owner can do this week — a single, named action with a concrete target (e.g. "Update your menu price grid: lattes from ${fc(525)} to ${fc(565)}, cappuccinos from ${fc(475)} to ${fc(510)}."). Quote any currency figures in the operator's currency (${currencyMeta.code}); never substitute USD or "$".
- why: REQUIRED for "weakness" and "suggestion". OMIT for "strength". One short sentence explaining why the recommendation should work (the mechanism — price elasticity, labor leverage, traffic timing, etc.).

Mix: typically 1–2 strengths, 2–3 weaknesses or suggestions. Be direct. Owners need honest feedback, not cheerleading. Never flag a problem without telling the owner exactly what to do about it.

Voice rules:
- Founder voice. Plain English. Direct.
- NEVER use: leverage, synergy, curated, unlock, elevate, embark, delve, journey, actually, genuinely, honestly.
- No emojis. No headings inside any field — these are flat strings.

If any ratios were flagged 🔴 or 🟡 in the "Ratios Outside Healthy Benchmark" block above, at least one bullet MUST address the most severe red flag by name, quote its current value and the healthy range, and recommend a concrete next step (pricing, staffing, supplier change, lease renegotiation, etc.).

Return ONLY the JSON object, no other text.`;

  try {
    const message = await anthropic.messages.create({
      model: PLATFORM_AI_MODEL,
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
    console.error("financials assessment error:", err);
    return Response.json({ error: "AI generation failed" }, { status: 500 });
  }
}
