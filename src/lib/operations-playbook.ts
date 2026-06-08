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

// ── Mobile cart / pop-up seeds (mobile_popup) ────────────────────────────────

export const SEED_OPENING_ITEMS_MOBILE_POPUP: SopChecklistItem[] = [
  plainItem("Confirm commissary kitchen sign-in complete and all prep work done before loading cart.", 5),
  plainItem("Load cart: espresso machine, grinder, batch brewer, water supply, milk cooler, POS hardware.", 15),
  plainItem("Verify generator fuel level; test power output before leaving commissary.", 5),
  plainItem("Check fresh-water tank is full; confirm gray-water tank is empty and sealed.", 3),
  plainItem("Transport to pitch location; set up canopy, signage, and service table.", 20),
  plainItem("Connect power; start espresso machine warm-up sequence. Allow 30 minutes to reach temp.", 30),
  plainItem("Calibrate grinder on-site: pull two test shots and adjust until dialed in.", 10),
  plainItem("Set up POS and confirm mobile signal or hotspot is live.", 3),
  plainItem("Display health permit and mobile food unit license visibly at point of service.", 1),
  plainItem("Count opening cash float; confirm card reader is online.", 5),
  plainItem("Open at posted time.", 1),
];

export const SEED_CLOSING_ITEMS_MOBILE_POPUP: SopChecklistItem[] = [
  plainItem("Stop accepting orders at posted close time. Finish any drinks in queue.", null),
  plainItem("Backflush espresso machine with cleaner; flush group heads three times.", 10),
  plainItem("Drain remaining water from machine reservoir into gray-water container.", 3),
  plainItem("Run POS end-of-day report; count till and reconcile against POS.", 10),
  plainItem("Drain gray-water from sink into sealed container; never dump at pitch.", 5),
  plainItem("Pack and secure all equipment for transport; confirm nothing left at pitch.", 15),
  plainItem("Collect all trash and recyclables; take to commissary for disposal.", 5),
  plainItem("Sweep the pitch area; return space to original condition.", 5),
  plainItem("Return to commissary: sign out, unload, sanitize cart surfaces for next use.", 15),
  plainItem("Charge all batteries and power banks overnight.", 1),
];

export const SEED_CLEANING_ITEMS_MOBILE_POPUP: SopChecklistItem[] = [
  stationItem("Cart Surface", "Wipe espresso machine body, steam wands, and group heads after each drink.", "daily"),
  stationItem("Cart Surface", "Wipe all cart exterior and service counter surfaces at close; rinse gray-water tank.", "daily"),
  stationItem("Cart Surface", "Rinse and wipe milk pitchers; dispose of leftover milk at commissary.", "daily"),
  stationItem("Grinder", "Deep clean grinder hopper; brush burrs and chute.", "weekly"),
  stationItem("Power", "Inspect generator air filter; check fuel lines for wear.", "weekly"),
  stationItem("Water System", "Sanitize fresh-water holding tank per health authority schedule.", "weekly"),
  stationItem("Water System", "Replace water filter on scheduled monthly date; log date and technician.", "monthly"),
];

export const SEED_CASH_ITEMS_MOBILE_POPUP: SopChecklistItem[] = [
  plainItem("Open with a $150 float: 3x$20, 5x$10, 5x$5, 30x$1, $25 coin; sized for small mobile transactions.", null),
  plainItem("Card-first policy: prompt contactless or card at order; cash as secondary.", null),
  plainItem("Mid-day: if till exceeds $200 cash, secure excess in a lockbox stored off the cart.", null),
  plainItem("End of day: count till, reconcile against POS; use mobile deposit app or bank night drop.", null),
  plainItem("Never leave cash in the unattended cart overnight; transport to commissary safe.", null),
  plainItem("Variance threshold: any over/short greater than $5 is flagged and noted with shift names.", null),
];

export const SEED_FOOD_SAFETY_ITEMS_MOBILE_POPUP: SopChecklistItem[] = [
  plainItem("Confirm mobile food unit permit is current and posted visibly before each service.", null),
  plainItem("Fresh water only from commissary-approved source; never fill from untested taps at the pitch.", null),
  plainItem("Verify milk cooler is holding at 40°F or below before opening; log temperature.", null),
  plainItem("Allergen kit travels with the cart: separate scoops and pitchers for nut-free orders, marked and stored.", null),
  plainItem("Wash hands at commissary before loading; use food-safe hand sanitizer at cart when no running water is available.", null),
  plainItem("Discard any dairy held outside refrigeration for more than two hours.", null),
  plainItem("Allergen matrix posted inside cart and visible to staff at all times.", null),
  plainItem("All food contact surfaces sanitized with food-safe wipes or spray at open and close; log in commissary cleaning record.", null),
];

export const SEED_ROLES_ITEMS_MOBILE_POPUP: RoleAssignment[] = [
  roleAssignment(
    "Cart Operator",
    "Runs bar, register, and service. Responsible for all opening, closing, and permit compliance duties.",
  ),
  roleAssignment(
    "Cart Lead (2-Crew)",
    "Leads bar and customer service; oversees cash, permit display, and gray-water disposal.",
  ),
];

export const SEED_VENDOR_CONTACT_ITEMS_MOBILE_POPUP: VendorContact[] = [
  vendorContact("Commissary Kitchen", "", "", "", "License fee, storage access, shared-space rules, cleaning log contact."),
  vendorContact("Generator Service", "", "", "", "Annual servicing schedule, fuel supplier, emergency repair line."),
  vendorContact("Mobile Permit Agency", "", "", "", "Local health authority, permit renewal date, inspection schedule."),
  vendorContact("Espresso Tech", "", "", "", "Machine service; account number and after-hours rate."),
  vendorContact("Insurance", "", "", "", "General liability and mobile unit product liability; incident reporting line."),
  vendorContact("POS / Hotspot Support", "", "", "", "Mobile data plan provider, backup SIM info, Square support line."),
];

export const SEED_TRAINING_ITEMS_MOBILE_POPUP: TrainingItem[] = [
  trainingItem("day_1", "Tour the commissary: shared kitchen layout, storage, cleaning log, sign-in procedure."),
  trainingItem("day_1", "Review mobile food unit permit requirements and local health code for mobile operations."),
  trainingItem("day_1", "Shadow a full load-out, service session, and pack-down cycle."),
  trainingItem("week_1", "Run cart POS and Square reader; practice contactless payments and end-of-day reconciliation."),
  trainingItem("week_1", "Complete opening and closing checklist with trainer sign-off."),
  trainingItem("week_1", "Pass allergen quiz; demonstrate allergen kit procedure for cart use."),
  trainingItem("month_1", "Solo service window during a non-peak pitch; trainer present but hands-off."),
  trainingItem("month_1", "Cross-train on generator startup, water tank maintenance, and permit display protocol."),
  trainingItem("month_1", "30-day check-in with manager: strengths, gaps, next training goals."),
];

// ── Drive-through / kiosk seeds (drive_through) ───────────────────────────────

export const SEED_OPENING_ITEMS_DRIVE_THROUGH: SopChecklistItem[] = [
  plainItem("Unlock kiosk or building; disarm alarm; walk the order lane for overnight debris.", 5),
  plainItem("Power on espresso machine and steam boiler; allow 30 minutes to reach temperature.", 30),
  plainItem("Test drive-thru speaker and intercom; confirm audio is clear from the order board.", 5),
  plainItem("Calibrate grinder: pull two test shots; adjust if needed.", 10),
  plainItem("Stock milk fridge (whole, oat, almond) and confirm pitcher rinser is running.", 5),
  plainItem("Brew first batch of drip coffee and decaf.", 5),
  plainItem("Count opening cash float and confirm card reader at order window is online.", 5),
  plainItem("Log in to POS; enable drive-thru queue mode; confirm order display screen is on.", 3),
  plainItem("Wipe down order window, pass-through window, and counter ledges.", 5),
  plainItem("Confirm menu board lights are on; check digital board is showing current items.", 3),
  plainItem("Open order lane at posted time.", 1),
];

export const SEED_CLOSING_ITEMS_DRIVE_THROUGH: SopChecklistItem[] = [
  plainItem("Close order lane at posted time; stop new cars from entering.", null),
  plainItem("Finish drinks in queue before closing windows.", null),
  plainItem("Backflush espresso machine with cleaner; flush group heads three times.", 10),
  plainItem("Soak portafilters and steam wands; wipe steam tips; run a purge.", 5),
  plainItem("Power down speaker and intercom system.", 2),
  plainItem("Wipe both windows (order and pass-through) inside and outside.", 10),
  plainItem("Run POS end-of-day report; pull Z-report.", 5),
  plainItem("Count till; reconcile against POS; bag deposit.", 10),
  plainItem("Sweep and mop inside; clear any trash or debris from drive-thru lane.", 15),
  plainItem("Confirm pastry case temperature is in range before leaving.", 3),
  plainItem("Turn off equipment, lights, and music. Set alarm; lock all doors.", 5),
];

export const SEED_CLEANING_ITEMS_DRIVE_THROUGH: SopChecklistItem[] = [
  stationItem("Order Window", "Wipe window sill, ledge, and speaker housing exterior after each shift.", "daily"),
  stationItem("Pass-Through Window", "Wipe pass-through window sill, ledge, and glass inside and out.", "daily"),
  stationItem("Bar", "Wipe espresso machine body, steam wands, and group heads after each drink.", "daily"),
  stationItem("Bar", "Backflush espresso machine with cleaner at close.", "daily"),
  stationItem("Bar", "Rinse and wipe milk pitchers; replace pitcher rinser water.", "daily"),
  stationItem("Drive Lane", "Pick up debris from drive lane; inspect tire stops and curbing for damage.", "weekly"),
  stationItem("Bar", "Deep clean grinder hopper; brush burrs and chute.", "weekly"),
  stationItem("Windows", "Deep clean interior window track, ledge, and glass on both windows.", "weekly"),
  stationItem("Equipment", "Inspect headset, speaker, and intercom equipment; log any damage or wear.", "monthly"),
  stationItem("Bar", "Replace water filter cartridge on the scheduled monthly date.", "monthly"),
];

export const SEED_CASH_ITEMS_DRIVE_THROUGH: SopChecklistItem[] = [
  plainItem("Open with a $200 float: standard denomination split.", null),
  plainItem("Two-window flow: payment at order window, drink handoff at pass-through; cash and card at order window only.", null),
  plainItem("Mid-day drop: when till exceeds $300 in cash, pull $200 to safe.", null),
  plainItem("End of day: Z-report reconcile, count till, bag deposit.", null),
  plainItem("Variance threshold: any over/short greater than $5 is flagged with shift names.", null),
  plainItem("Two-person rule: end-of-day count and bag prep done by two staff when possible.", null),
];

export const SEED_FOOD_SAFETY_ITEMS_DRIVE_THROUGH: SopChecklistItem[] = [
  plainItem("Allergen matrix posted at order window and on POS screen for staff reference during order-taking.", null),
  plainItem("No bare-hand contact with drink lids, straws, or cup tops at the pass-through; use sleeve and lid dispensers.", null),
  plainItem("Sanitize both window sills and pass-through surfaces with food-safe wipes at open and close.", null),
  plainItem("Pastry case temperature target: 34-40°F. Anything outside range triggers hold and manager call.", null),
  plainItem("Walk-in temperature target: 34-40°F. Anything above 40°F triggers hold and manager call.", null),
  plainItem("Dedicated allergen kit: separate scoops, pitchers, and tongs for nut-free and gluten-free orders; stored at bar.", null),
  plainItem("Lane blind-spot safety: confirm mirror or camera at order station is clear before staff steps into the lane.", null),
  plainItem("Wash hands for 20 seconds at shift start, after restroom, after handling cash, and between food and drink tasks.", null),
];

export const SEED_ROLES_ITEMS_DRIVE_THROUGH: RoleAssignment[] = [
  roleAssignment(
    "Order Window",
    "Takes orders via headset, processes payment, greets customers. Owns the drive-thru queue and lane timing.",
  ),
  roleAssignment(
    "Bar",
    "Builds drinks against the queue; calls out ETAs to the window when the line stacks.",
  ),
  roleAssignment(
    "Pass-Through Window",
    "Hands drinks to customers; final quality check before passing. Doubles as bar on slow shifts.",
  ),
  roleAssignment(
    "Manager On Duty",
    "Owns the shift: variance calls, incidents, throughput decisions, end-of-day close.",
  ),
];

export const SEED_VENDOR_CONTACT_ITEMS_DRIVE_THROUGH: VendorContact[] = [
  vendorContact("Espresso Tech", "", "", "", "Service call for machine issues; ask about after-hours rate."),
  vendorContact("Speaker / Intercom Provider", "", "", "", "Headset repair, speaker system support; account number here."),
  vendorContact("POS Support", "", "", "", "Drive-thru queue mode troubleshooting; support line and account number."),
  vendorContact("Plumber", "", "", "", "Drains, water line, water filter line."),
  vendorContact("Landlord", "", "", "", "Building and drive-lane issues outside the lease line."),
  vendorContact("Insurance", "", "", "", "General liability and property; incident reporting line."),
];

export const SEED_TRAINING_ITEMS_DRIVE_THROUGH: TrainingItem[] = [
  trainingItem("day_1", "Tour the kiosk: bar, order window, pass-through window, intercom, alarm, exits, and blind-spot mirror."),
  trainingItem("day_1", "Learn headset protocol: how to greet, take orders accurately, and call drinks through."),
  trainingItem("day_1", "Read house Concept and menu; understand upsell and add-on prompts for the drive-thru greeting script."),
  trainingItem("week_1", "Run order window under supervision: headset greeting, order entry, payment processing."),
  trainingItem("week_1", "Learn two-window handoff: when to pass the drink vs. hold and communicate an ETA."),
  trainingItem("week_1", "Pass allergen quiz; practice allergen kit procedure for drive-thru service."),
  trainingItem("week_1", "Complete opening and closing checklist with trainer sign-off."),
  trainingItem("month_1", "Solo order window shift during a non-peak window; trainer present but hands-off."),
  trainingItem("month_1", "Cross-train on bar during active drive-thru service."),
  trainingItem("month_1", "30-day check-in: throughput targets, gaps, next training goals."),
];

// ── Roastery cafe seeds (roastery_cafe) ───────────────────────────────────────

export const SEED_OPENING_ITEMS_ROASTERY_CAFE: SopChecklistItem[] = [
  plainItem("Unlock and alarm off; turn on lights, music, and HVAC.", 3),
  plainItem("Power on espresso machine and steam boiler; allow 30 minutes to reach temperature.", 30),
  plainItem("Power on roaster and run warm-up per manufacturer spec before any roast session.", null),
  plainItem("Calibrate espresso grinder on today's featured roast: pull two test shots and adjust.", 10),
  plainItem("Stock retail bag display; rotate finished-goods inventory FIFO by roast date.", 10),
  plainItem("Brew first batch of drip using the featured house roast.", 5),
  plainItem("Count opening cash float; log in to POS; confirm card reader is online.", 5),
  plainItem("Review roast schedule for the day: check green bean inventory against batch plan.", 5),
  plainItem("Record current green bean inventory (variety, origin, lot number, weight) in roast log before first batch.", 5),
  plainItem("Open at posted time.", 1),
];

export const SEED_CLOSING_ITEMS_ROASTERY_CAFE: SopChecklistItem[] = [
  plainItem("Lock front door at posted close time; flip sign to Closed.", null),
  plainItem("Stop accepting orders; finish drinks in queue.", null),
  plainItem("Backflush espresso machine with cleaner; flush group heads.", 10),
  plainItem("If roasting today: begin roaster cooldown per manufacturer procedure; do not leave unattended.", null),
  plainItem("Record final roast log entries: batch number, bean variety, weight in/out, roast level, cupping notes.", 5),
  plainItem("Weigh and bag finished roast batches; apply roast date and roast level labels.", 10),
  plainItem("Run POS end-of-day report; count till; bag deposit.", 15),
  plainItem("Wipe bar, retail counter, and cupping station; rinse spittoons and spoon sets.", 10),
  plainItem("Sweep and mop; take out trash and recycling.", 15),
  plainItem("Confirm roaster is fully cooled and ventilation is off before setting alarm.", null),
  plainItem("Set alarm; lock all doors.", 3),
];

export const SEED_CLEANING_ITEMS_ROASTERY_CAFE: SopChecklistItem[] = [
  stationItem("Bar", "Wipe espresso machine body, steam wands, and group heads after each drink.", "daily"),
  stationItem("Bar", "Backflush espresso machine with cleaner at close.", "daily"),
  stationItem("Bar", "Rinse and wipe milk pitchers; replace pitcher rinser water.", "daily"),
  stationItem("Cupping Station", "Rinse spittoons, tumblers, and spoon sets; wipe down station after each session.", "daily"),
  stationItem("Retail", "Wipe retail bag display counter and signage.", "daily"),
  stationItem("Roaster", "Empty chaff tray after every roast session; check chaff collector for buildup.", "daily"),
  stationItem("Bar", "Deep clean grinder hopper; brush burrs and chute.", "weekly"),
  stationItem("Roaster", "Clean chaff collector; wipe drum exterior and ventilation hood.", "weekly"),
  stationItem("Retail Floor", "Mop hard floors; wipe menu boards and front-of-house glass.", "weekly"),
  stationItem("Roaster", "Full service inspection per manufacturer schedule; log in maintenance file.", "monthly"),
  stationItem("Bar", "Replace water filter cartridge on scheduled monthly date.", "monthly"),
];

export const SEED_CASH_ITEMS_ROASTERY_CAFE: SopChecklistItem[] = [
  plainItem("Open with a $200 float: standard denomination split.", null),
  plainItem("Mid-day drop: when till exceeds $300 in cash, pull $200 to safe.", null),
  plainItem("Retail sales (bags, merch, cupping tickets): ring under the correct product category in POS.", null),
  plainItem("Wholesale invoices: handled outside POS; retain paper invoice and log in weekly reconcile.", null),
  plainItem("End of day: count till; reconcile against POS Z-report; bag deposit.", null),
  plainItem("Variance threshold: any over/short greater than $5 is flagged with shift names.", null),
  plainItem("Two-person rule: cash count and bag prep done by two staff when possible.", null),
];

export const SEED_FOOD_SAFETY_ITEMS_ROASTERY_CAFE: SopChecklistItem[] = [
  plainItem("Green bean intake QC: inspect each new lot for moisture damage, mold, or pest evidence. Reject and return any suspect bags; log in roast log.", null),
  plainItem("Roast log discipline: every batch logged with date, green bean variety and lot number, weight in/out, roast level, and any anomalies.", null),
  plainItem("Finished-goods labeling: every retail bag labeled with roast date, variety, origin, and roast level before sale.", null),
  plainItem("Cupping protocol: rinse all cupping vessels and spoons with boiling water before each session; discard all cupped samples, no re-use.", null),
  plainItem("Blend record-keeping: log component varieties and percentages for every blended product; update the blend log if ratios change.", null),
  plainItem("Allergen matrix posted in kitchen: most roasted coffee has no common allergens, but list any flavored or ingredient-added products.", null),
  plainItem("Roaster fire safety: chaff is flammable. Never leave roaster unattended during a batch. Know the CO2 extinguisher location; keep the chaff tray empty.", null),
  plainItem("Wash hands for 20 seconds at shift start, after restroom, after handling cash, and between food and drink tasks.", null),
];

export const SEED_ROLES_ITEMS_ROASTERY_CAFE: RoleAssignment[] = [
  roleAssignment(
    "Bar",
    "Pulls espresso on featured roasts; coaches customers on origin and flavor notes; calls out tickets.",
  ),
  roleAssignment(
    "Register",
    "Greets, takes orders, handles retail bag sales, answers origin and roast-level questions. Owns the cash drawer.",
  ),
  roleAssignment(
    "Roaster",
    "Runs all roast batches; maintains green bean intake QC, roast logs, and finished-goods records. Does not run bar while a batch is in the drum.",
  ),
  roleAssignment(
    "Retail / Floor",
    "Stocks bag display, restocks cups and napkins, clears tables, handles customer requests on the floor.",
  ),
  roleAssignment(
    "Manager On Duty",
    "Owns the shift: variance calls, allergen incidents, roast schedule decisions, quality sign-offs, end-of-day close.",
  ),
];

export const SEED_VENDOR_CONTACT_ITEMS_ROASTERY_CAFE: VendorContact[] = [
  vendorContact("Green Bean Importer", "", "", "", "Primary lot purchasing, sample requests, harvest updates; account rep contact."),
  vendorContact("Roaster Manufacturer Service", "", "", "", "Annual service schedule, burner calibration, drum replacement; account number."),
  vendorContact("Espresso Tech", "", "", "", "Machine service; account number and after-hours rate."),
  vendorContact("Ventilation / HVAC", "", "", "", "Roastery exhaust and make-up air system; confirm roasting ventilation is in scope."),
  vendorContact("Insurance", "", "", "", "General liability and equipment coverage; note any roastery rider or endorsement."),
  vendorContact("Landlord", "", "", "", "Building and lease issues; confirm smoke and exhaust venting is within lease scope."),
];

export const SEED_TRAINING_ITEMS_ROASTERY_CAFE: TrainingItem[] = [
  trainingItem("day_1", "Tour the roastery: bar, roaster area, green bean storage, cupping station, retail display, alarm, exits, CO2 extinguisher location."),
  trainingItem("day_1", "Paperwork and handbook; read the Concept, Menu, and current featured roast origin cards."),
  trainingItem("day_1", "Shadow the roaster during a batch: observe intake QC, loading, roast curve, and cooldown."),
  trainingItem("week_1", "Run register under supervision; learn retail bag sales and how to describe origins and roast levels to customers."),
  trainingItem("week_1", "Attend a cupping session; learn basic flavor wheel vocabulary and how to give and receive cupping feedback."),
  trainingItem("week_1", "Pass allergen quiz; understand roastery-specific food safety (chaff fire risk and CO2 extinguisher protocol)."),
  trainingItem("week_1", "Complete opening and closing checklist with trainer sign-off."),
  trainingItem("month_1", "Solo bar shift on featured roasts; trainer present but hands-off."),
  trainingItem("month_1", "Assist on a full roast batch from green bean intake QC through bagging and labeling."),
  trainingItem("month_1", "30-day check-in: bar competency, roast vocabulary, retail storytelling; strengths and gaps."),
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

export function seededPlaybook(shopType?: string): OperationsPlaybookDocument {
  const clone = structuredClone(EMPTY_OPERATIONS_PLAYBOOK);

  if (shopType === "mobile_popup") {
    clone.opening.intro =
      "Run this checklist at the commissary before you leave and again at your pitch. Your espresso machine needs 30 minutes from cold; start it the moment you have power.";
    clone.opening.items = SEED_OPENING_ITEMS_MOBILE_POPUP.map((i) => ({ ...i, id: id() }));
    clone.closing.intro =
      "Break down in reverse order. Gray-water and trash return to the commissary: never dump at the pitch.";
    clone.closing.items = SEED_CLOSING_ITEMS_MOBILE_POPUP.map((i) => ({ ...i, id: id() }));
    clone.cleaning.intro =
      "Daily tasks happen at the commissary after each service. Weekly tasks are commissary-side deep cleans. Generator and water system maintenance is on a fixed schedule.";
    clone.cleaning.items = SEED_CLEANING_ITEMS_MOBILE_POPUP.map((i) => ({ ...i, id: id() }));
    clone.cash_handling.intro =
      "Card-first operation: most mobile customers pay contactless. Keep cash protocol tight; no overnight cash in an unattended cart.";
    clone.cash_handling.items = SEED_CASH_ITEMS_MOBILE_POPUP.map((i) => ({ ...i, id: id() }));
    clone.food_safety.intro =
      "Mobile food units have additional permit requirements. Your permit must be current and visible at every service. Water and waste handling are the two things health inspectors check first.";
    clone.food_safety.items = SEED_FOOD_SAFETY_ITEMS_MOBILE_POPUP.map((i) => ({ ...i, id: id() }));
    clone.roles.intro =
      "Most mobile service runs on one or two crew. One person holds all roles on a solo shift; both responsibilities still apply.";
    clone.roles.items = SEED_ROLES_ITEMS_MOBILE_POPUP.map((r) => ({ ...r, id: id() }));
    clone.vendor_contacts.items = SEED_VENDOR_CONTACT_ITEMS_MOBILE_POPUP.map((v) => ({ ...v, id: id() }));
    clone.training.intro =
      "Every new cart crew member works through these milestones with a named trainer. The trainer signs off when each milestone is met.";
    clone.training.items = SEED_TRAINING_ITEMS_MOBILE_POPUP.map((t) => ({ ...t, id: id() }));
  } else if (shopType === "drive_through") {
    clone.opening.intro =
      "Run this checklist 45 minutes before the lane opens. Test the speaker system first: a dead intercom is a closed lane.";
    clone.opening.items = SEED_OPENING_ITEMS_DRIVE_THROUGH.map((i) => ({ ...i, id: id() }));
    clone.closing.intro =
      "Close the lane at posted time. Finish the queue before closing windows; never turn away a car already in line.";
    clone.closing.items = SEED_CLOSING_ITEMS_DRIVE_THROUGH.map((i) => ({ ...i, id: id() }));
    clone.cleaning.intro =
      "Window ledges and the drive lane are unique to your setup. Keep them clean: customers judge the brand by what they see from the car.";
    clone.cleaning.items = SEED_CLEANING_ITEMS_DRIVE_THROUGH.map((i) => ({ ...i, id: id() }));
    clone.cash_handling.intro =
      "Card is the dominant payment at the window. Keep the two-window handoff clean: cash and card at the first window, drinks at the second.";
    clone.cash_handling.items = SEED_CASH_ITEMS_DRIVE_THROUGH.map((i) => ({ ...i, id: id() }));
    clone.food_safety.intro =
      "The drive-thru window is a contamination point. Lids, straws, and sleeves go straight to the customer. No bare-hand contact with drink tops.";
    clone.food_safety.items = SEED_FOOD_SAFETY_ITEMS_DRIVE_THROUGH.map((i) => ({ ...i, id: id() }));
    clone.roles.intro =
      "Drive-thru runs on clear handoffs. The order window and bar must communicate: a stacked queue is managed together, not in silos.";
    clone.roles.items = SEED_ROLES_ITEMS_DRIVE_THROUGH.map((r) => ({ ...r, id: id() }));
    clone.vendor_contacts.items = SEED_VENDOR_CONTACT_ITEMS_DRIVE_THROUGH.map((v) => ({ ...v, id: id() }));
    clone.training.intro =
      "Drive-thru rhythm is the hardest thing to learn. Prioritize headset protocol and queue timing in Week 1.";
    clone.training.items = SEED_TRAINING_ITEMS_DRIVE_THROUGH.map((t) => ({ ...t, id: id() }));
  } else if (shopType === "roastery_cafe") {
    clone.opening.intro =
      "Run this checklist 45 minutes before open. Check the roast schedule first. If you have a batch today, you need 90 minutes of lead time from roaster cold-start to first pull.";
    clone.opening.items = SEED_OPENING_ITEMS_ROASTERY_CAFE.map((i) => ({ ...i, id: id() }));
    clone.closing.intro =
      "If you roasted today, the roaster takes longest to cool. Start the cooldown before you close the bar. Never leave a warm roaster unattended.";
    clone.closing.items = SEED_CLOSING_ITEMS_ROASTERY_CAFE.map((i) => ({ ...i, id: id() }));
    clone.cleaning.intro =
      "The roaster adds a cleaning layer the standard cafe playbook does not cover. Chaff builds up: keep the tray empty and the hood clean.";
    clone.cleaning.items = SEED_CLEANING_ITEMS_ROASTERY_CAFE.map((i) => ({ ...i, id: id() }));
    clone.cash_handling.intro =
      "Standard float and drop policy applies. Retail bag and wholesale sales need separate category tracking in POS for accurate reporting.";
    clone.cash_handling.items = SEED_CASH_ITEMS_ROASTERY_CAFE.map((i) => ({ ...i, id: id() }));
    clone.food_safety.intro =
      "Roastery food safety has two layers: standard cafe protocol plus roast-specific QC. Green bean intake and chaff fire risk are things a standard cafe playbook will not warn you about.";
    clone.food_safety.items = SEED_FOOD_SAFETY_ITEMS_ROASTERY_CAFE.map((i) => ({ ...i, id: id() }));
    clone.roles.intro =
      "The roaster role is protected. The person running a batch cannot also run the bar. Both need focused attention.";
    clone.roles.items = SEED_ROLES_ITEMS_ROASTERY_CAFE.map((r) => ({ ...r, id: id() }));
    clone.vendor_contacts.items = SEED_VENDOR_CONTACT_ITEMS_ROASTERY_CAFE.map((v) => ({ ...v, id: id() }));
    clone.training.intro =
      "Roastery staff need two skill sets: cafe service and roast literacy. Build both in parallel. Do not wait until month 2 to introduce the roaster.";
    clone.training.items = SEED_TRAINING_ITEMS_ROASTERY_CAFE.map((t) => ({ ...t, id: id() }));
  } else {
    clone.opening.items = SEED_OPENING_ITEMS.map((i) => ({ ...i, id: id() }));
    clone.closing.items = SEED_CLOSING_ITEMS.map((i) => ({ ...i, id: id() }));
    clone.cleaning.items = SEED_CLEANING_ITEMS.map((i) => ({ ...i, id: id() }));
    clone.cash_handling.items = SEED_CASH_ITEMS.map((i) => ({ ...i, id: id() }));
    clone.food_safety.items = SEED_FOOD_SAFETY_ITEMS.map((i) => ({ ...i, id: id() }));
    clone.roles.items = SEED_ROLES_ITEMS.map((r) => ({ ...r, id: id() }));
    clone.vendor_contacts.items = SEED_VENDOR_CONTACT_ITEMS.map((v) => ({ ...v, id: id() }));
    clone.training.items = SEED_TRAINING_ITEMS.map((t) => ({ ...t, id: id() }));
  }

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
