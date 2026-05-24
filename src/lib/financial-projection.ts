// TIM-972: Pure financial projection functions, extracted from financials.ts.
// All monetary inputs use cents; all monetary outputs are in dollars for display.
// Independently testable — no browser or Next.js dependencies.

export interface MonthlyProjections {
  daily_flow: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number };
  avg_ticket_cents: number;
  open_days_per_week: number;
  hours_per_day: number;
  cogs_pct: number;
  labor_pct: number;
  monthly_rent_cents: number;
  utilities_monthly_cents: number;
  other_opex_monthly_cents: number;
}

export function defaultMonthlyProjections(): MonthlyProjections {
  return {
    daily_flow: { mon: 80, tue: 90, wed: 100, thu: 100, fri: 130, sat: 150, sun: 100 },
    avg_ticket_cents: 750,
    open_days_per_week: 7,
    hours_per_day: 10,
    cogs_pct: 30,
    labor_pct: 35,
    monthly_rent_cents: 450000,
    utilities_monthly_cents: 60000,
    other_opex_monthly_cents: 80000,
  };
}

export function normalizeMonthlyProjections(raw: unknown): MonthlyProjections {
  const defaults = defaultMonthlyProjections();
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;

  const flow =
    r.daily_flow && typeof r.daily_flow === "object"
      ? { ...defaults.daily_flow, ...(r.daily_flow as Partial<MonthlyProjections["daily_flow"]>) }
      : defaults.daily_flow;

  return {
    daily_flow: flow,
    avg_ticket_cents: typeof r.avg_ticket_cents === "number" ? r.avg_ticket_cents : defaults.avg_ticket_cents,
    open_days_per_week: typeof r.open_days_per_week === "number" ? r.open_days_per_week : defaults.open_days_per_week,
    hours_per_day: typeof r.hours_per_day === "number" ? r.hours_per_day : defaults.hours_per_day,
    cogs_pct: typeof r.cogs_pct === "number" ? r.cogs_pct : defaults.cogs_pct,
    labor_pct: typeof r.labor_pct === "number" ? r.labor_pct : defaults.labor_pct,
    monthly_rent_cents: typeof r.monthly_rent_cents === "number" ? r.monthly_rent_cents : defaults.monthly_rent_cents,
    utilities_monthly_cents: typeof r.utilities_monthly_cents === "number" ? r.utilities_monthly_cents : defaults.utilities_monthly_cents,
    other_opex_monthly_cents: typeof r.other_opex_monthly_cents === "number" ? r.other_opex_monthly_cents : defaults.other_opex_monthly_cents,
  };
}

export interface EquipmentSummary {
  total_cost_cents: number;
  financed_cost_cents: number;
}

export interface YearProjection {
  revenue: number;
  cogs: number;
  gross_margin: number;
  gross_margin_pct: number;
  labor: number;
  rent: number;
  utilities: number;
  other_opex: number;
  total_opex: number;
  ebitda: number;
  depreciation: number;
  net_income: number;
}

export interface FinancialProjections {
  year1: YearProjection;
  year3: YearProjection;
  year5: YearProjection;
  startup_equipment_total: number;
  financed_total: number;
}

function avgDailyCustomers(
  flow: MonthlyProjections["daily_flow"],
  openDaysPerWeek: number
): number {
  const days = (Object.keys(flow) as (keyof typeof flow)[]);
  const sorted = [...days].sort((a, b) => flow[b] - flow[a]);
  const active = sorted.slice(0, Math.min(openDaysPerWeek, 7));
  const total = active.reduce((sum, d) => sum + flow[d], 0);
  return total / active.length;
}

function projectYear(
  baseRevenue: number,
  growthFactor: number,
  mp: MonthlyProjections,
  annualDepreciationUsd: number
): YearProjection {
  const revenue = baseRevenue * growthFactor;
  const cogs = revenue * (mp.cogs_pct / 100);
  const gross_margin = revenue - cogs;
  const gross_margin_pct = revenue > 0 ? (gross_margin / revenue) * 100 : 0;
  const labor = revenue * (mp.labor_pct / 100);
  const rent = (mp.monthly_rent_cents / 100) * 12;
  const utilities = (mp.utilities_monthly_cents / 100) * 12;
  const other_opex = (mp.other_opex_monthly_cents / 100) * 12;
  const total_opex = labor + rent + utilities + other_opex;
  const ebitda = gross_margin - total_opex;
  return {
    revenue,
    cogs,
    gross_margin,
    gross_margin_pct,
    labor,
    rent,
    utilities,
    other_opex,
    total_opex,
    ebitda,
    depreciation: annualDepreciationUsd,
    net_income: ebitda - annualDepreciationUsd,
  };
}

export function computeProjections(
  mp: MonthlyProjections,
  equipment: EquipmentSummary
): FinancialProjections {
  const avgDaily = avgDailyCustomers(mp.daily_flow, mp.open_days_per_week);
  const annualCustomers = avgDaily * mp.open_days_per_week * 52;
  const avgTicketUsd = mp.avg_ticket_cents / 100;
  const baseRevenue = annualCustomers * avgTicketUsd;

  // Depreciate financed equipment over 7 years (straight-line)
  const annualDepreciationUsd = equipment.financed_cost_cents / 100 / 7;

  const startupEquipmentTotalUsd = equipment.total_cost_cents / 100;
  const financedTotalUsd = equipment.financed_cost_cents / 100;

  return {
    year1: projectYear(baseRevenue, 1.0, mp, annualDepreciationUsd),
    year3: projectYear(baseRevenue, 1.3, mp, annualDepreciationUsd),
    year5: projectYear(baseRevenue, 1.55, mp, annualDepreciationUsd),
    startup_equipment_total: startupEquipmentTotalUsd,
    financed_total: financedTotalUsd,
  };
}

export function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${n < 0 ? "-" : ""}$${Math.round(abs / 100) / 10}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
