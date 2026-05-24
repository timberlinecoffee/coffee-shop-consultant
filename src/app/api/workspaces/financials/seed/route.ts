// TIM-964: AI equipment-seed endpoint for the Financial Suite.
// Reads the user's concept doc and generates a starter equipment list.
// POST /api/workspaces/financials/seed

export const runtime = "nodejs";
export const maxDuration = 45;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { normalizeConceptV2, formatConceptV2ForAI } from "@/lib/concept";
import type { EquipmentItem, FinancingMethod, EquipmentCategory } from "@/lib/financials";

const anthropic = new Anthropic();

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function POST() {
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

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  // Load concept doc for context
  const { data: conceptDoc } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", plan.id)
    .eq("workspace_key", "concept")
    .maybeSingle();

  const conceptText = conceptDoc?.content
    ? formatConceptV2ForAI(normalizeConceptV2(conceptDoc.content))
    : "No concept details yet — assume a standard espresso bar.";

  const prompt = `You are an expert coffee shop consultant helping a new owner plan their startup equipment list.

Based on the following coffee shop concept, generate a realistic startup equipment and supplies list. Include both major equipment (espresso machines, grinders, refrigeration, POS) and minor supplies (tampers, pitchers, cleaning supplies, smallwares).

## Coffee Shop Concept
${conceptText}

## Instructions
Return a JSON array of equipment items. Each item must have these exact fields:
- name: string (e.g. "La Marzocco Linea Micra")
- brand: string (e.g. "La Marzocco")
- model: string (e.g. "Linea Micra 2-Group")
- supplier: string (e.g. "Espresso Parts")
- cost_usd: number (realistic market cost)
- financing: one of "cash", "loan", "in_house_financing", "other"
- category: "major" for big equipment (>$500), "minor" for small items
- notes: string (brief note on why this item or key spec)

Rules:
- Include 12-18 items total (mix of major and minor)
- Major items (espresso machine, grinders, refrigeration, POS system, furniture) should use "loan" or "in_house_financing" for anything over $3,000
- Minor items (pitchers, tampers, cleaning supplies, etc.) should be "cash"
- Use realistic 2024-2025 market pricing
- Tailor selections to the concept type (e.g., espresso bar vs drive-through vs cafe)
- Do NOT include rent, utilities, or inventory — equipment and durable supplies only

Return ONLY the JSON array, no other text.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    // Extract JSON array from response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ error: "No JSON array in AI response" }, { status: 500 });
    }

    const rawItems = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;

    const items: EquipmentItem[] = rawItems.map((item) => ({
      id: makeId(),
      name: String(item.name ?? ""),
      brand: String(item.brand ?? ""),
      model: String(item.model ?? ""),
      supplier: String(item.supplier ?? ""),
      cost_usd: Number(item.cost_usd ?? 0),
      financing: (["cash", "loan", "in_house_financing", "other"].includes(
        String(item.financing)
      )
        ? item.financing
        : "cash") as FinancingMethod,
      category: (["major", "minor"].includes(String(item.category))
        ? item.category
        : "minor") as EquipmentCategory,
      notes: String(item.notes ?? ""),
    }));

    return Response.json({ items });
  } catch (err) {
    console.error("financials seed error:", err);
    return Response.json({ error: "AI generation failed" }, { status: 500 });
  }
}
