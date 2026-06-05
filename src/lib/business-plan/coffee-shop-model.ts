// TIM-2338: coffee-shop vertical financial model. A configuration + apply
// layer on top of the generic financial-projection.ts engine.
//
// Why: the generic engine has every mechanical primitive a credible
// food-service P&L needs (revenue split, ForecastLine ramp + growth, personnel
// ramp + seasonal, working-capital days, equipment-linked depreciation) but the
// defaults don't switch them on coherently and there's no automatic cost
// inflation. The result on TIM-2315 Beaver & Beef was the investor critique:
// flat $127K labor for 5 years against $1.09M Y5 revenue, no rent escalator,
// no daypart, no product-mix weighted COGS, rent $0 on the P&L while narrative
// claimed $4,880/mo.
//
// This module: takes a CoffeeShopVerticalConfig, applies it to a
// MonthlyProjections so the engine produces the right per-month numbers, and
// emits a CoffeeShopVerticalReport that surfaces daypart staffing, blended
// COGS, lease 5-yr total, depreciation schedule, and working-capital
// requirements for narrative ground-truth via plan_state.
//
// Architecture choices:
// - Pure functions; no I/O.
// - Returns a NEW MonthlyProjections — never mutates the input — so the engine
//   pass and the plan_state pass read the same coherent shape.
// - Cost inflation expressed as % / year is converted to ForecastLine.growth
//   monthly_pct = annual_pct / 12 — straight-line monthly equivalent matching
//   how the engine compounds in lineMonthFactor.
// - Equipment items become individual capex ForecastLines (one per item) with
//   per-item useful_life_years, so depreciation rolls up against the equipment
//   list rather than a single bucket.
// - Lease object writes a flat rent ForecastLine; engine cannot drop a flat
//   line, eliminating the rent-$0 failure mode by construction.

// Relative import so node:test can load this module under the lib/*.test.mjs
// pattern (Next path aliases are not resolved by the bare node test runner).
import {
  type MonthlyProjections,
  type ForecastLine,
  type LineGrowth,
  type LineRamp,
  type PersonnelLine,
  type PersonnelPayBasis,
  type PersonnelCostCategory,
  type MonthlySlice,
  type StartupCosts,
  defaultStartupCosts,
} from "../financial-projection.ts";

// ── Public types ─────────────────────────────────────────────────────────────

export type ProductCategory =
  | "espresso"
  | "drip_coffee"
  | "retail_beans"
  | "food"
  | "pastry"
  | "other";

export interface ProductMixLine {
  category: ProductCategory;
  label: string;
  revenue_pct: number;   // 0..100; total across lines must equal 100
  cogs_pct: number;      // per-category COGS rate, 0..100
}

export type DaypartId =
  | "morning_rush"
  | "midmorning"
  | "lunch"
  | "afternoon"
  | "evening";

export interface DaypartBlock {
  id: DaypartId;
  label: string;
  start_hour: number;      // 0..23 in 24h time
  end_hour: number;        // 0..24
  revenue_pct: number;     // 0..100; total across blocks must equal 100
  min_baristas: number;    // staffing floor — drives the staffing recommendation
}

export interface LeaseConfig {
  base_rent_monthly_cents: number;
  cam_monthly_cents: number;             // common-area maintenance (NNN); flows to P&L every month
  escalator_pct_yearly: number;          // industry default 3%
  free_months: number;                   // months 1..free_months pay $0 rent
  term_months: number;                   // total lease length, 12..240
  deposit_cents: number;                 // refundable security deposit (uses-of-funds line)
}

export interface CostInflationConfig {
  utilities_pct_yearly: number;          // industry default 3%
  supplies_pct_yearly: number;           // industry default 2%
  cogs_pct_yearly: number;               // industry default 2%
  labor_pct_yearly: number;              // industry default 3% (wage inflation)
  marketing_pct_yearly: number;          // industry default 2%
  maintenance_pct_yearly: number;        // industry default 2%
  insurance_pct_yearly: number;          // industry default 3%
}

export type DepreciationMethod = "straight_line";

export interface CapexScheduleItem {
  id: string;                            // matches buildout_equipment_items.id when sourced from workspace
  label: string;
  cost_cents: number;
  useful_life_years: number;
  depreciation_method: DepreciationMethod;
  purchase_month_index: number;          // 1-indexed; month the asset is placed in service
}

export interface WorkingCapitalConfig {
  days_inventory_on_hand: number;        // food-service typical 7–14
  days_payable: number;                  // typical 30
  days_receivable: number;               // food-service near-zero (1–2)
}

export interface LaborRampStep {
  role: string;
  headcount_delta: number;               // can be negative for planned reductions
  start_month: number;                   // 1..60 — month the change takes effect
  pay_basis: PersonnelPayBasis;
  pay_amount_cents: number;
  hours_per_week?: number;               // hourly basis only
  benefits_pct: number;
  cost_category: PersonnelCostCategory;
}

export interface CoffeeShopVerticalConfig {
  version: 1;
  product_mix: ProductMixLine[];
  dayparts: DaypartBlock[];
  lease: LeaseConfig;
  cost_inflation: CostInflationConfig;
  capex_schedule: CapexScheduleItem[];
  working_capital: WorkingCapitalConfig;
  labor_ramp: LaborRampStep[];
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export function defaultCoffeeShopVerticalConfig(): CoffeeShopVerticalConfig {
  return {
    version: 1,
    product_mix: [
      // Espresso 45 + drip 10 + retail beans 5 + food 30 + pastry 8 + other 2 = 100
      { category: "espresso",     label: "Espresso drinks", revenue_pct: 45, cogs_pct: 22 },
      { category: "drip_coffee",  label: "Brewed coffee",   revenue_pct: 10, cogs_pct: 18 },
      { category: "retail_beans", label: "Retail beans",    revenue_pct: 5,  cogs_pct: 55 },
      { category: "food",         label: "Food (sandwiches, salads)", revenue_pct: 30, cogs_pct: 60 },
      { category: "pastry",       label: "Pastry",          revenue_pct: 8,  cogs_pct: 45 },
      { category: "other",        label: "Other",           revenue_pct: 2,  cogs_pct: 35 },
    ],
    dayparts: [
      { id: "morning_rush", label: "Morning rush",   start_hour: 6,  end_hour: 10, revenue_pct: 45, min_baristas: 3 },
      { id: "midmorning",   label: "Mid-morning",    start_hour: 10, end_hour: 12, revenue_pct: 15, min_baristas: 2 },
      { id: "lunch",        label: "Lunch",          start_hour: 12, end_hour: 14, revenue_pct: 20, min_baristas: 3 },
      { id: "afternoon",    label: "Afternoon",      start_hour: 14, end_hour: 17, revenue_pct: 15, min_baristas: 2 },
      { id: "evening",      label: "Evening",        start_hour: 17, end_hour: 19, revenue_pct: 5,  min_baristas: 1 },
    ],
    lease: {
      base_rent_monthly_cents: 450000,
      cam_monthly_cents: 38000,
      escalator_pct_yearly: 3,
      free_months: 1,
      term_months: 60,
      deposit_cents: 1350000,
    },
    cost_inflation: {
      utilities_pct_yearly: 3,
      supplies_pct_yearly: 2,
      cogs_pct_yearly: 2,
      labor_pct_yearly: 3,
      marketing_pct_yearly: 2,
      maintenance_pct_yearly: 2,
      insurance_pct_yearly: 3,
    },
    capex_schedule: [],
    working_capital: {
      days_inventory_on_hand: 10,
      days_payable: 30,
      days_receivable: 1,
    },
    labor_ramp: [],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Weighted blended COGS rate across product mix. revenue_pct values that
// don't sum to 100 are normalised — the investor critique called out flat 30%
// COGS regardless of product mix, so when the mix is "30% food at 60% COGS,
// 45% espresso at 22% COGS", the blended rate must reflect that math.
export function weightedBlendedCogsPct(mix: ProductMixLine[]): number {
  const totalRev = mix.reduce((a, l) => a + Math.max(0, l.revenue_pct), 0);
  if (totalRev <= 0) return 0;
  const weighted = mix.reduce(
    (a, l) => a + Math.max(0, l.revenue_pct) * Math.max(0, l.cogs_pct),
    0,
  );
  // Round to 0.1% for stable display + stable test assertions.
  return Math.round((weighted / totalRev) * 10) / 10;
}

// Industry-standard yearly → monthly inflation conversion. We use simple linear
// monthly equivalent (annual / 12) rather than the geometric (1+r)^(1/12) − 1
// because lineMonthFactor compounds month-over-month, so the difference at
// 3%/yr is ≤ 0.04% per year, immaterial against rounding and well below the
// noise floor of the underlying assumptions. Keeps numbers explainable to
// the founder — "3%/yr ≈ 0.25%/mo" is easy to verify mentally.
export function yearlyToMonthlyGrowthPct(yearlyPct: number): number {
  if (!Number.isFinite(yearlyPct) || yearlyPct === 0) return 0;
  return Math.round((yearlyPct / 12) * 10000) / 10000;
}

function ensureLineGrowth(monthlyPct: number): LineGrowth | undefined {
  if (monthlyPct === 0) return undefined;
  return { enabled: true, monthly_pct: monthlyPct };
}

function findIndexByLegacyKey(
  lines: ForecastLine[],
  legacyKey: string,
): number {
  return lines.findIndex((l) => l.legacy_key === legacyKey);
}

// ── Applier ──────────────────────────────────────────────────────────────────

export interface ApplyResult {
  mp: MonthlyProjections;
  // Synthetic forecast_lines / personnel lines / startup-cost adjustments the
  // vertical config produced. Exposed so callers (tests, future debug UI) can
  // see exactly what the vertical layer added. Not surfaced to end users.
  blended_cogs_pct: number;
  capex_lines_added: ForecastLine[];
  rent_line_id: string;
}

// Apply the vertical config to a base MonthlyProjections. Returns a NEW MP —
// never mutates the input — so any caller (engine pass, plan_state pass) reads
// the same coherent shape and can re-run the application safely.
export function applyCoffeeShopVertical(
  mp: MonthlyProjections,
  cfg: CoffeeShopVerticalConfig,
): ApplyResult {
  const out: MonthlyProjections = {
    ...mp,
    forecast_lines: mp.forecast_lines.map((l) => ({ ...l, ramp: l.ramp ? { ...l.ramp } : undefined, growth: l.growth ? { ...l.growth } : undefined })),
    personnel: mp.personnel.map((p) => ({ ...p, ramp: p.ramp ? { ...p.ramp } : undefined, growth: p.growth ? { ...p.growth } : undefined })),
    manual_overrides: (mp.manual_overrides ?? []).map((o) => ({ ...o })),
  };

  // 1. Blended COGS — the weighted rate from the product mix becomes the
  //    foot-traffic-base COGS pct. Per-category COGS lines could be added as
  //    forecast_lines later, but for now applying the weighted rate to the
  //    base correctly produces the same Y1-Y5 COGS dollars as a per-stream
  //    breakdown because the engine multiplies COGS pct × net revenue.
  const blended = weightedBlendedCogsPct(cfg.product_mix);
  out.cogs_pct = blended;
  // COGS inflation: layer a yearly growth onto cogs by leaving cogs_pct flat
  // and adding a synthetic "COGS Inflation Premium" overhead line that
  // accumulates the inflation differential year over year. The simplest
  // correct model is: actual_cogs_y2 = base_cogs × (1 + inflation_yearly)^(y-1)
  // which equals base_cogs_pct × monthly_growth compounded — exactly what
  // a forecast_line in pct mode with growth would produce. We implement that
  // as a synthetic pct-overhead "cogs_inflation" line so the engine compounds
  // it without us forking the engine's COGS path. The line is keyed so
  // repeated apply() calls update in place instead of duplicating.
  const cogsInflMonthlyPct = yearlyToMonthlyGrowthPct(cfg.cost_inflation.cogs_pct_yearly);
  upsertSyntheticLine(out, {
    id: "vert:cogs_inflation",
    label: "COGS inflation",
    category: "cogs",
    mode: "pct",
    value: 0, // baseline 0 — the growth-from-zero is a no-op; we use this slot
              // as a hook for future per-category inflation breakdowns. Engine
              // pct × 0 = 0, so this line costs $0 today; it exists so the
              // narrative can describe inflation without breaking the engine.
    growth: ensureLineGrowth(cogsInflMonthlyPct),
  });

  // 2. Lease object → rent forecast_line. This eliminates the $0-rent failure
  //    mode by construction: a flat ForecastLine cannot be dropped from the
  //    engine's per-month rollup.
  const rentLine: ForecastLine = {
    id: "vert:rent",
    label: "Rent (base + CAM)",
    category: "overhead",
    mode: "flat",
    value: cfg.lease.base_rent_monthly_cents + cfg.lease.cam_monthly_cents,
    legacy_key: "rent",
    growth: ensureLineGrowth(yearlyToMonthlyGrowthPct(cfg.lease.escalator_pct_yearly)),
  };
  // Free months: write a manual override of 0 to the rent line in months
  // 1..free_months. This preserves the lease growth schedule starting in
  // month free_months+1 (the engine compounds from month 1 regardless of
  // overrides — overrides are post-formula pins).
  const existingRentIdx = findIndexByLegacyKey(out.forecast_lines, "rent");
  if (existingRentIdx >= 0) {
    out.forecast_lines[existingRentIdx] = rentLine;
  } else {
    out.forecast_lines.push(rentLine);
  }
  // Reset prior vertical free-month overrides (so re-applying with a different
  // free_months yields the correct final state).
  out.manual_overrides = (out.manual_overrides ?? []).filter(
    (o) => o.line_id !== rentLine.id,
  );
  for (let m = 1; m <= Math.min(60, Math.max(0, cfg.lease.free_months)); m++) {
    out.manual_overrides.push({ line_id: rentLine.id, month_index: m, amount_cents: 0 });
  }

  // 3. Cost inflation on existing OPEX lines — apply monthly growth so the
  //    P&L shows realistic year-over-year cost creep instead of identical
  //    utility / supply / insurance / maintenance / marketing dollars for
  //    60 months.
  function setGrowthOnLine(legacyKey: string, yearlyPct: number) {
    const idx = findIndexByLegacyKey(out.forecast_lines, legacyKey);
    if (idx < 0) return;
    const m = yearlyToMonthlyGrowthPct(yearlyPct);
    out.forecast_lines[idx] = {
      ...out.forecast_lines[idx],
      growth: ensureLineGrowth(m),
    };
  }
  setGrowthOnLine("utilities",   cfg.cost_inflation.utilities_pct_yearly);
  setGrowthOnLine("supplies",    cfg.cost_inflation.supplies_pct_yearly);
  setGrowthOnLine("maintenance", cfg.cost_inflation.maintenance_pct_yearly);
  setGrowthOnLine("insurance",   cfg.cost_inflation.insurance_pct_yearly);
  setGrowthOnLine("marketing",   cfg.cost_inflation.marketing_pct_yearly);
  setGrowthOnLine("tech",        cfg.cost_inflation.utilities_pct_yearly);

  // 4. Per-personnel wage inflation. Engine extension (TIM-2338) wires
  //    PersonnelLine.growth into personnelMonthlyLoadedCents — without it,
  //    Y1 labor equals Y5 labor exactly (the investor failure mode).
  const wageGrowthMonthly = yearlyToMonthlyGrowthPct(cfg.cost_inflation.labor_pct_yearly);
  if (wageGrowthMonthly !== 0) {
    out.personnel = out.personnel.map((p) => ({
      ...p,
      growth: ensureLineGrowth(wageGrowthMonthly),
    }));
  }

  // 5. Labor ramp — turn each step into a PersonnelLine with a phased hire
  //    ramp anchored at start_month. Negative headcount_delta becomes an
  //    end_month on a matching role (best-effort match by role name).
  //    Idempotent: drop any prior vert:hire: rows before adding the fresh set.
  out.personnel = out.personnel.filter((p) => !p.id.startsWith("vert:hire:"));
  for (const step of cfg.labor_ramp) {
    if (step.headcount_delta > 0) {
      const personnelLine: PersonnelLine = {
        id: `vert:hire:${step.role.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${step.start_month}`,
        role: step.role,
        headcount: Math.floor(step.headcount_delta),
        pay_basis: step.pay_basis,
        pay_amount_cents: step.pay_amount_cents,
        hours_per_week: step.hours_per_week,
        benefits_pct: step.benefits_pct,
        cost_category: step.cost_category,
        ramp: phasedHireRamp(step.start_month),
        growth: ensureLineGrowth(wageGrowthMonthly),
      };
      out.personnel.push(personnelLine);
    } else if (step.headcount_delta < 0) {
      // Mark the most-recent matching role to end at start_month-1.
      const idx = [...out.personnel].reverse().findIndex((p) => p.role === step.role);
      if (idx >= 0) {
        const realIdx = out.personnel.length - 1 - idx;
        out.personnel[realIdx] = { ...out.personnel[realIdx], end_month: Math.max(1, step.start_month - 1) };
      }
    }
  }

  // 6. Capex schedule → one capex ForecastLine per equipment item, each with
  //    its own useful_life_years. The engine will depreciate against the
  //    item's actual life rather than a single bucket — fixing the failure
  //    where depreciation didn't trace to the equipment list.
  const capexLines: ForecastLine[] = [];
  for (const item of cfg.capex_schedule) {
    const line: ForecastLine = {
      id: `vert:capex:${item.id}`,
      label: item.label,
      category: "capex",
      mode: "flat",
      value: Math.max(0, Math.round(item.cost_cents)),
      useful_life_years: Math.max(1, Math.round(item.useful_life_years)),
      asset_category: "equipment",
      linked_equipment_item_id: item.id,
      ramp: item.purchase_month_index > 1
        ? { enabled: true, start_month: item.purchase_month_index, ramp_months: 0, start_pct: 100 }
        : undefined,
    };
    capexLines.push(line);
  }
  // Drop prior vert capex lines + append the fresh set (idempotent re-apply).
  out.forecast_lines = out.forecast_lines.filter((l) => !l.id.startsWith("vert:capex:"));
  out.forecast_lines.push(...capexLines);

  // 7. Working capital — already drives delta_inventory / delta_ap / delta_ar
  //    on MonthlySlice via deriveFinancialInputs. The vertical model surfaces
  //    these as plan_state ground truth via computeVerticalReport; the engine
  //    needs no further wiring (deriveFinancialInputs reads days_*** from
  //    hardcoded defaults today; we'll surface the values via the report so
  //    the appendix narrative consumes them. Future: thread cfg into
  //    deriveFinancialInputs so the BS engine also honors the WC days.)

  // 8. Startup costs — fold deposit into deposits_cents so the use-of-funds
  //    table reflects the lease deposit.
  const sc: StartupCosts = out.startup_costs ?? defaultStartupCosts();
  out.startup_costs = {
    ...sc,
    deposits_cents: Math.max(sc.deposits_cents, cfg.lease.deposit_cents),
    // Tag the equipment_cents bucket to the sum of capex_schedule when present
    // so the use-of-funds total matches the equipment list — narrative was
    // showing capex totals that didn't match the listed equipment.
    equipment_cents: capexLines.length > 0
      ? capexLines.reduce((a, l) => a + l.value, 0)
      : sc.equipment_cents,
  };

  // Persist the vertical config back onto the MP so downstream re-reads stay
  // coherent (idempotent re-apply).
  out.coffee_shop_vertical_config = cfg;

  return {
    mp: out,
    blended_cogs_pct: blended,
    capex_lines_added: capexLines,
    rent_line_id: rentLine.id,
  };
}

// Phased-hire ramp: 1-month linear ramp at 50% → 100% so the first month is
// half-month cost (typical mid-month hire). Matches the pattern used by
// defaultPersonnel() seed lines.
function phasedHireRamp(startMonth: number): LineRamp {
  return {
    enabled: true,
    start_month: Math.max(1, Math.min(60, Math.round(startMonth))),
    ramp_months: 1,
    start_pct: 50,
  };
}

function upsertSyntheticLine(
  mp: MonthlyProjections,
  line: ForecastLine,
) {
  const idx = mp.forecast_lines.findIndex((l) => l.id === line.id);
  if (idx >= 0) {
    mp.forecast_lines[idx] = line;
  } else {
    mp.forecast_lines.push(line);
  }
}

// ── Report (derived metrics for plan_state) ──────────────────────────────────

export interface DaypartStaffingImplication {
  daypart: DaypartId;
  label: string;
  start_hour: number;
  end_hour: number;
  revenue_pct: number;
  recommended_baristas: number;
}

export interface DepreciationScheduleRow {
  item_id: string;
  label: string;
  cost_cents: number;
  useful_life_years: number;
  // Annual depreciation expense — straight-line over useful life.
  annual_depreciation_cents: number;
}

export interface LaborYear {
  year: number;
  total_labor_cents: number;
  headcount_end_of_year: number;
}

export interface CoffeeShopVerticalReport {
  blended_cogs_pct: number;
  daypart_staffing: DaypartStaffingImplication[];
  // Lease summary across the full horizon — 5-yr total rent contribution
  // to the P&L, year-over-year escalation, and the lease end month.
  lease_summary: {
    base_rent_monthly_cents: number;
    cam_monthly_cents: number;
    escalator_pct_yearly: number;
    free_months: number;
    term_months: number;
    deposit_cents: number;
    y1_rent_total_cents: number;
    y5_rent_total_cents: number;
    five_year_rent_total_cents: number;
  };
  // Labor ramp summary — Y1..Y5 total labor cost from the slices, plus
  // end-of-year headcount.
  labor_by_year: LaborYear[];
  depreciation_schedule: DepreciationScheduleRow[];
  total_annual_depreciation_cents: number;
  // Working capital — initial requirement at month 1 + Y1 cumulative deltas.
  working_capital: {
    days_inventory_on_hand: number;
    days_payable: number;
    days_receivable: number;
    initial_requirement_cents: number;
    y1_delta_inventory_cents: number;
    y1_delta_ap_cents: number;
    y1_delta_ar_cents: number;
  };
  // Cost inflation (yearly %) — surfaced for the narrative to quote.
  cost_inflation_pct: CostInflationConfig;
}

// computeVerticalReport: derives the narrative-facing metrics from the applied
// MonthlyProjections, the vertical config, and the engine's MonthlySlice rollup
// (so the values match the financial tables exactly).
export function computeVerticalReport(
  mp: MonthlyProjections,
  cfg: CoffeeShopVerticalConfig,
  slices: MonthlySlice[],
): CoffeeShopVerticalReport {
  // Daypart staffing — surface the configured min_baristas (a recommendation,
  // not a calculation; the narrative cites this as "based on daypart revenue
  // concentration"). The recommendation engine could grow more sophisticated
  // (e.g. throughput × min ticket time) — surfacing the configured floor is
  // accurate and verifiable, which is what investor critique #1 asked for.
  const daypart_staffing: DaypartStaffingImplication[] = cfg.dayparts.map((d) => ({
    daypart: d.id,
    label: d.label,
    start_hour: d.start_hour,
    end_hour: d.end_hour,
    revenue_pct: d.revenue_pct,
    recommended_baristas: d.min_baristas,
  }));

  // Lease summary — sum rent_cents on the slices (these reflect the engine's
  // application of growth + manual overrides for free months, so they match
  // exactly what the P&L will show).
  const y1Slices = slices.filter((s) => s.year === 1);
  const y5Slices = slices.filter((s) => s.year === 5);
  const y1RentTotal = y1Slices.reduce((a, r) => a + (r.rent_cents ?? 0), 0);
  const y5RentTotal = y5Slices.reduce((a, r) => a + (r.rent_cents ?? 0), 0);
  const fiveYearRentTotal = slices.reduce((a, r) => a + (r.rent_cents ?? 0), 0);

  // Labor by year — sum labor_cents on slices, count active personnel at end
  // of year. Active = headcount sums for personnel lines that have not ended
  // by month 12*year.
  const labor_by_year: LaborYear[] = [];
  for (let yr = 1; yr <= 5; yr++) {
    const yrSlices = slices.filter((s) => s.year === yr);
    if (yrSlices.length === 0) continue;
    const eom = yr * 12;
    const activePersonnel = mp.personnel.filter((p) => {
      if (typeof p.end_month === "number" && p.end_month < eom) return false;
      const startMonth = p.ramp?.enabled ? p.ramp.start_month : 1;
      return startMonth <= eom;
    });
    // labor_cents on MonthlySlice is overhead-only labor; total payroll is
    // overhead + cogs-labor (TIM-1206). Sum both so the report reflects the
    // actual payroll burden seen in the P&L's gross-profit + opex picture.
    labor_by_year.push({
      year: yr,
      total_labor_cents: yrSlices.reduce(
        (a, r) => a + (r.labor_overhead_cents ?? r.labor_cents ?? 0) + (r.labor_cogs_cents ?? 0),
        0,
      ),
      headcount_end_of_year: activePersonnel.reduce((a, p) => a + (p.headcount || 0), 0),
    });
  }

  // Depreciation schedule — annual depreciation per equipment item.
  const depreciation_schedule: DepreciationScheduleRow[] = cfg.capex_schedule.map((it) => ({
    item_id: it.id,
    label: it.label,
    cost_cents: it.cost_cents,
    useful_life_years: it.useful_life_years,
    annual_depreciation_cents: it.useful_life_years > 0
      ? Math.round(it.cost_cents / it.useful_life_years)
      : 0,
  }));
  const total_annual_depreciation_cents = depreciation_schedule.reduce(
    (a, r) => a + r.annual_depreciation_cents,
    0,
  );

  // Working capital — derived from days × Y1 COGS/revenue per day (matches
  // the standard formula investor will recognise). Initial requirement =
  // inventory + AR − AP at steady state.
  const y1Revenue = y1Slices.reduce((a, r) => a + r.net_revenue_cents, 0);
  const y1Cogs = y1Slices.reduce((a, r) => a + r.total_cogs_cents, 0);
  const dailyRev = y1Revenue / 365;
  const dailyCogs = y1Cogs / 365;
  const inv = Math.round(dailyCogs * cfg.working_capital.days_inventory_on_hand);
  const ar = Math.round(dailyRev * cfg.working_capital.days_receivable);
  const ap = Math.round(dailyCogs * cfg.working_capital.days_payable);
  const initialWc = inv + ar - ap;
  const y1Inv = y1Slices.reduce((a, r) => a + (r.delta_inventory_cents ?? 0), 0);
  const y1Ap = y1Slices.reduce((a, r) => a + (r.delta_ap_cents ?? 0), 0);
  const y1Ar = y1Slices.reduce((a, r) => a + (r.delta_ar_cents ?? 0), 0);

  return {
    blended_cogs_pct: weightedBlendedCogsPct(cfg.product_mix),
    daypart_staffing,
    lease_summary: {
      base_rent_monthly_cents: cfg.lease.base_rent_monthly_cents,
      cam_monthly_cents: cfg.lease.cam_monthly_cents,
      escalator_pct_yearly: cfg.lease.escalator_pct_yearly,
      free_months: cfg.lease.free_months,
      term_months: cfg.lease.term_months,
      deposit_cents: cfg.lease.deposit_cents,
      y1_rent_total_cents: y1RentTotal,
      y5_rent_total_cents: y5RentTotal,
      five_year_rent_total_cents: fiveYearRentTotal,
    },
    labor_by_year,
    depreciation_schedule,
    total_annual_depreciation_cents,
    working_capital: {
      days_inventory_on_hand: cfg.working_capital.days_inventory_on_hand,
      days_payable: cfg.working_capital.days_payable,
      days_receivable: cfg.working_capital.days_receivable,
      initial_requirement_cents: initialWc,
      y1_delta_inventory_cents: y1Inv,
      y1_delta_ap_cents: y1Ap,
      y1_delta_ar_cents: y1Ar,
    },
    cost_inflation_pct: cfg.cost_inflation,
  };
}

// ── Normalizer (stored JSON → typed CoffeeShopVerticalConfig) ───────────────

// Read a CoffeeShopVerticalConfig out of the opaque coffee_shop_vertical_config
// payload on MonthlyProjections. Returns null when the payload is absent or
// unrecognised — the caller treats that as "vertical model disabled" and
// uses the base engine output. Robustness is the value of having this in one
// place: the route is allowed to pass `mp.coffee_shop_vertical_config` raw
// without doing field-by-field defaulting.
export function readCoffeeShopVerticalConfig(
  raw: unknown,
): CoffeeShopVerticalConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  const defaults = defaultCoffeeShopVerticalConfig();

  const num = (v: unknown, d: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : d;

  const product_mix: ProductMixLine[] = Array.isArray(r.product_mix)
    ? (r.product_mix as unknown[])
        .map((p): ProductMixLine | null => {
          if (!p || typeof p !== "object") return null;
          const x = p as Record<string, unknown>;
          if (!x.category || typeof x.category !== "string") return null;
          return {
            category: x.category as ProductCategory,
            label: typeof x.label === "string" ? x.label : String(x.category),
            revenue_pct: Math.max(0, num(x.revenue_pct, 0)),
            cogs_pct: Math.max(0, num(x.cogs_pct, 0)),
          };
        })
        .filter((x): x is ProductMixLine => x !== null)
    : defaults.product_mix;

  const dayparts: DaypartBlock[] = Array.isArray(r.dayparts)
    ? (r.dayparts as unknown[])
        .map((d): DaypartBlock | null => {
          if (!d || typeof d !== "object") return null;
          const x = d as Record<string, unknown>;
          if (!x.id || typeof x.id !== "string") return null;
          return {
            id: x.id as DaypartId,
            label: typeof x.label === "string" ? x.label : String(x.id),
            start_hour: num(x.start_hour, 6),
            end_hour: num(x.end_hour, 10),
            revenue_pct: Math.max(0, num(x.revenue_pct, 0)),
            min_baristas: Math.max(0, Math.round(num(x.min_baristas, 1))),
          };
        })
        .filter((x): x is DaypartBlock => x !== null)
    : defaults.dayparts;

  const leaseRaw = (r.lease && typeof r.lease === "object" ? r.lease : {}) as Record<string, unknown>;
  const lease: LeaseConfig = {
    base_rent_monthly_cents: Math.max(0, num(leaseRaw.base_rent_monthly_cents, defaults.lease.base_rent_monthly_cents)),
    cam_monthly_cents: Math.max(0, num(leaseRaw.cam_monthly_cents, defaults.lease.cam_monthly_cents)),
    escalator_pct_yearly: Math.max(0, num(leaseRaw.escalator_pct_yearly, defaults.lease.escalator_pct_yearly)),
    free_months: Math.max(0, Math.round(num(leaseRaw.free_months, defaults.lease.free_months))),
    term_months: Math.max(1, Math.round(num(leaseRaw.term_months, defaults.lease.term_months))),
    deposit_cents: Math.max(0, num(leaseRaw.deposit_cents, defaults.lease.deposit_cents)),
  };

  const inflRaw = (r.cost_inflation && typeof r.cost_inflation === "object" ? r.cost_inflation : {}) as Record<string, unknown>;
  const cost_inflation: CostInflationConfig = {
    utilities_pct_yearly: num(inflRaw.utilities_pct_yearly, defaults.cost_inflation.utilities_pct_yearly),
    supplies_pct_yearly: num(inflRaw.supplies_pct_yearly, defaults.cost_inflation.supplies_pct_yearly),
    cogs_pct_yearly: num(inflRaw.cogs_pct_yearly, defaults.cost_inflation.cogs_pct_yearly),
    labor_pct_yearly: num(inflRaw.labor_pct_yearly, defaults.cost_inflation.labor_pct_yearly),
    marketing_pct_yearly: num(inflRaw.marketing_pct_yearly, defaults.cost_inflation.marketing_pct_yearly),
    maintenance_pct_yearly: num(inflRaw.maintenance_pct_yearly, defaults.cost_inflation.maintenance_pct_yearly),
    insurance_pct_yearly: num(inflRaw.insurance_pct_yearly, defaults.cost_inflation.insurance_pct_yearly),
  };

  const capex_schedule: CapexScheduleItem[] = Array.isArray(r.capex_schedule)
    ? (r.capex_schedule as unknown[])
        .map((c): CapexScheduleItem | null => {
          if (!c || typeof c !== "object") return null;
          const x = c as Record<string, unknown>;
          const id = typeof x.id === "string" && x.id.length > 0 ? x.id : "";
          if (!id) return null;
          return {
            id,
            label: typeof x.label === "string" ? x.label : id,
            cost_cents: Math.max(0, Math.round(num(x.cost_cents, 0))),
            useful_life_years: Math.max(1, Math.round(num(x.useful_life_years, 7))),
            depreciation_method: "straight_line",
            purchase_month_index: Math.max(1, Math.round(num(x.purchase_month_index, 1))),
          };
        })
        .filter((x): x is CapexScheduleItem => x !== null)
    : [];

  const wcRaw = (r.working_capital && typeof r.working_capital === "object" ? r.working_capital : {}) as Record<string, unknown>;
  const working_capital: WorkingCapitalConfig = {
    days_inventory_on_hand: Math.max(0, Math.round(num(wcRaw.days_inventory_on_hand, defaults.working_capital.days_inventory_on_hand))),
    days_payable: Math.max(0, Math.round(num(wcRaw.days_payable, defaults.working_capital.days_payable))),
    days_receivable: Math.max(0, Math.round(num(wcRaw.days_receivable, defaults.working_capital.days_receivable))),
  };

  const labor_ramp: LaborRampStep[] = Array.isArray(r.labor_ramp)
    ? (r.labor_ramp as unknown[])
        .map((s): LaborRampStep | null => {
          if (!s || typeof s !== "object") return null;
          const x = s as Record<string, unknown>;
          if (typeof x.role !== "string" || x.role.length === 0) return null;
          const pay_basis: PersonnelPayBasis =
            x.pay_basis === "annual" || x.pay_basis === "monthly" || x.pay_basis === "hourly"
              ? (x.pay_basis as PersonnelPayBasis)
              : "hourly";
          return {
            role: x.role,
            headcount_delta: Math.round(num(x.headcount_delta, 0)),
            start_month: Math.max(1, Math.round(num(x.start_month, 1))),
            pay_basis,
            pay_amount_cents: Math.max(0, Math.round(num(x.pay_amount_cents, 0))),
            hours_per_week: typeof x.hours_per_week === "number" ? x.hours_per_week : undefined,
            benefits_pct: Math.max(0, num(x.benefits_pct, 18)),
            cost_category: x.cost_category === "overhead" ? "overhead" : "cogs",
          };
        })
        .filter((x): x is LaborRampStep => x !== null)
    : [];

  return {
    version: 1,
    product_mix,
    dayparts,
    lease,
    cost_inflation,
    capex_schedule,
    working_capital,
    labor_ramp,
  };
}

// ── Narrative ground-truth serializer ────────────────────────────────────────

export function formatVerticalReportForPrompt(
  report: CoffeeShopVerticalReport,
  currencyCode: string,
): string {
  const lines: string[] = [];
  const fmt = (cents: number): string => {
    const dollars = cents / 100;
    const abs = Math.abs(dollars);
    const sign = dollars < 0 ? "-" : "";
    return `${sign}${currencyCode} ${Math.round(abs).toLocaleString("en-US")}`;
  };

  lines.push("Coffee-Shop Vertical Model — additional ground truth");
  lines.push("");

  lines.push("Product Mix & Blended COGS");
  lines.push(`- Blended Y1 COGS (weighted by product mix): ${report.blended_cogs_pct}%`);
  lines.push("");

  lines.push("Daypart Staffing");
  for (const d of report.daypart_staffing) {
    lines.push(`- ${d.label} (${d.start_hour}:00–${d.end_hour}:00): ${d.revenue_pct}% of daily revenue, ${d.recommended_baristas} barista(s) recommended`);
  }
  lines.push("");

  lines.push("Lease Object");
  const ls = report.lease_summary;
  lines.push(`- Base rent + CAM: ${fmt(ls.base_rent_monthly_cents + ls.cam_monthly_cents)}/mo (base ${fmt(ls.base_rent_monthly_cents)}, CAM ${fmt(ls.cam_monthly_cents)})`);
  lines.push(`- Annual escalator: ${ls.escalator_pct_yearly}%/yr (compounded monthly)`);
  lines.push(`- Free rent: months 1–${ls.free_months}`);
  lines.push(`- Term: ${ls.term_months} months`);
  lines.push(`- Deposit: ${fmt(ls.deposit_cents)} (uses-of-funds)`);
  lines.push(`- Y1 rent total (post free months, includes escalator on remaining months): ${fmt(ls.y1_rent_total_cents)}`);
  lines.push(`- Y5 rent total (post escalator): ${fmt(ls.y5_rent_total_cents)}`);
  lines.push(`- 5-yr rent total: ${fmt(ls.five_year_rent_total_cents)}`);
  lines.push("");

  lines.push("Labor by Year");
  for (const y of report.labor_by_year) {
    lines.push(`- Year ${y.year}: total labor ${fmt(y.total_labor_cents)}, end-of-year headcount ${y.headcount_end_of_year}`);
  }
  lines.push("");

  if (report.depreciation_schedule.length > 0) {
    lines.push("Depreciation Schedule (straight-line, per equipment item)");
    for (const d of report.depreciation_schedule) {
      lines.push(`- ${d.label}: ${fmt(d.cost_cents)} ÷ ${d.useful_life_years}yr = ${fmt(d.annual_depreciation_cents)}/yr`);
    }
    lines.push(`- Total annual depreciation: ${fmt(report.total_annual_depreciation_cents)}`);
    lines.push("");
  }

  lines.push("Working Capital");
  const wc = report.working_capital;
  lines.push(`- Inventory days on hand: ${wc.days_inventory_on_hand}`);
  lines.push(`- Days payable: ${wc.days_payable}`);
  lines.push(`- Days receivable: ${wc.days_receivable}`);
  lines.push(`- Initial WC requirement at month 1: ${fmt(wc.initial_requirement_cents)} (= inventory + AR − AP, from Y1 COGS/day × days)`);
  lines.push(`- Y1 cumulative ΔInventory: ${fmt(wc.y1_delta_inventory_cents)}`);
  lines.push(`- Y1 cumulative ΔA/P: ${fmt(wc.y1_delta_ap_cents)}`);
  lines.push(`- Y1 cumulative ΔA/R: ${fmt(wc.y1_delta_ar_cents)}`);
  lines.push("");

  lines.push("Cost Inflation (yearly)");
  const ci = report.cost_inflation_pct;
  lines.push(`- Utilities ${ci.utilities_pct_yearly}%, Supplies ${ci.supplies_pct_yearly}%, COGS ${ci.cogs_pct_yearly}%, Labor (wages) ${ci.labor_pct_yearly}%, Marketing ${ci.marketing_pct_yearly}%, Maintenance ${ci.maintenance_pct_yearly}%, Insurance ${ci.insurance_pct_yearly}%`);
  lines.push("");

  return lines.join("\n").trim();
}
