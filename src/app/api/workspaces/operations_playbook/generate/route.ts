// TIM-1061: AI "Improve" endpoint for a single Operations Playbook SOP category.
// Returns the FULL updated playbook document (only the requested category is rewritten),
// so the client can replace state in one assignment and let the existing autosave persist.
//
// Per AGENTS.md / TIM-1002: Title Case is applied at the API boundary for label-shaped
// fields (station names) via titleCaseSopCategory(). Sentence-form copy stays as-is.

export const runtime = "nodejs";
export const maxDuration = 30;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import {
  type OperationsPlaybookDocument,
  type SopCategory,
  type SopCategoryKey,
  type SopChecklistItem,
  type SopCadence,
  SOP_CATEGORY_KEYS,
  SOP_CATEGORY_LABELS,
  EMPTY_OPERATIONS_PLAYBOOK,
  normalizeOperationsPlaybook,
  titleCaseSopCategory,
} from "@/lib/operations-playbook";

const anthropic = new Anthropic();

function paywallReason(status: string): "no_subscription" | "paused" | "expired" {
  if (status === "cancelled") return "paused";
  if (status === "expired") return "expired";
  return "no_subscription";
}

function isCategoryKey(v: unknown): v is SopCategoryKey {
  return typeof v === "string" && (SOP_CATEGORY_KEYS as string[]).includes(v);
}

function localId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

interface ConceptComponentLike {
  content?: string;
}

function extractConceptContext(content: unknown): {
  shop_identity: string;
  service_format: string;
  city: string;
  food_program: string;
} {
  const empty = { shop_identity: "", service_format: "", city: "", food_program: "" };
  if (!content || typeof content !== "object") return empty;
  const obj = content as Record<string, unknown>;
  const components = (obj.components as Record<string, ConceptComponentLike> | null) ?? null;
  return {
    shop_identity: components?.shop_identity?.content ?? "",
    service_format: components?.service_format?.content ?? "",
    city: components?.city?.content ?? "",
    food_program: components?.food_program?.content ?? "",
  };
}

interface MenuItemRow {
  name: string | null;
  // TIM-1140: menu_items_with_cogs exposes the joined category name; we use
  // the view here so we can group by user-facing name without an extra join.
  category_name: string | null;
}

function summarizeMenu(items: MenuItemRow[] | null): string {
  if (!items || items.length === 0) return "No menu items yet.";
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const cat = item.category_name ?? "Other";
    const list = grouped.get(cat) ?? [];
    if (item.name) list.push(item.name);
    grouped.set(cat, list);
  }
  const lines: string[] = [];
  for (const [cat, names] of grouped.entries()) {
    if (names.length === 0) continue;
    lines.push(`- ${cat}: ${names.slice(0, 12).join(", ")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "No menu items yet.";
}

function buildPrompt(
  categoryKey: SopCategoryKey,
  categoryLabel: string,
  current: SopCategory,
  concept: { shop_identity: string; service_format: string; city: string; food_program: string },
  menuSummary: string,
): string {
  const cadenceGuidance =
    categoryKey === "cleaning"
      ? `- Each item MUST include "station" (one of "Bar", "Retail Floor", "Restroom", "Walk-In", "Dish") and "cadence" (one of "daily", "weekly", "monthly").`
      : `- Do NOT include "station" or "cadence" fields.`;

  const durationGuidance =
    categoryKey === "opening" || categoryKey === "closing"
      ? `- Each item MUST include "duration_min" as an integer estimate (or null if unknown).`
      : `- "duration_min" should be null.`;

  const categoryGuidance: Record<SopCategoryKey, string> = {
    opening: `Pre-open routine. Order steps so longest-lead-time tasks (espresso machine warm-up) start first. Include grinder calibration, pastry case stock, register float, music/lights, sandwich board.`,
    closing: `Post-close routine. Espresso machine backflush, milk fridge wipe, register Z-report, cash count, alarm, deposit bag prep, walk-in temp check.`,
    cleaning: `Daily, weekly, and monthly tasks split by station. Cover bar, retail floor, restroom, walk-in, and dish stations. Daily items are per-shift; weekly items have a fixed day; monthly items live on the manager's calendar.`,
    cash_handling: `Opening float amount and break-down (small bills + coin), mid-day drop threshold, end-of-day reconciliation, variance threshold ($5 is a common default), deposit cadence (e.g. Tuesday and Friday), two-person rule when feasible.`,
    drink_recipes: `Espresso ratio (e.g. 18g in / 36g out / 25-30s), milk temps (140-150°F for textured milk, 130°F for cortado), signature drink builds. Include cappuccino, latte, cortado, Americano, drip, pour-over, cold brew at minimum. Reference the menu items the owner has actually listed when relevant.`,
    food_safety: `Allergen matrix posted in kitchen. Dedicated allergen kit. Hand-washing protocol. Glove change between raw and ready-to-eat. Pastry case temp logged at open/mid-day/close (34-40°F). Walk-in temp logged at open/close. Date-labeling. Sanitizer concentration (quat 200ppm or chlorine 50ppm) with test strip check.`,
  };

  const conceptLines: string[] = [];
  if (concept.shop_identity) conceptLines.push(`- Shop identity: ${concept.shop_identity}`);
  if (concept.service_format) conceptLines.push(`- Service format: ${concept.service_format}`);
  if (concept.city) conceptLines.push(`- City: ${concept.city}`);
  if (concept.food_program) conceptLines.push(`- Food program: ${concept.food_program}`);
  const conceptBlock =
    conceptLines.length > 0 ? conceptLines.join("\n") : "- (concept not yet filled in)";

  return `You are a senior coffee shop operations consultant. The owner is preparing the "${categoryLabel}" Standard Operating Procedure for their shop. Improve the current SOP using their concept and menu context.

Shop context:
${conceptBlock}

Menu (top items by category):
${menuSummary}

Current "${categoryLabel}" SOP:
- Intro: ${current.intro || "(empty)"}
- Steps:
${current.items.length === 0 ? "  (empty)" : current.items.map((it, idx) => `  ${idx + 1}. ${it.text}`).join("\n")}

Category-specific guidance:
${categoryGuidance[categoryKey]}

Return ONLY a JSON object — no preamble, no markdown fences:
{
  "intro": "1-2 sentence intro the team will read before running the SOP. Plain shop-owner language. Sentence case.",
  "items": [
    {
      "text": "Specific step a brand-new barista could follow without asking questions. Sentence case.",
      "duration_min": null,
      "station": null,
      "cadence": null
    }
  ]
}

Rules:
${cadenceGuidance}
${durationGuidance}
- 6-16 items. Concrete, not generic.
- No emojis.
- "text" is full sentence-form copy. Do NOT title-case.
- "station" values MUST be one of "Bar", "Retail Floor", "Restroom", "Walk-In", "Dish" (already Title Case).
- Reference the shop's specific concept and menu when it makes the step better; do not invent equipment the owner didn't mention.`;
}

function parseAiCategory(raw: string): SopCategory | null {
  try {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as {
      intro?: unknown;
      items?: unknown;
    };
    const intro = typeof obj.intro === "string" ? obj.intro : "";
    const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
    const items: SopChecklistItem[] = itemsRaw
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const rec = r as Record<string, unknown>;
        const text = typeof rec.text === "string" ? rec.text : "";
        if (!text) return null;
        const dur = rec.duration_min;
        const station = rec.station;
        const cadence = rec.cadence;
        return {
          id: localId(),
          text,
          duration_min:
            typeof dur === "number" && Number.isFinite(dur) ? dur : null,
          station: typeof station === "string" && station.length > 0 ? station : null,
          cadence:
            cadence === "daily" || cadence === "weekly" || cadence === "monthly"
              ? (cadence as SopCadence)
              : null,
        };
      })
      .filter((it): it is SopChecklistItem => it !== null);
    return {
      intro: intro || "",
      items,
      last_generated_at: new Date().toISOString(),
    };
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
    .select("subscription_status, beta_waiver_until")
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

  if (!isCategoryKey(body.section)) {
    return Response.json({ error: "Invalid section" }, { status: 400 });
  }
  const section = body.section;

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  const [
    { data: doc },
    { data: conceptDoc },
    { data: menuItems },
  ] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "operations_playbook")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("menu_items_with_cogs")
      .select("name, category_name")
      .eq("plan_id", plan.id)
      .eq("archived", false)
      .limit(50),
  ]);

  const current = normalizeOperationsPlaybook(doc?.content);
  const concept = extractConceptContext(conceptDoc?.content);
  const menuSummary = summarizeMenu(menuItems as MenuItemRow[] | null);

  const prompt = buildPrompt(
    section,
    SOP_CATEGORY_LABELS[section],
    current[section],
    concept,
    menuSummary,
  );

  let aiText: string;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    aiText =
      response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch (err) {
    console.error("[operations_playbook/generate] anthropic error:", err);
    return Response.json({ error: "AI generation failed" }, { status: 502 });
  }

  const parsedCategory = parseAiCategory(aiText);
  if (!parsedCategory) {
    console.error(
      "[operations_playbook/generate] parse failed, len=",
      aiText.length,
    );
    return Response.json({ error: "AI response could not be parsed" }, { status: 502 });
  }

  // Preserve existing intro if AI returned empty.
  const merged: SopCategory = {
    intro: parsedCategory.intro || current[section].intro || EMPTY_OPERATIONS_PLAYBOOK[section].intro,
    items: parsedCategory.items,
    last_generated_at: parsedCategory.last_generated_at,
  };

  const updated: OperationsPlaybookDocument = {
    ...current,
    [section]: titleCaseSopCategory(merged),
  };

  const { error: upsertErr } = await supabase
    .from("workspace_documents")
    .upsert(
      { plan_id: plan.id, workspace_key: "operations_playbook", content: updated },
      { onConflict: "plan_id,workspace_key" },
    );

  if (upsertErr) {
    console.error("[operations_playbook/generate] upsert error:", upsertErr);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }

  return Response.json({ content: updated });
}
