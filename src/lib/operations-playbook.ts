// TIM-1061: Operations Playbook (SOPs) workspace types and helpers.
// TIM-1416: V1 = planning binder (templates, policies, schedules). Daily
// execution/logs are V2 and out of scope. Drink recipes now live in the Menu
// workspace; the Operations Playbook consumes them read-only. Three new
// planning-only sections (roles, vendor contacts, training checklist) extend
// the V1 binder.
//
// Stored in workspace_documents.content as jsonb where workspace_key='operations_playbook'.
//
// Five fixed SOP categories (was six — drink_recipes moved to Menu). Each
// category has a rich-text intro paragraph plus an ordered editable checklist
// of structured items. Defaults are seeds the owner can edit; the per-SOP
// "Improve" button asks the AI to rewrite the category using the plan's
// Concept and Menu.

import { toTitleCase } from "./text.ts";
import { normalizeAIOutput } from "./normalize.ts";

// ── SOP categories (checklist-style) ─────────────────────────────────────────

export type SopCategoryKey =
  | "opening"
  | "closing"
  | "cleaning"
  | "cash_handling"
  | "food_safety";

export const SOP_CATEGORY_KEYS: SopCategoryKey[] = [
  "opening",
  "closing",
  "cleaning",
  "cash_handling",
  "food_safety",
];

export const SOP_CATEGORY_LABELS: Record<SopCategoryKey, string> = {
  opening: "Opening Procedures",
  closing: "Closing Procedures",
  cleaning: "Cleaning Schedule",
  cash_handling: "Cash Handling",
  food_safety: "Food Safety & Allergens",
};

export const SOP_CATEGORY_TAGLINES: Record<SopCategoryKey, string> = {
  opening: "Pre-open checklist your barista runs every morning.",
  closing: "Post-close routine that resets the shop for tomorrow.",
  cleaning: "Daily, weekly, and monthly tasks by station.",
  cash_handling: "Float, mid-day drop policy, variance threshold, deposit cadence.",
  food_safety: "Allergen matrix, contamination prevention, temperature protocol.",
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

// ── Roles & shift responsibilities ───────────────────────────────────────────

export interface RoleAssignment {
  id: string;
  // Role label (Bar, Register, Pastry, Floor, Manager-On-Duty, etc.) — Title Case.
  role: string;
  // Responsibilities for that role — sentence-form prose.
  responsibilities: string;
}

export interface RolesSection {
  intro: string;
  items: RoleAssignment[];
  last_generated_at: string | null;
}

// ── Vendor & emergency contacts ──────────────────────────────────────────────

export interface VendorContact {
  id: string;
  // Short category label printed on the quick-reference card (Espresso Tech,
  // Plumber, Alarm Co., Milk Supplier, Landlord, Insurance) — Title Case.
  label: string;
  // The contact's name or company name — Title Case.
  contact_name: string;
  phone: string;
  email: string;
  // Free-form notes (account number, after-hours pager, contract reference, etc.).
  notes: string;
}

export interface VendorContactsSection {
  intro: string;
  items: VendorContact[];
  last_generated_at: string | null;
}

// ── New-hire training checklist ──────────────────────────────────────────────

export type TrainingPhase = "day_1" | "week_1" | "month_1";

export const TRAINING_PHASE_KEYS: TrainingPhase[] = ["day_1", "week_1", "month_1"];

export const TRAINING_PHASE_LABELS: Record<TrainingPhase, string> = {
  day_1: "Day 1",
  week_1: "Week 1",
  month_1: "Month 1",
};

export interface TrainingItem {
  id: string;
  phase: TrainingPhase;
  // Specific training task in sentence form.
  text: string;
}

export interface TrainingSection {
  intro: string;
  items: TrainingItem[];
  last_generated_at: string | null;
}

// ── Planning section keys (the three new V1 sections) ───────────────────────

export type PlanningSectionKey = "roles" | "vendor_contacts" | "training";

export const PLANNING_SECTION_KEYS: PlanningSectionKey[] = [
  "roles",
  "vendor_contacts",
  "training",
];

export const PLANNING_SECTION_LABELS: Record<PlanningSectionKey, string> = {
  roles: "Roles & Shift Responsibilities",
  vendor_contacts: "Vendor & Emergency Contacts",
  training: "New-Hire Training",
};

export const PLANNING_SECTION_TAGLINES: Record<PlanningSectionKey, string> = {
  roles: "Who does what — bar, register, pastry, floor, manager-on-duty.",
  vendor_contacts: "Quick-reference card for the people you call when something breaks.",
  training: "Day 1, Week 1, Month 1 onboarding for every new hire.",
};

// ── Recipes section key (Menu-sourced, read-only) ───────────────────────────

export const RECIPES_SECTION_KEY = "recipes" as const;
export const RECIPES_SECTION_LABEL = "Drink Recipes";
export const RECIPES_SECTION_TAGLINE =
  "Read-only view of the recipes you build in the Menu workspace.";

// ── Combined section key (tabs in the editor) ────────────────────────────────

export type OperationsSectionKey =
  | SopCategoryKey
  | PlanningSectionKey
  | typeof RECIPES_SECTION_KEY;

export const OPERATIONS_SECTION_KEYS: OperationsSectionKey[] = [
  "opening",
  "closing",
  "cleaning",
  "cash_handling",
  "food_safety",
  RECIPES_SECTION_KEY,
  "roles",
  "vendor_contacts",
  "training",
];

export function operationsSectionLabel(key: OperationsSectionKey): string {
  if (key === RECIPES_SECTION_KEY) return RECIPES_SECTION_LABEL;
  if (key in SOP_CATEGORY_LABELS) return SOP_CATEGORY_LABELS[key as SopCategoryKey];
  return PLANNING_SECTION_LABELS[key as PlanningSectionKey];
}

export function operationsSectionTagline(key: OperationsSectionKey): string {
  if (key === RECIPES_SECTION_KEY) return RECIPES_SECTION_TAGLINE;
  if (key in SOP_CATEGORY_TAGLINES) return SOP_CATEGORY_TAGLINES[key as SopCategoryKey];
  return PLANNING_SECTION_TAGLINES[key as PlanningSectionKey];
}

// ── Document shape ───────────────────────────────────────────────────────────

export interface OperationsPlaybookDocument {
  opening: SopCategory;
  closing: SopCategory;
  cleaning: SopCategory;
  cash_handling: SopCategory;
  food_safety: SopCategory;
  roles: RolesSection;
  vendor_contacts: VendorContactsSection;
  training: TrainingSection;
}

// ── Default seeds (SOPs) ─────────────────────────────────────────────────────

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
  plainItem("Count opening cash float against the float policy.", 5),
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
  plainItem("Run end-of-day POS report; pull the Z-report.", 5),
  plainItem("Count till; reconcile against POS report; bag deposit.", 10),
  plainItem("Confirm walk-in and pastry case temperatures are within range before leaving.", 3),
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
  stationItem("Bar", "Replace water filter cartridge on the scheduled monthly date.", "monthly"),
  // Retail floor — daily
  stationItem("Retail Floor", "Wipe customer tables and condiment bar between every clear.", "daily"),
  stationItem("Retail Floor", "Sweep entry mat, customer area, and behind register.", "daily"),
  // Retail floor — weekly
  stationItem("Retail Floor", "Mop hard floors; vacuum any rug areas.", "weekly"),
  stationItem("Retail Floor", "Wipe down menu boards and front-of-house glass.", "weekly"),
  // Restroom — daily
  stationItem("Restroom", "Restock paper goods; wipe sink, mirror, and toilet; mop floor.", "daily"),
  // Walk-in — daily
  stationItem("Walk-In", "Check walk-in and pastry case temperatures (target 38°F / 3°C); escalate anything out of range.", "daily"),
  // Walk-in — weekly
  stationItem("Walk-In", "Wipe shelves; rotate stock; toss anything past code date.", "weekly"),
  // Dish — daily
  stationItem("Dish", "Run dish machine after every rush; clean spray arms; refill sanitizer.", "daily"),
  stationItem("Dish", "Empty and wipe down dish pit and three-compartment sink.", "daily"),
];

export const SEED_CASH_ITEMS: SopChecklistItem[] = [
  plainItem("Open with a $200 float in the till: 1x$20, 5x$10, 10x$5, 50x$1, $30 in coin.", null),
  plainItem("Mid-day drop: when the till exceeds $300 in cash, pull $200 to the safe.", null),
  plainItem("End of day: count till, subtract opening float, reconcile against POS cash total.", null),
  plainItem("Variance threshold: any over/short greater than $5 is flagged and noted with shift names.", null),
  plainItem("Deposit cadence: bank drop every Tuesday and Friday; cash never sits overnight beyond Friday.", null),
  plainItem("Two-person rule: cash count and bag prep are done by two staff members when possible.", null),
];

export const SEED_FOOD_SAFETY_ITEMS: SopChecklistItem[] = [
  plainItem("Allergen matrix posted in the kitchen: list every menu item against milk, soy, gluten, nuts, eggs.", null),
  plainItem("Dedicated allergen kit: separate scoops, pitchers, and tongs marked for nut-free and gluten-free orders.", null),
  plainItem("Wash hands for 20 seconds when starting a shift, after restroom, after handling cash, and between food and drink tasks.", null),
  plainItem("Glove change between handling raw and ready-to-eat foods.", null),
  plainItem("Pastry case temperature target: 34-40°F. Anything outside the range triggers a hold and call to the manager.", null),
  plainItem("Walk-in temperature target: 34-40°F. Anything above 40°F triggers a hold and call to the manager.", null),
  plainItem("Date-label all opened milk, syrups, and prepped food with open date and discard date.", null),
  plainItem("Sanitize any food contact surface with quat at 200ppm or chlorine at 50ppm; verify with a test strip at open and at close.", null),
];

// ── Default seeds (planning sections) ────────────────────────────────────────

function roleAssignment(role: string, responsibilities: string): RoleAssignment {
  return { id: id(), role, responsibilities };
}

export const SEED_ROLES_ITEMS: RoleAssignment[] = [
  roleAssignment(
    "Bar",
    "Pull espresso, steam milk, build drinks. Call out tickets, keep the bar clean, and dial in the grinder when shots drift.",
  ),
  roleAssignment(
    "Register",
    "Greet, take orders, run payments, answer menu questions, ring up retail. Owns the cash drawer for the shift.",
  ),
  roleAssignment(
    "Pastry & Food",
    "Stock and rotate pastry case, plate food orders, manage allergen kit, track waste pulls.",
  ),
  roleAssignment(
    "Floor",
    "Clear tables and condiment bar, restock cups and napkins, sweep entry, handle customer requests on the floor.",
  ),
  roleAssignment(
    "Manager On Duty",
    "Owns the shift: variance calls, allergen incidents, equipment issues, comp decisions, end-of-day close.",
  ),
];

function vendorContact(
  label: string,
  contact_name: string,
  phone: string,
  email: string,
  notes: string,
): VendorContact {
  return { id: id(), label, contact_name, phone, email, notes };
}

export const SEED_VENDOR_CONTACT_ITEMS: VendorContact[] = [
  vendorContact("Espresso Tech", "", "", "", "Service call for machine issues; ask about after-hours rate."),
  vendorContact("Plumber", "", "", "", "Backed-up drains, leaks, water filter line."),
  vendorContact("Alarm Company", "", "", "", "Account number and panel code go here; have them on file for false alarms."),
  vendorContact("Milk Supplier", "", "", "", "Standing order cadence and order cutoff time."),
  vendorContact("Landlord", "", "", "", "Building issues outside the lease line: HVAC, roof, shared utilities."),
  vendorContact("Insurance", "", "", "", "General liability and workers comp; incident reporting line."),
];

function trainingItem(phase: TrainingPhase, text: string): TrainingItem {
  return { id: id(), phase, text };
}

export const SEED_TRAINING_ITEMS: TrainingItem[] = [
  trainingItem("day_1", "Tour the shop: bar, dish pit, walk-in, restroom, alarm panel, electrical, exits."),
  trainingItem("day_1", "Paperwork: I-9, W-4, direct deposit, handbook acknowledgement."),
  trainingItem("day_1", "Read the Concept and Menu workspaces; understand the house story."),
  trainingItem("day_1", "Shadow opening shift; do not run the bar solo."),
  trainingItem("week_1", "Run register under supervision; learn POS, voids, refunds, and tipping."),
  trainingItem("week_1", "Steam milk to standard texture; pour basic rosetta and heart latte art."),
  trainingItem("week_1", "Pass the allergen quiz; demonstrate the allergen kit procedure."),
  trainingItem("week_1", "Complete an opening or closing checklist with the trainer signing off each section."),
  trainingItem("month_1", "Solo bar shift during a non-peak window; trainer present but hands-off."),
  trainingItem("month_1", "Cross-train on pastry stocking and food plate-up."),
  trainingItem("month_1", "30-day check-in with manager: strengths, gaps, next training goals."),
];

// ── Empty document + seeded factory ──────────────────────────────────────────

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
  food_safety: {
    intro:
      "Allergen and temperature protocols protect customers and meet local health code. Out-of-range readings escalate to the manager on duty.",
    items: [],
    last_generated_at: null,
  },
  roles: {
    intro:
      "Every shift assigns these roles. A single person can hold more than one role on a slow shift, but the responsibilities still belong to someone by name.",
    items: [],
    last_generated_at: null,
  },
  vendor_contacts: {
    intro:
      "Print this card and tape it inside the manager's cabinet. When something breaks, the answer is on the wall, not in someone's phone.",
    items: [],
    last_generated_at: null,
  },
  training: {
    intro:
      "Every new hire works through these milestones with a named trainer. The trainer signs off when each milestone is met.",
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
  clone.food_safety.items = SEED_FOOD_SAFETY_ITEMS.map((i) => ({ ...i, id: id() }));
  clone.roles.items = SEED_ROLES_ITEMS.map((r) => ({ ...r, id: id() }));
  clone.vendor_contacts.items = SEED_VENDOR_CONTACT_ITEMS.map((v) => ({ ...v, id: id() }));
  clone.training.items = SEED_TRAINING_ITEMS.map((t) => ({ ...t, id: id() }));
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

function pickPhase(obj: Record<string, unknown> | null | undefined, key: string): TrainingPhase {
  const v = obj?.[key];
  if (v === "day_1" || v === "week_1" || v === "month_1") return v;
  return "day_1";
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

function normalizeRolesSection(input: unknown, fallbackIntro: string): RolesSection {
  if (!input || typeof input !== "object") {
    return { intro: fallbackIntro, items: [], last_generated_at: null };
  }
  const obj = input as Record<string, unknown>;
  const intro = pickString(obj, "intro");
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items = rawItems
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const role = pickString(r, "role");
      const responsibilities = pickString(r, "responsibilities");
      if (!role && !responsibilities) return null;
      return {
        id: pickString(r, "id") || id(),
        role,
        responsibilities,
      } satisfies RoleAssignment;
    })
    .filter((it): it is RoleAssignment => it !== null);
  const lastGen = obj.last_generated_at;
  return {
    intro: intro || fallbackIntro,
    items,
    last_generated_at: typeof lastGen === "string" ? lastGen : null,
  };
}

function normalizeVendorContactsSection(
  input: unknown,
  fallbackIntro: string,
): VendorContactsSection {
  if (!input || typeof input !== "object") {
    return { intro: fallbackIntro, items: [], last_generated_at: null };
  }
  const obj = input as Record<string, unknown>;
  const intro = pickString(obj, "intro");
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items = rawItems
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const label = pickString(r, "label");
      if (!label) return null;
      return {
        id: pickString(r, "id") || id(),
        label,
        contact_name: pickString(r, "contact_name"),
        phone: pickString(r, "phone"),
        email: pickString(r, "email"),
        notes: pickString(r, "notes"),
      } satisfies VendorContact;
    })
    .filter((it): it is VendorContact => it !== null);
  const lastGen = obj.last_generated_at;
  return {
    intro: intro || fallbackIntro,
    items,
    last_generated_at: typeof lastGen === "string" ? lastGen : null,
  };
}

function normalizeTrainingSection(input: unknown, fallbackIntro: string): TrainingSection {
  if (!input || typeof input !== "object") {
    return { intro: fallbackIntro, items: [], last_generated_at: null };
  }
  const obj = input as Record<string, unknown>;
  const intro = pickString(obj, "intro");
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items = rawItems
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const text = pickString(r, "text");
      if (!text) return null;
      return {
        id: pickString(r, "id") || id(),
        phase: pickPhase(r, "phase"),
        text,
      } satisfies TrainingItem;
    })
    .filter((it): it is TrainingItem => it !== null);
  const lastGen = obj.last_generated_at;
  return {
    intro: intro || fallbackIntro,
    items,
    last_generated_at: typeof lastGen === "string" ? lastGen : null,
  };
}

export function normalizeOperationsPlaybook(input: unknown): OperationsPlaybookDocument {
  if (!input || typeof input !== "object") return structuredClone(EMPTY_OPERATIONS_PLAYBOOK);
  const obj = input as Record<string, unknown>;
  // Note: drink_recipes (legacy V1) is intentionally ignored here. Recipes
  // now live in the Menu workspace; any data in obj.drink_recipes is stale
  // and no longer surfaced.
  return {
    opening: normalizeCategory(obj.opening, EMPTY_OPERATIONS_PLAYBOOK.opening.intro),
    closing: normalizeCategory(obj.closing, EMPTY_OPERATIONS_PLAYBOOK.closing.intro),
    cleaning: normalizeCategory(obj.cleaning, EMPTY_OPERATIONS_PLAYBOOK.cleaning.intro),
    cash_handling: normalizeCategory(obj.cash_handling, EMPTY_OPERATIONS_PLAYBOOK.cash_handling.intro),
    food_safety: normalizeCategory(obj.food_safety, EMPTY_OPERATIONS_PLAYBOOK.food_safety.intro),
    roles: normalizeRolesSection(obj.roles, EMPTY_OPERATIONS_PLAYBOOK.roles.intro),
    vendor_contacts: normalizeVendorContactsSection(
      obj.vendor_contacts,
      EMPTY_OPERATIONS_PLAYBOOK.vendor_contacts.intro,
    ),
    training: normalizeTrainingSection(obj.training, EMPTY_OPERATIONS_PLAYBOOK.training.intro),
  };
}

export function isPlaybookEmpty(doc: OperationsPlaybookDocument): boolean {
  return (
    SOP_CATEGORY_KEYS.every((key) => doc[key].items.length === 0) &&
    doc.roles.items.length === 0 &&
    doc.vendor_contacts.items.length === 0 &&
    doc.training.items.length === 0
  );
}

// ── Title Case for AI-generated category content ────────────────────────────
//
// Station labels ("Bar", "Retail Floor") are label-shaped — Title Case.
// Item text is full-sentence guidance — sentence case stays untouched.
export function titleCaseSopCategory(cat: SopCategory): SopCategory {
  return {
    intro: cat.intro ? normalizeAIOutput(cat.intro) : cat.intro,
    last_generated_at: cat.last_generated_at,
    items: cat.items.map((item) => ({
      ...item,
      text: normalizeAIOutput(item.text),
      station: item.station ? toTitleCase(item.station) : null,
    })),
  };
}

export function titleCaseRolesSection(section: RolesSection): RolesSection {
  return {
    intro: section.intro ? normalizeAIOutput(section.intro) : section.intro,
    last_generated_at: section.last_generated_at,
    items: section.items.map((item) => ({
      ...item,
      role: item.role ? toTitleCase(item.role) : item.role,
      responsibilities: item.responsibilities
        ? normalizeAIOutput(item.responsibilities)
        : item.responsibilities,
    })),
  };
}

export function titleCaseVendorContactsSection(
  section: VendorContactsSection,
): VendorContactsSection {
  return {
    intro: section.intro ? normalizeAIOutput(section.intro) : section.intro,
    last_generated_at: section.last_generated_at,
    items: section.items.map((item) => ({
      ...item,
      label: item.label ? toTitleCase(item.label) : item.label,
      contact_name: item.contact_name ? toTitleCase(item.contact_name) : item.contact_name,
      notes: item.notes ? normalizeAIOutput(item.notes) : item.notes,
    })),
  };
}

export function titleCaseTrainingSection(section: TrainingSection): TrainingSection {
  return {
    intro: section.intro ? normalizeAIOutput(section.intro) : section.intro,
    last_generated_at: section.last_generated_at,
    items: section.items.map((item) => ({
      ...item,
      text: normalizeAIOutput(item.text),
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
  lines.push(`**${PLANNING_SECTION_LABELS.roles}**`);
  if (doc.roles.items.length === 0) {
    lines.push("- _no roles defined yet_");
  } else {
    for (const role of doc.roles.items.slice(0, 5)) {
      lines.push(`- ${role.role}: ${role.responsibilities}`);
    }
    if (doc.roles.items.length > 5) {
      lines.push(`- _+${doc.roles.items.length - 5} more_`);
    }
  }
  lines.push("");
  lines.push(`**${PLANNING_SECTION_LABELS.vendor_contacts}**`);
  if (doc.vendor_contacts.items.length === 0) {
    lines.push("- _no contacts yet_");
  } else {
    for (const vc of doc.vendor_contacts.items.slice(0, 5)) {
      const detail = [vc.contact_name, vc.phone].filter(Boolean).join(" / ") || "—";
      lines.push(`- ${vc.label}: ${detail}`);
    }
    if (doc.vendor_contacts.items.length > 5) {
      lines.push(`- _+${doc.vendor_contacts.items.length - 5} more_`);
    }
  }
  lines.push("");
  lines.push(`**${PLANNING_SECTION_LABELS.training}**`);
  if (doc.training.items.length === 0) {
    lines.push("- _no training milestones yet_");
  } else {
    for (const t of doc.training.items.slice(0, 5)) {
      lines.push(`- ${TRAINING_PHASE_LABELS[t.phase]}: ${t.text}`);
    }
    if (doc.training.items.length > 5) {
      lines.push(`- _+${doc.training.items.length - 5} more_`);
    }
  }
  return lines.join("\n").trim();
}
