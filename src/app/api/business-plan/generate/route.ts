// TIM-1037: Business Plan executive summary AI generation — SSE stream.
// Builds a LivePlan-style executive summary from all suite data.
// TIM-1315: per-section quality specs + voice rules.

export const runtime = "nodejs";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSubscriptionActive, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access";
import { loadPlanContext } from "@/lib/plan-context";
import { buildPlanSnapshotForExecutiveSummary, BUSINESS_PLAN_SECTIONS } from "@/lib/business-plan";
import {
  assembleCompanyConcept,
  assembleTargetMarket,
  assembleExecutionOperations,
  assembleExecutionMarketingSales,
  assembleOperationsLaunch,
  assembleTeamHiring,
  assembleFinancialPlan,
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpMenuItem,
  type BpLaunchItem,
  type BpHiringRole,
  toBpMarketingPlanning,
  type BusinessPlanSectionData,
} from "@/lib/business-plan";
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
    .select("subscription_status, subscription_tier, copilot_trial_messages_used, ai_credits_remaining, onboarding_data, beta_waiver_until")
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

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  const reqBody = await request.json().catch(() => ({})) as { sectionKey?: string };
  const sectionKey = reqBody.sectionKey ?? "executive-summary";

  const planId = plan.id;

  const [
    { data: conceptDoc },
    { data: locationRows },
    { data: equipmentRows },
    { data: menuRows },
    { data: launchRows },
    { data: hiringRows },
    { data: marketingDoc },
    { data: financialModel },
  ] = await Promise.all([
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items").select("id, name, cost_usd, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents").eq("plan_id", planId).order("position"),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents, status").eq("plan_id", planId).order("created_at"),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
  ]);

  // TIM-1498: two-level taxonomy autoContent map. Subsections with no assembled
  // source data (Problem & Solution, Competition, Financing) feed an empty
  // string to the prompt so the model writes from the executive snapshot plus
  // founder context only.
  const sections: BusinessPlanSectionData[] = BUSINESS_PLAN_SECTIONS.map((meta) => ({
    key: meta.key,
    title: meta.title,
    sourceLabel: meta.sourceLabel,
    autoContent: ({
      "executive-summary": "",
      "opportunity-problem-solution": "",
      "opportunity-target-market": assembleTargetMarket(conceptDoc?.content),
      "opportunity-competition": "",
      "execution-marketing-sales": assembleExecutionMarketingSales(
        (menuRows ?? []) as BpMenuItem[],
        toBpMarketingPlanning(marketingDoc?.content),
      ),
      "execution-operations": assembleExecutionOperations(
        (locationRows ?? []) as BpLocationCandidate[],
        (equipmentRows ?? []) as BpEquipmentItem[],
        financialModel,
      ),
      "execution-milestones-metrics": assembleOperationsLaunch(
        (launchRows ?? []) as BpLaunchItem[],
      ),
      "company-overview": assembleCompanyConcept(conceptDoc?.content),
      "company-team": assembleTeamHiring((hiringRows ?? []) as BpHiringRole[]),
      "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? []),
      "financial-plan-financing": "",
      "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? []),
      "appendix-monthly-statements": "",
    } as Record<string, string>)[meta.key] ?? "",
    userContent: null,
    isVisible: meta.defaultVisible,
  }));

  const planSnapshot = buildPlanSnapshotForExecutiveSummary(sections);
  const shopName = plan.plan_name ?? "this coffee shop";
  const onboarding = (profile.onboarding_data ?? {}) as Record<string, unknown>;

  // TIM-1418: Pull location from the live tables instead of the frozen
  // onboarding snapshot. Budget / stage live nowhere else, so they stay on
  // onboarding_data for now.
  const planContext = await loadPlanContext(supabase, user.id);

  const targetSection = sections.find((s) => s.key === sectionKey);
  const sectionAutoContent = targetSection?.autoContent ?? "";
  const sectionTitle = targetSection?.title ?? sectionKey;

  const sharedRules = `Voice and style rules:
- Write in the founder's plain voice — direct, confident, operational. Not corporate. Not AI-sounding.
- Coffee-specific vocabulary (espresso, pour-over, daypart, CAM, barista, neighborhood traffic) — never generic restaurant language.
- No em dashes anywhere in the text. Use a regular dash with spaces ( -- ) if you need a pause.
- No AI vocabulary: leverage, unlock, embark, elevate, delve, seamlessly, robust, comprehensive, innovative, holistic, synergy, passionate.
- No filler phrases: "high-quality experience," "welcoming space," "wide variety," "we pride ourselves on," "is committed to."
- Title case for headings and named items (role titles like Opening-Key Barista, equipment names, drink names, place names, persona names). Body prose is sentence case.
- Specific numbers throughout -- not "significant revenue" but the actual dollar figure from the data.
- Return only the section text. No preamble, no labels, no explanation.`;

  // TIM-1498: prompts keyed to the two-level taxonomy.
  const SECTION_SPECS: Record<string, string> = {
    "executive-summary": `Length: 250 to 350 words. Four paragraphs, no bullet lists.
Structure: Paragraph 1 -- what the business is, where it is, when it opens. Paragraph 2 -- who the owner is and why they can do this (specific roles, years, numbers). Paragraph 3 -- the market gap the shop fills (name competitors and say what they do not do). Paragraph 4 -- the money: how much is needed, where it comes from, and what it buys.
Do NOT start with "I" -- start with the shop name or a specific claim.
Any paragraph that could describe any coffee shop is too generic. Reject sentences where the owner name and city could be swapped without changing meaning.`,

    "opportunity-problem-solution": `Length: 250 to 400 words. Three to four paragraphs.
Structure: Paragraph 1 -- the customer problem in concrete terms (who has it, when, where, and what they do today instead). Paragraph 2 -- why that gap exists in this specific catchment (what the existing options miss). Paragraph 3 -- the solution the shop offers and why it directly addresses the problem named in paragraph 1. Paragraph 4 (optional) -- evidence the problem is real (customer conversations, observed traffic patterns, comparable markets).
Name the actual customer behavior. Avoid "we solve the lack of community" or any abstraction that could describe any business. Tie the solution back to the specific problem statement, not a generic value proposition.`,

    "opportunity-target-market": `Length: 400 to 500 words. Four to five paragraphs.
Structure: Paragraph 1 -- the addressable market with specific numbers (population, student enrollment, visitor counts, daytime workers). Paragraphs 2 and 3 -- customer segments: describe two or three buyer types with specific spending behavior, visit frequency, and what they want, not demographic abstractions. Paragraph 4 -- daypart and traffic patterns specific to the location. Paragraph 5 -- any primary research or validation the owner has done.
No broad national market size figures that don't connect to the specific location. Tie every number to the catchment.`,

    "opportunity-competition": `Length: 300 to 450 words. Three to four paragraphs.
Structure: Paragraph 1 -- direct competitors in the catchment area (name each, describe what they actually do, price point, observable traffic). Paragraph 2 -- adjacent competitors (drive-throughs, fast-casual, grocery coffee, work-from-home setups) that absorb the same customer intent. Paragraph 3 -- the specific gap this shop fills that none of them serve. Paragraph 4 (optional) -- competitive risks and how the shop mitigates them.
Name the competitors by name and street. Do not list categories. Be honest about what they do well, then say where they fall short.`,

    "execution-marketing-sales": `Length: 400 to 600 words. Four to six paragraphs covering both the menu/pricing story and the marketing approach.
Structure: Paragraphs 1-2 -- the menu lineup and pricing rationale (name beans, equipment, sourcing partners; explain pricing relative to the local market). Paragraph 3 -- pre-opening marketing strategy. Paragraph 4 -- opening event and its purpose. Paragraphs 5-6 -- ongoing post-opening approach: what the owner does to earn customers and what they deliberately do not do.
This section merges Menu & Pricing with Marketing -- treat them as one go-to-market story. Avoid "high-quality ingredients" and "robust social media presence" -- name the actual products and the actual tactics.`,

    "execution-operations": `Length: 400 to 600 words. Four to six paragraphs covering both location/real estate and equipment.
Structure: Paragraph 1 -- chosen location: address, neighborhood context, why this site. Paragraph 2 -- lease terms (sq ft, monthly rent, per-sq-ft rate, term length, renewal options, abatements). Paragraph 3 -- physical condition of the space and what the build-out entails. Paragraph 4 -- espresso program equipment (name specific machines). Paragraph 5 -- kitchen equipment and production capacity. Paragraph 6 -- service contracts and maintenance reserve.
This section merges Location & Real Estate with Equipment & Supplies. State the actual rent, sq ft, and equipment cost numbers. Explain the reasoning behind major choices, not just what was purchased.`,

    "execution-milestones-metrics": `Length: 300 to 450 words. Three to four paragraphs.
Structure: Paragraph 1 -- overview of the timeline and how many milestones, with the date range. Paragraph 2 -- construction and procurement phase (what has long lead times, what must happen first). Paragraph 3 -- training phase (who trains when, what the readiness bar is). Paragraph 4 -- soft open, public opening, and the operational metrics tracked from day one (transactions per day target, average ticket, opening waste percentage, staff retention through month three).
The timeline should feel like someone who has actually thought through what Tuesday morning looks like. Name the equipment with long lead times. Name the metrics the owner will watch weekly.`,

    "company-overview": `Length: 300 to 450 words. Four to five paragraphs.
Structure: Paragraph 1 -- legal entity, address, physical footprint (sq ft, seats, bar configuration). Paragraph 2 -- the concept origin story (honest account of why the owner built this, not a marketing pitch). Paragraphs 3 and 4 -- what the concept looks like in practice: what the customer does when they walk in, what they order, what the room feels like. Paragraph 5 -- the owner's ongoing operational role.
Describe the actual physical experience. Avoid "community hub," "third place," "gathering space" -- describe the actual room. Avoid "mission is to create" -- say what the space actually contains.`,

    "company-team": `Length: 300 to 450 words. Three to four paragraphs plus a brief org structure list.
Structure: Paragraph 1 -- the owner: specific experience, specific roles held, specific numbers (revenue managed, staff trained, years in the craft). Paragraph 2 -- gaps and how they are being filled (advisors, mentors, hired expertise -- name them). Paragraph 3 -- org structure. A brief list of roles is appropriate here.
State what the owner has actually done and why it is relevant. Name the advisors. Avoid inflated credentials. No vague bio language like "brings extensive experience." No org chart titles that don't reflect actual roles.`,

    "financial-plan-forecast": `Length: 300 to 450 words. Four to five paragraphs of narrative supporting the forecast charts.
Structure: Paragraph 1 -- key assumptions (transactions per day, average ticket, opening hours, FTE staffing, ramp curve). Paragraph 2 -- revenue trajectory by month for year one and why the curve is shaped the way it is. Paragraph 3 -- expense trajectory by month and any step changes. Paragraph 4 -- multi-year net profit outlook (years one through three minimum).
Tie every assumption to a source: comparable shops, observed traffic counts, owner experience. Avoid round-number assumptions without justification.`,

    "financial-plan-financing": `Length: 250 to 400 words. Three to four paragraphs.
Structure: Paragraph 1 -- total ask and what is already committed. Paragraph 2 -- loan details (lender, amount, structure, status of application). Paragraph 3 -- use of proceeds with specific line items. Paragraph 4 -- why this capital structure was chosen over alternatives.
State the actual numbers. Name the lender. Say whether the application is pending or approved. Explain the reasoning behind the capital structure choice.`,

    "financial-plan-statements": `Length: 400 to 600 words. Five to six paragraphs.
Structure: Paragraph 1 -- startup costs: total number with specific breakdown. Paragraph 2 -- revenue model: transactions per day, average ticket, monthly targets for months one, six, and twelve, and where those numbers came from. Paragraph 3 -- cost structure: COGS, payroll, occupancy, other operating costs as percentages of revenue. Paragraph 4 -- gross profit and gross margin trajectory. Paragraph 5 -- path to profitability and breakeven month. Paragraph 6 -- owner compensation and risk acknowledgment.
This section is the narrative summary of the projected P&L, cash flow, and balance sheet. Do not reproduce the full statement tables here (those live in the appendix). Tell the financial story in plain language.`,
  };

  let systemPrompt: string;
  let userMessage: string;
  const sectionSpec = SECTION_SPECS[sectionKey] ?? "";
  const maxTokens = (
    {
      "executive-summary": 900,
      "opportunity-problem-solution": 1000,
      "opportunity-target-market": 1400,
      "opportunity-competition": 1200,
      "execution-marketing-sales": 1600,
      "execution-operations": 1600,
      "execution-milestones-metrics": 1200,
      "company-overview": 1400,
      "company-team": 1200,
      "financial-plan-forecast": 1200,
      "financial-plan-financing": 1000,
      "financial-plan-statements": 1600,
    } as Record<string, number>
  )[sectionKey] ?? 1200;

  if (sectionKey === "executive-summary") {
    systemPrompt = `You are an expert coffee shop business advisor writing an executive summary for a founder's business plan.

${sharedRules}

Section spec:
${sectionSpec}`;

    userMessage = `Write the executive summary for ${shopName}.

Founder context:
- Budget: ${String(onboarding?.budget ?? "not specified")}
- Location: ${planContext.location_country ?? "not specified"}
- Stage: ${String(onboarding?.stage ?? "not specified")}

Plan data:
${planSnapshot || "The founder has not yet filled out the workspaces. Write a two-paragraph placeholder that names what should go in each of the four paragraphs once the plan is filled in. Be direct about what is missing."}`;
  } else {
    systemPrompt = `You are an expert coffee shop business advisor writing the "${sectionTitle}" section of a founder's business plan.

${sharedRules}

Section spec:
${sectionSpec}`;

    userMessage = `Write the "${sectionTitle}" section for ${shopName}.

Assembled plan data for this section:
${sectionAutoContent || "No data assembled yet. Write a two-paragraph placeholder that explains specifically what information the founder needs to add in the relevant workspace, and what this section will cover once that data is provided. Be concrete about what is missing."}`;
  }

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
          max_tokens: maxTokens,
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

        // Spend a credit if paid user
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
