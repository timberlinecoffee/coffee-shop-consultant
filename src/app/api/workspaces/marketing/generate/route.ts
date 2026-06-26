// TIM-1417: AI seed endpoint for a single Marketing planning section.
// Returns the FULL updated marketing document (only the requested section is
// rewritten), so the client can replace state and let autosave persist.
// Pulls concept + onboarding + target opening date as seed context.

export const runtime = "nodejs";
export const maxDuration = 30;

import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { buildAiLanguageDirective, SUPPORTED_LANGUAGES } from "@/lib/account-settings";
import { normalizeAIOutput } from "@/lib/normalize";
import {
  type MarketingDocument,
  type MarketingSectionKey,
  type MarketingChannelEntry,
  type MarketingMilestone,
  MARKETING_SECTION_KEYS,
  MARKETING_CHANNEL_OPTIONS,
  normalizeMarketing,
  titleCaseMarketingFromAI,
} from "@/lib/marketing";
import { normalizeConceptV2 } from "@/lib/concept";

const anthropic = new Anthropic();

function paywallReason(status: string): "no_subscription" | "paused" | "expired" {
  if (status === "cancelled") return "paused";
  if (status === "expired") return "expired";
  return "no_subscription";
}

function isSectionKey(v: unknown): v is MarketingSectionKey {
  return typeof v === "string" && (MARKETING_SECTION_KEYS as string[]).includes(v);
}

function localId(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

interface ConceptSeed {
  shop_identity: string;
  vision: string;
  target_customer: string;
  differentiation: string;
  brand_voice: string;
  location: string;
  offering: string;
  target_opening_date: string | null;
}

function buildConceptBlock(seed: ConceptSeed): string {
  const lines: string[] = [];
  if (seed.shop_identity) lines.push(`- Shop identity: ${seed.shop_identity}`);
  if (seed.vision) lines.push(`- Vision: ${seed.vision}`);
  if (seed.location) lines.push(`- Location: ${seed.location}`);
  if (seed.target_customer) lines.push(`- Target customer: ${seed.target_customer}`);
  if (seed.differentiation) lines.push(`- Differentiation: ${seed.differentiation}`);
  if (seed.brand_voice) lines.push(`- Brand voice: ${seed.brand_voice}`);
  if (seed.offering) lines.push(`- Offering: ${seed.offering}`);
  if (seed.target_opening_date)
    lines.push(`- Target opening date: ${seed.target_opening_date}`);
  return lines.length > 0 ? lines.join("\n") : "- (concept not yet filled in)";
}

const SYSTEM_PROMPT = `You are a marketing consultant helping a coffee shop owner plan how their shop gets known. You are not running campaigns or scheduling posts. You are helping the owner think through their plan.

Voice rules:
- Warm, operational, grounded. Founder voice — like a friend who has done this two or three times.
- No marketing-speak. NEVER use: actually, genuinely, honestly, unlock, elevate, leverage, embark, delve, journey, curated, artisanal, handcrafted, passionate, passionate about coffee.
- No emojis anywhere.
- No em dashes anywhere.
- Title Case for labels (channel names, milestone titles). Sentence case for full sentences (narratives, prompts, notes).
- Be specific, not clever. Real verbs, real neighborhood references, real numbers when relevant.

Output: return ONLY valid JSON matching the requested shape. No preamble, no markdown fences, no trailing text.`;

const SECTION_PROMPTS: Record<MarketingSectionKey, string> = {
  overview: `Generate the OVERVIEW section. Return JSON:
{
  "narrative": string (2-4 short paragraphs, sentence case, owner voice, how this shop plans to get known in the lead-up to opening and after — channels they will lean on, the kind of regular they want to attract, what feels true to the concept and neighborhood. No campaign jargon, no posting schedules.)
}`,
  channels: `Generate the CHANNELS section — the platforms and presences the owner intends to keep up with. Return JSON:
{
  "selected": [
    { "name": Title Case channel name, "notes": sentence case 1-2 sentences explaining why this channel and what kind of moment shows up there }
  ]
}
Rules:
- 3-6 channels max. Pick what an owner can realistically maintain.
- Use channel names from this preset list when applicable: ${MARKETING_CHANNEL_OPTIONS.join(", ")}. Add a custom name only when the preset list does not cover the channel.
- Notes are why-and-what, not a posting plan or cadence.
- Shop-type fit: Instagram, TikTok, Community Events suit full café, espresso bar, and third-wave concepts. LinkedIn suits co-working café and B2B account-driven concepts — include it when the shop serves remote workers or sells to business accounts. Wholesale Outreach suits roaster+retail and roaster concepts — include it when the shop roasts or sells beans wholesale. Skip LinkedIn and Wholesale Outreach for mobile cart and drive-thru unless catering is in scope.`,
  story: `Generate the STORY AND BRAND section. Return JSON:
{
  "founder_story": string (sentence case, 3-5 sentences — how the owner got here, what a customer reading the bio should feel like they know),
  "origin": string (sentence case, 3-5 sentences — why this shop, why this neighborhood, why now),
  "differentiator": string (sentence case, 3-5 sentences — the one or two things competitors cannot easily copy: supplier relationships, people, atmosphere, expertise),
  "target_customer": string (sentence case, 3-5 sentences — the real person the owner is making decisions for, their week, their morning, what brings them in)
}`,
  pre_launch: `Generate the PRE-LAUNCH PLAN section — the small set of marketing milestones between today and a busy opening week. Return JSON:
{
  "milestones": [
    {
      "label": Title Case milestone name (e.g. "Soft Launch For Friends And Family", "Industry Preview Night", "Public Opening Week"),
      "target_date": null,
      "notes": sentence case 1-2 sentences — who is invited, what gets tested, what makes it feel right,
      "completed": false
    }
  ]
}
Rules:
- 4-7 milestones, in the order they happen.
- target_date is null — the owner fills in dates.
- Focus on owner-facing planning milestones, not posting schedules or campaigns.`,
};

function parseAiSection(
  raw: string,
  section: MarketingSectionKey,
): Partial<MarketingDocument> | null {
  try {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;

    if (section === "overview") {
      const narrative =
        typeof obj.narrative === "string" ? normalizeAIOutput(obj.narrative) : "";
      return { overview: { narrative } };
    }

    if (section === "channels") {
      const arr = Array.isArray(obj.selected) ? obj.selected : [];
      const selected: MarketingChannelEntry[] = arr
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const rec = r as Record<string, unknown>;
          const name = typeof rec.name === "string" ? normalizeAIOutput(rec.name) : "";
          const notes =
            typeof rec.notes === "string" ? normalizeAIOutput(rec.notes) : "";
          if (!name) return null;
          return { name, notes };
        })
        .filter((c): c is MarketingChannelEntry => c !== null);
      return { channels: { selected } };
    }

    if (section === "story") {
      const story = {
        founder_story:
          typeof obj.founder_story === "string"
            ? normalizeAIOutput(obj.founder_story)
            : "",
        origin: typeof obj.origin === "string" ? normalizeAIOutput(obj.origin) : "",
        differentiator:
          typeof obj.differentiator === "string"
            ? normalizeAIOutput(obj.differentiator)
            : "",
        target_customer:
          typeof obj.target_customer === "string"
            ? normalizeAIOutput(obj.target_customer)
            : "",
      };
      return { story };
    }

    if (section === "pre_launch") {
      const arr = Array.isArray(obj.milestones) ? obj.milestones : [];
      const milestones: MarketingMilestone[] = arr
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const rec = r as Record<string, unknown>;
          const label =
            typeof rec.label === "string" ? normalizeAIOutput(rec.label) : "";
          if (!label) return null;
          const td = rec.target_date;
          return {
            id: localId(),
            label,
            target_date: typeof td === "string" && td.length > 0 ? td : null,
            notes: typeof rec.notes === "string" ? normalizeAIOutput(rec.notes) : "",
            completed: rec.completed === true,
          };
        })
        .filter((m): m is MarketingMilestone => m !== null);
      return { pre_launch: { milestones } };
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select(
      "subscription_status, beta_waiver_until, target_opening_date, onboarding_data, preferred_language",
    )
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json(
      {
        reason: paywallReason(profile?.subscription_status ?? "free_trial"),
        tier_required: "starter",
      },
      { status: 402 },
    );
  }

  let body: { section?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isSectionKey(body.section)) {
    return Response.json({ error: "Invalid section" }, { status: 400 });
  }
  const section = body.section;

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  const [{ data: doc }, { data: conceptDoc }] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "marketing")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "concept")
      .maybeSingle(),
  ]);

  const current = normalizeMarketing(doc?.content);
  const concept = normalizeConceptV2(conceptDoc?.content);
  const seed: ConceptSeed = {
    shop_identity:
      (plan.plan_name?.trim() ?? "") || concept.components.shop_identity.content,
    vision: concept.components.vision.content,
    target_customer: concept.components.target_customer.content,
    differentiation: concept.components.differentiation.content,
    brand_voice: concept.components.brand_voice.content,
    location: concept.components.location.content,
    offering: concept.components.offering.content,
    target_opening_date: profile?.target_opening_date ?? null,
  };

  const prompt = `${SECTION_PROMPTS[section]}

Shop context:
${buildConceptBlock(seed)}
`;

  let aiText: string;
  try {
    const response = await anthropic.messages.create({
      model: PLATFORM_AI_MODEL,
      max_tokens: 2048,
      system: (() => {
        const rawLang = typeof (profile as { preferred_language?: unknown }).preferred_language === "string" ? (profile as { preferred_language?: string }).preferred_language!.trim().toLowerCase() : "en";
        const lang = SUPPORTED_LANGUAGES.some((l) => l.code === rawLang) ? rawLang : "en";
        const langDir = buildAiLanguageDirective(lang);
        return langDir ? `${SYSTEM_PROMPT}\n\n${langDir}` : SYSTEM_PROMPT;
      })(),
      messages: [{ role: "user", content: prompt }],
    });
    aiText = response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch (err) {
    console.error("[marketing/generate] anthropic error:", err);
    return Response.json({ error: "AI generation failed" }, { status: 502 });
  }

  const parsed = parseAiSection(aiText, section);
  if (!parsed) {
    console.error("[marketing/generate] parse failed, len=", aiText.length);
    return Response.json({ error: "AI response could not be parsed" }, { status: 502 });
  }

  let merged: MarketingDocument = {
    ...current,
    last_generated_at: new Date().toISOString(),
  };
  if (parsed.overview) merged = { ...merged, overview: parsed.overview };
  if (parsed.channels) merged = { ...merged, channels: parsed.channels };
  if (parsed.story) merged = { ...merged, story: parsed.story };
  if (parsed.pre_launch) merged = { ...merged, pre_launch: parsed.pre_launch };

  const titled = titleCaseMarketingFromAI(merged);

  // TIM-2924 Shape C fix: do not persist here. The review modal is the Accept
  // gate; onApply writes via the existing autosave when the user confirms.
  return Response.json({ content: titled });
}
