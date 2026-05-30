// TIM-1059: Suppliers & Vendors workspace shared types + category catalog.
// TIM-1414: Custom categories — keys are either a seeded VendorCategoryKey or
// a plan-scoped "custom:<slug>" stored in vendor_custom_categories.

export const VENDOR_CATEGORY_KEYS = [
  "coffee_roaster",
  "dairy_altmilk",
  "bakery",
  "syrups_sauces",
  "tea",
  "packaging",
  "cleaning_chemicals",
  "equipment_service",
  "other",
] as const;

export type VendorCategoryKey = (typeof VENDOR_CATEGORY_KEYS)[number];

// TIM-1414: union of seeded and custom keys. Custom keys are namespaced so they
// never collide with seeded keys, and the API/UI can branch on the prefix.
export type VendorCategoryId = VendorCategoryKey | `custom:${string}`;

export const VENDOR_CATEGORY_LABELS: Record<VendorCategoryKey, string> = {
  coffee_roaster: "Coffee Roaster",
  dairy_altmilk: "Dairy & Alt-Milk",
  bakery: "Bakery",
  syrups_sauces: "Syrups & Sauces",
  tea: "Tea",
  packaging: "Packaging",
  cleaning_chemicals: "Cleaning & Chemicals",
  equipment_service: "Equipment Service",
  other: "Other",
};

export const VENDOR_CATEGORY_SUBTITLES: Record<VendorCategoryKey, string> = {
  coffee_roaster: "Your beans: espresso, filter, decaf.",
  dairy_altmilk: "Whole milk, half-and-half, oat, almond, soy.",
  bakery: "Pastry partner: daily delivery vs. weekly wholesale.",
  syrups_sauces: "Vanilla, caramel, hazelnut, lavender, simple syrup.",
  tea: "Loose leaf, matcha, chai, herbal.",
  packaging: "Cups, lids, sleeves, takeaway bags, straws.",
  cleaning_chemicals: "Cafiza, sanitizer, grinder cleaner, dish soap.",
  equipment_service: "Espresso machine tech, grinder service, plumber.",
  other: "POS, software, insurance, misc.",
};

export type VendorStatus = "researching" | "shortlisted" | "chosen" | "rejected";

export interface VendorCandidate {
  id: string;
  plan_id: string;
  category: VendorCategoryId;
  name: string;
  contact: string | null;
  price_per_unit: string | null;
  minimum_order: string | null;
  lead_time: string | null;
  notes: string | null;
  status: VendorStatus;
  source: "ai_suggested" | "user_added";
  position: number;
  created_at: string;
  updated_at: string;
}

export interface VendorDecision {
  id: string;
  plan_id: string;
  category: VendorCategoryId;
  candidate_id: string | null;
  vendor_name: string;
  decided_on: string;
  reason: string | null;
  is_current: boolean;
  created_at: string;
}

export interface VendorCustomCategory {
  id: string;
  plan_id: string;
  key: string; // canonical form: "custom:<slug>"
  label: string;
  position: number;
  created_at: string;
}

export function isSeededCategoryKey(value: unknown): value is VendorCategoryKey {
  return typeof value === "string" && (VENDOR_CATEGORY_KEYS as readonly string[]).includes(value);
}

export function isCustomCategoryKey(value: unknown): value is `custom:${string}` {
  return typeof value === "string" && /^custom:[a-z0-9_-]{1,40}$/.test(value);
}

export function isVendorCategoryId(value: unknown): value is VendorCategoryId {
  return isSeededCategoryKey(value) || isCustomCategoryKey(value);
}

// Back-compat shim — existing callers expect this name.
export const isVendorCategoryKey = isVendorCategoryId;

export function isVendorStatus(value: unknown): value is VendorStatus {
  return value === "researching" || value === "shortlisted" || value === "chosen" || value === "rejected";
}

// TIM-1414: deterministic slug from a label so custom keys are stable.
export function slugifyCategoryLabel(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || `custom_${Date.now().toString(36)}`;
}

export function customCategoryKey(slug: string): `custom:${string}` {
  return `custom:${slug}` as `custom:${string}`;
}

// Resolve a label for any category id (seeded or custom) given the loaded
// custom-category index.
export function resolveCategoryLabel(
  id: VendorCategoryId,
  customById: Map<string, VendorCustomCategory>
): string {
  if (isSeededCategoryKey(id)) return VENDOR_CATEGORY_LABELS[id];
  const c = customById.get(id);
  return c?.label ?? "Custom category";
}
