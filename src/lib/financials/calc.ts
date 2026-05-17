// TIM-716 / TIM-621-CHARTS — shared financial calc layer.
// Pure functions only: same numbers feed the Financials charts (screen) and
// the PDF template (TIM-621-PDF3). Do not import client/runtime modules here.

export type FinancialInputs = {
  startupCosts: number;
  monthlyRevenue: number;
  monthlyCogs: number;
  monthlyRent: number;
  monthlyOtherFixed: number;
};

export type SensitivityAdjustments = {
  revenuePct: number;
  cogsPct: number;
  rentPct: number;
};

export type MonthRow = {
  month: number;
  revenue: number;
  variableCost: number;
  fixedCost: number;
  netMonthly: number;
  cumulativeRevenue: number;
  cumulativeCost: number;
  cumulativeProfit: number;
};

export type BreakEvenSeries = {
  rows: MonthRow[];
  breakEvenMonth: number | null;
  fixedCostMonthly: number;
};

export const EMPTY_INPUTS: FinancialInputs = {
  startupCosts: 0,
  monthlyRevenue: 0,
  monthlyCogs: 0,
  monthlyRent: 0,
  monthlyOtherFixed: 0,
};

export const NO_ADJUSTMENTS: SensitivityAdjustments = {
  revenuePct: 0,
  cogsPct: 0,
  rentPct: 0,
};

export const PROJECTION_MONTHS = 12;

function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function pctMultiplier(pct: number): number {
  const clamped = Number.isFinite(pct) ? pct : 0;
  return 1 + clamped / 100;
}

export function normalizeInputs(
  partial: Partial<FinancialInputs> | null | undefined,
): FinancialInputs {
  if (!partial) return { ...EMPTY_INPUTS };
  return {
    startupCosts: nonNegative(Number(partial.startupCosts ?? 0)),
    monthlyRevenue: nonNegative(Number(partial.monthlyRevenue ?? 0)),
    monthlyCogs: nonNegative(Number(partial.monthlyCogs ?? 0)),
    monthlyRent: nonNegative(Number(partial.monthlyRent ?? 0)),
    monthlyOtherFixed: nonNegative(Number(partial.monthlyOtherFixed ?? 0)),
  };
}

export function applyAdjustments(
  inputs: FinancialInputs,
  adjustments: SensitivityAdjustments,
): FinancialInputs {
  return {
    startupCosts: inputs.startupCosts,
    monthlyRevenue: nonNegative(inputs.monthlyRevenue * pctMultiplier(adjustments.revenuePct)),
    monthlyCogs: nonNegative(inputs.monthlyCogs * pctMultiplier(adjustments.cogsPct)),
    monthlyRent: nonNegative(inputs.monthlyRent * pctMultiplier(adjustments.rentPct)),
    monthlyOtherFixed: inputs.monthlyOtherFixed,
  };
}

export function buildMonthlySeries(
  inputs: FinancialInputs,
  months: number = PROJECTION_MONTHS,
): MonthRow[] {
  const fixed = inputs.monthlyRent + inputs.monthlyOtherFixed;
  const rows: MonthRow[] = [];
  let cumulativeRevenue = 0;
  let cumulativeCost = inputs.startupCosts;
  for (let m = 1; m <= months; m += 1) {
    const revenue = inputs.monthlyRevenue;
    const variableCost = inputs.monthlyCogs;
    const fixedCost = fixed;
    const netMonthly = revenue - variableCost - fixedCost;
    cumulativeRevenue += revenue;
    cumulativeCost += variableCost + fixedCost;
    rows.push({
      month: m,
      revenue,
      variableCost,
      fixedCost,
      netMonthly,
      cumulativeRevenue,
      cumulativeCost,
      cumulativeProfit: cumulativeRevenue - cumulativeCost,
    });
  }
  return rows;
}

export function findBreakEvenMonth(rows: MonthRow[]): number | null {
  for (const row of rows) {
    if (row.cumulativeProfit >= 0) return row.month;
  }
  return null;
}

export function projectBreakEven(
  inputs: FinancialInputs,
  months: number = PROJECTION_MONTHS,
): BreakEvenSeries {
  const rows = buildMonthlySeries(inputs, months);
  return {
    rows,
    breakEvenMonth: findBreakEvenMonth(rows),
    fixedCostMonthly: inputs.monthlyRent + inputs.monthlyOtherFixed,
  };
}

export function projectWithAdjustments(
  inputs: FinancialInputs,
  adjustments: SensitivityAdjustments,
  months: number = PROJECTION_MONTHS,
): BreakEvenSeries {
  return projectBreakEven(applyAdjustments(inputs, adjustments), months);
}

export function hasAnyInputs(inputs: FinancialInputs): boolean {
  return (
    inputs.startupCosts > 0 ||
    inputs.monthlyRevenue > 0 ||
    inputs.monthlyCogs > 0 ||
    inputs.monthlyRent > 0 ||
    inputs.monthlyOtherFixed > 0
  );
}
