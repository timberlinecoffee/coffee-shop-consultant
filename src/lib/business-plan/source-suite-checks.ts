// TIM-2394 Plan Quality Check v2 — source-suite-only audit engine.
//
// Mental model (board, 2026-06-06): the Business Plan suite is a NARRATIVE
// OUTPUT of the source suites (Financials, Marketing, Operations, Equipment,
// Menu, Hiring/Org, etc.). Auditing the BP against the source it was generated
// from is unhelpful. v2 audits the source suites against EACH OTHER and against
// industry benchmarks — never reads BP fields. After fixes land, BP regen runs
// from clean source.
//
// Two rule families live here:
//
//   1. Cross-source-suite consistency
//      - Hiring headcount (Hiring suite) ↔ payroll headcount (Financials)
//      - Equipment list total (Equipment suite) ↔ capex equipment line (Financials)
//      - Menu price range (Menu suite) ↔ avg ticket assumption (Financials)
//      - Hiring role start dates (Hiring) ↔ opening milestone date (Launch)
//
//   2. Best-practice / benchmark checks against `benchmarks.json`
//      - COGS % of revenue, Labor %, Rent %, ramp months, opening cash buffer,
//        DSCR Y1, average ticket (USD-only), build-out $/sqft
//
// Relative imports (no @/ aliases) so node:test can load this module without
// the Next.js path-alias resolver — matches plan-state.ts / validate.ts.
//
// Per Rule 3 each emitted string is sanitized at the audit module boundary by
// the route's downstream stripFindingTags pass.

import type { PlanState } from "./plan-state.ts";
import type { AuditFinding, AuditSeverity, AuditSourceRef, AuditRuleId } from "./audit.ts";
import { loadBenchmarks, type IndustryBenchmark } from "./benchmarks.ts";

// ── Source workspace refs ────────────────────────────────────────────────────

// Each source-suite check points the user at a specific workspace. We use the
// same `workspace` slug surface the audit's "Go to source" deep-link reads, so
// the existing FindingCard wiring works without changes.

const REF_FINANCIALS: AuditSourceRef = {
  workspace: "financials",
  workspace_label: "Financials",
  field: null,
  field_label: null,
};

const REF_HIRING: AuditSourceRef = {
  workspace: "hiring",
  workspace_label: "Hiring",
  field: null,
  field_label: null,
};

const REF_EQUIPMENT: AuditSourceRef = {
  workspace: "buildout-equipment",
  workspace_label: "Equipment",
  field: null,
  field_label: null,
};

const REF_MENU: AuditSourceRef = {
  workspace: "menu-pricing",
  workspace_label: "Menu",
  field: null,
  field_label: null,
};

const REF_LAUNCH: AuditSourceRef = {
  workspace: "launch-plan",
  workspace_label: "Launch Plan",
  field: null,
  field_label: null,
};

const REF_LEASE: AuditSourceRef = {
  workspace: "location-lease",
  workspace_label: "Location & Lease",
  field: null,
  field_label: null,
};

function refWithField(ref: AuditSourceRef, field: string, label: string): AuditSourceRef {
  return { ...ref, field, field_label: label };
}

// ── Source data shape ───────────────────────────────────────────────────────

export interface SourceSuiteHiringRow {
  id: string;
  role_title: string | null;
  headcount: number | null;
  start_date: string | null;
}

export interface SourceSuiteEquipmentRow {
  id: string;
  name: string | null;
  cost_usd: number | null;
}

export interface SourceSuiteMenuRow {
  id: string;
  name: string | null;
  price_cents: number | null;
  expected_mix_pct?: number | null;
  expected_popularity?: "low" | "medium" | "high" | null;
  archived?: boolean | null;
}

export interface SourceSuiteLaunchRow {
  id: string;
  milestone: string | null;
  target_date: string | null;
  status: string | null;
}

export interface SourceSuiteCheckInputs {
  planState: PlanState;
  hiring: SourceSuiteHiringRow[];
  equipment: SourceSuiteEquipmentRow[];
  menu: SourceSuiteMenuRow[];
  launch: SourceSuiteLaunchRow[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function currency(state: PlanState): string {
  return state.meta.currency_code || "USD";
}

function fmtCents(cents: number, cc: string): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const hasDec = Math.abs(dollars - Math.round(dollars)) > 0.005;
  const formatted = hasDec
    ? abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(abs).toLocaleString("en-US");
  const sign = dollars < 0 ? "-" : "";
  return `${sign}${cc} ${formatted}`;
}

function pctRoundOne(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
}

function emit(args: {
  id: string;
  rule_id: AuditRuleId;
  severity: AuditSeverity;
  raw_message: string;
  quoted_text?: string | null;
  units: AuditFinding["units"];
  expected_text?: string | null;
  source: AuditSourceRef;
  target: AuditSourceRef;
}): AuditFinding {
  return {
    id: args.id,
    rule_id: args.rule_id,
    severity: args.severity,
    raw_message: args.raw_message,
    quoted_text: args.quoted_text ?? null,
    units: args.units,
    expected_text: args.expected_text ?? null,
    suggested_replacement: null,
    source: args.source,
    target: args.target,
    issue: null,
    why_it_matters: null,
    suggested_fix: null,
  };
}

// ── 1. Cross-source-suite consistency ───────────────────────────────────────

function sumHeadcount(rows: SourceSuiteHiringRow[]): number {
  let total = 0;
  for (const r of rows) {
    const hc = Number(r.headcount ?? 0);
    if (Number.isFinite(hc) && hc > 0) total += hc;
  }
  return total;
}

function activeMenu(rows: SourceSuiteMenuRow[]): SourceSuiteMenuRow[] {
  return rows.filter((r) => !r.archived && typeof r.price_cents === "number" && (r.price_cents ?? 0) > 0);
}

function menuPriceRangeCents(rows: SourceSuiteMenuRow[]): { min: number; max: number } | null {
  const active = activeMenu(rows);
  if (active.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const r of active) {
    const p = Number(r.price_cents ?? 0);
    if (p < min) min = p;
    if (p > max) max = p;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

// Parse a YYYY-MM-DD (or anything Date() understands) — returns null on failure.
function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Find the earliest dated milestone whose title reads like an opening event
// ("open", "soft open", "grand opening", "launch", "doors open"). Falls back
// to the earliest milestone whose status === "completed".
function inferOpeningDate(rows: SourceSuiteLaunchRow[]): { date: Date; milestone: string } | null {
  const candidates: Array<{ date: Date; milestone: string; priority: number }> = [];
  for (const r of rows) {
    const dt = parseDate(r.target_date);
    if (!dt) continue;
    const m = (r.milestone ?? "").toLowerCase();
    let priority = 0;
    if (/grand\s*open/.test(m)) priority = 4;
    else if (/soft\s*open|doors\s*open|first\s*day|day\s*one|opening\s*day/.test(m)) priority = 3;
    else if (/\bopen\b|\blaunch\b/.test(m)) priority = 2;
    else if ((r.status ?? "").toLowerCase() === "completed") priority = 1;
    if (priority > 0) {
      candidates.push({ date: dt, milestone: r.milestone ?? "", priority });
    }
  }
  if (candidates.length === 0) return null;
  // Prefer highest priority; tie-break on earliest date.
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.date.getTime() - b.date.getTime();
  });
  return { date: candidates[0].date, milestone: candidates[0].milestone };
}

export function runCrossSuiteChecks(input: SourceSuiteCheckInputs): AuditFinding[] {
  const out: AuditFinding[] = [];
  const cc = currency(input.planState);

  // Check 1 — Headcount alignment. Hiring suite total vs Financials payroll roster.
  // The Financials "personnel" roster is the source of truth for the P&L line; if
  // Hiring claims a different size, lenders see a contradiction the moment they
  // open both tabs.
  const hiringHeadcount = sumHeadcount(input.hiring);
  const financialsHeadcount = input.planState.labor.total_headcount;
  if (hiringHeadcount > 0 && financialsHeadcount > 0 && hiringHeadcount !== financialsHeadcount) {
    out.push(
      emit({
        id: "src:headcount_mismatch",
        rule_id: "cross_suite_mismatch",
        severity: "critical",
        raw_message: `Hiring shows ${hiringHeadcount} total ${hiringHeadcount === 1 ? "role" : "roles"} but Financials runs payroll for ${financialsHeadcount}. The two need to agree before the plan reads as one business.`,
        quoted_text: `Hiring ${hiringHeadcount} vs Financials ${financialsHeadcount}`,
        units: "count",
        expected_text: `${financialsHeadcount}`,
        source: refWithField(REF_HIRING, "headcount", "Hiring roster"),
        target: refWithField(REF_FINANCIALS, "personnel", "Financials payroll"),
      }),
    );
  }

  // Check 2 — Equipment total vs CapEx equipment line. Lenders trace every
  // dollar in CapEx back to a real piece of equipment; if the totals diverge by
  // more than $100 / 1 percent, that trace breaks.
  const equipTotalCents = input.equipment.reduce((acc, e) => acc + Math.round(Number(e.cost_usd ?? 0) * 100), 0);
  const capexEquipLine = input.planState.use_of_funds.lines.find((l) => l.key === "equipment_cents");
  const capexEquipCents = capexEquipLine?.amount_cents ?? 0;
  if (equipTotalCents > 0 && capexEquipCents > 0) {
    const diff = Math.abs(equipTotalCents - capexEquipCents);
    const tolerance = Math.max(10_000, Math.round(capexEquipCents * 0.01)); // $100 OR 1%
    if (diff > tolerance) {
      out.push(
        emit({
          id: "src:capex_equipment_mismatch",
          rule_id: "cross_suite_mismatch",
          severity: "critical",
          raw_message: `Equipment workspace items total ${fmtCents(equipTotalCents, cc)} but Financials capex shows ${fmtCents(capexEquipCents, cc)} for equipment. Lenders trace every CapEx dollar back to the equipment list — the two need to match.`,
          quoted_text: `Equipment ${fmtCents(equipTotalCents, cc)} vs CapEx ${fmtCents(capexEquipCents, cc)}`,
          units: "currency",
          expected_text: fmtCents(capexEquipCents, cc),
          source: refWithField(REF_EQUIPMENT, "items", "Equipment list"),
          target: refWithField(REF_FINANCIALS, "use_of_funds", "Use of funds: Equipment"),
        }),
      );
    }
  }

  // Check 3 — Menu price range vs avg ticket. The average customer order is
  // almost always 1-2 items, so avg ticket should sit between min menu price
  // and ~3x max menu price. Anything outside that range is a structural error
  // (e.g. avg ticket lower than the cheapest drink → the model is wrong).
  const range = menuPriceRangeCents(input.menu);
  const ticket = input.planState.revenue.avg_ticket_cents;
  if (range && ticket > 0) {
    if (ticket < range.min) {
      out.push(
        emit({
          id: "src:menu_ticket_below_min",
          rule_id: "cross_suite_mismatch",
          severity: "critical",
          raw_message: `Financials avg ticket of ${fmtCents(ticket, cc)} is below the cheapest menu item (${fmtCents(range.min, cc)}). A customer cannot spend less than the lowest priced thing on the menu.`,
          quoted_text: `Avg ticket ${fmtCents(ticket, cc)} vs menu min ${fmtCents(range.min, cc)}`,
          units: "currency",
          expected_text: `at least ${fmtCents(range.min, cc)}`,
          source: refWithField(REF_FINANCIALS, "avg_ticket", "Financials: average ticket"),
          target: refWithField(REF_MENU, "prices", "Menu prices"),
        }),
      );
    } else if (ticket > range.max * 3) {
      out.push(
        emit({
          id: "src:menu_ticket_above_basket",
          rule_id: "cross_suite_mismatch",
          severity: "warning",
          raw_message: `Financials avg ticket of ${fmtCents(ticket, cc)} is more than 3 times the highest priced menu item (${fmtCents(range.max, cc)}). Confirm the menu reflects a real customer's basket.`,
          quoted_text: `Avg ticket ${fmtCents(ticket, cc)} vs menu max ${fmtCents(range.max, cc)}`,
          units: "currency",
          expected_text: `within reasonable basket multiple of ${fmtCents(range.max, cc)}`,
          source: refWithField(REF_FINANCIALS, "avg_ticket", "Financials: average ticket"),
          target: refWithField(REF_MENU, "prices", "Menu prices"),
        }),
      );
    }
  }

  // Check 4 — Hiring start dates vs opening milestone. Any role with a
  // start_date AFTER the opening date is in the payroll line at month 1 but
  // not on payroll until after opening — a direct contradiction.
  const opening = inferOpeningDate(input.launch);
  if (opening) {
    const late: Array<{ role: string; start: string }> = [];
    for (const r of input.hiring) {
      const sd = parseDate(r.start_date);
      if (!sd) continue;
      if (sd.getTime() > opening.date.getTime()) {
        late.push({
          role: r.role_title ?? "an unnamed role",
          start: r.start_date ?? "",
        });
      }
    }
    if (late.length > 0) {
      const sample = late.slice(0, 3).map((l) => `${l.role} (${l.start})`).join(", ");
      const more = late.length > 3 ? ` +${late.length - 3} more` : "";
      out.push(
        emit({
          id: "src:hiring_after_opening",
          rule_id: "cross_suite_mismatch",
          severity: "warning",
          raw_message: `${late.length} hiring role${late.length === 1 ? " has" : "s have"} a start date after the opening milestone (${opening.date.toISOString().slice(0, 10)}). Either delay them in Financials or move the start date earlier.`,
          quoted_text: `${sample}${more}`,
          units: "text",
          expected_text: `start ≤ ${opening.date.toISOString().slice(0, 10)}`,
          source: refWithField(REF_HIRING, "start_date", "Hiring start dates"),
          target: refWithField(REF_LAUNCH, "opening", "Launch Plan opening milestone"),
        }),
      );
    }
  }

  return out;
}

// ── 2. Best-practice / benchmark checks ─────────────────────────────────────
//
// Parse a benchmark `value_range` string of the form "28% to 32%", "$6 to $9",
// "6 to 12", "1.20x to 1.25x" into low/high numbers. Unit handling is
// intentionally lenient — we trust the caller to know what the benchmark's
// unit is.

interface BenchmarkRange {
  low: number;
  high: number;
}

function parseRange(s: string): BenchmarkRange | null {
  if (!s) return null;
  // Strip the per-value unit suffix/prefix characters ("%", "$", "x", "×") so
  // the same regex handles "28% to 32%", "$6 to $9", and "1.20x to 1.25x".
  const cleaned = s.replace(/[%$×]/g, "").replace(/(\d)x/gi, "$1");
  const m = cleaned.match(/([-+]?\d+(?:\.\d+)?)\s*(?:to|-|–|—)\s*([-+]?\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const low = Number(m[1]);
  const high = Number(m[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

// Severity for a value outside a range: small overshoot → info, medium →
// warning, hard miss → critical. Tuned per benchmark via `criticalFactor`.
function severityForDeviation(value: number, range: BenchmarkRange, criticalFactor = 1.5): AuditSeverity {
  if (value >= range.low && value <= range.high) return "info";
  const span = range.high - range.low || range.high;
  const distance = value < range.low ? range.low - value : value - range.high;
  const ratio = distance / Math.max(span, 1e-9);
  if (ratio >= criticalFactor) return "critical";
  if (ratio >= 0.5) return "warning";
  return "info";
}

interface BenchmarkCheckConfig {
  key: string;
  // Computed value the benchmark is checked against (already in the unit the
  // benchmark expects: percent, USD, count, ratio).
  value: number | null;
  // Renderer for the actual value into a string for the message.
  format: (v: number) => string;
  // The source workspace this value lives in.
  source: AuditSourceRef;
  // Severity scaling — some benchmarks are stricter than others.
  criticalFactor?: number;
  // When true, evaluation skips if the user's currency is not USD (the
  // benchmark is denominated in USD and not comparable).
  usdOnly?: boolean;
}

function buildBenchmarkFinding(
  cfg: BenchmarkCheckConfig,
  b: IndustryBenchmark,
  state: PlanState,
): AuditFinding | null {
  if (cfg.value === null || !Number.isFinite(cfg.value)) return null;
  if (cfg.usdOnly && currency(state) !== "USD") return null;
  const range = parseRange(b.value_range);
  if (!range) return null;
  if (cfg.value >= range.low && cfg.value <= range.high) return null;
  const severity = severityForDeviation(cfg.value, range, cfg.criticalFactor);
  const direction = cfg.value < range.low ? "below" : "above";
  return emit({
    id: `bench:${cfg.key}`,
    rule_id: "benchmark_out_of_range",
    severity,
    raw_message: `${b.label} comes out to ${cfg.format(cfg.value)}, ${direction} the typical ${b.value_range} ${b.unit} range. ${b.note}`,
    quoted_text: `${cfg.format(cfg.value)} vs ${b.value_range} ${b.unit}`,
    units: b.unit.includes("percent")
      ? "percent"
      : b.unit.includes("dollar") || b.unit.includes("US")
        ? "currency"
        : "count",
    expected_text: `${b.value_range} ${b.unit}`,
    source: cfg.source,
    target: cfg.source,
  });
}

export function runBenchmarkChecks(input: SourceSuiteCheckInputs): AuditFinding[] {
  const ds = loadBenchmarks();
  const byKey = new Map<string, IndustryBenchmark>(ds.benchmarks.map((b) => [b.key, b]));
  const out: AuditFinding[] = [];
  const state = input.planState;

  const y1Revenue = state.years[0]?.revenue_cents ?? 0;
  const annualLaborCents = state.labor.monthly_loaded_cost_cents * 12;
  const annualRentCents = state.lease.monthly_rent_cents * 12;
  const laborPct = y1Revenue > 0 ? (annualLaborCents / y1Revenue) * 100 : null;
  const rentPct = y1Revenue > 0 ? (annualRentCents / y1Revenue) * 100 : null;

  // Opening cash buffer months: opening_cash_buffer dollars / monthly opex.
  const cashLine = state.use_of_funds.lines.find((l) => l.key === "opening_cash_buffer_cents");
  const cashBufferCents = cashLine?.amount_cents ?? 0;
  const cashBufferMonths = state.opex.monthly_total_cents > 0
    ? cashBufferCents / state.opex.monthly_total_cents
    : null;

  // Build-out $/sqft: buildout cents / sq_ft.
  const buildoutLine = state.use_of_funds.lines.find((l) => l.key === "buildout_cents");
  const buildoutCents = buildoutLine?.amount_cents ?? 0;
  const sqFt = state.lease.sq_ft ?? null;
  const buildoutPerSqft = sqFt && sqFt > 0 ? (buildoutCents / 100) / sqFt : null;

  // DSCR Y1: lender_metrics.dscr.years[0].
  const dscrYears = state.lender_metrics.dscr?.years ?? [];
  const dscrY1 = state.lender_metrics.dscr?.has_term_debt ? (dscrYears[0]?.dscr_ratio ?? null) : null;

  const checks: BenchmarkCheckConfig[] = [
    {
      key: "coffee_shop_blended_cogs_pct",
      value: state.cogs.blended_pct,
      format: (v) => pctRoundOne(v),
      source: refWithField(REF_FINANCIALS, "cogs", "Financials: COGS rate"),
    },
    {
      key: "coffee_shop_labor_pct",
      value: laborPct,
      format: (v) => pctRoundOne(v),
      source: refWithField(REF_FINANCIALS, "labor", "Financials: labor as % of revenue"),
      criticalFactor: 1.5,
    },
    {
      key: "coffee_shop_rent_pct",
      value: rentPct,
      format: (v) => pctRoundOne(v),
      source: refWithField(REF_LEASE, "rent", "Lease: monthly rent"),
      criticalFactor: 1.2,
    },
    {
      key: "coffee_shop_avg_ticket_usd",
      value: state.revenue.avg_ticket_cents > 0 ? state.revenue.avg_ticket_cents / 100 : null,
      format: (v) => `$${v.toFixed(2)}`,
      source: refWithField(REF_FINANCIALS, "avg_ticket", "Financials: average ticket"),
      usdOnly: true,
    },
    {
      key: "coffee_shop_ramp_months",
      value: state.revenue.ramp_months > 0 ? state.revenue.ramp_months : null,
      format: (v) => `${v} months`,
      source: refWithField(REF_FINANCIALS, "ramp_months", "Financials: ramp months"),
    },
    {
      key: "coffee_shop_opening_cash_buffer_months",
      value: cashBufferMonths,
      format: (v) => `${v.toFixed(1)} months`,
      source: refWithField(REF_FINANCIALS, "opening_cash_buffer", "Financials: opening cash buffer"),
      criticalFactor: 1.5,
    },
    {
      key: "coffee_shop_dscr_threshold",
      value: dscrY1,
      format: (v) => `${v.toFixed(2)}x`,
      source: refWithField(REF_FINANCIALS, "dscr", "Financials: DSCR"),
      criticalFactor: 1.2,
    },
    {
      key: "coffee_shop_buildout_cost_per_sqft",
      value: buildoutPerSqft,
      format: (v) => `$${Math.round(v).toLocaleString("en-US")}/sqft`,
      source: refWithField(REF_FINANCIALS, "buildout", "Financials: build-out budget"),
      usdOnly: true,
    },
  ];

  for (const cfg of checks) {
    const b = byKey.get(cfg.key);
    if (!b) continue;
    const f = buildBenchmarkFinding(cfg, b, state);
    if (f) out.push(f);
  }

  return out;
}

// ── Top-level run ────────────────────────────────────────────────────────────

export function runSourceSuiteAudit(input: SourceSuiteCheckInputs): AuditFinding[] {
  return [...runCrossSuiteChecks(input), ...runBenchmarkChecks(input)];
}
