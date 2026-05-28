// TIM-972: Pure financial projection functions, extracted from financials.ts.
// TIM-1004: Extended with per-day operating schedule + itemized operating expenses.
// TIM-1004 follow-up: monthly granularity — computeMonthlyProjections is the primitive;
// computeAnnualSummary and computeProjections derive from it for TIM-1006 compatibility.
// TIM-1102: LivePlan-style flexible expense modeling. forecast_lines[] is the source of
//   truth; legacy named fields (labor / monthly_rent_cents / marketing / ...) are
//   migrated into forecast_lines on read. Each line has a category (revenue|cogs|
//   overhead|capex), a flat-$ vs. %-of-sales mode, optional per-line ramp, and
//   optional per-line monthly growth.
// TIM-1101: multi-currency support — currency_code persists on MonthlyProjections;
//   formatCurrency / fmt accept an optional code and delegate to src/lib/currency.

import { formatCurrencyAmount, normalizeCurrencyCode } from "./currency.ts";

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

// ── TIM-1102: Custom forecast lines ────────────────────────────────────────────

export type ForecastCategory = "revenue" | "cogs" | "overhead" | "capex";

// legacy_key tags lines that round-trip to existing named fields in MonthlySlice
// so balance-sheet, break-even, and ratios tabs that read e.g. `labor_cents`
// keep working without per-tab refactors.
export type LegacyLineKey =
  | "labor"
  | "rent"
  | "marketing"
  | "utilities"
  | "insurance"
  | "tech"
  | "maintenance"
  | "supplies"
  | "interest";

export interface LineRamp {
  enabled: boolean;
  start_month: number;   // 1-indexed: first month the line applies (default 1)
  ramp_months: number;   // 0–24: months over which the level ramps from start_pct → 100%
  start_pct: number;     // 0–100: multiplier at start_month (e.g. 30 means start at 30% of full)
}

export interface LineGrowth {
  enabled: boolean;
  monthly_pct: number;   // compounding % per month, applied AFTER ramp completes
}

// TIM-1117: COGS lines can target a specific revenue stream and/or derive their
// pct from the Menu module. revenue_stream_id values:
//   undefined / "all" → applies against total revenue (legacy default)
//   "base"            → applies against the foot-traffic base revenue
//   <line.id>         → applies against that revenue line's amount this month
// menu_linked: when true on a COGS line, the line's effective pct comes from the
// blended menu COGS ratio (computed in the workspace from menu_items) and
// line.value is ignored. Falls back to line.value if no menu data is supplied.
export interface ForecastLine {
  id: string;
  label: string;
  category: ForecastCategory;
  mode: OpexLineMode;        // "flat" → cents/mo; "pct" → percent of net revenue
  value: number;             // cents if mode === "flat"; percent (e.g. 30) if "pct"
  ramp?: LineRamp;
  growth?: LineGrowth;
  legacy_key?: LegacyLineKey;
  revenue_stream_id?: string;
  menu_linked?: boolean;
  // TIM-1169: capex lines depreciate straight-line over their own useful life.
  // Default 7 years preserves prior behavior. Ignored on non-capex lines.
  useful_life_years?: number;
}

// TIM-1122: Funding Sources. Multiple line items per category; each kind has
// its own relevant fields (loans → term/rate, investors → % ownership). All
// equity kinds flow into balance-sheet Equity; loans flow into Long-Term Debt
// and produce monthly loan repayments in cash flow.
export type FundingKind = "founder_equity" | "loan" | "investor_equity" | "grant";

export interface FundingSourceLine {
  id: string;
  kind: FundingKind;
  label: string;
  amount_cents: number;
  // Loans only — required when kind === "loan".
  term_months?: number;
  annual_rate_pct?: number;
  // Investor equity only.
  pct_ownership?: number;
  // Grants / Other.
  notes?: string;
}

// TIM-1206: Salaries / Personnel plan. `personnel` is the single source of truth
// for labor cost. Each line's loaded cost (base pay + benefits burden) flows
// into the P&L (in the COGS or operating-overhead bucket per its designation),
// cash flow (as cash out in the month paid), and break-even. Personnel are
// fixed monthly costs — they do not scale per transaction — so break-even
// counts them in the fixed bucket. The legacy "labor" forecast_line is dropped
// on normalize so labor is never double-counted across the two models.
export type PersonnelPayBasis = "annual" | "monthly" | "hourly";

// Where a role's loaded cost rolls up on the P&L:
//   "cogs"     → direct service labor, reduces gross profit (e.g. baristas).
//   "overhead" → operating expense below gross profit (e.g. manager, bookkeeper).
export type PersonnelCostCategory = "cogs" | "overhead";

export interface PersonnelLine {
  id: string;
  role: string;                  // role / title (Title Case)
  headcount: number;             // number of staff in this role
  pay_basis: PersonnelPayBasis;
  // Per the basis: annual salary (cents/yr), monthly salary (cents/mo), or
  // hourly rate (cents/hr). Hourly uses hours_per_week × 52/12 per head.
  pay_amount_cents: number;
  hours_per_week?: number;       // hourly basis only — expected hours/week per head
  benefits_pct: number;          // payroll burden as % of base pay (taxes, health, etc.)
  benefits_fixed_cents?: number; // optional fixed burden per head per month
  cost_category: PersonnelCostCategory;
  // Phased hiring reuses the TIM-1102 ramp model: start_month is the hire month;
  // ramp_months / start_pct phase headcount in (e.g. start at 50%, reach full
  // staffing over 3 months). No per-line growth — pay changes are explicit edits.
  ramp?: LineRamp;
  end_month?: number;            // optional 1..60 — last month the role is paid (seasonal/temp)
}

// TIM-1243: LivePlan-style manual control. Two layers, both resolved at compute
// time in computeMonthlyProjections so overrides flow into the P&L, cash flow,
// balance sheet, break-even, and ratios identically to calculated values:
//   1. Per-cell override — `manual_overrides` pins a single (line, month) value.
//      The rest of the line keeps computing from its assumptions.
//   2. Per-line manual mode — a line id in `manual_lines` ignores its formula
//      entirely; every month comes from `manual_overrides` (a month with no
//      override resolves to 0). Switching a line to manual seeds overrides from
//      its current calculated values so the numbers are unchanged on conversion.
// `line_id` is a forecast_line id, a personnel line id, or BASE_REVENUE_LINE_ID
// for the foot-traffic base revenue. `month_index` is 1..60 (absolute).
export const BASE_REVENUE_LINE_ID = "__base_revenue__";

export interface ManualOverride {
  line_id: string;
  month_index: number;
  amount_cents: number;
}

// TIM-1244: One-time costs to open the doors. Previously these were hardcoded
// placeholders inside deriveFinancialInputs (workspace) and shown read-only on
// the Startup tab. They are now persisted so the guided interview can populate
// them and the owner can edit them on the input page.
export interface StartupCosts {
  buildout_cents: number;
  equipment_cents: number;
  deposits_cents: number;
  licenses_cents: number;
  pre_opening_marketing_cents: number;
  initial_inventory_cents: number;
  working_capital_reserve_cents: number;
  opening_cash_buffer_cents: number;
  // TIM-1246: build-out and equipment are capital assets, so they depreciate
  // straight-line over a useful life — the same coherent treatment capex
  // ForecastLines get (TIM-1169). Before this, these buckets seeded gross fixed
  // assets on the balance sheet but never depreciated, so net fixed assets never
  // declined and no depreciation expense / tax shield ever hit the P&L — even
  // though the Startup tab told owners equipment was "on a depreciation
  // schedule". Defaults: build-out / leasehold improvements 15y, equipment 7y.
  buildout_useful_life_years: number;
  equipment_useful_life_years: number;
}

export interface MonthlyProjections {
  // Customer flow
  daily_flow: DailyFlow;
  avg_ticket_cents: number;

  // TIM-1245: optional beverage/food split of the average ticket. When
  // revenue_split_enabled is true, avg_ticket_cents is kept in sync as
  // beverage_ticket_cents + food_ticket_cents, so the projection engine
  // (customers/day × avg ticket) is unchanged — the split is an attribution
  // layer the owner can read as average beverage/food sales per day. Beginners
  // leave it disabled and enter a single average-ticket number.
  revenue_split_enabled?: boolean;
  beverage_ticket_cents?: number;
  food_ticket_cents?: number;

  // Per-day operating schedule
  weekly_schedule: WeekSchedule;

  // Default COGS rate for the foot-traffic base revenue (additional COGS lines
  // can be added in forecast_lines).
  cogs_pct: number;

  // TIM-1102: source-of-truth flexible line items.
  forecast_lines: ForecastLine[];

  // TIM-1122: source-of-truth funding sources. When non-empty, these drive
  // owner_capital_cents / loan_amount_cents in computeMonthlySlices; the
  // legacy single-loan FinancialInputs fields are fall-backs for pre-1122 data.
  funding_sources: FundingSourceLine[];

  // TIM-1206: source-of-truth personnel plan (headcount, hire timing, pay,
  // benefits). Drives labor cost across P&L / cash flow / break-even.
  personnel: PersonnelLine[];

  // TIM-1244: persisted one-time startup costs. Optional for backward-compat —
  // older stored payloads without it fall back to defaultStartupCosts().
  startup_costs?: StartupCosts;

  // Below-the-line items
  // TIM-1247: income tax — applied to pre-tax profit, only when positive, and
  // flows to the P&L Net Income line. Renamed from the old ambiguous taxes_pct;
  // normalizeMonthlyProjections migrates legacy taxes_pct into this field.
  income_tax_pct: number;
  // TIM-1247: sales tax — a pass-through liability on taxable sales (collected
  // from customers, remitted to the state). Per standard accounting it is NOT
  // revenue or expense, so it does not touch any P&L line; it is surfaced only
  // as a memo (sales_tax_collected_cents). Projected revenue is tax-exclusive.
  sales_tax_pct: number;

  // Global ramp for the base (foot-traffic-driven) revenue. Per-line ramps
  // are configured inside each ForecastLine.
  ramp_months: number;
  ramp_multipliers: number[];
  growth_mode: "simple" | "custom";
  growth_monthly_pct: number;
  growth_custom_monthly: number[];

  // TIM-1100: First calendar month of the user's fiscal year (1=Jan … 12=Dec).
  // Default 1. Drives column ordering on monthly P&L / Balance Sheet / Cash Flow
  // tabs; does NOT change the underlying month-1..N simulation math.
  fiscal_year_start_month: number;

  // TIM-1101: ISO 4217 currency code (e.g., "USD", "EUR", "JPY"). Drives
  // symbol + locale formatting across the planner, AI assessment, and exports.
  // Single currency per plan — no FX conversion in v1.
  currency_code: string;

  // TIM-1169: Owner activity that hits financing-section cash flow without
  // touching net income.
  //   owner_draws_monthly_cents: flat monthly outflow (e.g. an owner taking a
  //     salary from the business). Reduces equity.
  //   owner_contributions: one-time cash injections at specific month_index
  //     values (1–60). Increase equity and cash.
  owner_draws_monthly_cents?: number;
  owner_contributions?: { month_index: number; amount_cents: number }[];

  // TIM-1180: revenue/cost drivers that are not modeled as forecast_lines.
  //   payment_processing_pct: card fees as a % of gross revenue (operating expense)
  //   spoilage_pct: product loss as a % of non-labor COGS (operating expense)
  //   loyalty_discount_pct: loyalty redemptions as a % of gross revenue (contra-revenue)
  // These flow through the P&L waterfall in computeMonthlyProjections so the
  // P&L, annual summary, slices, break-even, and ratios are all consistent.
  payment_processing_pct?: number;
  spoilage_pct?: number;
  loyalty_discount_pct?: number;

  // TIM-1243: per-cell manual overrides and per-line manual-entry mode.
  manual_overrides?: ManualOverride[];
  manual_lines?: string[];

  // ── Legacy fields kept on the type for migration / backward-compat reads ────
  // These are normalized INTO `forecast_lines` by normalizeMonthlyProjections.
  // New code should not read them directly — read the rollups on MonthlySlice
  // (labor_cents, rent_cents, etc.) instead. They remain optional so older
  // stored JSON deserializes cleanly.
  labor?: OpexLine;
  monthly_rent_cents?: number;
  marketing?: OpexLine;
  utilities_monthly_cents?: number;
  insurance_monthly_cents?: number;
  tech_monthly_cents?: number;
  maintenance_monthly_cents?: number;
  supplies_monthly_cents?: number;
  other_monthly_cents?: number;
  interest_monthly_cents?: number;
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

// Stable IDs for the seeded "starter" lines so migration produces deterministic
// IDs from a legacy MonthlyProjections payload (avoids creating duplicate lines
// every time normalizeMonthlyProjections runs).
const SEED_LINE_ID = {
  labor: "line:labor",
  rent: "line:rent",
  marketing: "line:marketing",
  utilities: "line:utilities",
  insurance: "line:insurance",
  tech: "line:tech",
  maintenance: "line:maintenance",
  supplies: "line:supplies",
  other: "line:other",
  interest: "line:interest",
} as const;

export function defaultForecastLines(): ForecastLine[] {
  // TIM-1206: Labor is no longer a forecast_line — it is modeled in `personnel`
  // (see defaultPersonnel) so headcount, hire timing, pay, and benefits are the
  // single source of truth. The labor forecast_line is dropped on normalize.
  return [
    {
      id: SEED_LINE_ID.rent,
      label: "Rent",
      category: "overhead",
      mode: "flat",
      value: 450000,
      legacy_key: "rent",
    },
    {
      id: SEED_LINE_ID.marketing,
      label: "Marketing",
      category: "overhead",
      mode: "pct",
      value: 2,
      legacy_key: "marketing",
    },
    {
      id: SEED_LINE_ID.utilities,
      label: "Utilities",
      category: "overhead",
      mode: "flat",
      value: 60000,
      legacy_key: "utilities",
    },
    {
      id: SEED_LINE_ID.insurance,
      label: "Insurance",
      category: "overhead",
      mode: "flat",
      value: 20000,
      legacy_key: "insurance",
    },
    {
      id: SEED_LINE_ID.tech,
      label: "Tech & Software",
      category: "overhead",
      mode: "flat",
      value: 25000,
      legacy_key: "tech",
    },
    {
      id: SEED_LINE_ID.maintenance,
      label: "Maintenance",
      category: "overhead",
      mode: "flat",
      value: 15000,
      legacy_key: "maintenance",
    },
    {
      id: SEED_LINE_ID.supplies,
      label: "Supplies",
      category: "overhead",
      mode: "flat",
      value: 30000,
      legacy_key: "supplies",
    },
    {
      id: SEED_LINE_ID.other,
      label: "Other",
      category: "overhead",
      mode: "flat",
      value: 20000,
    },
  ];
}

export function defaultFundingSources(): FundingSourceLine[] {
  return [
    {
      id: "funding:founder",
      kind: "founder_equity",
      label: "Founder Equity",
      amount_cents: 1500000000,
    },
    {
      id: "funding:loan",
      kind: "loan",
      label: "Bank Loan",
      amount_cents: 1000000000,
      term_months: 60,
      annual_rate_pct: 6.5,
    },
  ];
}

// TIM-1206: starter personnel plan. Roles default to operating-overhead labor
// (the common coffee-shop treatment, matching the prior labor line's placement);
// users can re-designate any role as COGS-labor. Realistic loaded labor here is
// intentionally higher than the old 30%-of-revenue line, which understated labor
// and break-even (see TIM-1178). Role names are Title Case (TIM-1002).
export function defaultPersonnel(): PersonnelLine[] {
  return [
    {
      id: "staff:baristas",
      role: "Baristas",
      headcount: 2,
      pay_basis: "hourly",
      pay_amount_cents: 1700, // $17.00/hr
      hours_per_week: 28,
      benefits_pct: 12,
      cost_category: "overhead",
    },
    {
      id: "staff:store-manager",
      role: "Store Manager",
      headcount: 1,
      pay_basis: "annual",
      pay_amount_cents: 4600000, // $46,000/yr
      benefits_pct: 18,
      cost_category: "overhead",
    },
  ];
}

// TIM-1244: default one-time startup costs. These match the placeholder values
// that previously lived hardcoded in deriveFinancialInputs, so existing plans
// (and plans created before startup_costs was persisted) are unchanged.
export function defaultStartupCosts(): StartupCosts {
  return {
    buildout_cents: 15000000,
    equipment_cents: 5000000,
    deposits_cents: 900000,
    licenses_cents: 500000,
    pre_opening_marketing_cents: 300000,
    initial_inventory_cents: 200000,
    working_capital_reserve_cents: 1500000,
    opening_cash_buffer_cents: 1000000,
    buildout_useful_life_years: 15,
    equipment_useful_life_years: 7,
  };
}

export function defaultMonthlyProjections(): MonthlyProjections {
  return {
    daily_flow: { mon: 80, tue: 90, wed: 100, thu: 100, fri: 130, sat: 150, sun: 100 },
    avg_ticket_cents: 750,
    weekly_schedule: defaultWeekSchedule(),
    cogs_pct: 30,
    forecast_lines: defaultForecastLines(),
    funding_sources: defaultFundingSources(),
    personnel: defaultPersonnel(),
    startup_costs: defaultStartupCosts(),
    income_tax_pct: 25,
    sales_tax_pct: 0,
    ramp_months: 3,
    ramp_multipliers: [30, 55, 80],
    growth_mode: "simple",
    growth_monthly_pct: 2,
    growth_custom_monthly: [],
    fiscal_year_start_month: 1,
    currency_code: "USD",
    owner_draws_monthly_cents: 0,
    owner_contributions: [],
    payment_processing_pct: 2.5,
    spoilage_pct: 2,
    loyalty_discount_pct: 1,
    manual_overrides: [],
    manual_lines: [],
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

function normalizeRamp(raw: unknown): LineRamp | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const enabled = r.enabled === true;
  if (!enabled) return undefined;
  return {
    enabled: true,
    start_month: typeof r.start_month === "number" ? Math.max(1, Math.round(r.start_month)) : 1,
    ramp_months: typeof r.ramp_months === "number" ? Math.max(0, Math.min(24, Math.round(r.ramp_months))) : 0,
    start_pct: typeof r.start_pct === "number" ? Math.max(0, Math.min(100, r.start_pct)) : 0,
  };
}

function normalizeGrowth(raw: unknown): LineGrowth | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const enabled = r.enabled === true;
  if (!enabled) return undefined;
  return {
    enabled: true,
    monthly_pct: typeof r.monthly_pct === "number" ? r.monthly_pct : 0,
  };
}

const ALL_LEGACY_KEYS: LegacyLineKey[] = [
  "labor",
  "rent",
  "marketing",
  "utilities",
  "insurance",
  "tech",
  "maintenance",
  "supplies",
  "interest",
];

const FUNDING_KINDS: FundingKind[] = ["founder_equity", "loan", "investor_equity", "grant"];

function normalizeFundingSource(raw: unknown, fallbackId: string): FundingSourceLine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = FUNDING_KINDS.includes(r.kind as FundingKind) ? (r.kind as FundingKind) : "founder_equity";
  const amount_cents = typeof r.amount_cents === "number" && r.amount_cents >= 0 ? Math.round(r.amount_cents) : 0;
  const id = typeof r.id === "string" && r.id.length > 0 ? r.id : fallbackId;
  const label = typeof r.label === "string" && r.label.length > 0 ? r.label : defaultFundingLabel(kind);
  const line: FundingSourceLine = { id, kind, label, amount_cents };
  if (kind === "loan") {
    line.term_months = typeof r.term_months === "number" && r.term_months > 0 ? Math.round(r.term_months) : 60;
    line.annual_rate_pct = typeof r.annual_rate_pct === "number" && r.annual_rate_pct >= 0 ? r.annual_rate_pct : 0;
  } else if (kind === "investor_equity") {
    line.pct_ownership = typeof r.pct_ownership === "number" ? Math.max(0, Math.min(100, r.pct_ownership)) : 0;
  }
  if (typeof r.notes === "string" && r.notes.length > 0) line.notes = r.notes;
  return line;
}

function defaultFundingLabel(kind: FundingKind): string {
  switch (kind) {
    case "founder_equity": return "Founder Equity";
    case "loan": return "Loan";
    case "investor_equity": return "Investor Equity";
    case "grant": return "Grant";
  }
}

// When a stored row predates TIM-1122 (no `funding_sources`) try to seed from
// any legacy single-loan inputs the founder may have configured via the old
// Inputs tab. If nothing useful is found, return the default funding set.
function migrateLegacyFundingSources(r: Record<string, unknown>): FundingSourceLine[] {
  const owner = typeof r.owner_capital_cents === "number" ? r.owner_capital_cents : null;
  const loanAmt = typeof r.loan_amount_cents === "number" ? r.loan_amount_cents : null;
  const loanTerm = typeof r.loan_term_months === "number" ? r.loan_term_months : 60;
  const loanRate = typeof r.loan_annual_rate_pct === "number" ? r.loan_annual_rate_pct : 0;
  if (owner === null && loanAmt === null) return defaultFundingSources();
  const lines: FundingSourceLine[] = [];
  if (owner && owner > 0) {
    lines.push({ id: "funding:founder", kind: "founder_equity", label: "Founder Equity", amount_cents: owner });
  }
  if (loanAmt && loanAmt > 0) {
    lines.push({
      id: "funding:loan",
      kind: "loan",
      label: "Loan",
      amount_cents: loanAmt,
      term_months: loanTerm,
      annual_rate_pct: loanRate,
    });
  }
  return lines.length > 0 ? lines : defaultFundingSources();
}

function normalizeForecastLine(raw: unknown, fallbackId: string): ForecastLine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const category: ForecastCategory =
    r.category === "revenue" || r.category === "cogs" || r.category === "overhead" || r.category === "capex"
      ? r.category
      : "overhead";
  const mode: OpexLineMode = r.mode === "flat" ? "flat" : "pct";
  const value = typeof r.value === "number" ? r.value : 0;
  const id = typeof r.id === "string" && r.id.length > 0 ? r.id : fallbackId;
  const label = typeof r.label === "string" && r.label.length > 0 ? r.label : "Line";
  const legacy = typeof r.legacy_key === "string" && ALL_LEGACY_KEYS.includes(r.legacy_key as LegacyLineKey)
    ? (r.legacy_key as LegacyLineKey)
    : undefined;
  const revenue_stream_id =
    typeof r.revenue_stream_id === "string" && r.revenue_stream_id.length > 0
      ? r.revenue_stream_id
      : undefined;
  const menu_linked = r.menu_linked === true ? true : undefined;
  const useful_life_years =
    typeof r.useful_life_years === "number" && r.useful_life_years > 0
      ? Math.min(50, Math.max(1, Math.round(r.useful_life_years)))
      : undefined;
  return {
    id,
    label,
    category,
    mode,
    value,
    ramp: normalizeRamp(r.ramp),
    growth: normalizeGrowth(r.growth),
    legacy_key: legacy,
    revenue_stream_id,
    menu_linked,
    useful_life_years,
  };
}

// Build forecast_lines from the legacy named fields. Called once per stored row
// when no `forecast_lines` array is present.
function migrateLegacyToForecastLines(r: Record<string, unknown>): ForecastLine[] {
  const lines: ForecastLine[] = [];

  // Labor (was OpexLine)
  const labor = r.labor ? normalizeOpexLine(r.labor, "pct", 30, 0)
    : typeof r.labor_pct === "number" ? { mode: "pct" as const, pct: r.labor_pct, flat_cents: 0 } : null;
  if (labor) {
    lines.push({
      id: SEED_LINE_ID.labor,
      label: "Labor",
      category: "overhead",
      mode: labor.mode,
      value: labor.mode === "pct" ? labor.pct : labor.flat_cents,
      legacy_key: "labor",
    });
  }

  // Rent
  if (typeof r.monthly_rent_cents === "number") {
    lines.push({
      id: SEED_LINE_ID.rent,
      label: "Rent",
      category: "overhead",
      mode: "flat",
      value: r.monthly_rent_cents,
      legacy_key: "rent",
    });
  }

  // Marketing
  if (r.marketing) {
    const m = normalizeOpexLine(r.marketing, "pct", 2, 0);
    lines.push({
      id: SEED_LINE_ID.marketing,
      label: "Marketing",
      category: "overhead",
      mode: m.mode,
      value: m.mode === "pct" ? m.pct : m.flat_cents,
      legacy_key: "marketing",
    });
  }

  // Flat named OpEx lines
  const flatLegacyFields: { field: string; id: string; label: string; key: LegacyLineKey }[] = [
    { field: "utilities_monthly_cents", id: SEED_LINE_ID.utilities, label: "Utilities", key: "utilities" },
    { field: "insurance_monthly_cents", id: SEED_LINE_ID.insurance, label: "Insurance", key: "insurance" },
    { field: "tech_monthly_cents", id: SEED_LINE_ID.tech, label: "Tech & Software", key: "tech" },
    { field: "maintenance_monthly_cents", id: SEED_LINE_ID.maintenance, label: "Maintenance", key: "maintenance" },
    { field: "supplies_monthly_cents", id: SEED_LINE_ID.supplies, label: "Supplies", key: "supplies" },
  ];
  for (const f of flatLegacyFields) {
    if (typeof r[f.field] === "number") {
      lines.push({
        id: f.id,
        label: f.label,
        category: "overhead",
        mode: "flat",
        value: r[f.field] as number,
        legacy_key: f.key,
      });
    }
  }

  // Other (no legacy_key — rolls into other_misc_cents)
  if (typeof r.other_monthly_cents === "number") {
    lines.push({
      id: SEED_LINE_ID.other,
      label: "Other",
      category: "overhead",
      mode: "flat",
      value: r.other_monthly_cents,
    });
  }

  // Interest (kept as a line so users can edit it like any other expense)
  if (typeof r.interest_monthly_cents === "number" && r.interest_monthly_cents > 0) {
    lines.push({
      id: SEED_LINE_ID.interest,
      label: "Interest",
      category: "overhead",
      mode: "flat",
      value: r.interest_monthly_cents,
      legacy_key: "interest",
    });
  }

  // If migration produced nothing usable, fall back to a complete starter set so
  // the user sees the same defaults as a fresh model.
  return lines.length > 0 ? lines : defaultForecastLines();
}

// TIM-1206: normalize one stored personnel row, clamping to sane ranges.
function normalizePersonnelLine(raw: unknown, fallbackId: string): PersonnelLine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id.length > 0 ? r.id : fallbackId;
  const role = typeof r.role === "string" && r.role.length > 0 ? r.role : "Staff";
  const headcount =
    typeof r.headcount === "number" && r.headcount >= 0 ? Math.floor(r.headcount) : 1;
  const pay_basis: PersonnelPayBasis =
    r.pay_basis === "annual" || r.pay_basis === "monthly" || r.pay_basis === "hourly"
      ? r.pay_basis
      : "hourly";
  const pay_amount_cents =
    typeof r.pay_amount_cents === "number" && r.pay_amount_cents >= 0
      ? Math.round(r.pay_amount_cents)
      : 0;
  const cost_category: PersonnelCostCategory = r.cost_category === "cogs" ? "cogs" : "overhead";
  const benefits_pct =
    typeof r.benefits_pct === "number" && r.benefits_pct >= 0 ? r.benefits_pct : 0;
  const line: PersonnelLine = {
    id,
    role,
    headcount,
    pay_basis,
    pay_amount_cents,
    benefits_pct,
    cost_category,
  };
  if (pay_basis === "hourly") {
    line.hours_per_week =
      typeof r.hours_per_week === "number" && r.hours_per_week >= 0
        ? r.hours_per_week
        : 30;
  }
  if (typeof r.benefits_fixed_cents === "number" && r.benefits_fixed_cents > 0) {
    line.benefits_fixed_cents = Math.round(r.benefits_fixed_cents);
  }
  const ramp = normalizeRamp(r.ramp);
  if (ramp) line.ramp = ramp;
  if (typeof r.end_month === "number" && r.end_month >= 1 && r.end_month <= 60) {
    line.end_month = Math.round(r.end_month);
  }
  return line;
}

// TIM-1206: when a stored row predates the personnel module, best-effort seed it.
// A flat (salaried) legacy labor line carries a fixed dollar amount we can keep
// exactly as a single monthly-pay role; a %-of-revenue labor line has no
// headcount mapping, so fall back to the realistic starter plan.
function migratePersonnelFromLegacy(forecastLines: ForecastLine[]): PersonnelLine[] {
  const labor = forecastLines.find((l) => l.legacy_key === "labor");
  if (labor && labor.mode === "flat" && labor.value > 0) {
    return [
      {
        id: "staff:legacy-labor",
        role: "Staff",
        headcount: 1,
        pay_basis: "monthly",
        pay_amount_cents: labor.value,
        benefits_pct: 0,
        cost_category: "overhead",
      },
    ];
  }
  return defaultPersonnel();
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

  // TIM-1102: forecast_lines is the source of truth. If present in stored JSON,
  // normalize each entry; otherwise migrate from the legacy named fields.
  const forecast_lines: ForecastLine[] = Array.isArray(r.forecast_lines)
    ? (r.forecast_lines as unknown[])
        .map((entry, idx) => normalizeForecastLine(entry, `line:${idx}:${Date.now()}`))
        .filter((x): x is ForecastLine => x !== null)
    : migrateLegacyToForecastLines(r);

  // TIM-1122: funding_sources — same migration pattern as forecast_lines.
  const funding_sources: FundingSourceLine[] = Array.isArray(r.funding_sources)
    ? (r.funding_sources as unknown[])
        .map((entry, idx) => normalizeFundingSource(entry, `funding:${idx}:${Date.now()}`))
        .filter((x): x is FundingSourceLine => x !== null)
    : migrateLegacyFundingSources(r);

  // TIM-1206: personnel is the source of truth for labor. A stored array (even
  // an empty one — meaning owner-only) normalizes through; legacy rows with no
  // personnel seed from the old labor line / the starter plan.
  const personnel: PersonnelLine[] = Array.isArray(r.personnel)
    ? (r.personnel as unknown[])
        .map((entry, idx) => normalizePersonnelLine(entry, `staff:${idx}:${Date.now()}`))
        .filter((x): x is PersonnelLine => x !== null)
    : migratePersonnelFromLegacy(forecast_lines);

  // Drop the legacy "labor" forecast_line so labor is never double-counted — it
  // now lives entirely in `personnel`.
  const forecast_lines_final = forecast_lines.filter((l) => l.legacy_key !== "labor");

  // Global ramp + growth (still applies to base foot-traffic revenue)
  const ramp_months =
    typeof r.ramp_months === "number" ? Math.min(12, Math.max(0, Math.round(r.ramp_months))) : 0;
  const ramp_multipliers = Array.isArray(r.ramp_multipliers)
    ? (r.ramp_multipliers as number[]).slice(0, 12)
    : [];
  const growth_mode: "simple" | "custom" =
    r.growth_mode === "custom" ? "custom" : "simple";
  const growth_monthly_pct =
    typeof r.growth_monthly_pct === "number" ? r.growth_monthly_pct : 0;
  const growth_custom_monthly = Array.isArray(r.growth_custom_monthly)
    ? (r.growth_custom_monthly as number[]).slice(0, 60)
    : [];

  const fiscal_year_start_month =
    typeof r.fiscal_year_start_month === "number"
      ? Math.min(12, Math.max(1, Math.round(r.fiscal_year_start_month)))
      : defaults.fiscal_year_start_month;

  const currency_code = normalizeCurrencyCode(r.currency_code);

  // TIM-1169: owner activity normalization. Negative or non-finite values
  // clamp to zero; month_index outside 1..60 is dropped.
  const owner_draws_monthly_cents =
    typeof r.owner_draws_monthly_cents === "number" && r.owner_draws_monthly_cents > 0
      ? Math.round(r.owner_draws_monthly_cents)
      : 0;
  const owner_contributions: { month_index: number; amount_cents: number }[] = Array.isArray(
    r.owner_contributions
  )
    ? (r.owner_contributions as unknown[])
        .map((c) => {
          if (!c || typeof c !== "object") return null;
          const o = c as Record<string, unknown>;
          const mi = typeof o.month_index === "number" ? Math.round(o.month_index) : NaN;
          const amt = typeof o.amount_cents === "number" ? Math.round(o.amount_cents) : 0;
          if (!Number.isFinite(mi) || mi < 1 || mi > 60 || amt <= 0) return null;
          return { month_index: mi, amount_cents: amt };
        })
        .filter((x): x is { month_index: number; amount_cents: number } => x !== null)
    : [];

  // TIM-1243: manual overrides. Drop non-finite / out-of-range entries; clamp
  // negative amounts to 0 (revenue/expense magnitudes); dedupe on (line, month)
  // keeping the last write.
  const overrideMap = new Map<string, ManualOverride>();
  if (Array.isArray(r.manual_overrides)) {
    for (const c of r.manual_overrides as unknown[]) {
      if (!c || typeof c !== "object") continue;
      const o = c as Record<string, unknown>;
      const lineId = typeof o.line_id === "string" ? o.line_id : "";
      const mi = typeof o.month_index === "number" ? Math.round(o.month_index) : NaN;
      const amt = typeof o.amount_cents === "number" ? Math.round(o.amount_cents) : NaN;
      if (!lineId || !Number.isFinite(mi) || mi < 1 || mi > 60 || !Number.isFinite(amt)) continue;
      overrideMap.set(`${lineId}:${mi}`, { line_id: lineId, month_index: mi, amount_cents: Math.max(0, amt) });
    }
  }
  const manual_overrides = Array.from(overrideMap.values());
  const manual_lines = Array.isArray(r.manual_lines)
    ? Array.from(new Set((r.manual_lines as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)))
    : [];

  // TIM-1244: startup costs. Merge stored values over defaults so older payloads
  // (without the field) read the same numbers they always did; clamp to >= 0.
  const sc = (r.startup_costs && typeof r.startup_costs === "object"
    ? r.startup_costs
    : {}) as Record<string, unknown>;
  const scDefaults = defaultStartupCosts();
  const startupCent = (key: keyof StartupCosts): number => {
    const v = sc[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0
      ? Math.round(v)
      : scDefaults[key];
  };
  // TIM-1246: useful life is clamped to a sane 1..50y range, defaulting to the
  // per-bucket default when missing (older payloads) or out of range.
  const startupLife = (key: "buildout_useful_life_years" | "equipment_useful_life_years"): number => {
    const v = sc[key];
    return typeof v === "number" && Number.isFinite(v) && v > 0
      ? Math.min(50, Math.max(1, Math.round(v)))
      : scDefaults[key];
  };
  const startup_costs: StartupCosts = {
    buildout_cents: startupCent("buildout_cents"),
    equipment_cents: startupCent("equipment_cents"),
    deposits_cents: startupCent("deposits_cents"),
    licenses_cents: startupCent("licenses_cents"),
    pre_opening_marketing_cents: startupCent("pre_opening_marketing_cents"),
    initial_inventory_cents: startupCent("initial_inventory_cents"),
    working_capital_reserve_cents: startupCent("working_capital_reserve_cents"),
    opening_cash_buffer_cents: startupCent("opening_cash_buffer_cents"),
    buildout_useful_life_years: startupLife("buildout_useful_life_years"),
    equipment_useful_life_years: startupLife("equipment_useful_life_years"),
  };

  // TIM-1245: optional beverage/food split of the average ticket. avg_ticket
  // stays the single engine driver; when the split is on we keep it equal to
  // beverage + food so customers/day × avg-ticket is unchanged.
  const revenue_split_enabled = r.revenue_split_enabled === true;
  let beverage_ticket_cents =
    typeof r.beverage_ticket_cents === "number" && r.beverage_ticket_cents >= 0
      ? Math.round(r.beverage_ticket_cents)
      : undefined;
  let food_ticket_cents =
    typeof r.food_ticket_cents === "number" && r.food_ticket_cents >= 0
      ? Math.round(r.food_ticket_cents)
      : undefined;
  let avg_ticket_cents =
    typeof r.avg_ticket_cents === "number" ? r.avg_ticket_cents : defaults.avg_ticket_cents;
  if (revenue_split_enabled) {
    if (beverage_ticket_cents === undefined && food_ticket_cents === undefined) {
      // Enabled with nothing entered yet: seed the split from the current ticket
      // (all beverage) so the rolled-up total is unchanged.
      beverage_ticket_cents = avg_ticket_cents;
      food_ticket_cents = 0;
    } else {
      avg_ticket_cents = (beverage_ticket_cents ?? 0) + (food_ticket_cents ?? 0);
    }
  }

  return {
    daily_flow: flow,
    avg_ticket_cents,
    revenue_split_enabled,
    beverage_ticket_cents,
    food_ticket_cents,
    weekly_schedule,
    cogs_pct: typeof r.cogs_pct === "number" ? r.cogs_pct : defaults.cogs_pct,
    forecast_lines: forecast_lines_final,
    funding_sources,
    personnel,
    startup_costs,
    // TIM-1247: migrate the legacy single rate (taxes_pct) into income_tax_pct
    // so saved plans keep the same meaning — the old rate was always income tax.
    income_tax_pct:
      typeof r.income_tax_pct === "number"
        ? r.income_tax_pct
        : typeof r.taxes_pct === "number"
        ? r.taxes_pct
        : defaults.income_tax_pct,
    sales_tax_pct:
      typeof r.sales_tax_pct === "number" ? r.sales_tax_pct : defaults.sales_tax_pct,
    ramp_months,
    ramp_multipliers,
    growth_mode,
    growth_monthly_pct,
    growth_custom_monthly,
    fiscal_year_start_month,
    currency_code,
    owner_draws_monthly_cents,
    owner_contributions,
    // TIM-1180: default to industry norms when absent so existing plans pick up
    // realistic payment processing / spoilage / loyalty costs instead of $0.
    payment_processing_pct:
      typeof r.payment_processing_pct === "number" ? r.payment_processing_pct : 2.5,
    spoilage_pct: typeof r.spoilage_pct === "number" ? r.spoilage_pct : 2,
    loyalty_discount_pct:
      typeof r.loyalty_discount_pct === "number" ? r.loyalty_discount_pct : 1,
    manual_overrides,
    manual_lines,
  };
}

// ── Equipment ─────────────────────────────────────────────────────────────────

export interface EquipmentSummary {
  total_cost_cents: number;
  financed_cost_cents: number;
}

// ── Monthly projection row (60-row computed output, TIM-1004 / TIM-1006) ──────

// Per-line per-month result, surfaced so the P&L tab can render whatever the
// user has built rather than only the hardcoded categories.
export interface LineMonthlyAmount {
  id: string;
  label: string;
  category: ForecastCategory;
  amount_cents: number;
  // TIM-1243: true when this month's value is a manual override (per-cell or
  // because the line is in full manual-entry mode). Lets the grid flag the cell.
  overridden?: boolean;
}

export interface MonthlyProjectionRow {
  year: number;        // 1–5
  month: number;       // 1–12
  month_index: number; // 1–60 (absolute)
  // All values in cents
  revenue_cents: number;
  // TIM-1243: foot-traffic base revenue (before additional revenue lines), and
  // whether it was manually overridden this month. revenue_cents still equals
  // base + additional revenue lines, so downstream rollups are unchanged.
  base_revenue_cents: number;
  base_revenue_overridden: boolean;
  // TIM-1180: loyalty discounts are contra-revenue; net_revenue = revenue − loyalty.
  loyalty_discounts_cents: number;
  net_revenue_cents: number;
  cogs_cents: number;
  // TIM-1180: payment processing (% of revenue) and spoilage (% of non-labor COGS)
  // are operating expenses included in total_opex_cents / operating_income_cents.
  payment_processing_cents: number;
  spoilage_cents: number;
  gross_profit_cents: number;
  // labor_cents is operating-overhead labor (the P&L "Labor" opex line). TIM-1206:
  // it is sourced from personnel lines designated "overhead". COGS-labor sits in
  // labor_cogs_cents (and is included in cogs_cents).
  labor_cents: number;
  // TIM-1206: personnel loaded cost split by P&L designation.
  labor_cogs_cents: number;      // direct service labor, included in cogs_cents
  labor_overhead_cents: number;  // operating labor, equals labor_cents
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
  // TIM-1247: sales tax collected on taxable sales this month — a pass-through
  // liability (collected then remitted), NOT part of revenue/expense/net income.
  // Memo only, so downstream tabs can show the cash flowing through.
  sales_tax_collected_cents: number;
  // TIM-1102: per-line breakdown so downstream tabs can render category groups
  forecast_line_amounts: LineMonthlyAmount[];
  capex_line_amounts: LineMonthlyAmount[];
  capex_cents: number;
  // TIM-1206: per-role personnel breakdown. Each entry's category is the role's
  // designation ("cogs" | "overhead") so the P&L can group it correctly. Kept
  // separate from forecast_line_amounts so break-even can treat personnel as a
  // fixed cost regardless of its P&L bucket.
  personnel_line_amounts: LineMonthlyAmount[];
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
  // TIM-1247: sales tax collected & remitted (pass-through memo, not in net income)
  sales_tax_collected: number;
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

// ── Fiscal year helpers (TIM-1100) ────────────────────────────────────────────

const CALENDAR_MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// Returns the 12 month labels in fiscal-year order starting at startMonth.
// startMonth is 1-indexed (1=Jan … 12=Dec). startMonth=4 → ["Apr","May",…,"Mar"].
export function fiscalYearMonthLabels(startMonth: number): string[] {
  const s = Math.min(12, Math.max(1, Math.round(startMonth || 1))) - 1;
  return Array.from({ length: 12 }, (_, i) => CALENDAR_MONTH_LABELS[(s + i) % 12]);
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

// Compute a revenue multiplier for a given 1-based month index (1–60).
// During ramp: uses ramp_multipliers[i-1] / 100 (clamped to stored length).
// After ramp: compounds growth_monthly_pct per month (simple) or uses
// per-entry growth_custom_monthly rates (custom mode).
function monthRevenueFactor(
  monthIndex: number,
  ramp_months: number,
  ramp_multipliers: number[],
  growth_mode: "simple" | "custom",
  growth_monthly_pct: number,
  growth_custom_monthly: number[]
): number {
  if (ramp_months > 0 && monthIndex <= ramp_months) {
    return (ramp_multipliers[monthIndex - 1] ?? 100) / 100;
  }
  // Months after ramp end: k = how many months past ramp end (1 = first post-ramp month)
  const k = monthIndex - ramp_months;
  if (growth_mode === "custom" && growth_custom_monthly.length > 0) {
    // Compound the custom monthly rates for months 1..k-1 (k-1 growth steps)
    let factor = 1.0;
    for (let i = 0; i < k - 1; i++) {
      factor *= 1 + (growth_custom_monthly[i] ?? growth_monthly_pct) / 100;
    }
    return factor;
  }
  // Simple compounding: first post-ramp month = 1.0x, then grows
  return Math.pow(1 + growth_monthly_pct / 100, k - 1);
}

// TIM-1102: compute per-line, per-month line factor (ramp × growth) applied
// to the line's base value. Returns 0 before start_month.
function lineMonthFactor(
  monthIndex: number,
  ramp: LineRamp | undefined,
  growth: LineGrowth | undefined
): number {
  const startMonth = ramp?.enabled ? Math.max(1, ramp.start_month) : 1;
  if (monthIndex < startMonth) return 0;
  const effective = monthIndex - startMonth + 1; // 1-indexed months since this line started

  // Ramp portion: linear from start_pct → 100% across ramp_months months.
  let rampFactor = 1.0;
  if (ramp?.enabled && ramp.ramp_months > 0) {
    if (effective <= ramp.ramp_months) {
      // effective=1 → start_pct/100; effective=ramp_months → 100/100
      const start = (ramp.start_pct ?? 0) / 100;
      const span = ramp.ramp_months;
      // linear interpolation across the ramp_months months
      const t = span === 1 ? 1 : (effective - 1) / (span - 1);
      rampFactor = start + (1 - start) * t;
    }
  }

  // Growth portion: compounding monthly, applied AFTER ramp completes.
  let growthFactor = 1.0;
  if (growth?.enabled) {
    const monthsPastRamp = Math.max(0, effective - (ramp?.enabled ? ramp.ramp_months : 0));
    if (monthsPastRamp > 0) {
      growthFactor = Math.pow(1 + (growth.monthly_pct ?? 0) / 100, monthsPastRamp - 1);
    }
  }

  return rampFactor * growthFactor;
}

// Compute one line's contribution in a given month, in cents. For pct lines,
// `monthRevenueCents` is the revenue base they apply to.
function computeLineAmountCents(
  line: ForecastLine,
  monthIndex: number,
  monthRevenueCents: number
): number {
  const factor = lineMonthFactor(monthIndex, line.ramp, line.growth);
  if (factor === 0) return 0;
  if (line.mode === "pct") {
    return Math.round(monthRevenueCents * (line.value / 100) * factor);
  }
  // flat: value is base cents/mo
  return Math.round(line.value * factor);
}

// TIM-1117: COGS lines may target a specific revenue stream and/or derive their
// pct from the menu. This picks the right base + pct given the runtime context.
export interface ProjectionContext {
  // Blended menu COGS percent (0–100), or null if no menu data is available.
  // Computed as Σ(item.cogs_cents × mix) / Σ(item.price_cents × mix) × 100 by
  // the caller; we just consume the number here so the projection stays pure.
  menu_blended_cogs_pct?: number | null;
}

// TIM-1118: pct-mode COGS and Overhead lines may target a revenue stream rather
// than total revenue. Resolves the right denominator given the user's selection.
// streamId values: undefined / "all" → total; "base" → foot-traffic base;
// <line.id> → that specific revenue line (falls back to total if deleted).
function resolveStreamRevenueCents(
  streamId: string | undefined,
  baseRevenueCents: number,
  totalRevenueCents: number,
  revenueByLineId: Map<string, number>
): number {
  if (!streamId || streamId === "all") return totalRevenueCents;
  if (streamId === "base") return baseRevenueCents;
  return revenueByLineId.get(streamId) ?? totalRevenueCents;
}

function computeCogsLineAmountCents(
  line: ForecastLine,
  monthIndex: number,
  baseRevenueCents: number,
  totalRevenueCents: number,
  revenueByLineId: Map<string, number>,
  ctx: ProjectionContext
): number {
  const factor = lineMonthFactor(monthIndex, line.ramp, line.growth);
  if (factor === 0) return 0;

  const baseForPct = resolveStreamRevenueCents(
    line.revenue_stream_id,
    baseRevenueCents,
    totalRevenueCents,
    revenueByLineId
  );

  // Resolve the effective rate / amount.
  if (line.menu_linked && typeof ctx.menu_blended_cogs_pct === "number") {
    return Math.round(baseForPct * (ctx.menu_blended_cogs_pct / 100) * factor);
  }
  if (line.mode === "pct") {
    return Math.round(baseForPct * (line.value / 100) * factor);
  }
  // flat: value is base cents/mo (revenue_stream_id is meaningless for flat lines)
  return Math.round(line.value * factor);
}

// TIM-1118: pct-mode overhead lines resolve their denominator the same way as
// COGS — undefined/"all" means total revenue (legacy default), "base" means
// foot-traffic, or a revenue line id targets that stream.
function computeOverheadLineAmountCents(
  line: ForecastLine,
  monthIndex: number,
  baseRevenueCents: number,
  totalRevenueCents: number,
  revenueByLineId: Map<string, number>
): number {
  const factor = lineMonthFactor(monthIndex, line.ramp, line.growth);
  if (factor === 0) return 0;
  if (line.mode === "pct") {
    const baseForPct = resolveStreamRevenueCents(
      line.revenue_stream_id,
      baseRevenueCents,
      totalRevenueCents,
      revenueByLineId
    );
    return Math.round(baseForPct * (line.value / 100) * factor);
  }
  return Math.round(line.value * factor);
}

// TIM-1206: a personnel line's full-staffing monthly base pay (before benefits),
// in cents. Hourly converts hours_per_week to a monthly figure via 52/12.
function personnelMonthlyBaseCents(line: PersonnelLine): number {
  const heads = Math.max(0, Math.floor(line.headcount || 0));
  if (heads <= 0) return 0;
  let perHead = 0;
  if (line.pay_basis === "annual") {
    perHead = (line.pay_amount_cents || 0) / 12;
  } else if (line.pay_basis === "monthly") {
    perHead = line.pay_amount_cents || 0;
  } else {
    const hrs = Math.max(0, line.hours_per_week || 0);
    perHead = (line.pay_amount_cents || 0) * hrs * (52 / 12);
  }
  return perHead * heads;
}

// TIM-1206: a personnel line's loaded monthly cost (base pay + benefits burden)
// for a given 1-based month, after applying phased-hiring ramp and any seasonal
// end month. Returns 0 before the hire month or after end_month.
function personnelMonthlyLoadedCents(line: PersonnelLine, monthIndex: number): number {
  if (typeof line.end_month === "number" && line.end_month > 0 && monthIndex > line.end_month) {
    return 0;
  }
  const factor = lineMonthFactor(monthIndex, line.ramp, undefined);
  if (factor === 0) return 0;
  const heads = Math.max(0, Math.floor(line.headcount || 0));
  const base = personnelMonthlyBaseCents(line);
  const benefits =
    base * ((line.benefits_pct || 0) / 100) + (line.benefits_fixed_cents || 0) * heads;
  return Math.round((base + benefits) * factor);
}

// TIM-1206: full-staffing loaded monthly cost (base pay + benefits burden),
// ignoring ramp/end_month. Exposed for UI previews and exports.
export function personnelLoadedMonthlyCents(line: PersonnelLine): number {
  const heads = Math.max(0, Math.floor(line.headcount || 0));
  if (heads <= 0) return 0;
  const base = personnelMonthlyBaseCents(line);
  return Math.round(
    base + base * ((line.benefits_pct || 0) / 100) + (line.benefits_fixed_cents || 0) * heads
  );
}

// One-time capex: charged in full on its start_month (or month 1 if no ramp).
function computeCapexAmountCents(line: ForecastLine, monthIndex: number): number {
  const startMonth = line.ramp?.enabled ? Math.max(1, line.ramp.start_month) : 1;
  if (monthIndex !== startMonth) return 0;
  // capex doesn't ramp or compound; it's a single charge
  return Math.round(line.value);
}

export function computeMonthlyProjections(
  mp: MonthlyProjections,
  equipment: EquipmentSummary,
  ctx: ProjectionContext = {}
): MonthlyProjectionRow[] {
  const openDays = DAY_KEYS.filter((d) => mp.weekly_schedule[d].open);
  const weeklyCustomers = openDays.reduce((sum, d) => sum + (mp.daily_flow[d] || 0), 0);
  const baseMonthlyRevenueCents = Math.round(
    (weeklyCustomers * 52 * (mp.avg_ticket_cents / 100) * 100) / 12
  );

  // TIM-1169: Depreciation is now per-capex-line. Each capex line depreciates
  // straight-line from its start month over its own useful_life_years (default
  // 7y). Legacy equipment financed-cost path is retired — `equipment` has been
  // hard-coded to {0, 0} in the workspace since TIM-1029.
  const ramp_months = mp.ramp_months ?? 0;
  const ramp_multipliers = mp.ramp_multipliers ?? [];
  const growth_mode = mp.growth_mode ?? "simple";
  const growth_monthly_pct = mp.growth_monthly_pct ?? 0;
  const growth_custom_monthly = mp.growth_custom_monthly ?? [];

  const lines = mp.forecast_lines ?? [];
  const revenueLines = lines.filter((l) => l.category === "revenue");
  const cogsLines = lines.filter((l) => l.category === "cogs");
  const overheadLines = lines.filter((l) => l.category === "overhead");
  const capexLines = lines.filter((l) => l.category === "capex");

  // TIM-1243: resolve a per-line per-month amount against manual control.
  //   - an explicit (line, month) override always wins (returns overridden:true)
  //   - else if the line is in full manual-entry mode, the formula is ignored
  //     and a month with no override is 0
  //   - else the calculated formula value is used
  // Applying this here is the single chokepoint that makes overrides flow into
  // every downstream statement, since they all derive from these rows.
  const overrideMap = new Map<string, number>();
  for (const o of mp.manual_overrides ?? []) {
    if (o && typeof o.line_id === "string" && Number.isFinite(o.month_index)) {
      overrideMap.set(`${o.line_id}:${o.month_index}`, Math.round(o.amount_cents) || 0);
    }
  }
  const manualLineSet = new Set(mp.manual_lines ?? []);
  const resolveAmount = (
    lineId: string,
    monthIndex: number,
    formulaCents: number
  ): { amount: number; overridden: boolean } => {
    const key = `${lineId}:${monthIndex}`;
    if (overrideMap.has(key)) return { amount: overrideMap.get(key)!, overridden: true };
    if (manualLineSet.has(lineId)) return { amount: 0, overridden: false };
    return { amount: formulaCents, overridden: false };
  };

  // Pre-compute monthly depreciation per capex line.
  //   - life = useful_life_years (default 7)
  //   - start = ramp.start_month if enabled, else 1
  //   - per-month dep = value / (life * 12) for months [start, start + life*12 - 1]
  // Sum across lines for each month into a single per-month depreciation array.
  // (We use simple round-per-month, accepting up to a few cents of cumulative
  // rounding drift over a full lifetime — well under the 1c threshold the BS
  // tolerance permits.)
  const depreciationByMonth: number[] = new Array(60).fill(0);
  for (const l of capexLines) {
    const life = typeof l.useful_life_years === "number" && l.useful_life_years > 0
      ? l.useful_life_years
      : 7;
    const start = l.ramp?.enabled ? Math.max(1, l.ramp.start_month) : 1;
    const months = Math.max(1, Math.round(life * 12));
    const perMonth = Math.round(l.value / months);
    if (perMonth <= 0) continue;
    for (let m = start; m < start + months && m <= 60; m++) {
      depreciationByMonth[m - 1] += perMonth;
    }
  }

  // TIM-1246: the one-time startup build-out and equipment buckets are capital
  // assets and must depreciate too, on the same straight-line basis as capex
  // lines. They are capitalized at open (month 1), so depreciation runs from
  // month 1 over each bucket's useful life. This is what makes depreciation
  // coherent across the whole asset model: every fixed asset on the balance
  // sheet — whether entered as an itemized capex line or as a startup bucket —
  // depreciates over a useful life, hits the P&L as expense (with the tax
  // shield), and draws down accumulated depreciation. Without this the startup
  // assets sat on the balance sheet at gross forever (see computeMonthlySlices
  // fixedAssetsGross seeding) with no expense ever recognized.
  const sc = mp.startup_costs ?? defaultStartupCosts();
  const addStraightLineDep = (costCents: number, lifeYears: number) => {
    if (!(costCents > 0)) return;
    const months = Math.max(1, Math.round((lifeYears > 0 ? lifeYears : 7) * 12));
    const perMonth = Math.round(costCents / months);
    if (perMonth <= 0) return;
    for (let m = 1; m <= months && m <= 60; m++) {
      depreciationByMonth[m - 1] += perMonth;
    }
  };
  addStraightLineDep(sc.buildout_cents ?? 0, sc.buildout_useful_life_years ?? 15);
  addStraightLineDep(sc.equipment_cents ?? 0, sc.equipment_useful_life_years ?? 7);

  const rows: MonthlyProjectionRow[] = [];

  for (let year = 1; year <= 5; year++) {
    for (let month = 1; month <= 12; month++) {
      const month_index_abs = (year - 1) * 12 + month;
      const revFactor = monthRevenueFactor(
        month_index_abs,
        ramp_months,
        ramp_multipliers,
        growth_mode,
        growth_monthly_pct,
        growth_custom_monthly
      );
      // Base foot-traffic revenue (after global ramp/growth). TIM-1243: a manual
      // override or manual-mode base replaces the formula. The overridden base is
      // also the denominator for pct-mode revenue lines that reference it.
      const baseFormulaCents = Math.round(baseMonthlyRevenueCents * revFactor);
      const baseRes = resolveAmount(BASE_REVENUE_LINE_ID, month_index_abs, baseFormulaCents);
      const baseRevenue = Math.max(0, baseRes.amount);
      // Revenue lines stack ON TOP of base. For now we compute each revenue
      // line against itself (its `value` is treated as a standalone cents/mo
      // amount with line ramp/growth); pct-mode revenue lines are interpreted
      // as a percent of base (e.g. retail = 10% of beverage revenue).
      let revenueAdds = 0;
      const revenueLineResults: LineMonthlyAmount[] = [];
      const revenueByLineId = new Map<string, number>();
      for (const l of revenueLines) {
        const formula = computeLineAmountCents(l, month_index_abs, baseRevenue);
        const res = resolveAmount(l.id, month_index_abs, formula);
        const amt = res.amount;
        revenueAdds += amt;
        revenueLineResults.push({ id: l.id, label: l.label, category: "revenue", amount_cents: amt, overridden: res.overridden });
        revenueByLineId.set(l.id, amt);
      }
      const revenue_cents = baseRevenue + revenueAdds;

      // TIM-1206: personnel — the source of truth for labor. Each role's loaded
      // monthly cost rolls into COGS-labor or operating-overhead per its
      // designation. Computed up front so COGS-labor can fold into cogs_cents.
      const personnelResults: LineMonthlyAmount[] = [];
      let labor_cogs_cents = 0;
      let labor_overhead_cents = 0;
      for (const p of mp.personnel ?? []) {
        const formula = personnelMonthlyLoadedCents(p, month_index_abs);
        const res = resolveAmount(p.id, month_index_abs, formula);
        const amt = res.amount;
        const cat: ForecastCategory = p.cost_category === "cogs" ? "cogs" : "overhead";
        personnelResults.push({ id: p.id, label: p.role, category: cat, amount_cents: amt, overridden: res.overridden });
        if (cat === "cogs") labor_cogs_cents += amt;
        else labor_overhead_cents += amt;
      }

      // Default COGS (legacy cogs_pct) applies to total revenue
      const baseCogs = Math.round(revenue_cents * (mp.cogs_pct / 100));
      let extraCogs = 0;
      const cogsLineResults: LineMonthlyAmount[] = [];
      for (const l of cogsLines) {
        const formula = computeCogsLineAmountCents(
          l,
          month_index_abs,
          baseRevenue,
          revenue_cents,
          revenueByLineId,
          ctx
        );
        const res = resolveAmount(l.id, month_index_abs, formula);
        const amt = res.amount;
        extraCogs += amt;
        cogsLineResults.push({ id: l.id, label: l.label, category: "cogs", amount_cents: amt, overridden: res.overridden });
      }
      // TIM-1206: direct (COGS-designated) labor is part of cost of goods sold.
      const cogs_cents = baseCogs + extraCogs + labor_cogs_cents;

      // TIM-1180: loyalty (contra-revenue), payment processing + spoilage (opex).
      // Spoilage applies to goods only, so exclude COGS-designated labor.
      const cogsExLaborCents = cogs_cents - labor_cogs_cents;
      const loyalty_discounts_cents = Math.round(
        revenue_cents * ((mp.loyalty_discount_pct ?? 0) / 100)
      );
      const net_revenue_cents = revenue_cents - loyalty_discounts_cents;
      const payment_processing_cents = Math.round(
        revenue_cents * ((mp.payment_processing_pct ?? 0) / 100)
      );
      const spoilage_cents = Math.round(cogsExLaborCents * ((mp.spoilage_pct ?? 0) / 100));
      const gross_profit_cents = net_revenue_cents - cogs_cents;

      // Overhead lines — sum per-line and roll up to legacy named buckets via legacy_key
      const overheadResults: LineMonthlyAmount[] = [];
      let total_opex_cents = 0;
      let labor_cents = 0;
      let rent_cents = 0;
      let marketing_cents = 0;
      let utilities_cents = 0;
      let insurance_cents = 0;
      let tech_cents = 0;
      let maintenance_cents = 0;
      let supplies_cents = 0;
      let other_misc_cents = 0;
      let interest_cents = 0;
      for (const l of overheadLines) {
        const formula = computeOverheadLineAmountCents(
          l,
          month_index_abs,
          baseRevenue,
          revenue_cents,
          revenueByLineId
        );
        const res = resolveAmount(l.id, month_index_abs, formula);
        const amt = res.amount;
        overheadResults.push({ id: l.id, label: l.label, category: "overhead", amount_cents: amt, overridden: res.overridden });
        switch (l.legacy_key) {
          case "labor": labor_cents += amt; break;
          case "rent": rent_cents += amt; break;
          case "marketing": marketing_cents += amt; break;
          case "utilities": utilities_cents += amt; break;
          case "insurance": insurance_cents += amt; break;
          case "tech": tech_cents += amt; break;
          case "maintenance": maintenance_cents += amt; break;
          case "supplies": supplies_cents += amt; break;
          case "interest": interest_cents += amt; break;
          default: other_misc_cents += amt; break;
        }
        // Interest is moved below the line, not into total_opex.
        if (l.legacy_key !== "interest") total_opex_cents += amt;
      }

      // TIM-1206: operating-overhead personnel is the P&L "Labor" opex line.
      labor_cents += labor_overhead_cents;
      total_opex_cents += labor_overhead_cents;

      // TIM-1180: payment processing + spoilage are operating expenses. Including
      // them here means the P&L sub-lines reconcile with Total Operating Expenses
      // and operating income reflects these real costs (previously $0).
      total_opex_cents += payment_processing_cents + spoilage_cents;

      // Capex lines — one-time charge in their start_month
      const capexResults: LineMonthlyAmount[] = [];
      let capex_cents = 0;
      for (const l of capexLines) {
        const formula = computeCapexAmountCents(l, month_index_abs);
        const res = resolveAmount(l.id, month_index_abs, formula);
        const amt = res.amount;
        capexResults.push({ id: l.id, label: l.label, category: "capex", amount_cents: amt, overridden: res.overridden });
        capex_cents += amt;
      }

      const operating_income_cents = gross_profit_cents - total_opex_cents;

      // TIM-1169: per-line straight-line depreciation, pre-aggregated above.
      const depreciation_cents = depreciationByMonth[month_index_abs - 1] ?? 0;

      const income_before_taxes_cents =
        operating_income_cents - depreciation_cents - interest_cents;
      const taxes_cents =
        income_before_taxes_cents > 0
          ? Math.round(income_before_taxes_cents * (mp.income_tax_pct / 100))
          : 0;
      const net_income_cents = income_before_taxes_cents - taxes_cents;

      // TIM-1247: sales tax is a pass-through liability — collected from
      // customers on taxable sales and remitted to the state. It is neither
      // revenue nor expense, so it touches no P&L line above; we compute it
      // purely as a memo on net (taxable) revenue so owners can see the cash
      // they collect and remit. Assumes net revenue is taxable; projected
      // revenue figures are tax-exclusive.
      const sales_tax_collected_cents = Math.round(
        net_revenue_cents * ((mp.sales_tax_pct ?? 0) / 100)
      );

      rows.push({
        year,
        month,
        month_index: month_index_abs,
        revenue_cents,
        base_revenue_cents: baseRevenue,
        base_revenue_overridden: baseRes.overridden,
        loyalty_discounts_cents,
        net_revenue_cents,
        cogs_cents,
        payment_processing_cents,
        spoilage_cents,
        gross_profit_cents,
        labor_cents,
        labor_cogs_cents,
        labor_overhead_cents,
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
        sales_tax_collected_cents,
        forecast_line_amounts: [...revenueLineResults, ...cogsLineResults, ...overheadResults],
        capex_line_amounts: capexResults,
        capex_cents,
        personnel_line_amounts: personnelResults,
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
  const sales_tax_collected = sumUsd("sales_tax_collected_cents");

  return {
    revenue, cogs, gross_profit, gross_margin_pct,
    labor, rent, marketing, utilities, insurance, tech, maintenance, supplies, other_misc,
    total_opex, operating_income,
    depreciation, interest, income_before_taxes, taxes, net_income, sales_tax_collected,
    gross_margin: gross_profit,
    ebitda: operating_income,
  };
}

export function computeProjections(
  mp: MonthlyProjections,
  equipment: EquipmentSummary,
  ctx: ProjectionContext = {}
): FinancialProjections {
  const rows = computeMonthlyProjections(mp, equipment, ctx);
  return {
    year1: computeAnnualSummary(rows, 1),
    year3: computeAnnualSummary(rows, 3),
    year5: computeAnnualSummary(rows, 5),
    startup_equipment_total: equipment.total_cost_cents / 100,
    financed_total: equipment.financed_cost_cents / 100,
  };
}

// TIM-1117: compute the blended menu COGS percent from menu items.
// Each item contributes (cogs × mix) to total cost and (price × mix) to total
// revenue; the ratio × 100 is the blended COGS %. Returns null when the menu
// has no valid items (no positive priced item with a non-zero mix), so the
// caller can render "Menu not available" rather than apply a zero rate.
export interface MenuItemForCogs {
  price_cents: number;
  computed_cogs_cents?: number | null;
  cogs_cents?: number | null;
  expected_mix_pct?: number | null;
  archived?: boolean | null;
}

export function computeMenuBlendedCogsPct(
  items: ReadonlyArray<MenuItemForCogs> | null | undefined
): number | null {
  if (!items || items.length === 0) return null;
  let totalCost = 0;
  let totalPrice = 0;
  for (const it of items) {
    if (it.archived) continue;
    const price = typeof it.price_cents === "number" && it.price_cents > 0 ? it.price_cents : 0;
    const mix = typeof it.expected_mix_pct === "number" && it.expected_mix_pct > 0
      ? it.expected_mix_pct
      : 0;
    if (price === 0 || mix === 0) continue;
    const cogs = typeof it.computed_cogs_cents === "number"
      ? it.computed_cogs_cents
      : typeof it.cogs_cents === "number"
        ? it.cogs_cents
        : 0;
    totalCost += cogs * mix;
    totalPrice += price * mix;
  }
  if (totalPrice <= 0) return null;
  return (totalCost / totalPrice) * 100;
}

// TIM-1101: formatCurrency now takes an optional ISO 4217 currency code so the
// planner, AI assessment, and exports can render in the user's selected
// currency. Defaults to USD to keep legacy single-arg callers compatible.
export function formatCurrency(n: number, currencyCode: string = "USD"): string {
  return formatCurrencyAmount(n, currencyCode);
}

// ── Phase 2 additions (TIM-1019) ─────────────────────────────────────────────

// MonthlySlice: richer per-month record for 5-year statement tabs.
// Extends MonthlyProjectionRow with break-even, cash-flow, and balance-sheet fields.
export interface MonthlySlice extends MonthlyProjectionRow {
  // P&L extras (loyalty_discounts_cents, net_revenue_cents, payment_processing_cents,
  // and spoilage_cents now live on MonthlyProjectionRow — see TIM-1180).
  gross_revenue_cents: number;
  total_cogs_cents: number;
  beverage_cogs_cents: number;
  food_cogs_cents: number;
  retail_cogs_cents: number;
  other_opex_cents: number;
  ebitda_cents: number;
  ebit_cents: number;
  avg_ticket_cents: number;
  // Cash-flow statement
  net_cash_cents: number;
  loan_repayment_cents: number;
  loan_interest_cents: number; // TIM-1169: interest portion of loan payment
  capex_cents: number;
  cash_cents: number;
  // TIM-1169: working-capital changes (this month minus last). Positive Δ in
  // assets = cash consumed; positive Δ in liabilities = cash freed.
  delta_ar_cents: number;
  delta_inventory_cents: number;
  delta_ap_cents: number;
  // TIM-1169: owner financing activity
  owner_draws_cents: number;
  owner_contributions_cents: number;
  // Balance sheet — assets
  accounts_receivable_cents: number;
  inventory_cents: number;
  fixed_assets_gross_cents: number;
  accumulated_depreciation_cents: number;
  net_fixed_assets_cents: number;
  other_assets_cents: number;
  total_assets_cents: number;
  // Balance sheet — liabilities
  accounts_payable_cents: number;
  current_debt_cents: number;
  long_term_debt_cents: number;
  total_liabilities_cents: number;
  // Balance sheet — equity
  owner_equity_cents: number;
  retained_earnings_cents: number;
  total_equity_cents: number;
  total_liabilities_and_equity_cents: number;
  // TIM-1122: equity composition from Funding tab. Sums to owner_equity_cents.
  founder_equity_cents: number;
  investor_equity_cents: number;
  grants_cents: number;
}

// FinancialInputs: extended model inputs used by the Startup / Inputs tabs.
export interface FinancialInputs {
  // Daily operations
  days_per_week: number;
  hours_per_day: number;
  avg_ticket_cents: number;
  customers_per_day: number;
  // Revenue mix (pct, must sum to 100)
  beverage_revenue_pct: number;
  food_revenue_pct: number;
  retail_revenue_pct: number;
  // COGS by category (pct)
  beverage_cogs_pct: number;
  food_cogs_pct: number;
  retail_cogs_pct: number;
  // Operating expenses
  rent_cents: number;
  labor_pct: number;
  marketing_pct: number;
  utilities_cents: number;
  insurance_cents: number;
  tech_cents: number;
  maintenance_cents: number;
  supplies_cents: number;
  payment_processing_pct: number;
  spoilage_pct: number;
  loyalty_discount_pct: number;
  other_opex_cents: number;
  // Startup costs
  buildout_cost_cents: number;
  equipment_cost_cents: number;
  rent_deposits_cents: number;
  license_permits_cents: number;
  pre_opening_marketing_cents: number;
  initial_inventory_cents: number;
  working_capital_reserve_cents: number;
  opening_cash_buffer_cents: number;
  // Funding
  owner_capital_cents: number;
  loan_amount_cents: number;
  loan_term_months: number;
  loan_annual_rate_pct: number;
  // Depreciation & taxes
  depreciation_years: number;
  // TIM-1247: this is the income tax rate (derived from MonthlyProjections
  // .income_tax_pct). Sales tax is pass-through and not modeled here.
  tax_rate_pct: number;
  // Working capital cycle
  days_inventory: number;
  days_payable: number;
  days_receivable: number;
}

// ── Break-even cost model (TIM-1178, TIM-1206) ───────────────────────────────
// Splits the month-1 cost base into variable (scales with revenue) and fixed
// (does not) buckets, then derives break-even revenue and transactions.
//
// Variable costs scale with revenue: non-labor COGS, payment processing,
// spoilage, and any overhead line in "pct" mode (e.g. marketing).
// Fixed costs do not scale: "flat" mode overhead lines, interest, depreciation,
// and — per TIM-1206 — all personnel cost. Salaries and expected-hours pay are
// fixed monthly commitments, not per-transaction costs, so they belong in the
// fixed bucket regardless of whether a role is designated COGS-labor or
// overhead. Personnel is the single source of truth for labor here.
//
// Before TIM-1178 labor was excluded from BOTH buckets, understating break-even
// by ~43% at default inputs and telling owners a loss-making volume was profit.
export interface BreakEvenModel {
  breakEvenRevenueCents: number;
  breakEvenTransactions: number;
  contributionMarginPct: number;     // fraction 0..1
  contributionPerTicketCents: number;
  variablePct: number;               // fraction 0..1
  fixedCostsCents: number;
  avgTicketCents: number;
}

export function computeBreakEvenModel(
  m1: MonthlySlice | undefined,
  forecastLines: ForecastLine[],
  avgTicketCents: number
): BreakEvenModel | null {
  if (!m1) return null;
  const nr = m1.net_revenue_cents;
  if (nr <= 0 || avgTicketCents <= 0) return null;

  const lineById = new Map(forecastLines.map((l) => [l.id, l]));
  let variableOverheadCents = 0;
  let fixedOverheadCents = 0;
  for (const a of m1.forecast_line_amounts) {
    if (a.category !== "overhead") continue;
    const line = lineById.get(a.id);
    // Interest is a flat below-the-line charge counted via m1.interest_cents.
    if (line?.legacy_key === "interest") continue;
    if (line?.mode === "pct") variableOverheadCents += a.amount_cents;
    else fixedOverheadCents += a.amount_cents;
  }

  // TIM-1206: personnel is fixed. total_cogs_cents includes COGS-labor, so strip
  // it out of the variable bucket and add all personnel to the fixed bucket.
  const laborCogsCents = m1.labor_cogs_cents ?? 0;
  const laborOverheadCents = m1.labor_overhead_cents ?? 0;

  const variableCents =
    (m1.total_cogs_cents - laborCogsCents) +
    m1.payment_processing_cents +
    m1.spoilage_cents +
    variableOverheadCents;
  const variablePct = variableCents / nr;
  const contributionMarginPct = 1 - variablePct;

  const fixedCostsCents =
    fixedOverheadCents +
    m1.interest_cents +
    m1.depreciation_cents +
    laborCogsCents +
    laborOverheadCents;

  const contributionPerTicketCents = avgTicketCents * contributionMarginPct;

  const breakEvenRevenueCents =
    contributionMarginPct > 0 ? fixedCostsCents / contributionMarginPct : Infinity;
  const breakEvenTransactions =
    contributionPerTicketCents > 0 ? Math.ceil(fixedCostsCents / contributionPerTicketCents) : Infinity;

  return {
    breakEvenRevenueCents,
    breakEvenTransactions,
    contributionMarginPct,
    contributionPerTicketCents,
    variablePct,
    fixedCostsCents,
    avgTicketCents,
  };
}

// fmt: format a cents value (or minor-unit value for non-2dp currencies) as a
// compact currency string. TIM-1101: accepts optional ISO 4217 code; defaults
// to USD for legacy single-arg callers.
export function fmt(cents: number, currencyCode: string = "USD"): string {
  return formatCurrency(cents / 100, currencyCode);
}

// pct: express numerator / denominator as a percentage string with one decimal.
export function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

// sumSlices: sum a list of MonthlySlice objects into a single Partial<MonthlySlice>.
export function sumSlices(slices: MonthlySlice[]): Partial<MonthlySlice> {
  if (slices.length === 0) return {};
  const numericKeys = Object.keys(slices[0]).filter(
    (k) => k !== "year" && k !== "month" && k !== "month_index"
  ) as (keyof MonthlySlice)[];

  const result: Partial<MonthlySlice> = {};
  for (const key of numericKeys) {
    let sum = 0;
    for (const s of slices) {
      const v = s[key];
      if (typeof v === "number") sum += v;
    }
    (result as Record<string, number>)[key] = sum;
  }
  return result;
}

// TIM-1102: aggregate per-line amounts across a set of slices, keyed by line id.
// Returns an array of {id, label, category, amount_cents} where amount_cents is the
// sum across all slices. Useful for quarterly/annual roll-ups in the P&L tab.
export function aggregateLineAmounts(slices: MonthlySlice[]): LineMonthlyAmount[] {
  const byId = new Map<string, LineMonthlyAmount>();
  for (const slice of slices) {
    for (const entry of slice.forecast_line_amounts ?? []) {
      const existing = byId.get(entry.id);
      if (existing) {
        existing.amount_cents += entry.amount_cents;
        if (entry.overridden) existing.overridden = true;
      } else {
        byId.set(entry.id, { ...entry });
      }
    }
  }
  return Array.from(byId.values());
}

// TIM-1206: same shape for personnel roles, summed across slices.
export function aggregatePersonnelAmounts(slices: MonthlySlice[]): LineMonthlyAmount[] {
  const byId = new Map<string, LineMonthlyAmount>();
  for (const slice of slices) {
    for (const entry of slice.personnel_line_amounts ?? []) {
      const existing = byId.get(entry.id);
      if (existing) {
        existing.amount_cents += entry.amount_cents;
        if (entry.overridden) existing.overridden = true;
      } else {
        byId.set(entry.id, { ...entry });
      }
    }
  }
  return Array.from(byId.values());
}

// Same shape for capex.
export function aggregateCapexAmounts(slices: MonthlySlice[]): LineMonthlyAmount[] {
  const byId = new Map<string, LineMonthlyAmount>();
  for (const slice of slices) {
    for (const entry of slice.capex_line_amounts ?? []) {
      const existing = byId.get(entry.id);
      if (existing) {
        existing.amount_cents += entry.amount_cents;
      } else {
        byId.set(entry.id, { ...entry });
      }
    }
  }
  return Array.from(byId.values());
}

// getQuarterSlices: return slices that fall in the given year + quarter (1–4).
export function getQuarterSlices(
  slices: MonthlySlice[],
  year: number,
  quarter: number
): MonthlySlice[] {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return slices.filter(
    (s) => s.year === year && s.month >= startMonth && s.month <= endMonth
  );
}

// computeMonthlySlices: produce MonthlySlice[] from MonthlyProjections + FinancialInputs.
// Extends computeMonthlyProjections with P&L extras, cash-flow, and balance-sheet fields.
export function computeMonthlySlices(
  mp: MonthlyProjections,
  equipment: EquipmentSummary,
  inputs: Partial<FinancialInputs> = {},
  ctx: ProjectionContext = {}
): MonthlySlice[] {
  const rows = computeMonthlyProjections(mp, equipment, ctx);

  // TIM-1180: payment processing, spoilage, and loyalty discounts are computed
  // inside computeMonthlyProjections (from mp) and already on each row, so they
  // flow through the P&L waterfall. Only the revenue-mix / working-capital
  // display inputs are read here.
  const bevRevPct = (inputs.beverage_revenue_pct ?? 70) / 100;
  const foodRevPct = (inputs.food_revenue_pct ?? 20) / 100;
  const bevCogsPct = (inputs.beverage_cogs_pct ?? 30) / 100;
  const foodCogsPct = (inputs.food_cogs_pct ?? 35) / 100;
  const daysInventory = inputs.days_inventory ?? 7;
  const daysPayable = inputs.days_payable ?? 30;
  const daysReceivable = inputs.days_receivable ?? 0;
  // TIM-1122: funding_sources is the source of truth when present. Each loan
  // amortizes independently so users can model e.g. a 60mo SBA loan alongside
  // a 24mo equipment loan with different rates. Equity sources roll up into
  // owner_capital_cents for backward-compat balance-sheet math.
  const fundingSources = mp.funding_sources ?? [];
  const sourceEquity = (kind: FundingKind) =>
    fundingSources
      .filter((s) => s.kind === kind)
      .reduce((sum, s) => sum + (s.amount_cents || 0), 0);
  const founderEquityCents = sourceEquity("founder_equity");
  const investorEquityCents = sourceEquity("investor_equity");
  const grantsCents = sourceEquity("grant");
  const fundingHasEntries = fundingSources.length > 0;
  // Sources rolled up; fall back to legacy FinancialInputs when no funding_sources
  // are configured (pre-1122 stored rows in dev/staging).
  const ownerCapital = fundingHasEntries
    ? founderEquityCents + investorEquityCents + grantsCents
    : (inputs.owner_capital_cents ?? 0);

  type LoanState = { balance: number; monthlyRate: number; monthlyPayment: number };
  const loanStates: LoanState[] = (fundingHasEntries
    ? fundingSources.filter((s) => s.kind === "loan" && (s.amount_cents || 0) > 0)
    : []
  ).map((s) => {
    const balance = s.amount_cents || 0;
    const monthlyRate = ((s.annual_rate_pct ?? 0) / 100) / 12;
    const term = Math.max(1, s.term_months ?? 0);
    const monthlyPayment =
      monthlyRate > 0
        ? Math.round(
            balance * monthlyRate * Math.pow(1 + monthlyRate, term) /
              (Math.pow(1 + monthlyRate, term) - 1)
          )
        : Math.round(balance / term);
    return { balance, monthlyRate, monthlyPayment };
  });
  // Legacy single-loan fallback if no funding_sources are present.
  if (!fundingHasEntries) {
    const legacyAmount = inputs.loan_amount_cents ?? 0;
    const legacyTerms = inputs.loan_term_months ?? 0;
    if (legacyAmount > 0 && legacyTerms > 0) {
      const monthlyRate = ((inputs.loan_annual_rate_pct ?? 0) / 100) / 12;
      const monthlyPayment =
        monthlyRate > 0
          ? Math.round(
              legacyAmount * monthlyRate * Math.pow(1 + monthlyRate, legacyTerms) /
                (Math.pow(1 + monthlyRate, legacyTerms) - 1)
            )
          : Math.round(legacyAmount / legacyTerms);
      loanStates.push({ balance: legacyAmount, monthlyRate, monthlyPayment });
    }
  }

  // TIM-1246: gross fixed assets are seeded from the SAME source that drives
  // depreciation (mp.startup_costs), so the two can never diverge — a capital
  // asset that depreciates on the P&L is always the asset that sits on the
  // balance sheet at gross. Previously this read inputs.equipment_cost_cents /
  // buildout_cost_cents while depreciation read mp.startup_costs; in production
  // those are equal (FinancialInputs is derived from the model), but any caller
  // that passed divergent inputs would break the balance-sheet identity once the
  // startup buckets started depreciating.
  const startupAssets = mp.startup_costs ?? defaultStartupCosts();
  const fixedAssetsGross =
    (startupAssets.equipment_cents || 0) + (startupAssets.buildout_cents || 0);
  // TIM-1181: The opening balance sheet must reconcile sources (funding) against
  // uses (assets + pre-opening spend), or Assets = Liabilities + Equity never
  // holds and the planner shows "Out Of Balance" on every valid input. Opening
  // cash is the residual: funding left after capitalizing fixed assets and
  // expensing pre-opening costs (deposits, licenses, launch marketing, initial
  // inventory). Those pre-opening costs become an opening accumulated deficit in
  // retained earnings, which keeps the identity true for every month.
  const initialLoanTotalCents = loanStates.reduce((sum, l) => sum + l.balance, 0);
  const preOpeningExpensesCents =
    (inputs.rent_deposits_cents ?? 0) +
    (inputs.license_permits_cents ?? 0) +
    (inputs.pre_opening_marketing_cents ?? 0) +
    (inputs.initial_inventory_cents ?? 0);
  const openingCash =
    ownerCapital + initialLoanTotalCents - fixedAssetsGross - preOpeningExpensesCents;

  const ownerDrawsMonthly = mp.owner_draws_monthly_cents ?? 0;
  const ownerContributionsByMonth = new Map<number, number>();
  for (const c of mp.owner_contributions ?? []) {
    ownerContributionsByMonth.set(c.month_index, (ownerContributionsByMonth.get(c.month_index) ?? 0) + c.amount_cents);
  }

  let cumulativeNetIncome = 0;
  let cumulativeDepreciation = 0;
  let cashBalance = openingCash;
  let cumulativeOwnerDraws = 0;
  let cumulativeOwnerContributions = 0;
  let prevArCents = 0;
  let prevInventoryCents = 0;
  let prevApCents = 0;

  return rows.map((row) => {
    const rev = row.revenue_cents;
    const grossRevenueCents = rev;
    // TIM-1206: working capital applies to goods, not labor — so exclude any
    // COGS-designated labor folded into cogs_cents.
    const cogsExLaborCents = row.cogs_cents - (row.labor_cogs_cents ?? 0);
    const bevRevCents = Math.round(rev * bevRevPct);
    const foodRevCents = Math.round(rev * foodRevPct);
    const retailRevCents = Math.round(rev * ((inputs.retail_revenue_pct ?? 10) / 100));
    const bevCogsCents = Math.round(bevRevCents * bevCogsPct);
    const foodCogsCents = Math.round(foodRevCents * foodCogsPct);
    const retailCogsCents = Math.round(retailRevCents * ((inputs.retail_cogs_pct ?? 40) / 100));
    // TIM-1182: total_opex excludes depreciation (applied below the line), so
    // operating_income_cents is gross profit minus opex-excl-D&A — i.e. it IS
    // EBITDA. EBIT subtracts depreciation; adding it back would double-count.
    const ebitdaCents = row.operating_income_cents;
    const ebitCents = row.operating_income_cents - row.depreciation_cents;

    cumulativeNetIncome += row.net_income_cents;
    cumulativeDepreciation += row.depreciation_cents;

    // Loan amortization — amortize each loan independently and sum principal
    // payments into loan_repayment_cents for the cash-flow statement.
    let loanRepaymentCents = 0;
    let loanInterestCents = 0;
    let totalLoanBalance = 0;
    for (const loan of loanStates) {
      if (loan.balance > 0) {
        const interest = Math.round(loan.balance * loan.monthlyRate);
        const principal = Math.min(loan.monthlyPayment - interest, loan.balance);
        loan.balance = Math.max(0, loan.balance - principal);
        loanRepaymentCents += principal;
        loanInterestCents += interest;
      }
      totalLoanBalance += loan.balance;
    }

    // TIM-1169: working-capital deltas. Compute end-of-period working-capital
    // balances first, then take the delta from the prior period.
    const arCents = Math.round(rev * (daysReceivable / 30));
    const inventoryCents = Math.round(cogsExLaborCents * (daysInventory / 30));
    const apCents = Math.round(cogsExLaborCents * (daysPayable / 30));
    const deltaAr = arCents - prevArCents;
    const deltaInventory = inventoryCents - prevInventoryCents;
    const deltaAp = apCents - prevApCents;
    prevArCents = arCents;
    prevInventoryCents = inventoryCents;
    prevApCents = apCents;

    // TIM-1169: owner activity
    const ownerContributionsCents = ownerContributionsByMonth.get(row.month_index) ?? 0;
    const ownerDrawsCents = ownerDrawsMonthly;
    cumulativeOwnerDraws += ownerDrawsCents;
    cumulativeOwnerContributions += ownerContributionsCents;

    // Cash flow with full CFO format:
    //   CFO = NI + D&A − ΔAR − ΔInventory + ΔAP
    //   CFI = − capex
    //   CFF = − loan principal − draws + contributions
    const netCashCents =
      row.net_income_cents
      + row.depreciation_cents
      - deltaAr
      - deltaInventory
      + deltaAp
      - loanRepaymentCents
      - row.capex_cents
      - ownerDrawsCents
      + ownerContributionsCents;
    cashBalance += netCashCents;

    // Balance sheet — capex lines add to fixed assets (gross)
    const cumulativeFixedAssetsGross =
      fixedAssetsGross + rows
        .filter((r) => r.month_index <= row.month_index)
        .reduce((s, r) => s + r.capex_cents, 0);
    const netFixedAssets = Math.max(0, cumulativeFixedAssetsGross - cumulativeDepreciation);
    const totalAssets = cashBalance + arCents + inventoryCents + netFixedAssets;
    const totalLiabilities = apCents + totalLoanBalance;
    // TIM-1181: pre-opening costs are an opening accumulated deficit, so retained
    // earnings starts negative by that amount and then accrues operating income.
    const retainedEarnings = cumulativeNetIncome - preOpeningExpensesCents;
    const totalEquity =
      ownerCapital + cumulativeOwnerContributions - cumulativeOwnerDraws + retainedEarnings;

    return {
      ...row,
      gross_revenue_cents: grossRevenueCents,
      total_cogs_cents: row.cogs_cents,
      beverage_cogs_cents: bevCogsCents,
      food_cogs_cents: foodCogsCents,
      retail_cogs_cents: retailCogsCents,
      other_opex_cents: row.other_misc_cents,
      ebitda_cents: ebitdaCents,
      ebit_cents: ebitCents,
      avg_ticket_cents: mp.avg_ticket_cents,
      net_cash_cents: netCashCents,
      loan_repayment_cents: loanRepaymentCents,
      loan_interest_cents: loanInterestCents,
      capex_cents: row.capex_cents,
      cash_cents: cashBalance,
      delta_ar_cents: deltaAr,
      delta_inventory_cents: deltaInventory,
      delta_ap_cents: deltaAp,
      owner_draws_cents: ownerDrawsCents,
      owner_contributions_cents: ownerContributionsCents,
      accounts_receivable_cents: arCents,
      inventory_cents: inventoryCents,
      fixed_assets_gross_cents: cumulativeFixedAssetsGross,
      accumulated_depreciation_cents: cumulativeDepreciation,
      net_fixed_assets_cents: netFixedAssets,
      other_assets_cents: 0,
      total_assets_cents: totalAssets,
      accounts_payable_cents: apCents,
      current_debt_cents: 0,
      long_term_debt_cents: totalLoanBalance,
      total_liabilities_cents: totalLiabilities,
      owner_equity_cents: ownerCapital + cumulativeOwnerContributions - cumulativeOwnerDraws,
      retained_earnings_cents: retainedEarnings,
      total_equity_cents: totalEquity,
      total_liabilities_and_equity_cents: totalLiabilities + totalEquity,
      founder_equity_cents: fundingHasEntries ? founderEquityCents : ownerCapital,
      investor_equity_cents: investorEquityCents,
      grants_cents: grantsCents,
    };
  });
}
