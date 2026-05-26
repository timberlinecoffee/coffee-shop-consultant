// TIM-1061: Operations Playbook (SOPs) workspace types and helpers.
// Stored in workspace_documents.content as jsonb where workspace_key='operations_playbook'.
//
// Six fixed SOP categories. Each category has a rich-text intro paragraph
// (sentence case) plus an ordered, editable checklist of structured items.
// Defaults are sensible seeds the owner can edit; the per-SOP "Improve" button
// asks the AI to rewrite the category using the plan's Concept and Menu.

import { toTitleCase } from "@/lib/text";

// ── Shared shapes ────────────────────────────────────────────────────────────

export type SopCategoryKey =
  | "opening"
  | "closing"
  | "cleaning"
  | "cash_handling"
  | "drink_recipes"
  | "food_safety";

export const SOP_CATEGORY_KEYS: SopCategoryKey[] = [
  "opening",
  "closing",
  "cleaning",
  "cash_handling",
  "drink_recipes",
  "food_safety",
];

export const SOP_CATEGORY_LABELS: Record<SopCategoryKey, string> = {
  opening: "Opening Procedures",
  closing: "Closing Procedures",
  cleaning: "Cleaning Schedule",
  cash_handling: "Cash Handling",
  drink_recipes: "Drink Recipes",
  food_safety: "Food Safety & Allergens",
};

export const SOP_CATEGORY_TAGLINES: Record<SopCategoryKey, string> = {
  opening: "Pre-open checklist your barista runs every morning.",
  closing: "Post-close routine that resets the shop for tomorrow.",
  cleaning: "Daily, weekly, and monthly tasks by station.",
  cash_handling: "Float, mid-day drop, end-of-day count, deposit cadence.",
  drink_recipes: "Espresso ratios, milk temps, signature drink builds.",
  food_safety: "Allergen matrix, contamination prevention, temp logs.",
};

export type SopCadence = "daily" | "weekly" | "monthly";

export interface SopChecklistItem {
  id: string;
  text: string;
  // Optional metadata. cleaning items use cadence + station; opening/closing
  // items often use duration_min; cash items use neither. All are optional so
  // the same shape covers every category.
  duration_min: number | null;
  station: string | null;
  cadence: SopCadence | null;
}

export interface SopCategory {
  intro: string;
  items: SopChecklistItem[];
  last_generated_at: string | null;
}

export interface OperationsPlaybookDocument {
  opening: SopCategory;
  closing: SopCategory;
  cleaning: SopCategory;
  cash_handling: SopCategory;
  drink_recipes: SopCategory;
  food_safety: SopCategory;
}

// ── Default seeds ────────────────────────────────────────────────────────────

function id(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

function plainItem(text: string, duration_min: number | null = null): SopChecklistItem {
  return { id: id(), text, duration_min, station: null, cadence: null };
}

function stationItem(station: string, text: string, cadence: SopCadence): SopChecklistItem {
  return { id: id(), text, duration_min: null, station, cadence };
}

export const SEED_OPENING_ITEMS: SopChecklistItem[] = [
  plainItem("Unlock front and back doors; disarm alarm.", 1),
  plainItem("Turn on lights, music, and HVAC.", 2),
  plainItem("Power on espresso machine and steam boiler; allow 30 minutes to come up to temperature.", 30),
  plainItem("Calibrate grinder: pull two test shots and adjust grind until dialed in.", 10),
  plainItem("Stock pastry case from walk-in; check date labels and rotate FIFO.", 10),
  plainItem("Brew first batch of drip coffee and decaf.", 5),
  plainItem("Stock milk fridge (whole, oat, almond) and check pitcher rinser is running.", 5),
  plainItem("Count opening cash float; record on the daily log.", 5),
  plainItem("Open POS, log in to register, and confirm card reader is online.", 3),
  plainItem("Wipe down bar, customer-facing counter, and condiment station.", 5),
  plainItem("Set out sandwich board, sweep entry, and unlock front door at open.", 5),
];

export const SEED_CLOSING_ITEMS: SopChecklistItem[] = [
  plainItem("Lock front door at posted close time; flip Open sign to Closed.", 1),
  plainItem("Stop accepting orders; finish drinks already in the queue.", null),
  plainItem("Backflush espresso machine with cleaner; flush group heads three times.", 10),
  plainItem("Soak portafilters and steam wands; wipe steam tips and run a purge.", 5),
  plainItem("Empty knock box; rinse drip trays.", 3),
  plainItem("Pull and date-label leftover pastries; donate or discard per policy.", 5),
  plainItem("Wipe milk fridge, condiment bar, and customer tables.", 10),
  plainItem("Sweep and mop floors; take out trash and recycling.", 15),
  plainItem("Run end-of-day POS report; pull Z-report and tape to deposit log.", 5),
  plainItem("Count till; reconcile against POS report; bag deposit.", 10),
  plainItem("Confirm walk-in and pastry case temperatures; record on temp log.", 3),
  plainItem("Turn off equipment, lights, and music. Set alarm; lock all doors.", 5),
];

export const SEED_CLEANING_ITEMS: SopChecklistItem[] = [
  // Bar — daily
  stationItem("Bar", "Wipe espresso machine body, steam wands, and group heads after each drink.", "daily"),
  stationItem("Bar", "Backflush espresso machine with cleaner at close.", "daily"),
  stationItem("Bar", "Rinse and wipe milk pitchers; replace pitcher rinser water.", "daily"),
  // Bar — weekly
  stationItem("Bar", "Deep clean grinder hopper; brush burrs and chute.", "weekly"),
  stationItem("Bar", "Descale brewer and drip coffee batch carafes.", "weekly"),
  // Bar — monthly
  stationItem("Bar", "Replace water filter cartridge; log replacement date.", "monthly"),
  // Retail floor — daily
  stationItem("Retail Floor", "Wipe customer tables and condiment bar between every clear.", "daily"),
  stationItem("Retail Floor", "Sweep entry mat, customer area, and behind register.", "daily"),
  // Retail floor — weekly
  stationItem("Retail Floor", "Mop hard floors; vacuum any rug areas.", "weekly"),
  stationItem("Retail Floor", "Wipe down menu boards and front-of-house glass.", "weekly"),
  // Restroom — daily
  stationItem("Restroom", "Restock paper goods; wipe sink, mirror, and toilet; mop floor.", "daily"),
  // Walk-in — daily
  stationItem("Walk-In", "Check and record walk-in and pastry case temperatures (target 38°F / 3°C).", "daily"),
  // Walk-in — weekly
  stationItem("Walk-In", "Wipe shelves; rotate stock; toss anything past code date.", "weekly"),
  // Dish — daily
  stationItem("Dish", "Run dish machine after every rush; clean spray arms; refill sanitizer.", "daily"),
  stationItem("Dish", "Empty and wipe down dish pit and three-compartment sink.", "daily"),
];

export const SEED_CASH_ITEMS: SopChecklistItem[] = [
  plainItem("Open with a $200 float in the till: 1x$20, 5x$10, 10x$5, 50x$1, $30 in coin.", null),
  plainItem("Mid-day drop: when till exceeds $300 in cash, pull $200 to the safe and log on cash sheet.", null),
  plainItem("End of day: count till, subtract opening float, reconcile against POS cash total.", null),
  plainItem("Variance threshold: any over/short greater than $5 is flagged and noted with shift names.", null),
  plainItem("Deposit cadence: bank drop every Tuesday and Friday; cash never sits overnight beyond Friday.", null),
  plainItem("Two-person rule: cash count and bag prep done by two staff members when possible.", null),
];

export const SEED_DRINK_RECIPES_ITEMS: SopChecklistItem[] = [
  plainItem("Espresso: 18g dose in, 36g out, 25-30s extraction time. Adjust grind to hit window.", null),
  plainItem("Americano: 2oz espresso + 6oz hot water. Espresso poured over water.", null),
  plainItem("Cappuccino: 2oz espresso + 4oz steamed milk, microfoam to 140-150°F.", null),
  plainItem("Latte: 2oz espresso + 10oz steamed milk, microfoam to 140-150°F.", null),
  plainItem("Cortado: 2oz espresso + 2oz steamed milk at 130°F, minimal foam.", null),
  plainItem("Drip coffee: 1:17 ratio (60g coffee per 1L water). Brew temp 200°F.", null),
  plainItem("Pour-over (V60, single): 22g coffee, 360g water at 205°F, 3:30 total brew.", null),
  plainItem("Cold brew: 1:8 ratio (240g coffee per 2L water). Steep 16-18 hours at room temp, then refrigerate.", null),
];

export const SEED_FOOD_SAFETY_ITEMS: SopChecklistItem[] = [
  plainItem("Allergen matrix posted in the kitchen: list every menu item against milk, soy, gluten, nuts, eggs.", null),
  plainItem("Dedicated allergen kit: separate scoops, pitchers, and tongs marked for nut-free and gluten-free orders.", null),
  plainItem("Wash hands for 20 seconds when starting a shift, after restroom, after handling cash, and between food and drink tasks.", null),
  plainItem("Glove change between handling raw and ready-to-eat foods.", null),
  plainItem("Pastry case temp logged at open, mid-day, and close. Acceptable range 34-40°F.", null),
  plainItem("Walk-in temp logged at open and close. Acceptable range 34-40°F. Anything above 40°F triggers a hold and call to manager.", null),
  plainItem("Date-label all opened milk, syrups, and prepped food with open date and discard date.", null),
  plainItem("Any food contact surface sanitized with quat at 200ppm or chlorine at 50ppm; test strip used at open and close.", null),
];

export const EMPTY_OPERATIONS_PLAYBOOK: OperationsPlaybookDocument = {
  opening: {
    intro:
      "Run this checklist top-to-bottom 45 minutes before open. Your espresso machine needs the longest lead time, so start it first.",
    items: [],
    last_generated_at: null,
  },
  closing: {
    intro:
      "Run this checklist top-to-bottom starting 15 minutes before close. Backflush the espresso machine after the last drink, not before.",
    items: [],
    last_generated_at: null,
  },
  cleaning: {
    intro:
      "Cleaning tasks are organized by station and cadence. Daily tasks happen every shift; weekly tasks are scheduled on a fixed day; monthly tasks live on the manager's calendar.",
    items: [],
    last_generated_at: null,
  },
  cash_handling: {
    intro:
      "Cash policy keeps the till consistent, the deposits predictable, and the variances visible. Keep this printed at the register.",
    items: [],
    last_generated_at: null,
  },
  drink_recipes: {
    intro:
      "Recipe ratios are the house standard. Baristas can adjust grind to hit the extraction window, but ratios and temps stay fixed for consistency.",
    items: [],
    last_generated_at: null,
  },
  food_safety: {
    intro:
      "Allergen and temp procedures protect customers and meet local health code. Temp logs live on the manager's clipboard at the bar.",
    items: [],
    last_generated_at: null,
  },
};

export function seededPlaybook(): OperationsPlaybookDocument {
  const clone = structuredClone(EMPTY_OPERATIONS_PLAYBOOK);
  clone.opening.items = SEED_OPENING_ITEMS.map((i) => ({ ...i, id: id() }));
  clone.closing.items = SEED_CLOSING_ITEMS.map((i) => ({ ...i, id: id() }));
  clone.cleaning.items = SEED_CLEANING_ITEMS.map((i) => ({ ...i, id: id() }));
  clone.cash_handling.items = SEED_CASH_ITEMS.map((i) => ({ ...i, id: id() }));
  clone.drink_recipes.items = SEED_DRINK_RECIPES_ITEMS.map((i) => ({ ...i, id: id() }));
  clone.food_safety.items = SEED_FOOD_SAFETY_ITEMS.map((i) => ({ ...i, id: id() }));
  return clone;
}

// ── Normalize from jsonb ────────────────────────────────────────────────────

function pickString(obj: Record<string, unknown> | null | undefined, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function pickNullableString(obj: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = obj?.[key];
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function pickNumberOrNull(obj: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = obj?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function pickCadence(obj: Record<string, unknown> | null | undefined, key: string): SopCadence | null {
  const v = obj?.[key];
  if (v === "daily" || v === "weekly" || v === "monthly") return v;
  return null;
}

function normalizeItems(input: unknown): SopChecklistItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const text = pickString(r, "text");
      if (!text) return null;
      return {
        id: pickString(r, "id") || id(),
        text,
        duration_min: pickNumberOrNull(r, "duration_min"),
        station: pickNullableString(r, "station"),
        cadence: pickCadence(r, "cadence"),
      };
    })
    .filter((item): item is SopChecklistItem => item !== null);
}

function normalizeCategory(input: unknown, fallbackIntro: string): SopCategory {
  if (!input || typeof input !== "object") {
    return { intro: fallbackIntro, items: [], last_generated_at: null };
  }
  const obj = input as Record<string, unknown>;
  const intro = pickString(obj, "intro");
  const lastGen = obj.last_generated_at;
  return {
    intro: intro || fallbackIntro,
    items: normalizeItems(obj.items),
    last_generated_at: typeof lastGen === "string" ? lastGen : null,
  };
}

export function normalizeOperationsPlaybook(input: unknown): OperationsPlaybookDocument {
  if (!input || typeof input !== "object") return structuredClone(EMPTY_OPERATIONS_PLAYBOOK);
  const obj = input as Record<string, unknown>;
  return {
    opening: normalizeCategory(obj.opening, EMPTY_OPERATIONS_PLAYBOOK.opening.intro),
    closing: normalizeCategory(obj.closing, EMPTY_OPERATIONS_PLAYBOOK.closing.intro),
    cleaning: normalizeCategory(obj.cleaning, EMPTY_OPERATIONS_PLAYBOOK.cleaning.intro),
    cash_handling: normalizeCategory(obj.cash_handling, EMPTY_OPERATIONS_PLAYBOOK.cash_handling.intro),
    drink_recipes: normalizeCategory(obj.drink_recipes, EMPTY_OPERATIONS_PLAYBOOK.drink_recipes.intro),
    food_safety: normalizeCategory(obj.food_safety, EMPTY_OPERATIONS_PLAYBOOK.food_safety.intro),
  };
}

export function isPlaybookEmpty(doc: OperationsPlaybookDocument): boolean {
  return SOP_CATEGORY_KEYS.every((key) => doc[key].items.length === 0);
}

// ── Title Case for AI-generated category content ────────────────────────────
//
// Station labels ("Bar", "Retail Floor") are label-shaped — Title Case.
// Item text is full-sentence guidance — sentence case stays untouched.
export function titleCaseSopCategory(cat: SopCategory): SopCategory {
  return {
    intro: cat.intro,
    last_generated_at: cat.last_generated_at,
    items: cat.items.map((item) => ({
      ...item,
      station: item.station ? toTitleCase(item.station) : null,
    })),
  };
}

// ── AI copilot context ───────────────────────────────────────────────────────

export function formatOperationsPlaybookForAI(doc: OperationsPlaybookDocument): string {
  const lines: string[] = [];
  for (const key of SOP_CATEGORY_KEYS) {
    const cat = doc[key];
    lines.push(`**${SOP_CATEGORY_LABELS[key]}**`);
    if (cat.items.length === 0) {
      lines.push("- _no items yet_");
    } else {
      const preview = cat.items.slice(0, 5).map((item) => `- ${item.text}`);
      lines.push(...preview);
      if (cat.items.length > 5) {
        lines.push(`- _+${cat.items.length - 5} more_`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
