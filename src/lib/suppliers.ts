// TIM-1059: Suppliers & Vendors workspace shared types + category catalog.

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
  coffee_roaster: "Your beans — espresso, filter, decaf.",
  dairy_altmilk: "Whole milk, half-and-half, oat, almond, soy.",
  bakery: "Pastry partner — daily delivery vs. weekly wholesale.",
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
  category: VendorCategoryKey;
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
  category: VendorCategoryKey;
  candidate_id: string | null;
  vendor_name: string;
  decided_on: string;
  reason: string | null;
  is_current: boolean;
  created_at: string;
}

export function isVendorCategoryKey(value: unknown): value is VendorCategoryKey {
  return typeof value === "string" && (VENDOR_CATEGORY_KEYS as readonly string[]).includes(value);
}

export function isVendorStatus(value: unknown): value is VendorStatus {
  return value === "researching" || value === "shortlisted" || value === "chosen" || value === "rejected";
}
