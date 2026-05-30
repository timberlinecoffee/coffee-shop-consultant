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
  assembleMarketAnalysis,
  assembleLocationSection,
  assembleBuildoutEquipment,
  assembleMenuPricing,
  assembleMarketingPlan,
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
  const sectionKey = reqBody.sectionKey ?? "executive_summary";

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

  const sections: BusinessPlanSectionData[] = BUSINESS_PLAN_SECTIONS.map((meta) => ({
    key: meta.key,
    title: meta.title,
    sourceLabel: meta.sourceLabel,
    autoContent: {
      company_concept: assembleCompanyConcept(conceptDoc?.content),
      market_analysis: assembleMarketAnalysis(conceptDoc?.content),
      location_real_estate: assembleLocationSection((locationRows ?? []) as BpLocationCandidate[]),
      buildout_equipment: assembleBuildoutEquipment((equipmentRows ?? []) as BpEquipmentItem[], financialModel),
      menu_pricing: assembleMenuPricing((menuRows ?? []) as BpMenuItem[]),
      marketing_plan: assembleMarketingPlan(toBpMarketingPlanning(marketingDoc?.content)),
      operations_launch: assembleOperationsLaunch((launchRows ?? []) as BpLaunchItem[]),
      team_hiring: assembleTeamHiring((hiringRows ?? []) as BpHiringRole[]),
      financial_plan: assembleFinancialPlan(financialModel, equipmentRows ?? []),
      executive_summary: "",
      funding_request: "",
    }[meta.key] ?? "",
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

  const SECTION_SPECS: Record<string, string> = {
    executive_summary: `Length: 250 to 350 words. Four paragraphs, no bullet lists.
Structure: Paragraph 1 -- what the business is, where it is, when it opens. Paragraph 2 -- who the owner is and why they can do this (specific roles, years, numbers). Paragraph 3 -- the market gap the shop fills (name competitors and say what they do not do). Paragraph 4 -- the money: how much is needed, where it comes from, and what it buys.
Do NOT start with "I" -- start with the shop name or a specific claim.
Any paragraph that could describe any coffee shop is too generic. Reject sentences where the owner name and city could be swapped without changing meaning.`,

    company_concept: `Length: 300 to 450 words. Four to five paragraphs.
Structure: Paragraph 1 -- legal entity, address, physical footprint (sq ft, seats, bar configuration). Paragraph 2 -- the concept origin story (honest account of why the owner built this, not a marketing pitch). Paragraphs 3 and 4 -- what the concept looks like in practice: what the customer does when they walk in, what they order, what the room feels like. Paragraph 5 -- the owner's ongoing operational role.
Describe the actual physical experience. Avoid "community hub," "third place," "gathering space" -- describe the actual room. Avoid "mission is to create" -- say what the space actually contains.`,

    market_analysis: `Length: 400 to 500 words. Four to five paragraphs.
Structure: Paragraph 1 -- the addressable market with specific numbers (population, student enrollment, visitor counts, daytime workers). Paragraph 2 -- competitive landscape: name the competitors, describe what they actually do, and say where the gap is. Paragraphs 3 and 4 -- customer segments: describe two or three buyer types with specific spending behavior and visit frequency, not demographic abstractions. Paragraph 5 -- any primary research or validation the owner has done.
No broad national market size figures that don't connect to the specific location. Name the competitors. Say what they do not do.`,

    location_real_estate: `Length: 250 to 400 words. Three to four paragraphs.
Structure: Paragraph 1 -- address, neighborhood context, why this location. Paragraph 2 -- lease terms (sq ft, monthly rent, per-sq-ft rate, term length, renewal options, abatements, annual increase caps). Paragraph 3 -- physical condition and what the build-out entails. Paragraph 4 -- other sites considered and why this one won.
State the actual rent and sq ft numbers. Say who reviewed the lease. Describe the actual condition of the space.`,

    buildout_equipment: `Length: 250 to 400 words. Three to four paragraphs with a brief list acceptable for major equipment.
Structure: Paragraph 1 -- total budget and what it covers. Paragraph 2 -- espresso program equipment (name the specific machines). Paragraph 3 -- kitchen equipment and capacity. Paragraph 4 -- service contracts and maintenance reserve.
Name the specific equipment models. State actual costs. Explain the reasoning behind major equipment choices -- not just what was purchased but why.`,

    menu_pricing: `Length: 300 to 450 words. Three to four paragraphs.
Structure: Two paragraphs on the product lineup and why the menu is sized the way it is. One paragraph on pricing rationale. One paragraph on the food program (or secondary revenue).
Name what the ingredients actually are. Name the equipment and the sourcing partners. Say where the beans come from. Avoid "high-quality ingredients" -- say what the ingredients are. Avoid "we pride ourselves on" anything.`,

    marketing_plan: `Length: 300 to 450 words. Three to four paragraphs.
Structure: Paragraph 1 -- pre-opening strategy (what happens in the months before opening). Paragraph 2 -- opening event and its purpose. Paragraphs 3 and 4 -- ongoing approach after opening (what the owner actually does to earn customers, and what she deliberately does not do and why).
No bullet lists of "we will post on social media three times per week" without explaining the strategy. Explain the specific approach and the reasoning. No "robust social media presence" without saying what specifically will be done.`,

    operations_launch: `Length: 300 to 450 words. Three to four paragraphs.
Structure: Paragraph 1 -- overview of the timeline and how many milestones, with the date range. Paragraph 2 -- construction and procurement phase (what has long lead times, what must happen first). Paragraph 3 -- training phase (who trains when, what the readiness bar is). Paragraph 4 -- soft open and public opening.
The timeline should feel like someone who has actually thought through what Tuesday morning looks like. Name the equipment with long lead times. Say when training starts and what the readiness criteria are.`,

    team_hiring: `Length: 300 to 450 words. Three to four paragraphs plus a brief org structure list.
Structure: Paragraph 1 -- the owner: specific experience, specific roles held, specific numbers (revenue managed, staff trained, years in the craft). Paragraph 2 -- gaps and how they are being filled (advisors, mentors, hired expertise -- name them). Paragraph 3 -- org structure. A brief list of roles is appropriate here.
State what the owner has actually done and why it is relevant. Name the advisors. Avoid inflated credentials. No vague bio language like "brings extensive experience." No org chart titles that don't reflect actual roles.`,

    financial_plan: `Length: 400 to 600 words. Five to six paragraphs.
Structure: Paragraph 1 -- startup costs: total number with specific breakdown. Paragraph 2 -- funding sources: how much from each source, the structure of each (loan vs. equity vs. subordinated debt), and current status. Paragraph 3 -- revenue model: transactions per day, average ticket, monthly targets for months one, six, and twelve, and where those numbers came from. Paragraph 4 -- cost structure: COGS, payroll, occupancy, other operating costs as percentages of revenue. Paragraph 5 -- path to profitability and breakeven month. Paragraph 6 -- owner compensation and risk acknowledgment.
This section explains assumptions and tells the financial story in plain language. Do not reproduce the financial model in prose -- summarize the logic. Be honest about risk. Show that the owner understands the math.`,

    funding_request: `Length: 250 to 400 words. Three to four paragraphs.
Structure: Paragraph 1 -- total ask and what is already committed. Paragraph 2 -- loan details (lender, amount, structure, status of application). Paragraph 3 -- use of proceeds with specific line items. Paragraph 4 -- why this capital structure was chosen over alternatives.
State the actual numbers. Name the lender. Say whether the application is pending or approved. Explain the reasoning behind the capital structure choice.`,
  };

  let systemPrompt: string;
  let userMessage: string;
  const sectionSpec = SECTION_SPECS[sectionKey] ?? "";
  const maxTokens = (
    { financial_plan: 1600, market_analysis: 1400, operations_launch: 1200, team_hiring: 1200,
      company_concept: 1400, menu_pricing: 1200, marketing_plan: 1200, location_real_estate: 1000,
      buildout_equipment: 1000, funding_request: 1000, executive_summary: 900 } as Record<string, number>
  )[sectionKey] ?? 1200;

  if (sectionKey === "executive_summary") {
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
