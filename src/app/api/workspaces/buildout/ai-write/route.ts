// TIM-3242: concept-aware "Write with AI" for Equipment & Supplies.
// Replaces the "Describe your setup" (natural-language-only) flow.
//
// GET  — returns concept richness metadata so the modal can pick Source A vs B.
// POST — generates an equipment list from either:
//   mode="concept" (Source A) — reads the user's Concept Suite outputs directly.
//   mode="prompt"  (Source B) — takes 4 structured fields (floorArea, seatCount,
//                               stationBreakdown, serviceModel) when concept is sparse.
//
// Returns: { rows: ParsedRow[] } — same shape as /api/workspaces/buildout/describe.

export const runtime = "nodejs";
export const maxDuration = 60;

import { z } from "zod";
import { runScoutTurn } from "@/lib/ai/scout-adapter";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import { normalizeAIOutput } from "@/lib/normalize";
import { applyExplicitPrices } from "@/lib/buildout-explicit-price";
import { normalizeConceptV2, formatConceptV2ForAI } from "@/lib/concept";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";
import type { ParsedRow } from "../import/route";

// ── Concept richness threshold ─────────────────────────────────────────────────
// "Rich" = at least 2 of the 4 key concept fields have >= 60 chars of content.
// Below this threshold the modal falls back to Source B (short prompt form).
const RICHNESS_MIN_CHARS = 60;
const RICHNESS_MIN_FIELDS = 2;

type ConceptFields = {
  shopIdentity: string;
  vision: string;
  location: string;
  offering: string;
};

async function loadConceptFields(userId: string): Promise<ConceptFields | null> {
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return null;

  const { data: conceptDoc } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", plan.id)
    .eq("workspace_key", "concept")
    .maybeSingle();

  if (!conceptDoc?.content) return null;

  const normalized = normalizeConceptV2(conceptDoc.content);
  const c = normalized.components;

  return {
    shopIdentity: c.shop_identity?.content?.trim() ?? "",
    vision: c.vision?.content?.trim() ?? "",
    location: c.location?.content?.trim() ?? "",
    offering: c.offering?.content?.trim() ?? "",
  };
}

function isConceptRich(fields: ConceptFields): boolean {
  const richFields = [
    fields.vision,
    fields.location,
    fields.offering,
    fields.shopIdentity,
  ].filter((f) => f.length >= RICHNESS_MIN_CHARS);
  return richFields.length >= RICHNESS_MIN_FIELDS;
}

// ── AI item shape ──────────────────────────────────────────────────────────────

type AiEquipmentItem = {
  name: string;
  station: string;
  category: string;
  brand: string;
  quantity: number;
  unit_cost_cents: number;
  price_band: string;
  notes: string;
};

// ── Shared AI prompt ───────────────────────────────────────────────────────────

const ITEM_SCHEMA_INSTRUCTIONS = `Return a structured equipment list grouped by station. For each item:

- name: equipment item name. Title Case every word. Acronyms ALL CAPS: EK43, WDT, RDT, PID, POS, HVAC, LED, PUQpress, VST, IMS, NSF. No model numbers in the name unless they are the common name.
- station: assign to exactly one of these stations: "Espresso Bar", "Pour Over / Manual Brew", "Batch Brew", "Cold Beverage", "Point of Sale / Cashier", "Front of House / Service", "Kitchen / Food Prep", "Back of House", "Furniture & Seating", "Decor & Ambiance", "Smallwares", "Cleaning & Sanitation"
- category: one of espresso_station, brew_platform, milk_beverage_prep, refrigeration, plumbing_water, electrical, pos_tech, furniture_fixtures, signage_decor, smallwares, ceramics, glassware, to_go_ware, miscellaneous
- brand: brand name if mentioned or strongly implied. Title Case. Empty string if unknown.
- quantity: integer (default 1).
- unit_cost_cents: integer cents. Use realistic specialty coffee market prices. 0 if truly unknown.
- price_band: one of "budget", "mid", "premium", "luxury". Use "" if not relevant.
- notes: any relevant notes. Empty string if none.

Rules:
- Include equipment appropriate for the described shop type, service model, and scale.
- Infer supporting equipment (knock box, portafilters, steam pitchers for an espresso bar, etc.).
- Do NOT include items unrelated to the setup.
- No emojis, no hedging, no preamble.

Return ONLY valid JSON — no markdown, no explanation:
{
  "items": [
    {
      "name": "...",
      "station": "...",
      "category": "...",
      "brand": "...",
      "quantity": 1,
      "unit_cost_cents": 0,
      "price_band": "",
      "notes": ""
    }
  ]
}`;

// ── GET — concept richness check ───────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const fields = await loadConceptFields(user.id);
  if (!fields) {
    return Response.json({ conceptRich: false, fields: null });
  }

  return Response.json({
    conceptRich: isConceptRich(fields),
    fields,
  });
}

// ── POST — generate equipment list ─────────────────────────────────────────────

const PostBodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("concept") }),
  z.object({
    mode: z.literal("prompt"),
    floorArea: z.string().max(500).default(""),
    seatCount: z.string().max(500).default(""),
    stationBreakdown: z.string().max(500).default(""),
    serviceModel: z.string().max(500).default(""),
  }),
]);

type PostBody = z.infer<typeof PostBodySchema>;

export async function POST(request: NextRequest) {
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

  // Rule 4: rate-limit every endpoint that calls a paid AI API.
  const rl = await rateLimit({
    bucket: "buildout:ai-write",
    id: user.id,
    limit: 10,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimitedResponse(rl);

  // Rule 3: validate and cap all user-supplied fields before touching AI or DB.
  let body: PostBody;
  try {
    const raw = await request.json();
    const parsed = PostBodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Build the context block ──────────────────────────────────────────────────

  let setupContext: string;

  if (body.mode === "concept") {
    const fields = await loadConceptFields(user.id);
    if (!fields) {
      return Response.json(
        { error: "No concept data found. Fill in your Concept Suite first." },
        { status: 422 }
      );
    }
    if (!isConceptRich(fields)) {
      return Response.json(
        { error: "Concept data is too sparse. Add more detail to Location and Offering." },
        { status: 422 }
      );
    }

    // Also load the full formatted concept for richer AI context.
    const { data: plan } = await supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let fullConceptSnippet = "";
    if (plan) {
      const { data: conceptDoc } = await supabase
        .from("workspace_documents")
        .select("content")
        .eq("plan_id", plan.id)
        .eq("workspace_key", "concept")
        .maybeSingle();
      if (conceptDoc?.content) {
        const normalized = normalizeConceptV2(conceptDoc.content);
        const formatted = formatConceptV2ForAI(normalized);
        if (formatted && !formatted.includes("no concept fields")) {
          fullConceptSnippet = formatted;
        }
      }
    }

    setupContext = `## Shop concept\n${fullConceptSnippet || [
      fields.shopIdentity && `Shop identity: ${fields.shopIdentity}`,
      fields.vision && `Vision: ${fields.vision}`,
      fields.location && `Location & physical setup: ${fields.location}`,
      fields.offering && `Offering: ${fields.offering}`,
    ].filter(Boolean).join("\n")}`;
  } else {
    const { floorArea, seatCount, stationBreakdown, serviceModel } = body;

    const parts: string[] = [];
    if (floorArea?.trim()) parts.push(`Floor area: ${floorArea.trim()}`);
    if (seatCount?.trim()) parts.push(`Seating: ${seatCount.trim()} seats`);
    if (serviceModel?.trim()) parts.push(`Service model: ${serviceModel.trim()}`);
    if (stationBreakdown?.trim()) parts.push(`Station breakdown: ${stationBreakdown.trim()}`);

    if (parts.length === 0) {
      return Response.json(
        { error: "At least one prompt field is required." },
        { status: 400 }
      );
    }

    setupContext = `## Shop setup\n${parts.join("\n")}`;
  }

  const prompt = `You are building an equipment list for a coffee shop.

${setupContext}

## Your task

${ITEM_SCHEMA_INSTRUCTIONS}`;

  let aiItems: AiEquipmentItem[];
  try {
    const result = await runScoutTurn({
      lane: "buildout_describe",
      systemBlocks: [],
      messages: [{ role: "user", content: prompt }],
      maxTokens: 8192,
      userId: user.id,
      routeTag: "/api/workspaces/buildout/ai-write",
    });

    const clean = result.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(clean) as { items?: AiEquipmentItem[] };
    aiItems = parsed.items ?? [];
  } catch (err) {
    console.error("AI ai-write error:", err);
    return Response.json(
      { error: "AI generation failed. Please try again." },
      { status: 500 }
    );
  }

  const rows: ParsedRow[] = aiItems.map((item, i) => ({
    _id: String(i),
    name: toTitleCase(item.name ?? ""),
    section_name: item.station ?? "Smallwares",
    vendor: toTitleCase(item.brand ?? ""),
    model: "",
    supplier: "",
    quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1,
    unit_cost_cents:
      typeof item.unit_cost_cents === "number" ? Math.round(item.unit_cost_cents) : 0,
    notes: normalizeAIOutput(
      [item.notes, item.price_band ? `Price band: ${item.price_band}` : ""]
        .filter(Boolean)
        .join(" · ")
    ),
    category: item.category ?? "miscellaneous",
    skip: false,
  }));

  // Re-bind any explicit prices from Source B prompt text.
  const descriptionForPriceGuard =
    body.mode === "prompt"
      ? [body.floorArea, body.seatCount, body.stationBreakdown, body.serviceModel]
          .filter(Boolean)
          .join(" ")
      : "";

  const guardedRows = descriptionForPriceGuard
    ? applyExplicitPrices(descriptionForPriceGuard, rows)
    : rows;

  return Response.json({ rows: guardedRows });
}
