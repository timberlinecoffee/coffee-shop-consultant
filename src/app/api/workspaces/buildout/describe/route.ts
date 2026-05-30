// TIM-1177: Section G — natural-language description → structured equipment list.
// POST /api/workspaces/buildout/describe
// Body: { description: string; includeConceptContext?: boolean }
// Returns: { rows: ParsedRow[] }

export const runtime = "nodejs";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import { normalizeAIOutput } from "@/lib/normalize";
import { normalizeConceptV2, formatConceptV2ForAI } from "@/lib/concept";
import type { NextRequest } from "next/server";
import type { ParsedRow } from "../import/route";

// ── AI row shape returned by the model ───────────────────────────────────────

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

// ── Handler ───────────────────────────────────────────────────────────────────

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

  let body: { description?: string; includeConceptContext?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const description = (body.description ?? "").trim();
  if (!description) {
    return Response.json({ error: "description is required" }, { status: 400 });
  }
  if (description.length > 4000) {
    return Response.json({ error: "Description too long (max 4000 characters)" }, { status: 400 });
  }

  // Optionally load concept context
  let conceptSnippet = "";
  if (body.includeConceptContext) {
    const { data: plan } = await supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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
          conceptSnippet = formatted;
        }
      }
    }
  }

  const conceptSection = conceptSnippet
    ? `\n\n## Concept context (use to inform station selection and quantities)\n${conceptSnippet}`
    : "";

  const prompt = `You are building an equipment list for a coffee shop buildout.

## Setup description
${description}${conceptSection}

## Your task

Return a structured equipment list grouped by station. For each item:

- name: equipment item name. Title Case every word. Acronyms ALL CAPS: EK43, WDT, RDT, PID, POS, HVAC, LED, PUQpress, VST, IMS, NSF. No model numbers in the name unless they are the common name.
- station: assign to exactly one of these stations: "Espresso Bar", "Pour Over / Manual Brew", "Batch Brew", "Cold Beverage", "Point of Sale / Cashier", "Front of House / Service", "Kitchen / Food Prep", "Back of House", "Furniture & Seating", "Decor & Ambiance", "Smallwares", "Cleaning & Sanitation"
- category: one of espresso_station, brew_platform, milk_beverage_prep, refrigeration, plumbing_water, electrical, pos_tech, furniture_fixtures, signage_decor, smallwares, ceramics, glassware, to_go_ware, miscellaneous
- brand: brand name if mentioned or strongly implied (e.g. "La Marzocco" from "Linea PB"). Title Case. Empty string if unknown.
- quantity: integer (default 1). Use context clues — "two-group" implies 1 machine; "two EK43" implies 2.
- unit_cost_cents: integer cents. Use realistic market prices for specialty coffee equipment. 0 if truly unknown.
- price_band: one of "budget", "mid", "premium", "luxury" based on the item. Use "" if not relevant.
- notes: any relevant notes (PID mod, custom order, etc.). Empty string if none.

Rules:
- Include all items explicitly mentioned in the description.
- Infer obvious supporting equipment (e.g. a two-group La Marzocco implies a knock box, portafilters, steam pitchers — add them under the same station).
- Do NOT include items unrelated to the described setup.
- Do NOT add items that were not mentioned or strongly implied.
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

  const client = new Anthropic();

  let aiItems: AiEquipmentItem[];
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(clean) as { items?: AiEquipmentItem[] };
    aiItems = parsed.items ?? [];
  } catch (err) {
    console.error("AI describe error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 }
    );
  }

  // Map to ParsedRow shape (reuses import/commit pipeline)
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
    notes: normalizeAIOutput([item.notes, item.price_band ? `Price band: ${item.price_band}` : ""]
      .filter(Boolean)
      .join(" · ")),
    category: item.category ?? "miscellaneous",
    skip: false,
  }));

  return Response.json({ rows });
}
