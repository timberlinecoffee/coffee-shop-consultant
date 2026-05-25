// TIM-972: Pure financial projection functions, extracted from financials.ts.
// TIM-1004: Extended with per-day operating schedule + itemized operating expenses.
// TIM-1004 follow-up: monthly granularity — computeMonthlyProjections is the primitive;
// computeAnnualSummary and computeProjections derive from it for TIM-1006 compatibility.

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type DailyFlow = Record<DayKey, number>;

export interface DaySchedule {
  open: boolean;
  open_time: string;   // "06:30"
  close_time: string;  // "17:00"
}

export type WeekSchedule = Record<DayKey, DaySchedule>;

export type OpexLineMode = "pct" | "flat";

export interface OpexLine {
  mode: OpexLineMode;
  pct: number;        // % of revenue (used when mode === "pct")
  flat_cents: number; // monthly, in cents (used when mode === "flat")
}

export interface MonthlyProjections {
  // Customer flow
  daily_flow: DailyFlow;
  avg_ticket_cents: number;

  // Per-day operating schedule (replaces open_days_per_week + hours_per_day)
  weekly_schedule: WeekSchedule;

  // COGS
  cogs_pct: number;

  // Operating Expenses (itemized)
  labor: OpexLine;                  // wages + payroll taxes + benefits
  monthly_rent_cents: number;       // flat monthly rent
  marketing: OpexLine;              // ads, promotions
  utilities_monthly_cents: number;  // gas, electric, water, internet
  insurance_monthly_cents: number;  // general liability, workers comp, property
  tech_monthly_cents: number;       // POS, payment processing, SaaS
  maintenance_monthly_cents: number; // repairs, maintenance
  supplies_monthly_cents: number;   // cleaning, paper, smallwares
  other_monthly_cents: number;      // miscellaneous

  // Below-the-line items
  interest_monthly_cents: number;
  taxes_pct: number;
}

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function defaultWeekSchedule(): WeekSchedule {
  return {
    mon: { open: true, open_time: "06:30", close_time: "17:00" },
    tue: { open: true, open_time: "06:30", close_time: "17:00" },
    wed: { open: true, open_time: "06:30", close_time: "17:00" },
    thu: { open: true, open_time: "06:30", close_time: "17:00" },
    fri: { open: true, open_time: "06:30", close_time: "17:00" },
    sat: { open: true, open_time: "07:00", close_time: "15:00" },
    sun: { open: false, open_time: "07:00", close_time: "15:00" },
  };
}

export function defaultMonthlyProjections(): MonthlyProjections {
  return {
    daily_flow: { mon: 80, tue: 90, wed: 100, thu: 100, fri: 130, sat: 150, sun: 100 },
    avg_ticket_cents: 750,
    weekly_schedule: defaultWeekSchedule(),
    cogs_pct: 30,
    labor: { mode: "pct", pct: 30, flat_cents: 0 },
    monthly_rent_cents: 450000,
    marketing: { mode: "pct", pct: 2, flat_cents: 0 },
    utilities_monthly_cents: 60000,
    insurance_monthly_cents: 20000,
    tech_monthly_cents: 25000,
    maintenance_monthly_cents: 15000,
    supplies_monthly_cents: 30000,
    other_monthly_cents: 20000,
    interest_monthly_cents: 0,
    taxes_pct: 25,
  };
}

function normalizeDaySchedule(raw: unknown, fallback: DaySchedule): DaySchedule {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  return {
    open: typeof r.open === "boolean" ? r.open : fallback.open,
    open_time: typeof r.open_time === "string" ? r.open_time : fallback.open_time,
    close_time: typeof r.close_time === "string" ? r.close_time : fallback.close_time,
  };
}

function normalizeWeekSchedule(raw: unknown): WeekSchedule {
  const defaults = defaultWeekSchedule();
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  return {
    mon: normalizeDaySchedule(r.mon, defaults.mon),
    tue: normalizeDaySchedule(r.tue, defaults.tue),
    wed: normalizeDaySchedule(r.wed, defaults.wed),
    thu: normalizeDaySchedule(r.thu, defaults.thu),
    fri: normalizeDaySchedule(r.fri, defaults.fri),
    sat: normalizeDaySchedule(r.sat, defaults.sat),
    sun: normalizeDaySchedule(r.sun, defaults.sun),
  };
}

function normalizeOpexLine(
  raw: unknown,
  defaultMode: OpexLineMode,
  defaultPct: number,
  defaultFlat: number
): OpexLine {
  if (!raw || typeof raw !== "object") {
    return { mode: defaultMode, pct: defaultPct, flat_cents: defaultFlat };
  }
  const r = raw as Record<string, unknown>;
  return {
    mode: r.mode === "pct" || r.mode === "flat" ? r.mode : defaultMode,
    pct: typeof r.pct === "number" ? r.pct : defaultPct,
    flat_cents: typeof r.flat_cents === "number" ? r.flat_cents : defaultFlat,
  };
}

export function normalizeMonthlyProjections(raw: unknown): MonthlyProjections {
  const defaults = defaultMonthlyProjections();
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;

  const flow =
    r.daily_flow && typeof r.daily_flow === "object"
      ? { ...defaults.daily_flow, ...(r.daily_flow as Partial<DailyFlow>) }
      : defaults.daily_flow;

  // Migration: if weekly_schedule is absent, derive from legacy open_days_per_week
  let weekly_schedule: WeekSchedule;
  if (r.weekly_schedule) {
    weekly_schedule = normalizeWeekSchedule(r.weekly_schedule);
  } else {
    weekly_schedule = defaultWeekSchedule();
    const legacyDays = typeof r.open_days_per_week === "number" ? r.open_days_per_week : 7;
    if (legacyDays <= 6) weekly_schedule.sun = { ...weekly_schedule.sun, open: false };
    if (legacyDays <= 5) weekly_schedule.sat = { ...weekly_schedule.sat, open: false };
  }

  // Labor: migrate from legacy labor_pct
  let labor: OpexLine;
  if (r.labor && typeof r.labor === "object") {
    labor = normalizeOpexLine(r.labor, "pct", 30, 0);
  } else if (typeof r.labor_pct === "number") {
    labor = { mode: "pct", pct: r.labor_pct, flat_cents: 0 };
  } else {
    labor = defaults.labor;
  }

  const marketing = r.marketing
    ? normalizeOpexLine(r.marketing, "pct", 2, 0)
    : defaults.marketing;

  const monthly_rent_cents =
    typeof r.monthly_rent_cents === "number" ? r.monthly_rent_cents : defaults.monthly_rent_cents;

  const utilities_monthly_cents =
    typeof r.utilities_monthly_cents === "number" ? r.utilities_monthly_cents : defaults.utilities_monthly_cents;

  // Migrate legacy other_opex_monthly_cents into the new itemized buckets
  const legacyOther =
    typeof r.other_opex_monthly_cents === "number" ? r.other_opex_monthly_cents : null;

  const insurance_monthly_cents =
    typeof r.insurance_monthly_cents === "number"
      ? r.insurance_monthly_cents
      : legacyOther != null
      ? Math.round(legacyOther * 0.25)
      : defaults.insurance_monthly_cents;

  const tech_monthly_cents =
    typeof r.tech_monthly_cents === "number"
      ? r.tech_monthly_cents
      : legacyOther != null
      ? Math.round(legacyOther * 0.3)
      : defaults.tech_monthly_cents;

  const maintenance_monthly_cents =
    typeof r.maintenance_monthly_cents === "number"
      ? r.maintenance_monthly_cents
      : legacyOther != null
      ? Math.round(legacyOther * 0.15)
      : defaults.maintenance_monthly_cents;

  const supplies_monthly_cents =
    typeof r.supplies_monthly_cents === "number"
      ? r.supplies_monthly_cents
      : legacyOther != null
      ? Math.round(legacyOther * 0.15)
      : defaults.supplies_monthly_cents;

  const other_monthly_cents =
    typeof r.other_monthly_cents === "number"
      ? r.other_monthly_cents
      : legacyOther != null
      ? Math.round(legacyOther * 0.15)
      : defaults.other_monthly_cents;

  return {
    daily_flow: flow,
    avg_ticket_cents:
      typeof r.avg_ticket_cents === "number" ? r.avg_ticket_cents : defaults.avg_ticket_cents,
    weekly_schedule,
    cogs_pct: typeof r.cogs_pct === "number" ? r.cogs_pct : defaults.cogs_pct,
    labor,
    monthly_rent_cents,
    marketing,
    utilities_monthly_cents,
    insurance_monthly_cents,
    tech_monthly_cents,
    maintenance_monthly_cents,
    supplies_monthly_cents,
    other_monthly_cents,
    interest_monthly_cents:
      typeof r.interest_monthly_cents === "number" ? r.interest_monthly_cents : defaults.interest_monthly_cents,
    taxes_pct:
      typeof r.taxes_pct === "number" ? r.taxes_pct : defaults.taxes_pct,
  };
}

// ── Equipment ─────────────────────────────────────────────────────────────────

export interface EquipmentSummary {
  total_cost_cents: number;
  financed_cost_cents: number;
}

// ── Monthly projection row (60-row computed output, TIM-1004 / TIM-1006) ──────

export interface MonthlyProjectionRow {
  year: number;        // 1–5
  month: number;       // 1–12
  month_index: number; // 1–60 (absolute)
  // All values in cents
  revenue_cents: number;
  cogs_cents: number;
  gross_profit_cents: number;
  labor_cents: number;
  rent_cents: number;
  marketing_cents: number;
  utilities_cents: number;
  insurance_cents: number;
  tech_cents: number;
  maintenance_cents: number;
  supplies_cents: number;
  other_misc_cents: number;
  total_opex_cents: number;
  operating_income_cents: number;
  depreciation_cents: number;
  interest_cents: number;
  income_before_taxes_cents: number;
  taxes_cents: number;
  net_income_cents: number;
}

// ── Projections output ────────────────────────────────────────────────────────

export interface YearProjection {
  revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  // Operating expenses (itemized)
  labor: number;
  rent: number;
  marketing: number;
  utilities: number;
  insurance: number;
  tech: number;
  maintenance: number;
  supplies: number;
  other_misc: number;
  total_opex: number;
  operating_income: number;
  // Below the line
  depreciation: number;
  interest: number;
  income_before_taxes: number;
  taxes: number;
  net_income: number;
  // Aliases for backward compatibility
  gross_margin: number;  // === gross_profit
  ebitda: number;        // === operating_income
}

export interface FinancialProjections {
  year1: YearProjection;
  year3: YearProjection;
  year5: YearProjection;
  startup_equipment_total: number;
  financed_total: number;
}

// ── Schedule helpers ──────────────────────────────────────────────────────────

export function computeDayHours(day: DaySchedule): number {
  if (!day.open) return 0;
  const [oh, om] = day.open_time.split(":").map(Number);
  const [ch, cm] = day.close_time.split(":").map(Number);
  return Math.max(0, ch + cm / 60 - (oh + om / 60));
}

export function computeWeeklyHours(schedule: WeekSchedule): number {
  return DAY_KEYS.reduce((sum, d) => sum + computeDayHours(schedule[d]), 0);
}

// ── Projection math ───────────────────────────────────────────────────────────

function yearGrowthFactor(year: number): number {
  if (year === 1) return 1.0;
  if (year === 2) return 1.15;
  if (year === 3) return 1.3;
  if (year === 4) return 1.425;
  return 1.55; // year 5
}

export function computeMonthlyProjections(
  mp: MonthlyProjections,
  equipment: EquipmentSummary
): MonthlyProjectionRow[] {
  const openDays = DAY_KEYS.filter((d) => mp.weekly_schedule[d].open);
  const weeklyCustomers = openDays.reduce((sum, d) => sum + (mp.daily_flow[d] || 0), 0);
  const baseMonthlyRevenueCents = Math.round(
    (weeklyCustomers * 52 * (mp.avg_ticket_cents / 100) * 100) / 12
  );
  const monthlyDepreciationCents = Math.round(
    (equipment.financed_cost_cents / 100 / 7 / 12) * 100
  );

  const rows: MonthlyProjectionRow[] = [];

  for (let year = 1; year <= 5; year++) {
    const monthlyRevenueCents = Math.round(baseMonthlyRevenueCents * yearGrowthFactor(year));

    for (let month = 1; month <= 12; month++) {
      const revenue_cents = monthlyRevenueCents;
      const cogs_cents = Math.round(revenue_cents * (mp.cogs_pct / 100));
      const gross_profit_cents = revenue_cents - cogs_cents;

      const labor_cents = mp.labor.mode === "pct"
        ? Math.round(revenue_cents * (mp.labor.pct / 100))
        : mp.labor.flat_cents;
      const rent_cents = mp.monthly_rent_cents;
      const marketing_cents = mp.marketing.mode === "pct"
        ? Math.round(revenue_cents * (mp.marketing.pct / 100))
        : mp.marketing.flat_cents;
      const utilities_cents = mp.utilities_monthly_cents;
      const insurance_cents = mp.insurance_monthly_cents;
      const tech_cents = mp.tech_monthly_cents;
      const maintenance_cents = mp.maintenance_monthly_cents;
      const supplies_cents = mp.supplies_monthly_cents;
      const other_misc_cents = mp.other_monthly_cents;

      const total_opex_cents =
        labor_cents + rent_cents + marketing_cents + utilities_cents +
        insurance_cents + tech_cents + maintenance_cents + supplies_cents + other_misc_cents;
      const operating_income_cents = gross_profit_cents - total_opex_cents;

      const depreciation_cents = monthlyDepreciationCents;
      const interest_cents = mp.interest_monthly_cents;
      const income_before_taxes_cents =
        operating_income_cents - depreciation_cents - interest_cents;
      const taxes_cents =
        income_before_taxes_cents > 0
          ? Math.round(income_before_taxes_cents * (mp.taxes_pct / 100))
          : 0;
      const net_income_cents = income_before_taxes_cents - taxes_cents;

      rows.push({
        year,
        month,
        month_index: (year - 1) * 12 + month,
        revenue_cents,
        cogs_cents,
        gross_profit_cents,
        labor_cents,
        rent_cents,
        marketing_cents,
        utilities_cents,
        insurance_cents,
        tech_cents,
        maintenance_cents,
        supplies_cents,
        other_misc_cents,
        total_opex_cents,
        operating_income_cents,
        depreciation_cents,
        interest_cents,
        income_before_taxes_cents,
        taxes_cents,
        net_income_cents,
      });
    }
  }

  return rows;
}

export function computeAnnualSummary(
  rows: MonthlyProjectionRow[],
  year: 1 | 2 | 3 | 4 | 5
): YearProjection {
  const yearRows = rows.filter((r) => r.year === year);

  function sumUsd(field: keyof MonthlyProjectionRow): number {
    return yearRows.reduce((s, r) => s + (r[field] as number), 0) / 100;
  }

  const revenue = sumUsd("revenue_cents");
  const cogs = sumUsd("cogs_cents");
  const gross_profit = sumUsd("gross_profit_cents");
  const gross_margin_pct = revenue > 0 ? (gross_profit / revenue) * 100 : 0;
  const labor = sumUsd("labor_cents");
  const rent = sumUsd("rent_cents");
  const marketing = sumUsd("marketing_cents");
  const utilities = sumUsd("utilities_cents");
  const insurance = sumUsd("insurance_cents");
  const tech = sumUsd("tech_cents");
  const maintenance = sumUsd("maintenance_cents");
  const supplies = sumUsd("supplies_cents");
  const other_misc = sumUsd("other_misc_cents");
  const total_opex = sumUsd("total_opex_cents");
  const operating_income = sumUsd("operating_income_cents");
  const depreciation = sumUsd("depreciation_cents");
  const interest = sumUsd("interest_cents");
  const income_before_taxes = sumUsd("income_before_taxes_cents");
  const taxes = sumUsd("taxes_cents");
  const net_income = sumUsd("net_income_cents");

  return {
    revenue, cogs, gross_profit, gross_margin_pct,
    labor, rent, marketing, utilities, insurance, tech, maintenance, supplies, other_misc,
    total_opex, operating_income,
    depreciation, interest, income_before_taxes, taxes, net_income,
    gross_margin: gross_profit,
    ebitda: operating_income,
  };
}

export function computeProjections(
  mp: MonthlyProjections,
  equipment: EquipmentSummary
): FinancialProjections {
  const rows = computeMonthlyProjections(mp, equipment);
  return {
    year1: computeAnnualSummary(rows, 1),
    year3: computeAnnualSummary(rows, 3),
    year5: computeAnnualSummary(rows, 5),
    startup_equipment_total: equipment.total_cost_cents / 100,
    financed_total: equipment.financed_cost_cents / 100,
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
