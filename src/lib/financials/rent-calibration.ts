// TIM-2522 (CQ-08): Calibrate default monthly rent to shop-type × city-tier
// (with a separate Mexico City row) and FX-convert to the plan's currency.
//
// The legacy defaultForecastLines() seeds Rent at a flat $4,500/mo, which
// Round-2 QA flagged as Major financial-accuracy: too low for Seattle /
// Toronto / Melbourne / SF / NYC; too high for Mexico City. Only Austin and
// Calgary land near reasonable on the legacy default.
//
// This module returns a shape-identical `monthly_rent_cents` value, computed
// as USD_baseline × FX(currency), where the USD baseline comes from the
// shop-type × city-tier table in the CQ-08 ticket spec.
//
// Backward-compat: defaultMonthlyProjections() with no args is unchanged
// (used by the xlsx/pdf normalization paths). Only new-plan financial_models
// row creation paths call calibrateRent(); existing rows are not migrated —
// owner-set values are owner-set values.
//
// Coordination: USD baselines pending Data Analyst sign-off (preferred
// dataset: Cushman & Wakefield retail rent reports + NCREIF index). The
// table is the engineering best-pass authored from the CQ-08 ticket spec.

import {
  pickShopTypeKey,
  pickCityTier,
  type ShopTypeKey,
  type CityTier,
} from "./startup-cost-calibration.ts";

// Rent tier extends the shared CityTier with a separate `mexico` row. CQ-08
// calls out Mexico City explicitly as a fourth bucket because its rent
// floor is materially below even our Tier 3 small-market US/CAN baseline.
export type RentTier = CityTier | "mexico";

// USD-cents baseline rent per (shop type, rent tier). Source: CQ-08 ticket
// spec table. Values are USD-equivalent; FX conversion to the plan's
// currency happens in calibrateRent().
//
// `drive_thru` × `mexico` is `null` because the drive-thru pattern is
// effectively absent in CDMX micro-blocks — we fall back to Tier 2 for
// that combination rather than seed a misleading number.
export const RENT_USD_CENTS: Record<
  ShopTypeKey,
  Record<RentTier, number | null>
> = {
  mobile_cart: {
    tier1: 120_000,   // $1,200
    tier2: 80_000,    // $800
    tier3: 50_000,    // $500
    mexico: 40_000,   // $400
  },
  espresso_bar: {
    tier1: 550_000,   // $5,500
    tier2: 400_000,   // $4,000
    tier3: 280_000,   // $2,800
    mexico: 220_000,  // $2,200
  },
  drive_thru: {
    tier1: 480_000,   // $4,800
    tier2: 380_000,   // $3,800
    tier3: 280_000,   // $2,800
    mexico: null,     // n/a — fall back to Tier 2
  },
  full_cafe: {
    tier1: 900_000,   // $9,000
    tier2: 650_000,   // $6,500
    tier3: 420_000,   // $4,200
    mexico: 350_000,  // $3,500
  },
  roastery_retail: {
    tier1: 750_000,   // $7,500
    tier2: 550_000,   // $5,500
    tier3: 380_000,   // $3,800
    mexico: 300_000,  // $3,000
  },
};

// USD → local FX multipliers. Same table as TIM-2521 revenue-calibration.
// Held flat (no live rates) because seeds are rough planning numbers, not
// invoices — owners adjust once they sign a real lease.
const FX_FROM_USD: Record<string, number> = {
  USD: 1.0,
  CAD: 1.37,
  AUD: 1.50,
  GBP: 0.78,
  EUR: 0.92,
  MXN: 18.0,
};

function normalizeCurrencyCode(code: string | null | undefined): string {
  if (!code) return "USD";
  const upper = code.trim().toUpperCase();
  return upper.length === 3 ? upper : "USD";
}

function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const trimmed = city.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

// Mexico-bucket detection: city literal first (handles "mexico city" / "cdmx"
// even if the country code is missing), then country code MX as a fallback
// for any other Mexican market that should plausibly land near CDMX rents
// rather than be lumped into Tier 2 USA.
function isMexicoBucket(
  city: string | null | undefined,
  countryCode: string | null | undefined,
): boolean {
  const normalizedCity = normalizeCity(city);
  if (normalizedCity === "mexico city" || normalizedCity === "cdmx") return true;
  const cc = (countryCode ?? "").trim().toUpperCase();
  return cc === "MX";
}

export function pickRentTier(
  city: string | null | undefined,
  countryCode: string | null | undefined,
): RentTier {
  if (isMexicoBucket(city, countryCode)) return "mexico";
  return pickCityTier(city, countryCode);
}

// Round rent to the nearest $100 (10_000 cents). Below the noise floor of a
// commercial lease comp and keeps Startup/Financials displays clean.
function roundCentsToHundred(value: number): number {
  return Math.round(value / 10_000) * 10_000;
}

export interface RentCalibrationSignal {
  shopTypes?: ReadonlyArray<string> | null;
  city?: string | null;
  countryCode?: string | null;
  currencyCode?: string | null;
}

export function calibrateRent(
  signal: RentCalibrationSignal | null | undefined,
): number {
  const shopTypeKey = pickShopTypeKey(signal?.shopTypes);
  const tier = pickRentTier(signal?.city, signal?.countryCode);
  const row = RENT_USD_CENTS[shopTypeKey];
  // Drive-thru × Mexico falls back to Tier 2 (see RENT_USD_CENTS comment).
  // Tier 2 is always non-null across every shop type — see the table above.
  const usdCents: number = row[tier] ?? (row.tier2 as number);
  const fx = FX_FROM_USD[normalizeCurrencyCode(signal?.currencyCode)] ?? 1.0;
  return roundCentsToHundred(usdCents * fx);
}

// Helper for callers that have a fully-populated MonthlyProjections.
// Mutates the rent forecast_line value in place (legacy_key === "rent") and
// returns the mutated array. Pure if the input is freshly defaulted; the
// callers we wire into (route + page financial_models insert paths) always
// build forecast_inputs from a fresh defaultMonthlyProjections() first.
import type { ForecastLine } from "../financial-projection.ts";

export function applyCalibratedRentToForecastLines(
  forecastLines: ForecastLine[],
  rentCents: number,
): ForecastLine[] {
  for (const line of forecastLines) {
    if (line.legacy_key === "rent") {
      line.value = rentCents;
      line.mode = "flat";
    }
  }
  return forecastLines;
}
