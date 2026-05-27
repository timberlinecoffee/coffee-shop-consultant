// TIM-1060: AI-generate per-section content for the Marketing & Pre-Launch workspace.
// Non-streaming JSON endpoint — merges generated content into the existing document
// and persists, applying toTitleCase() at the boundary for label-shaped fields.

export const runtime = "nodejs";
export const maxDuration = 45;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import {
  normalizeMarketingPreLaunch,
  titleCaseAiPayload,
  type MarketingPreLaunchDocument,
  type SocialPostIdea,
  type PressContact,
} from "@/lib/marketing-pre-launch";

const anthropic = new Anthropic();

type SectionKey = "waitlist" | "gbp" | "social" | "opening_promo" | "press";

const SECTION_PROMPTS: Record<SectionKey, string> = {
  waitlist: `Generate waitlist content for a pre-launch coffee shop. Return ONLY valid JSON with these keys:
{
  "landing_headline": string (Title Case, 6-10 words, calm and specific — no superlatives),
  "landing_copy": string (sentence case, 2-3 sentences, founder voice, no marketing-speak),
  "early_bird_offer": string (Title Case, 3-6 words, concrete and redeemable),
  "signup_goal": string (concrete number tied to neighborhood size, e.g. "500 emails before opening")
}`,
  gbp: `Generate Google Business Profile launch notes for a pre-launch coffee shop. Return ONLY valid JSON:
{
  "primary_category": "Coffee Shop",
  "notes": string (sentence case, 3-5 sentences, listing specifics worth tracking — category choices, photo plan, common pitfalls for this concept)
}`,
  social: `Generate social setup content for a pre-launch coffee shop. Return ONLY valid JSON:
{
  "bio_template": string (3 short lines separated by newlines — what / where / link),
  "cadence": string (Title Case, e.g. "3 Posts Per Week, Mondays Wednesdays Fridays"),
  "first_12_posts": array of exactly 12 objects with {label: Title Case 2-4 words, caption: sentence case 1-2 sentences, format: one of "Photo" | "Reel" | "Story" | "Carousel"}
}`,
  opening_promo: `Generate opening-day promo content for a pre-launch coffee shop. Return ONLY valid JSON:
{
  "promo_idea": string (Title Case, 4-8 words, concrete and easy to staff),
  "mechanic": string (sentence case, 2-3 sentences, exact register flow),
  "target_reach": string (specific number with rationale, e.g. "200 customers through the door on day one"),
  "partner_crosspromo": string (one neighborhood-business idea per line, 3-5 lines total, what they get + what they give)
}`,
  press: `Generate a press list for a pre-launch coffee shop. Return ONLY valid JSON:
{
  "contacts": array of 6-10 objects with {
    name: Title Case (realistic placeholder like "Local Food Editor"),
    outlet: Title Case (placeholder neighborhood publication),
    role: Title Case ("Food Reporter", "Neighborhood Blogger", "Podcast Host"),
    contact: string (empty — founder fills in),
    angle: string (sentence case, one sentence pitch unique to this contact),
    send_by: null,
    contacted: false
  }
}`,
};

const SYSTEM_PROMPT = `You are an expert pre-launch marketing consultant for independent coffee shops.

Voice rules:
- Warm, operational, grounded. Founder voice — like a friend who's done it three times.
- No marketing-speak. NEVER use: actually, genuinely, honestly, unlock, elevate, leverage, embark, delve, journey, curated, artisanal, handcrafted.
- No emojis anywhere.
- Title Case for labels (every word capitalized except articles/short prepositions). Sentence case for full copy.
- Be specific, not clever. Real numbers, real neighborhood references, real verbs.

Output: return ONLY valid JSON matching the requested shape — no preamble, no markdown fences, no trailing text.`;

function paywallReason(status: string): "no_subscription" | "paused" | "expired" {
  if (status === "cancelled") return "paused";
  if (status === "expired") return "expired";
  return "no_subscription";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until, onboarding_data")
    .eq("id", user.id)
    .single();
  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json(
      { reason: paywallReason(profile?.subscription_status ?? "free_trial"), tier_required: "starter" },
      { status: 402 },
    );
  }

  let body: { section?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const section = body.section as SectionKey | undefined;
  if (!section || !(section in SECTION_PROMPTS)) {
    return Response.json({ error: "Invalid section" }, { status: 400 });
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });
  const planId = plan.id;

  const [
    { data: existingDoc },
    { data: conceptDoc },
  ] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "marketing_pre_launch")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
  ]);

  const current = normalizeMarketingPreLaunch(existingDoc?.content);

  const onboarding = (profile.onboarding_data ?? {}) as Record<string, unknown>;
  const conceptContent = conceptDoc?.content as Record<string, unknown> | null;
  const components =
    (conceptContent?.components as Record<string, { content: string }> | null) ?? null;
  const shopIdentity = components?.shop_identity?.content ?? "";
  const brandVoice = components?.brand_voice?.content ?? "";

  const contextLines = [
    `Shop location: ${String(onboarding.location ?? "not specified")}`,
    `Shop format: ${String(onboarding.shop_type ?? "not specified")}`,
    `Stage: ${String(onboarding.stage ?? "not specified")}`,
  ];
  if (shopIdentity) contextLines.push(`Shop identity: ${shopIdentity}`);
  if (brandVoice) contextLines.push(`Brand voice: ${brandVoice}`);

  const userPrompt = `## Context\n${contextLines.join("\n")}\n\n## Task\n${SECTION_PROMPTS[section]}`;

  let aiText: string;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const firstBlock = response.content[0];
    if (firstBlock.type !== "text") {
      return Response.json({ error: "Unexpected AI response" }, { status: 502 });
    }
    aiText = firstBlock.text;
  } catch (err) {
    console.error("[marketing_pre_launch/generate] anthropic error:", err);
    return Response.json({ error: "AI generation failed" }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    const cleaned = aiText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[marketing_pre_launch/generate] JSON parse failed:", aiText.slice(0, 400));
    return Response.json({ error: "AI returned invalid JSON" }, { status: 502 });
  }

  const merged = mergeSection(current, section, parsed);
  const titleCased = titleCaseAiPayload(merged);

  const { error: upsertErr } = await supabase
    .from("workspace_documents")
    .upsert(
      { plan_id: planId, workspace_key: "marketing_pre_launch", content: titleCased },
      { onConflict: "plan_id,workspace_key" },
    );

  if (upsertErr) {
    console.error("[marketing_pre_launch/generate] upsert error:", upsertErr);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }

  return Response.json({ content: titleCased });
}

function mergeSection(
  current: MarketingPreLaunchDocument,
  section: SectionKey,
  payload: Record<string, unknown>,
): MarketingPreLaunchDocument {
  switch (section) {
    case "waitlist": {
      return {
        ...current,
        waitlist: {
          ...current.waitlist,
          landing_headline: pickStr(payload.landing_headline, current.waitlist.landing_headline),
          landing_copy: pickStr(payload.landing_copy, current.waitlist.landing_copy),
          early_bird_offer: pickStr(payload.early_bird_offer, current.waitlist.early_bird_offer),
          signup_goal: pickStr(payload.signup_goal, current.waitlist.signup_goal),
        },
      };
    }
    case "gbp": {
      return {
        ...current,
        gbp: {
          ...current.gbp,
          primary_category: pickStr(payload.primary_category, current.gbp.primary_category),
          notes: pickStr(payload.notes, current.gbp.notes),
        },
      };
    }
    case "social": {
      const postsRaw = Array.isArray(payload.first_12_posts) ? payload.first_12_posts : [];
      const first_12_posts: SocialPostIdea[] = postsRaw
        .slice(0, 12)
        .map((p): SocialPostIdea | null => {
          if (!p || typeof p !== "object") return null;
          const r = p as Record<string, unknown>;
          const fmt = typeof r.format === "string" ? r.format : "Photo";
          const format = (["Photo", "Reel", "Story", "Carousel"] as const).includes(
            fmt as SocialPostIdea["format"],
          )
            ? (fmt as SocialPostIdea["format"])
            : "Photo";
          return { label: pickStr(r.label, ""), caption: pickStr(r.caption, ""), format };
        })
        .filter((p): p is SocialPostIdea => p !== null);
      return {
        ...current,
        social: {
          ...current.social,
          bio_template: pickStr(payload.bio_template, current.social.bio_template),
          cadence: pickStr(payload.cadence, current.social.cadence),
          first_12_posts: first_12_posts.length > 0 ? first_12_posts : current.social.first_12_posts,
        },
      };
    }
    case "opening_promo": {
      return {
        ...current,
        opening_promo: {
          promo_idea: pickStr(payload.promo_idea, current.opening_promo.promo_idea),
          mechanic: pickStr(payload.mechanic, current.opening_promo.mechanic),
          target_reach: pickStr(payload.target_reach, current.opening_promo.target_reach),
          partner_crosspromo: pickStr(payload.partner_crosspromo, current.opening_promo.partner_crosspromo),
        },
      };
    }
    case "press": {
      const contactsRaw = Array.isArray(payload.contacts) ? payload.contacts : [];
      const contacts: PressContact[] = contactsRaw
        .map((c): PressContact | null => {
          if (!c || typeof c !== "object") return null;
          const r = c as Record<string, unknown>;
          return {
            id: `ai_${Math.random().toString(36).slice(2, 10)}`,
            name: pickStr(r.name, ""),
            outlet: pickStr(r.outlet, ""),
            role: pickStr(r.role, ""),
            contact: pickStr(r.contact, ""),
            angle: pickStr(r.angle, ""),
            send_by: null,
            contacted: false,
          };
        })
        .filter((c): c is PressContact => c !== null);
      return {
        ...current,
        press: { contacts: [...current.press.contacts, ...contacts] },
      };
    }
  }
}

function pickStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
