// TIM-1037: Business Plan executive summary AI generation — SSE stream.
// Builds a LivePlan-style executive summary from all suite data.

export const runtime = "nodejs";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSubscriptionActive, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access";
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
  type BpMarketingBrand,
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
    { data: marketingBrandRow },
    { data: financialModel },
  ] = await Promise.all([
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items").select("id, name, cost_usd, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents").eq("plan_id", planId).order("position"),
    supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents, status").eq("plan_id", planId).order("created_at"),
    supabase.from("marketing_brand").select("positioning_statement, brand_pillar_1, brand_pillar_2, brand_pillar_3").eq("plan_id", planId).maybeSingle(),
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
      marketing_plan: assembleMarketingPlan(marketingBrandRow as BpMarketingBrand | null),
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

  const targetSection = sections.find((s) => s.key === sectionKey);
  const sectionAutoContent = targetSection?.autoContent ?? "";
  const sectionTitle = targetSection?.title ?? sectionKey;

  const sharedRules = `Rules:
- Coffee-specific vocabulary (espresso, pour-over, daypart, CAM, barista, neighborhood traffic) — never generic restaurant language
- No filler phrases, no AI jargon, no buzzwords
- Title case for headings only — body text is sentence case
- No em dashes anywhere
- Do NOT use the word "passionate" or "passionate about coffee"
- Return only the section text, no preamble, no labels`;

  let systemPrompt: string;
  let userMessage: string;

  if (sectionKey === "executive_summary") {
    systemPrompt = `You are an expert coffee shop business advisor writing an executive summary for a founder's business plan. Write in the founder's plain voice — direct, confident, operational. Not corporate. Not AI-sounding.

${sharedRules}
- 3–5 tight paragraphs covering: the concept, the market, the opportunity, a brief financial picture, and the ask (if applicable)
- Write as if the founder is speaking to a bank or investor who has 90 seconds
- Do NOT start with "I" — start with the shop name or a specific claim`;

    userMessage = `Write the executive summary for ${shopName}.

Founder context:
- Budget: ${String(onboarding?.budget ?? "not specified")}
- Location: ${String(onboarding?.location ?? "not specified")}
- Stage: ${String(onboarding?.stage ?? "not specified")}

Plan data:
${planSnapshot || "The founder has not yet filled out the suites. Write a brief placeholder that says what should go here once the plan is filled in."}`;
  } else {
    systemPrompt = `You are an expert coffee shop business advisor writing the "${sectionTitle}" section of a founder's business plan. Write in the founder's plain voice — direct, confident, operational.

${sharedRules}
- 2–4 paragraphs appropriate for this section type
- Use the assembled plan data provided; do not invent numbers or specifics
- If the data is sparse, write a useful placeholder that explains what the founder should add`;

    userMessage = `Write the "${sectionTitle}" section for ${shopName}.

Assembled plan data for this section:
${sectionAutoContent || "No data assembled yet. Write a useful placeholder explaining what should go in this section once the relevant workspace is filled in."}`;
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
          max_tokens: 1024,
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
