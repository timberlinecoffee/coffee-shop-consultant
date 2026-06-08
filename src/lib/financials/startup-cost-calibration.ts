// TIM-2519: Calibrate one-time startup-cost defaults to shop-type × city-tier.
//
// The legacy defaultStartupCosts() returns a single ~$284k template that is
// 2-4× too low for a large café ($400-700k real range) and 3-6× too high for
// a mobile cart ($40-80k). Round-2 QA (CQ-03) flagged this as a Major
// financial-accuracy / planning-harm issue.
//
// This module returns shape-identical StartupCosts buckets, calibrated to a
// per-shop-type baseline total and scaled by a city-tier multiplier:
//
//   total = SHOP_TYPE_BASES[type] × CITY_TIER_MULTIPLIERS[tier]
//
// Buckets are then proportioned from a per-shop-type bucket-share table so
// every downstream surface (P&L depreciation, balance sheet, runway callout)
// keeps reading the same fields it already reads.
//
// Backward-compat: defaultStartupCosts() with no args is unchanged. Only
// new-plan financial_models row creation paths call calibrateStartupCosts().
// Existing rows are not migrated — owner-set values are owner-set values.
//
// Coordination: SHOP_TYPE_BASES + CITY_TIERS values pending Data Analyst
// sign-off (preferred dataset: SCORE / NRA). The table below is the
// engineering best-pass authored from the CQ-03 ticket spec and SBA
// long-form opening cost ranges. Update CITY_TIERS to add Tier 3 entries
// once the Data Analyst confirms the small-market list.

import type { StartupCosts } from "../financial-projection.ts";

// Canonical shop-type keys for the calibration table. These are NOT the
// onboarding display strings — pickShopTypeKey() maps display → canonical.
export type ShopTypeKey =
  | "mobile_cart"
  | "espresso_bar"
  | "drive_thru"
  | "full_cafe"
  | "roastery_retail";

export type CityTier = "tier1" | "tier2" | "tier3";

// Baseline (Tier 2) total opening cost per shop type, in cents.
// Source: TIM-2519 plan / SBA opening-cost long-form ranges.
export const SHOP_TYPE_BASES_CENTS: Record<ShopTypeKey, number> = {
  mobile_cart:     5_000_000,   // $50k
  espresso_bar:   12_000_000,   // $120k
  drive_thru:     25_000_000,   // $250k
  full_cafe:      35_000_000,   // $350k
  roastery_retail:40_000_000,   // $400k
};

// City-tier multipliers applied uniformly across all buckets.
export const CITY_TIER_MULTIPLIERS: Record<CityTier, number> = {
  tier1: 1.4,  // Seattle, SF, NYC, LA, Toronto, Melbourne, Sydney
  tier2: 1.0,  // Austin, Calgary, Mexico City, Denver, most metros
  tier3: 0.8,  // Small-market US/CAN (Data Analyst to enumerate)
};

// Bucket share of total per shop type. Shares sum to 1.0; each row is an
// engineering best-pass for how a realistic opening budget is decomposed.
// Build-out and equipment are capex (depreciate per TIM-1246). Working
// capital + cash buffer drive the opening-runway callout (TIM-2517).
type BucketShares = {
  buildout: number;
  equipment: number;
  deposits: number;
  licenses: number;
  pre_opening_marketing: number;
  initial_inventory: number;
  startup_supplies: number;
  professional_fees: number;
  working_capital_reserve: number;
  opening_cash_buffer: number;
};

const SHOP_TYPE_BUCKET_SHARES: Record<ShopTypeKey, BucketShares> = {
  // Mobile cart $50k baseline: cart fab + minimal permits + light reserve.
  mobile_cart: {
    buildout: 0.10,                  // $5k
    equipment: 0.40,                 // $20k (cart, espresso, grinder)
    deposits: 0.04,                  // $2k (commissary, storage)
    licenses: 0.06,                  // $3k (mobile + health + commissary)
    pre_opening_marketing: 0.02,     // $1k
    initial_inventory: 0.02,         // $1k
    startup_supplies: 0.00,
    professional_fees: 0.02,         // $1k
    working_capital_reserve: 0.24,   // $12k (≈3 mo mobile opex)
    opening_cash_buffer: 0.10,       // $5k
  },
  // Espresso bar $120k baseline: small footprint, lower buildout, no kitchen.
  espresso_bar: {
    buildout: 0.4167,                // $50k
    equipment: 0.2917,               // $35k
    deposits: 0.0333,                // $4k
    licenses: 0.0167,                // $2k
    pre_opening_marketing: 0.0083,   // $1k
    initial_inventory: 0.0083,       // $1k
    startup_supplies: 0.00,
    professional_fees: 0.0083,       // $1k
    working_capital_reserve: 0.15,   // $18k
    opening_cash_buffer: 0.0667,     // $8k
  },
  // Drive-thru $250k baseline: heavy buildout (lane, civil, canopy).
  drive_thru: {
    buildout: 0.48,                  // $120k
    equipment: 0.20,                 // $50k (drive-thru speaker + bar)
    deposits: 0.032,                 // $8k
    licenses: 0.02,                  // $5k
    pre_opening_marketing: 0.012,    // $3k
    initial_inventory: 0.008,        // $2k
    startup_supplies: 0.00,
    professional_fees: 0.008,        // $2k
    working_capital_reserve: 0.16,   // $40k
    opening_cash_buffer: 0.08,       // $20k
  },
  // Full café $350k baseline: kitchen, seating, kit (TIM-2519 ticket spec).
  full_cafe: {
    buildout: 0.5286,                // $185k
    equipment: 0.1714,               // $60k
    deposits: 0.0286,                // $10k
    licenses: 0.0143,                // $5k
    pre_opening_marketing: 0.0114,   // $4k
    initial_inventory: 0.0086,       // $3k
    startup_supplies: 0.00,
    professional_fees: 0.0086,       // $3k
    working_capital_reserve: 0.1571, // $55k
    opening_cash_buffer: 0.0714,     // $25k
  },
  // Roastery+retail $400k baseline: roaster + café equipment + production.
  roastery_retail: {
    buildout: 0.50,                  // $200k
    equipment: 0.225,                // $90k (roaster + cafe)
    deposits: 0.025,                 // $10k
    licenses: 0.0125,                // $5k
    pre_opening_marketing: 0.0025,   // $1k
    initial_inventory: 0.0025,       // $1k
    startup_supplies: 0.00,
    professional_fees: 0.0075,       // $3k
    working_capital_reserve: 0.15,   // $60k
    opening_cash_buffer: 0.075,      // $30k
  },
};

// Onboarding display strings → canonical key. When the user multi-selects,
// pickShopTypeKey() resolves to the most capital-intensive choice so we err
// on the side of telling them opening costs more than under-stating it.
const DISPLAY_TO_KEY: Record<string, ShopTypeKey> = {
  "Mobile cart or pop-up": "mobile_cart",
  "Mobile cart or kiosk": "mobile_cart",
  "Espresso bar (drinks only)": "espresso_bar",
  "Drive-through": "drive_thru",
  "Drive-through or kiosk": "drive_thru",
  "Drive-through or walk-up window": "drive_thru",
  "Full cafe with food": "full_cafe",
  "Roastery cafe": "roastery_retail",
};

// Priority order when the user selects multiple types: pick the largest
// opening-cost model. Avoids a Roastery+Mobile selection seeding $50k.
const KEY_PRIORITY: ShopTypeKey[] = [
  "roastery_retail",
  "full_cafe",
  "drive_thru",
  "espresso_bar",
  "mobile_cart",
];

export function pickShopTypeKey(
  onboardingShopTypes: ReadonlyArray<string> | null | undefined,
): ShopTypeKey {
  if (!onboardingShopTypes || onboardingShopTypes.length === 0) {
    return "full_cafe";
  }
  const mapped = new Set<ShopTypeKey>();
  for (const display of onboardingShopTypes) {
    const key = DISPLAY_TO_KEY[display];
    if (key) mapped.add(key);
  }
  if (mapped.size === 0) return "full_cafe";
  for (const candidate of KEY_PRIORITY) {
    if (mapped.has(candidate)) return candidate;
  }
  return "full_cafe";
}

// City → tier overrides. Lower-case keys; pickCityTier() lower-cases input.
// Pending Data Analyst sign-off (TIM-2519 coordination ask).
const CITY_TIERS: Record<string, CityTier> = {
  // Tier 1 (+40%)
  "seattle": "tier1",
  "seatac": "tier1",
  "san francisco": "tier1",
  "new york": "tier1",
  "new york city": "tier1",
  "nyc": "tier1",
  "los angeles": "tier1",
  "toronto": "tier1",
  "melbourne": "tier1",
  "sydney": "tier1",
  // Tier 2 (baseline) — explicit so they don't surprise-classify as Tier 3
  // when the Tier 3 list ships.
  "austin": "tier2",
  "calgary": "tier2",
  "mexico city": "tier2",
  "cdmx": "tier2",
  "denver": "tier2",
  // Tier 3 (-20%) — left empty pending Data Analyst confirmation. Add to
  // this map when the small-market US/CAN list is signed off.
};

function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const trimmed = city.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function pickCityTier(
  city: string | null | undefined,
  _countryCode?: string | null | undefined,
): CityTier {
  const normalized = normalizeCity(city);
  if (normalized && CITY_TIERS[normalized]) return CITY_TIERS[normalized];
  return "tier2";
}

export interface CalibrationSignal {
  shopTypes?: ReadonlyArray<string> | null;
  city?: string | null;
  countryCode?: string | null;
  buildoutUsefulLifeYears?: number;
  equipmentUsefulLifeYears?: number;
}

// Round-to-nearest-$100 keeps the seeded totals readable on the Startup tab
// without losing accuracy below the noise floor of an opening budget.
function roundCents(value: number): number {
  return Math.round(value / 10000) * 10000;
}

export function calibrateStartupCosts(
  signal: CalibrationSignal | null | undefined,
): StartupCosts {
  const shopTypeKey = pickShopTypeKey(signal?.shopTypes);
  const tier = pickCityTier(signal?.city, signal?.countryCode);
  const base = SHOP_TYPE_BASES_CENTS[shopTypeKey];
  const multiplier = CITY_TIER_MULTIPLIERS[tier];
  const total = base * multiplier;
  const shares = SHOP_TYPE_BUCKET_SHARES[shopTypeKey];
  return {
    buildout_cents: roundCents(total * shares.buildout),
    equipment_cents: roundCents(total * shares.equipment),
    deposits_cents: roundCents(total * shares.deposits),
    licenses_cents: roundCents(total * shares.licenses),
    pre_opening_marketing_cents: roundCents(total * shares.pre_opening_marketing),
    initial_inventory_cents: roundCents(total * shares.initial_inventory),
    startup_supplies_cents: roundCents(total * shares.startup_supplies),
    professional_fees_cents: roundCents(total * shares.professional_fees),
    working_capital_reserve_cents: roundCents(total * shares.working_capital_reserve),
    opening_cash_buffer_cents: roundCents(total * shares.opening_cash_buffer),
    buildout_useful_life_years: signal?.buildoutUsefulLifeYears ?? 15,
    equipment_useful_life_years: signal?.equipmentUsefulLifeYears ?? 7,
  };
}

export function startupCostsTotalCents(sc: StartupCosts): number {
  return (
    sc.buildout_cents +
    sc.equipment_cents +
    sc.deposits_cents +
    sc.licenses_cents +
    sc.pre_opening_marketing_cents +
    sc.initial_inventory_cents +
    sc.startup_supplies_cents +
    sc.professional_fees_cents +
    sc.working_capital_reserve_cents +
    sc.opening_cash_buffer_cents
  );
}
