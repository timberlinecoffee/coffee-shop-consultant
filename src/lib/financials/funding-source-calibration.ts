// TIM-2557: Calibrate default funding-source defaults to shop-type × city-tier
// × plan currency.
//
// The legacy defaultFundingSources() returns a flat $10M bank loan + $15M
// founder equity for every persona regardless of shop type, geography, or
// startup-cost scale. TIM-2556 re-verification of TIM-2466 surfaced this as
// the last byte-identical leak across the 6 BP personas: Year-1 Interest
// amortized to the same $598,491 across mobile-cart through roastery plans.
//
// This module returns shape-identical FundingSourceLine[] (founder equity +
// bank loan), with the loan principal sized at LOAN_SHARE_OF_STARTUP_TOTAL
// (~65% — the SBA 7(a) typical coverage band per the TIM-2557 spec) of the
// calibrated startup-cost total, founder equity sized to the residual, and
// both amounts FX-converted to the plan's currency so non-USD personas show
// principal in their own currency rather than USD.
//
// Backward-compat: defaultFundingSources() with no args is unchanged (it's
// still called from migrateLegacyFundingSources in financial-projection.ts
// as the fallback when a pre-TIM-1122 row has neither owner_capital_cents
// nor loan_amount_cents). Only new-plan financial_models row creation paths
// call calibrateFundingSources(); existing rows are not migrated — owner-set
// values are owner-set values.

import {
  pickShopTypeKey,
  pickCityTier,
  SHOP_TYPE_BASES_CENTS,
  CITY_TIER_MULTIPLIERS,
} from "./startup-cost-calibration.ts";
import type { FundingSourceLine } from "../financial-projection.ts";

// SBA 7(a) loans typically cover 60-70% of opening project cost; the rest
// comes from founder equity. We pick 65% as the midpoint so a calibrated
// loan tracks the realistic financing mix without overstating either side.
export const LOAN_SHARE_OF_STARTUP_TOTAL = 0.65;

// Industry-typical small-business term loan defaults. Owners adjust once a
// real loan offer lands. Kept identical to the legacy defaultFundingSources
// values so downstream amortization tests don't drift on the rate.
export const DEFAULT_LOAN_TERM_MONTHS = 60;
export const DEFAULT_LOAN_ANNUAL_RATE_PCT = 6.5;

// USD → local FX multipliers. Same table as TIM-2521 revenue-calibration
// and TIM-2522 rent-calibration. Held flat (no live rates) because seeds
// are rough planning numbers, not closing docs — owners refine once they
// have a real term sheet.
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

// Round funding amounts to the nearest $1,000 (100_000 cents). Term-sheet
// noise floor; keeps the Financials Funding tab readable without losing
// signal at the $100k+ scale the loans live at.
function roundCentsToThousand(value: number): number {
  return Math.round(value / 100_000) * 100_000;
}

export interface FundingCalibrationSignal {
  shopTypes?: ReadonlyArray<string> | null;
  city?: string | null;
  countryCode?: string | null;
  currencyCode?: string | null;
}

// USD-cents project total before FX conversion. Mirrors the math in
// calibrateStartupCosts() but skips the per-bucket allocation so we get a
// clean total to size funding against. Pulled out of the calibrator so
// funding stays internally consistent with startup costs even when the
// bucket-share table evolves.
export function calibratedStartupTotalUsdCents(
  signal: FundingCalibrationSignal | null | undefined,
): number {
  const shopTypeKey = pickShopTypeKey(signal?.shopTypes);
  const tier = pickCityTier(signal?.city, signal?.countryCode);
  const base = SHOP_TYPE_BASES_CENTS[shopTypeKey];
  const multiplier = CITY_TIER_MULTIPLIERS[tier];
  return base * multiplier;
}

export function calibrateFundingSources(
  signal: FundingCalibrationSignal | null | undefined,
): FundingSourceLine[] {
  const totalUsdCents = calibratedStartupTotalUsdCents(signal);
  const loanUsdCents = totalUsdCents * LOAN_SHARE_OF_STARTUP_TOTAL;
  const founderUsdCents = totalUsdCents - loanUsdCents;
  const fx = FX_FROM_USD[normalizeCurrencyCode(signal?.currencyCode)] ?? 1.0;
  const loanCents = roundCentsToThousand(loanUsdCents * fx);
  const founderCents = roundCentsToThousand(founderUsdCents * fx);
  return [
    {
      id: "funding:founder",
      kind: "founder_equity",
      label: "Founder Equity",
      amount_cents: founderCents,
    },
    {
      id: "funding:loan",
      kind: "loan",
      label: "Bank Loan",
      amount_cents: loanCents,
      term_months: DEFAULT_LOAN_TERM_MONTHS,
      annual_rate_pct: DEFAULT_LOAN_ANNUAL_RATE_PCT,
    },
  ];
}
