// TIM-2521 (CQ-07): Calibrate default revenue inputs (daily_flow +
// avg_ticket_cents) to shop type and plan currency.
//
// The legacy defaultMonthlyProjections() always returned the same single
// mid-size template: a 750/week (107/day) daily_flow and a $7.50 ticket.
// Round-2 QA flagged this as Major financial-accuracy: a Seattle full-café
// plan projected 40-55% of realistic revenue, and a mobile-cart plan
// projected roughly the right volume but the wrong ticket.
//
// This module returns shape-identical revenue seeds, calibrated to a
// per-shop-type baseline daily customer count and USD avg ticket, with the
// ticket FX-converted into the plan's selected currency so non-USD plans
// don't seed a USD-priced menu.
//
// Backward-compat: defaultMonthlyProjections() with no args is unchanged
// (used by the xlsx/pdf normalization paths). Only new-plan financial_models
// row creation paths call calibrateRevenue(); existing rows are not
// migrated — owner-set values are owner-set values.
//
// Coordination: customers/day + USD ticket pending Data Analyst sign-off
// (preferred datasets: SCA Coffee Standards Report + Square POS averages).
// The table below is the engineering best-pass authored from the CQ-07
// ticket spec.

import type { DailyFlow, DayKey } from "../financial-projection.ts";
import { pickShopTypeKey, type ShopTypeKey } from "./startup-cost-calibration.ts";

// Per-shop-type baseline: average customers/day and USD-denominated avg
// ticket in cents. Values picked from the midpoint of the CQ-07 ranges so
// the seed is honest about being a midpoint rather than the worst case.
export interface ShopTypeRevenueBase {
  avgCustomersPerDay: number;
  avgTicketCentsUsd: number;
}

export const SHOP_TYPE_REVENUE_BASES: Record<ShopTypeKey, ShopTypeRevenueBase> = {
  mobile_cart:     { avgCustomersPerDay: 100, avgTicketCentsUsd: 700 },   // 100 × $7.00
  espresso_bar:    { avgCustomersPerDay: 175, avgTicketCentsUsd: 650 },   // mid 150-200 × $6.50
  drive_thru:      { avgCustomersPerDay: 250, avgTicketCentsUsd: 700 },   // mid 200-300 × $7.00
  full_cafe:       { avgCustomersPerDay: 275, avgTicketCentsUsd: 1200 },  // mid 250-300 × $12.00
  roastery_retail: { avgCustomersPerDay: 85,  avgTicketCentsUsd: 1400 },  // mid 70-100 × $14.00
};

// USD → local FX multipliers. Held flat (no live rates) because seeds are
// rough planning numbers, not invoices — owners adjust the ticket once they
// have local menu pricing. Picked at ~mid-2026 spot.
const FX_FROM_USD: Record<string, number> = {
  USD: 1.0,
  CAD: 1.37,
  AUD: 1.50,
  GBP: 0.78,
  EUR: 0.92,
  MXN: 18.0,
};

// Weekday tilt for the daily_flow. Derived from the legacy template
// (M80/Tu90/W100/Th100/F130/Sa150/Su100, avg 107.14) and re-expressed as a
// multiplier-of-mean so every shop-type seed keeps the same weekend-skewed
// shape. Numbers sum to 7.0 (i.e. each entry is a fraction of weekly mean).
const WEEKDAY_TILT: Record<DayKey, number> = {
  mon: 80 / 107.142857,
  tue: 90 / 107.142857,
  wed: 100 / 107.142857,
  thu: 100 / 107.142857,
  fri: 130 / 107.142857,
  sat: 150 / 107.142857,
  sun: 100 / 107.142857,
};

function normalizeCurrencyCode(code: string | null | undefined): string {
  if (!code) return "USD";
  const upper = code.trim().toUpperCase();
  return upper.length === 3 ? upper : "USD";
}

function roundToQuarter(cents: number): number {
  return Math.round(cents / 25) * 25;
}

export function convertUsdTicketCents(usdCents: number, currencyCode: string): number {
  const code = normalizeCurrencyCode(currencyCode);
  const fx = FX_FROM_USD[code] ?? 1.0;
  return roundToQuarter(usdCents * fx);
}

export function dailyFlowFromAverage(avgPerDay: number): DailyFlow {
  return {
    mon: Math.round(avgPerDay * WEEKDAY_TILT.mon),
    tue: Math.round(avgPerDay * WEEKDAY_TILT.tue),
    wed: Math.round(avgPerDay * WEEKDAY_TILT.wed),
    thu: Math.round(avgPerDay * WEEKDAY_TILT.thu),
    fri: Math.round(avgPerDay * WEEKDAY_TILT.fri),
    sat: Math.round(avgPerDay * WEEKDAY_TILT.sat),
    sun: Math.round(avgPerDay * WEEKDAY_TILT.sun),
  };
}

export interface RevenueCalibrationSignal {
  shopTypes?: ReadonlyArray<string> | null;
  currencyCode?: string | null;
}

export interface RevenueCalibration {
  daily_flow: DailyFlow;
  avg_ticket_cents: number;
}

export function calibrateRevenue(
  signal: RevenueCalibrationSignal | null | undefined,
): RevenueCalibration {
  const shopTypeKey = pickShopTypeKey(signal?.shopTypes);
  const base = SHOP_TYPE_REVENUE_BASES[shopTypeKey];
  const currencyCode = normalizeCurrencyCode(signal?.currencyCode);
  return {
    daily_flow: dailyFlowFromAverage(base.avgCustomersPerDay),
    avg_ticket_cents: convertUsdTicketCents(base.avgTicketCentsUsd, currencyCode),
  };
}
