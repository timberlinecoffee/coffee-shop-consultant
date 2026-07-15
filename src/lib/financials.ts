// TIM-964: Financial Suite — data types, defaults, and projection calculations.
// Stored in workspace_documents.content as jsonb where workspace_key='financials'.

// ── Equipment ────────────────────────────────────────────────────────────────

export type FinancingMethod = "cash" | "in_house_financing" | "loan" | "other";
export type EquipmentCategory = "major" | "minor";

export interface EquipmentItem {
  id: string;
  name: string;
  brand: string;
  model: string;
  supplier: string;
  cost_usd: number;
  financing: FinancingMethod;
  category: EquipmentCategory;
  notes: string;
}

// ── Forecast Inputs ──────────────────────────────────────────────────────────

export interface DailyFlow {
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
}

export interface ForecastInputs {
  // Customer flow
  daily_flow: DailyFlow;
  avg_ticket_usd: number;

  // Operations
  open_days_per_week: number;
  hours_per_day: number;

  // COGS (product cost as % of revenue)
  cogs_pct: number;

  // Operating expenses
  monthly_rent_usd: number;
  labor_pct: number;
  utilities_monthly_usd: number;
  other_opex_monthly_usd: number;
}

// ── AI Critique ──────────────────────────────────────────────────────────────

// TIM-1104: weaknesses and suggestions must now ship with a recommendation,
// concrete next step, and short reason. Strengths only carry text. Older
// persisted records may not have the new fields, so renderers must treat
// recommendation/next_step/why as optional.
export interface CritiqueBullet {
  type: "strength" | "weakness" | "suggestion";
  text: string;
  recommendation?: string;
  next_step?: string;
  why?: string;
}

export interface CritiqueResult {
  bullets: CritiqueBullet[];
  generated_at: string;
}

// ── Top-level document ───────────────────────────────────────────────────────

export interface FinancialsDocument {
  version: 2;
  equipment: EquipmentItem[];
  equipment_ai_seeded: boolean;
  forecast: ForecastInputs;
  critique: CritiqueResult | null;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export function defaultForecast(): ForecastInputs {
  return {
    daily_flow: { mon: 80, tue: 90, wed: 100, thu: 100, fri: 130, sat: 150, sun: 100 },
    avg_ticket_usd: 7.5,
    open_days_per_week: 7,
    hours_per_day: 10,
    cogs_pct: 30,
    monthly_rent_usd: 4500,
    labor_pct: 35,
    utilities_monthly_usd: 600,
    other_opex_monthly_usd: 800,
  };
}

export function defaultFinancialsDocument(): FinancialsDocument {
  return {
    version: 2,
    equipment: [],
    equipment_ai_seeded: false,
    forecast: defaultForecast(),
    critique: null,
  };
}

export function normalizeFinancials(raw: unknown): FinancialsDocument {
  if (!raw || typeof raw !== "object") return defaultFinancialsDocument();
  const r = raw as Record<string, unknown>;

  // Version migration: if version is missing or < 2, use defaults
  const defaults = defaultFinancialsDocument();

  const forecast = (r.forecast && typeof r.forecast === "object")
    ? { ...defaults.forecast, ...(r.forecast as Partial<ForecastInputs>) }
    : defaults.forecast;

  const dailyFlow = (forecast.daily_flow && typeof forecast.daily_flow === "object")
    ? { ...defaults.forecast.daily_flow, ...(forecast.daily_flow as Partial<DailyFlow>) }
    : defaults.forecast.daily_flow;

  return {
    version: 2,
    equipment: Array.isArray(r.equipment) ? (r.equipment as EquipmentItem[]) : [],
    equipment_ai_seeded: Boolean(r.equipment_ai_seeded),
    forecast: { ...forecast, daily_flow: dailyFlow },
    critique: (r.critique && typeof r.critique === "object") ? (r.critique as CritiqueResult) : null,
  };
}

// ── Projection calculations ───────────────────────────────────────────────────

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

function avgDailyCustomers(flow: DailyFlow, openDaysPerWeek: number): number {
  const days: (keyof DailyFlow)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  // Use the top N days by count where N = openDaysPerWeek
  const sorted = [...days].sort((a, b) => flow[b] - flow[a]);
  const activeDays = sorted.slice(0, Math.min(openDaysPerWeek, 7));
  const total = activeDays.reduce((sum, d) => sum + flow[d], 0);
  return total / activeDays.length;
}

function computeDepreciation(equipment: EquipmentItem[]): number {
  // Depreciate financed items over 7 years (straight-line)
  const financedTotal = equipment
    .filter((e) => e.financing === "loan" || e.financing === "in_house_financing")
    .reduce((sum, e) => sum + (e.cost_usd || 0), 0);
  return financedTotal / 7;
}

function projectYear(
  baseRevenue: number,
  growthFactor: number,
  f: ForecastInputs,
  annualDepreciation: number
): YearProjection {
  const revenue = baseRevenue * growthFactor;
  const cogs = revenue * (f.cogs_pct / 100);
  const gross_margin = revenue - cogs;
  const gross_margin_pct = revenue > 0 ? (gross_margin / revenue) * 100 : 0;
  const labor = revenue * (f.labor_pct / 100);
  const rent = f.monthly_rent_usd * 12;
  const utilities = f.utilities_monthly_usd * 12;
  const other_opex = f.other_opex_monthly_usd * 12;
  const total_opex = labor + rent + utilities + other_opex;
  const ebitda = gross_margin - total_opex;
  const net_income = ebitda - annualDepreciation;
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
    depreciation: annualDepreciation,
    net_income,
  };
}

export function computeProjections(doc: FinancialsDocument): FinancialProjections {
  const f = doc.forecast;
  const avgDaily = avgDailyCustomers(f.daily_flow, f.open_days_per_week);
  const annualCustomers = avgDaily * f.open_days_per_week * 52;
  const baseRevenue = annualCustomers * f.avg_ticket_usd;
  const annualDepreciation = computeDepreciation(doc.equipment);

  const startup_equipment_total = doc.equipment.reduce((s, e) => s + (e.cost_usd || 0), 0);
  const financed_total = doc.equipment
    .filter((e) => e.financing === "loan" || e.financing === "in_house_financing")
    .reduce((s, e) => s + (e.cost_usd || 0), 0);

  return {
    year1: projectYear(baseRevenue, 1.0, f, annualDepreciation),
    year3: projectYear(baseRevenue, 1.3, f, annualDepreciation),
    year5: projectYear(baseRevenue, 1.55, f, annualDepreciation),
    startup_equipment_total,
    financed_total,
  };
}

export const FINANCING_LABELS: Record<FinancingMethod, string> = {
  cash: "Cash",
  in_house_financing: "In-house financing",
  loan: "Loan",
  other: "Other",
};

export const DAY_LABELS: Record<keyof DailyFlow, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
