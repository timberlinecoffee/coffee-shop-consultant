// TIM-1179: Section H — AI equipment recommendations + referral matching.
// POST /api/workspaces/buildout/recommendations
// Body: { items: { id: string; name: string; category: string; station?: string }[] }
// Returns: EquipmentRecommendation[]

export const runtime = "nodejs";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { normalizeConceptV2, formatConceptV2ForAI } from "@/lib/concept";
import type { NextRequest } from "next/server";
import type { EquipmentRecommendation, EquipmentReferral } from "@/types/referral";

type InputItem = {
  id: string;
  name: string;
  category: string;
  station?: string;
};

type AiRecommendation = {
  item_id: string;
  recommended_brand: string;
  recommended_model: string;
  estimated_price_cents: number;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();

  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  let body: { items?: InputItem[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json([], { status: 200 });
  }

  // Cap to 30 items per call to keep AI response predictable
  const capped = items.slice(0, 30);

  // Load plan
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Load concept context
  let conceptSnippet = "";
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

    // Also read total equipment spend as budget signal
    if (!conceptSnippet) {
      const { data: model } = await supabase
        .from("financial_models")
        .select("startup_costs")
        .eq("plan_id", plan.id)
        .maybeSingle();

      if (model?.startup_costs) {
        const costs = model.startup_costs as Record<string, unknown>;
        const total = typeof costs.total_equipment_cents === "number" ? costs.total_equipment_cents : 0;
        if (total > 0) {
          const band = total < 2000000 ? "budget (under $20k)" :
                       total < 5000000 ? "mid-range ($20k–$50k)" :
                       total < 15000000 ? "premium ($50k–$150k)" : "luxury (over $150k)";
          conceptSnippet = `Equipment budget tier: ${band}`;
        }
      }
    }
  }

  const conceptSection = conceptSnippet
    ? `\n\nShop context (use to calibrate recommendations):\n${conceptSnippet}`
    : "";

  const itemList = capped
    .map((i) => `- id: "${i.id}" | name: "${i.name}" | category: ${i.category}${i.station ? ` | station: ${i.station}` : ""}`)
    .join("\n");

  const prompt = `You are a specialty coffee equipment consultant recommending specific products for a coffee shop buildout.

## Equipment items to recommend for
${itemList}${conceptSection}

## Task
For each item, recommend ONE specific make and model that fits a specialty coffee shop. Base recommendations on:
- The item name and category
- The shop context above (budget tier, aesthetic, service model) — if not provided, default to a quality mid-range specialty coffee shop
- Real products available on the market as of 2024

Rules:
- Recommend what is genuinely right for the shop — do not recommend luxury gear for a budget shop
- No emojis, no hedging language, no preamble
- If the item is already a specific model (has a brand in the name), still provide a recommendation as a "considered alternative"
- Prices should be realistic USD retail prices in cents
- Acronyms ALL CAPS: EK43, PID, WDT, RDT

Return ONLY valid JSON, no markdown:
{
  "recommendations": [
    {
      "item_id": "...",
      "recommended_brand": "Brand Name",
      "recommended_model": "Model Name",
      "estimated_price_cents": 0
    }
  ]
}`;

  const client = new Anthropic();
  let aiRecs: AiRecommendation[];

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(clean) as { recommendations?: AiRecommendation[] };
    aiRecs = parsed.recommendations ?? [];
  } catch (err) {
    console.error("[recommendations] AI error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 }
    );
  }

  // Load active referrals for cross-reference
  const svc = createServiceClient();
  const { data: referrals } = await svc
    .from("equipment_referrals")
    .select("*")
    .eq("active_flag", true);

  const referralList = (referrals ?? []) as EquipmentReferral[];

  // Match AI recs to referral table
  const results: EquipmentRecommendation[] = aiRecs.map((rec) => {
    const match = referralList.find(
      (r) =>
        r.brand.toLowerCase() === rec.recommended_brand.toLowerCase() &&
        r.model.toLowerCase() === rec.recommended_model.toLowerCase()
    ) ?? referralList.find(
      (r) =>
        r.brand.toLowerCase() === rec.recommended_brand.toLowerCase() &&
        rec.recommended_model.toLowerCase().includes(r.model.toLowerCase())
    );

    return {
      item_id: rec.item_id,
      recommended_brand: rec.recommended_brand,
      recommended_model: rec.recommended_model,
      estimated_price_cents: rec.estimated_price_cents,
      referral_url: match?.referral_url ?? null,
      partner_name: match?.partner_name || null,
    };
  });

  return Response.json(results);
}
