// TIM-1061: AI "Improve" endpoint for a single Operations Playbook section.
// TIM-1416: V1 binder — handles SOP categories plus the three planning
// sections (roles, vendor contacts, training). Drink recipes are sourced from
// the Menu workspace and are not generated here.
// Returns the FULL updated playbook document (only the requested section is
// rewritten), so the client can replace state in one assignment and let the
// existing autosave persist.
//
// Per AGENTS.md / TIM-1002: Title Case is applied at the API boundary for
// label-shaped fields (station names, role labels, vendor labels, contact
// names) via the titleCase*Section() helpers. Sentence-form copy stays as-is.

export const runtime = "nodejs";
export const maxDuration = 30;

import { runScoutTurn } from "@/lib/ai/scout-adapter";
import { createClient } from "@/lib/supabase/server";
import { normalizeAIOutput } from "@/lib/normalize";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { buildAiLanguageDirective, SUPPORTED_LANGUAGES } from "@/lib/account-settings";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  type OperationsPlaybookDocument,
  type SopCategory,
  type SopCategoryKey,
  type SopChecklistItem,
  type SopCadence,
  type RolesSection,
  type RoleAssignment,
  type VendorContactsSection,
  type VendorContact,
  type TrainingSection,
  type TrainingItem,
  type TrainingPhase,
  SOP_CATEGORY_KEYS,
  SOP_CATEGORY_LABELS,
  EMPTY_OPERATIONS_PLAYBOOK,
  normalizeOperationsPlaybook,
  titleCaseSopCategory,
  titleCaseRolesSection,
  titleCaseVendorContactsSection,
  titleCaseTrainingSection,
} from "@/lib/operations-playbook";
import { normalizeConceptV2 } from "@/lib/concept";

const ROUTE_PATH = "/api/workspaces/operations_playbook/generate";

type GeneratableSection = SopCategoryKey | "roles" | "vendor_contacts" | "training";

function isGeneratableSection(v: unknown): v is GeneratableSection {
  if (typeof v !== "string") return false;
  if ((SOP_CATEGORY_KEYS as string[]).includes(v)) return true;
  return v === "roles" || v === "vendor_contacts" || v === "training";
}

function paywallReason(status: string): "no_subscription" | "paused" | "expired" {
  if (status === "cancelled") return "paused";
  if (status === "expired") return "expired";
  return "no_subscription";
}

function localId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

// TIM-1406: normalizer-backed read keeps V1 (onboarding-fresh) and V2
// (post-edit) concepts behaving the same. shop_identity prefers the SoT
// (coffee_shop_plans.plan_name) supplied by the caller; city maps to the V2
// `location` component. service_format and food_program have no V2 equivalent
// today — they stay empty until a future concept-schema extension.
function extractConceptContext(content: unknown, planName: string | null): {
  shop_identity: string;
  service_format: string;
  city: string;
  food_program: string;
} {
  const concept = normalizeConceptV2(content);
  const trimmedPlanName = planName?.trim() ?? "";
  return {
    shop_identity: trimmedPlanName || concept.components.shop_identity.content,
    service_format: "",
    city: concept.components.location.content,
    food_program: "",
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

// ── Shared voice rules (TIM-2528) ────────────────────────────────────────────
// Appended to every builder's prompt so AI-generated SOP / role / vendor /
// training copy stays in Groundwork voice instead of corporate policy-manual
// register.

const VOICE_RULES = `Voice rules:
- Write like the owner's most experienced friend, not a corporate policy writer.
- Plain English. Short sentences. Specific steps a barista can follow on day one.
- NEVER use: leverage, synergy, curated, unlock, elevate, embark, delve, seamlessly, robust, holistic, comprehensive, innovative, passionate about, actually, genuinely, honestly.
- NEVER use em dashes (—). Use ( -- ) if you need a break.
- No passive voice in instructions. "Pull the shot at 9 bars" not "Shot pressure should be maintained at 9 bars."
- Specific beats vague: "wipe steam wand after every shot" beats "maintain equipment cleanliness."`;

// ── SOP prompt ──────────────────────────────────────────────────────────────

function buildSopPrompt(
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
    cash_handling: `Opening float amount and break-down (small bills + coin), mid-day drop threshold, end-of-day reconciliation, variance threshold ($5 is a common default), deposit cadence (e.g. Tuesday and Friday), two-person rule when feasible. Describe the policy, not the daily log entry.`,
    food_safety: `Allergen matrix posted in kitchen. Dedicated allergen kit. Hand-washing protocol. Glove change between raw and ready-to-eat. Temperature targets for the pastry case and walk-in (34-40°F) and the out-of-range escalation. Date-labeling. Sanitizer concentration (quat 200ppm or chlorine 50ppm) with test-strip verification. Describe the protocol, not the daily log entry.`,
  };

  const conceptLines: string[] = [];
  if (concept.shop_identity) conceptLines.push(`- Shop identity: ${concept.shop_identity}`);
  if (concept.service_format) conceptLines.push(`- Service format: ${concept.service_format}`);
  if (concept.city) conceptLines.push(`- City: ${concept.city}`);
  if (concept.food_program) conceptLines.push(`- Food program: ${concept.food_program}`);
  const conceptBlock =
    conceptLines.length > 0 ? conceptLines.join("\n") : "- (concept not yet filled in)";

  return `You are a knowledgeable friend who has run coffee shops and is helping this owner build their opening playbook. The owner is preparing the "${categoryLabel}" Standard Operating Procedure for their shop. This is a planning binder for opening day — policies and templates, not a daily-execution log. Improve the current SOP using their concept and menu context.

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
- Steps describe the policy or template, not a daily log entry. Do not include language like "record on the log" or "enter today's count".
- "text" is full sentence-form copy. Do NOT title-case.
- "station" values MUST be one of "Bar", "Retail Floor", "Restroom", "Walk-In", "Dish" (already Title Case).
- Reference the shop's specific concept and menu when it makes the step better; do not invent equipment the owner didn't mention.

${VOICE_RULES}`;
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
    const intro = typeof obj.intro === "string" ? normalizeAIOutput(obj.intro) : "";
    const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
    const items: SopChecklistItem[] = itemsRaw
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const rec = r as Record<string, unknown>;
        const text = typeof rec.text === "string" ? normalizeAIOutput(rec.text) : "";
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

// ── Roles prompt ────────────────────────────────────────────────────────────

function buildRolesPrompt(
  current: RolesSection,
  concept: { shop_identity: string; city: string },
  menuSummary: string,
): string {
  const conceptLines: string[] = [];
  if (concept.shop_identity) conceptLines.push(`- Shop identity: ${concept.shop_identity}`);
  if (concept.city) conceptLines.push(`- City: ${concept.city}`);
  const conceptBlock =
    conceptLines.length > 0 ? conceptLines.join("\n") : "- (concept not yet filled in)";

  return `You are a knowledgeable friend who has run coffee shops and is helping this owner build their opening playbook. The owner is defining the roles and shift responsibilities for their shop. This is a planning binder — who-does-what on every shift, not a per-shift assignment log.

Shop context:
${conceptBlock}

Menu (top items by category):
${menuSummary}

Current roles:
${current.items.length === 0 ? "(none)" : current.items.map((r) => `- ${r.role}: ${r.responsibilities}`).join("\n")}

Return ONLY a JSON object — no preamble, no markdown fences:
{
  "intro": "1-2 sentences explaining how roles work on a shift. Sentence case.",
  "items": [
    {
      "role": "Role label in Title Case (e.g. Bar, Register, Manager On Duty)",
      "responsibilities": "What this role owns on a shift, sentence-form."
    }
  ]
}

Rules:
- 4-7 roles. Cover bar, register/front of house, food/pastry, floor, manager on duty at minimum.
- No emojis.
- "role" is a Title Case label.
- "responsibilities" is sentence-form prose, two or three sentences max.

${VOICE_RULES}`;
}

function parseAiRoles(raw: string): RolesSection | null {
  try {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as {
      intro?: unknown;
      items?: unknown;
    };
    const intro = typeof obj.intro === "string" ? normalizeAIOutput(obj.intro) : "";
    const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
    const items: RoleAssignment[] = itemsRaw
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const rec = r as Record<string, unknown>;
        const role = typeof rec.role === "string" ? rec.role.trim() : "";
        const responsibilities =
          typeof rec.responsibilities === "string"
            ? normalizeAIOutput(rec.responsibilities)
            : "";
        if (!role && !responsibilities) return null;
        return { id: localId(), role, responsibilities } satisfies RoleAssignment;
      })
      .filter((it): it is RoleAssignment => it !== null);
    return { intro, items, last_generated_at: new Date().toISOString() };
  } catch {
    return null;
  }
}

// ── Vendor contacts prompt ──────────────────────────────────────────────────

function buildVendorContactsPrompt(
  current: VendorContactsSection,
  concept: { shop_identity: string; city: string },
): string {
  const conceptLines: string[] = [];
  if (concept.shop_identity) conceptLines.push(`- Shop identity: ${concept.shop_identity}`);
  if (concept.city) conceptLines.push(`- City: ${concept.city}`);
  const conceptBlock =
    conceptLines.length > 0 ? conceptLines.join("\n") : "- (concept not yet filled in)";

  return `You are a knowledgeable friend who has run coffee shops and is helping this owner build their opening playbook. The owner is preparing the vendor and emergency contacts quick-reference card for their shop. The owner will fill in names and numbers; you supply the rows and the helpful notes.

Shop context:
${conceptBlock}

Current contacts:
${current.items.length === 0 ? "(none)" : current.items.map((c) => `- ${c.label}: ${c.contact_name || "(no name)"} / ${c.phone || "(no phone)"} — ${c.notes || ""}`).join("\n")}

Return ONLY a JSON object — no preamble, no markdown fences:
{
  "intro": "1-2 sentences explaining how the contact card is used. Sentence case.",
  "items": [
    {
      "label": "Role or type, Title Case (e.g. Espresso Tech, Plumber, Alarm Company, Milk Supplier, Landlord, Insurance, Health Inspector)",
      "contact_name": "",
      "phone": "",
      "email": "",
      "notes": "Why you'd call this contact and what info to have ready."
    }
  ]
}

Rules:
- 6-10 rows. Include espresso tech, plumber, alarm company, milk supplier, landlord, insurance carrier, and at least one local-utility / inspector row appropriate to a coffee shop.
- "contact_name", "phone", "email" should be empty strings — the owner fills these in.
- "notes" is a short helpful hint, one sentence.
- No emojis.
- "label" is Title Case.

${VOICE_RULES}`;
}

function parseAiVendorContacts(raw: string): VendorContactsSection | null {
  try {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as {
      intro?: unknown;
      items?: unknown;
    };
    const intro = typeof obj.intro === "string" ? normalizeAIOutput(obj.intro) : "";
    const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
    const items: VendorContact[] = itemsRaw
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const rec = r as Record<string, unknown>;
        const label = typeof rec.label === "string" ? rec.label.trim() : "";
        if (!label) return null;
        return {
          id: localId(),
          label,
          contact_name: typeof rec.contact_name === "string" ? rec.contact_name : "",
          phone: typeof rec.phone === "string" ? rec.phone : "",
          email: typeof rec.email === "string" ? rec.email : "",
          notes: typeof rec.notes === "string" ? normalizeAIOutput(rec.notes) : "",
        } satisfies VendorContact;
      })
      .filter((it): it is VendorContact => it !== null);
    return { intro, items, last_generated_at: new Date().toISOString() };
  } catch {
    return null;
  }
}

// ── Training prompt ─────────────────────────────────────────────────────────

function buildTrainingPrompt(
  current: TrainingSection,
  concept: { shop_identity: string; city: string },
): string {
  const conceptLines: string[] = [];
  if (concept.shop_identity) conceptLines.push(`- Shop identity: ${concept.shop_identity}`);
  if (concept.city) conceptLines.push(`- City: ${concept.city}`);
  const conceptBlock =
    conceptLines.length > 0 ? conceptLines.join("\n") : "- (concept not yet filled in)";

  return `You are a knowledgeable friend who has run coffee shops and is helping this owner build their opening playbook. The owner is preparing the new-hire training checklist for their shop, broken into Day 1, Week 1, and Month 1 milestones.

Shop context:
${conceptBlock}

Current milestones:
${current.items.length === 0 ? "(none)" : current.items.map((t) => `- ${t.phase}: ${t.text}`).join("\n")}

Return ONLY a JSON object — no preamble, no markdown fences:
{
  "intro": "1-2 sentences explaining how the checklist is used. Sentence case.",
  "items": [
    {
      "phase": "day_1 | week_1 | month_1",
      "text": "Specific milestone the trainer signs off on."
    }
  ]
}

Rules:
- 9-15 milestones total, spread across all three phases.
- Day 1 covers tour, paperwork, shadowing.
- Week 1 covers register, drinks, allergens, shift fundamentals.
- Month 1 covers solo bar, cross-training, 30-day check-in.
- "phase" must be exactly "day_1", "week_1", or "month_1".
- "text" is sentence-form, concrete enough that the trainer can verify it.
- No emojis.

${VOICE_RULES}`;
}

function parseAiTraining(raw: string): TrainingSection | null {
  try {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as {
      intro?: unknown;
      items?: unknown;
    };
    const intro = typeof obj.intro === "string" ? normalizeAIOutput(obj.intro) : "";
    const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
    const items: TrainingItem[] = itemsRaw
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const rec = r as Record<string, unknown>;
        const phaseRaw = rec.phase;
        const phase: TrainingPhase =
          phaseRaw === "week_1" || phaseRaw === "month_1" ? phaseRaw : "day_1";
        const text = typeof rec.text === "string" ? normalizeAIOutput(rec.text) : "";
        if (!text) return null;
        return { id: localId(), phase, text } satisfies TrainingItem;
      })
      .filter((it): it is TrainingItem => it !== null);
    return { intro, items, last_generated_at: new Date().toISOString() };
  } catch {
    return null;
  }
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4: rate-limit a paid-API route.
  const rateLimited = await enforceRateLimit({
    bucket: "operations-playbook:generate",
    id: user.id,
    limit: 10,
    windowSec: 60,
  });
  if (rateLimited) return rateLimited;

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until, preferred_language")
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

  if (!isGeneratableSection(body.section)) {
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
  const concept = extractConceptContext(conceptDoc?.content, plan.plan_name ?? null);
  const menuSummary = summarizeMenu(menuItems as MenuItemRow[] | null);

  // Build the section-specific prompt, dispatch to Anthropic, parse the
  // category-shaped JSON, and merge back into the full document.
  let prompt: string;
  if (section === "roles") {
    prompt = buildRolesPrompt(current.roles, concept, menuSummary);
  } else if (section === "vendor_contacts") {
    prompt = buildVendorContactsPrompt(current.vendor_contacts, concept);
  } else if (section === "training") {
    prompt = buildTrainingPrompt(current.training, concept);
  } else {
    prompt = buildSopPrompt(
      section,
      SOP_CATEGORY_LABELS[section],
      current[section],
      concept,
      menuSummary,
    );
  }

  let aiText: string;
  try {
    const rawLang = typeof (profile as { preferred_language?: unknown }).preferred_language === "string" ? (profile as { preferred_language?: string }).preferred_language!.trim().toLowerCase() : "en";
    const lang = SUPPORTED_LANGUAGES.some((l) => l.code === rawLang) ? rawLang : "en";
    const langDir = buildAiLanguageDirective(lang);
    const result = await runScoutTurn({
      lane: "ops_playbook_generate",
      systemBlocks: langDir ? [{ text: langDir }] : [],
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2048,
      userId: user.id,
      routeTag: ROUTE_PATH,
    });
    aiText = result.text;
  } catch (err) {
    console.error("[operations_playbook/generate] AI error:", err);
    return Response.json({ error: "AI generation failed" }, { status: 502 });
  }

  let updated: OperationsPlaybookDocument;

  if (section === "roles") {
    const parsed = parseAiRoles(aiText);
    if (!parsed) {
      console.error("[operations_playbook/generate] roles parse failed");
      return Response.json({ error: "AI response could not be parsed" }, { status: 502 });
    }
    const merged: RolesSection = {
      intro: parsed.intro || current.roles.intro || EMPTY_OPERATIONS_PLAYBOOK.roles.intro,
      items: parsed.items,
      last_generated_at: parsed.last_generated_at,
    };
    updated = { ...current, roles: titleCaseRolesSection(merged) };
  } else if (section === "vendor_contacts") {
    const parsed = parseAiVendorContacts(aiText);
    if (!parsed) {
      console.error("[operations_playbook/generate] vendor_contacts parse failed");
      return Response.json({ error: "AI response could not be parsed" }, { status: 502 });
    }
    const merged: VendorContactsSection = {
      intro:
        parsed.intro ||
        current.vendor_contacts.intro ||
        EMPTY_OPERATIONS_PLAYBOOK.vendor_contacts.intro,
      items: parsed.items,
      last_generated_at: parsed.last_generated_at,
    };
    updated = {
      ...current,
      vendor_contacts: titleCaseVendorContactsSection(merged),
    };
  } else if (section === "training") {
    const parsed = parseAiTraining(aiText);
    if (!parsed) {
      console.error("[operations_playbook/generate] training parse failed");
      return Response.json({ error: "AI response could not be parsed" }, { status: 502 });
    }
    const merged: TrainingSection = {
      intro:
        parsed.intro ||
        current.training.intro ||
        EMPTY_OPERATIONS_PLAYBOOK.training.intro,
      items: parsed.items,
      last_generated_at: parsed.last_generated_at,
    };
    updated = { ...current, training: titleCaseTrainingSection(merged) };
  } else {
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
      intro:
        parsedCategory.intro ||
        current[section].intro ||
        EMPTY_OPERATIONS_PLAYBOOK[section].intro,
      items: parsedCategory.items,
      last_generated_at: parsedCategory.last_generated_at,
    };
    updated = { ...current, [section]: titleCaseSopCategory(merged) };
  }

  // TIM-2924 Shape C fix: do not persist here. The review modal is the Accept
  // gate; onApply writes via the existing autosave when the user confirms.
  return Response.json({ content: updated });
}
