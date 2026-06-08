// TIM-2518: Geo-aware minimum wage floor.
//
// Default barista wages must respect the local minimum. Seattle's 2026
// minimum is $19.97/hr; our prior $17 system default is illegal there.
// This module resolves a minimum wage from a (city, country) signal and is
// used in two places:
//   1. Plan-init: bump a sub-minimum default before the row is written.
//   2. Personnel/Hiring inputs: warn inline when the user enters a
//      sub-minimum wage so they can correct it before saving.
//
// City overrides win over national floors. Stored amounts are in the minor
// unit of the listed currency (cents for USD/CAD/AUD/MXN). Mexico City's
// federal minimum is daily; we convert at an 8-hour day so the floor stays
// meaningful as an hourly check.

export type MinWageSource = "city" | "national";

export interface MinWageInfo {
  hourlyMinorUnits: number;
  currency: string;
  jurisdictionLabel: string;
  year: number;
  source: MinWageSource;
}

export interface GeoSignal {
  city?: string | null;
  countryCode?: string | null;
}

const CITY_MINIMUMS: Record<string, MinWageInfo> = {
  seattle: { hourlyMinorUnits: 1997, currency: "USD", jurisdictionLabel: "Seattle", year: 2026, source: "city" },
  seatac: { hourlyMinorUnits: 1997, currency: "USD", jurisdictionLabel: "SeaTac", year: 2026, source: "city" },
  "san francisco": { hourlyMinorUnits: 1904, currency: "USD", jurisdictionLabel: "San Francisco", year: 2026, source: "city" },
  "new york": { hourlyMinorUnits: 1650, currency: "USD", jurisdictionLabel: "New York City", year: 2026, source: "city" },
  "new york city": { hourlyMinorUnits: 1650, currency: "USD", jurisdictionLabel: "New York City", year: 2026, source: "city" },
  nyc: { hourlyMinorUnits: 1650, currency: "USD", jurisdictionLabel: "New York City", year: 2026, source: "city" },
  "los angeles": { hourlyMinorUnits: 1728, currency: "USD", jurisdictionLabel: "Los Angeles", year: 2026, source: "city" },
  toronto: { hourlyMinorUnits: 1720, currency: "CAD", jurisdictionLabel: "Toronto", year: 2026, source: "city" },
  melbourne: { hourlyMinorUnits: 2410, currency: "AUD", jurisdictionLabel: "Melbourne", year: 2026, source: "city" },
  // Mexico City: daily federal minimum is MXN 278.80. Convert at an 8-hour
  // day so the floor check stays meaningful for an hourly input.
  cdmx: { hourlyMinorUnits: 3485, currency: "MXN", jurisdictionLabel: "Mexico City", year: 2026, source: "city" },
  "mexico city": { hourlyMinorUnits: 3485, currency: "MXN", jurisdictionLabel: "Mexico City", year: 2026, source: "city" },
};

const NATIONAL_MINIMUMS: Record<string, MinWageInfo> = {
  US: { hourlyMinorUnits: 725, currency: "USD", jurisdictionLabel: "United States", year: 2026, source: "national" },
  CA: { hourlyMinorUnits: 1765, currency: "CAD", jurisdictionLabel: "Canada", year: 2026, source: "national" },
  AU: { hourlyMinorUnits: 2410, currency: "AUD", jurisdictionLabel: "Australia", year: 2026, source: "national" },
  MX: { hourlyMinorUnits: 3485, currency: "MXN", jurisdictionLabel: "Mexico", year: 2026, source: "national" },
};

function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const trimmed = city.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  if (upper.length === 0) return null;
  if (upper.length === 2) return upper;
  // Tolerate the long names that appear on user.onboarding_data.
  const MAP: Record<string, string> = {
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    USA: "US",
    CANADA: "CA",
    AUSTRALIA: "AU",
    MEXICO: "MX",
  };
  return MAP[upper] ?? null;
}

export function resolveMinimumWage(geo: GeoSignal): MinWageInfo | null {
  const city = normalizeCity(geo.city);
  if (city && CITY_MINIMUMS[city]) return CITY_MINIMUMS[city];
  const country = normalizeCountry(geo.countryCode);
  if (country && NATIONAL_MINIMUMS[country]) return NATIONAL_MINIMUMS[country];
  return null;
}

/**
 * Return a default barista wage in minor units that's at or above the local
 * minimum. Used at plan-init so a new Seattle plan never seeds with the
 * system $17 default below Seattle's $19.97 floor.
 */
export function defaultBaristaWageMinorUnits(
  systemDefaultMinorUnits: number,
  minimum: MinWageInfo | null,
): number {
  if (!minimum) return systemDefaultMinorUnits;
  return Math.max(systemDefaultMinorUnits, minimum.hourlyMinorUnits);
}

/**
 * True when an hourly wage entry is below the resolved minimum and should
 * surface the inline warning. Returns false on zero / blank entries so the
 * empty input state stays clean.
 */
export function isBelowMinimumWage(
  enteredHourlyMinorUnits: number,
  minimum: MinWageInfo | null,
): boolean {
  if (!minimum) return false;
  if (!Number.isFinite(enteredHourlyMinorUnits) || enteredHourlyMinorUnits <= 0) return false;
  return enteredHourlyMinorUnits < minimum.hourlyMinorUnits;
}

// Locale hints for the currencies we surface minimum wages in. Kept local to
// avoid pulling the full ./currency.ts catalog into client bundles that only
// need the warning string.
const WAGE_LOCALES: Record<string, string> = {
  USD: "en-US",
  CAD: "en-CA",
  AUD: "en-AU",
  MXN: "es-MX",
};

/**
 * Format an hourly wage amount in its minor unit (cents/centavos) as a string
 * with the currency symbol and two fraction digits, so "$19.97" stays "$19.97"
 * in the warning copy rather than rounding to "$20".
 */
export function formatHourlyWage(
  hourlyMinorUnits: number,
  currency: string,
): string {
  const locale = WAGE_LOCALES[currency] ?? "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(hourlyMinorUnits / 100);
  } catch {
    return `${(hourlyMinorUnits / 100).toFixed(2)} ${currency}`;
  }
}
