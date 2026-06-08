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
import { blendedTicketCentsFromMenu } from "../menu.ts";
import {
  MENU_TICKET_ABS_TOLERANCE_CENTS,
  MENU_TICKET_REL_TOLERANCE,
} from "../cross-suite/menu-ticket.ts";

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

// ── Metric bindings (TIM-2428) ──────────────────────────────────────────────
//
// Each AuditMetricKey is the contract between an audit check and the
// user-facing source page it cites. `read()` returns the value the check
// compares to a benchmark (or that the cross-suite finding will quote in its
// message); `source` is the workspace + field the user is sent to. The unit
// test `source-suite-checks.consistency.test.mjs` asserts these never drift.
//
// Rule (TIM-2428): if you cite a source page for a finding, the number you
// quote in raw_message MUST equal what that page renders. No exceptions. If
// you need to quote a different aggregate, cite a different page.
//
// The COGS bug: the benchmark check used to read state.cogs.blended_pct (the
// labor-INCLUDED total — for trent's fixture, ~69%) while citing "Forecast
// Inputs" (which renders the ingredient-only blended menu COGS — 31.5%). The
// benchmark "Specialty coffee blended COGS (28-32%)" is SCA's ingredient-only
// figure (labor lives in coffee_shop_labor_pct). Fix: read the ingredient-only
// blended COGS so the value, the benchmark, and the cited page are all the
// same metric.

export type AuditMetricKey =
  | "financials.cogs.ingredient_blended_pct"
  | "financials.labor.annualized_pct_of_revenue"
  | "financials.lease.annualized_rent_pct_of_revenue"
  | "financials.revenue.avg_ticket_usd"
  | "financials.revenue.ramp_months"
  | "financials.opening_cash_buffer.months"
  | "financials.lender_metrics.dscr_y1"
  | "financials.use_of_funds.buildout_per_sqft";

export interface MetricBinding {
  // The plan_state field path the value comes from. Keep this human-readable —
  // it's used in unit-test failure messages so you can find the field fast.
  field_path: string;
  // The cited source ref (workspace + field + label). What "Go to source"
  // navigates to. The field_label is rendered in the finding card.
  source: AuditSourceRef;
  // Compute the value from the live PlanState + side data. Pure function — no
  // I/O — so the consistency test can call it deterministically.
  read: (ctx: MetricReadContext) => number | null;
}

export interface MetricReadContext {
  state: PlanState;
}

const METRIC_BINDINGS: Record<AuditMetricKey, MetricBinding> = {
  "financials.cogs.ingredient_blended_pct": {
    field_path: "plan_state.cogs.menu_blended_pct (fallback: base_cogs_pct)",
    source: refWithField(REF_FINANCIALS, "cogs", "Forecast Inputs: blended menu COGS"),
    read: ({ state }) => {
      // TIM-2428 fix: the benchmark is ingredient-only ("Specialty coffee
      // blended COGS"); labor lives in coffee_shop_labor_pct. Read the
      // canonical ingredient-only value that the Forecast Inputs page renders.
      const menu = state.cogs.menu_blended_pct;
      if (menu != null && Number.isFinite(menu)) return menu;
      const base = state.cogs.base_cogs_pct;
      if (Number.isFinite(base)) return base;
      return null;
    },
  },
  "financials.labor.annualized_pct_of_revenue": {
    field_path: "plan_state.labor.monthly_loaded_cost_cents * 12 / years[0].revenue_cents",
    source: refWithField(REF_FINANCIALS, "labor", "Financials: total labor as % of revenue"),
    read: ({ state }) => {
      const y1Revenue = state.years[0]?.revenue_cents ?? 0;
      if (y1Revenue <= 0) return null;
      const annualLaborCents = state.labor.monthly_loaded_cost_cents * 12;
      return (annualLaborCents / y1Revenue) * 100;
    },
  },
  "financials.lease.annualized_rent_pct_of_revenue": {
    field_path: "plan_state.lease.monthly_rent_cents * 12 / years[0].revenue_cents",
    source: refWithField(REF_LEASE, "rent", "Lease: monthly rent (annualized vs revenue)"),
    read: ({ state }) => {
      const y1Revenue = state.years[0]?.revenue_cents ?? 0;
      if (y1Revenue <= 0) return null;
      const annualRentCents = state.lease.monthly_rent_cents * 12;
      return (annualRentCents / y1Revenue) * 100;
    },
  },
  "financials.revenue.avg_ticket_usd": {
    field_path: "plan_state.revenue.avg_ticket_cents / 100",
    source: refWithField(REF_FINANCIALS, "avg_ticket", "Forecast Inputs: average ticket"),
    read: ({ state }) => {
      const cents = state.revenue.avg_ticket_cents;
      return cents > 0 ? cents / 100 : null;
    },
  },
  "financials.revenue.ramp_months": {
    field_path: "plan_state.revenue.ramp_months",
    source: refWithField(REF_FINANCIALS, "ramp_months", "Forecast Inputs: ramp months"),
    read: ({ state }) => (state.revenue.ramp_months > 0 ? state.revenue.ramp_months : null),
  },
  "financials.opening_cash_buffer.months": {
    field_path: "use_of_funds.opening_cash_buffer / opex.monthly_total_cents",
    source: refWithField(REF_FINANCIALS, "opening_cash_buffer", "Use of Funds: opening cash buffer"),
    read: ({ state }) => {
      const line = state.use_of_funds.lines.find((l) => l.key === "opening_cash_buffer_cents");
      const cashBufferCents = line?.amount_cents ?? 0;
      const monthlyOpex = state.opex.monthly_total_cents;
      if (monthlyOpex <= 0) return null;
      return cashBufferCents / monthlyOpex;
    },
  },
  "financials.lender_metrics.dscr_y1": {
    field_path: "plan_state.lender_metrics.dscr.years[0].dscr_ratio (if has_term_debt)",
    source: refWithField(REF_FINANCIALS, "dscr", "Financials: DSCR (Year 1)"),
    read: ({ state }) => {
      const dscr = state.lender_metrics.dscr;
      if (!dscr?.has_term_debt) return null;
      const y1 = dscr.years?.[0]?.dscr_ratio;
      return typeof y1 === "number" && Number.isFinite(y1) ? y1 : null;
    },
  },
  "financials.use_of_funds.buildout_per_sqft": {
    field_path: "use_of_funds.buildout_cents / lease.sq_ft",
    source: refWithField(REF_FINANCIALS, "buildout", "Use of Funds: build-out budget"),
    read: ({ state }) => {
      const line = state.use_of_funds.lines.find((l) => l.key === "buildout_cents");
      const buildoutCents = line?.amount_cents ?? 0;
      const sqFt = state.lease.sq_ft ?? null;
      if (!sqFt || sqFt <= 0 || buildoutCents <= 0) return null;
      return (buildoutCents / 100) / sqFt;
    },
  },
};

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
  // TIM-2488: was `cost_usd` — column renamed to be currency-neutral.
  cost_local: number | null;
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
  const equipTotalCents = input.equipment.reduce((acc, e) => acc + Math.round(Number(e.cost_local ?? 0) * 100), 0);
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

  // Check 3b (TIM-2482 / F13) — Menu blended ticket vs Forecast Inputs avg
  // ticket. Distinct from Check 3 (which only flags structural errors where
  // avg ticket is outside the menu's price range). This catches the common
  // silent-drift case: owner builds an $8.20-blended menu but never opens
  // Forecast Inputs, so the $7.50 default keeps driving every projection.
  // Tolerance is exported from menu-ticket.ts so the workspace banner, the
  // detector, and this check all agree on what counts as drift.
  if (ticket > 0 && input.menu.length > 0) {
    // The menu rows here type as SourceSuiteMenuRow — fields match what
    // blendedTicketCentsFromMenu() needs (id, price_cents, expected_popularity,
    // archived). Pass directly.
    const menuBlend = blendedTicketCentsFromMenu(
      input.menu.map((m) => ({
        id: m.id,
        price_cents: m.price_cents ?? 0,
        expected_popularity: m.expected_popularity ?? null,
        archived: m.archived ?? false,
      })),
    );
    if (menuBlend !== null && menuBlend > 0) {
      const delta = Math.abs(menuBlend - ticket);
      const rel = delta / Math.max(ticket, 1);
      const meaningful =
        delta >= MENU_TICKET_ABS_TOLERANCE_CENTS && rel >= MENU_TICKET_REL_TOLERANCE;
      if (meaningful) {
        const menuHigher = menuBlend > ticket;
        out.push(
          emit({
            id: "src:menu_ticket_blend_mismatch",
            rule_id: "cross_suite_mismatch",
            severity: "warning",
            raw_message: menuHigher
              ? `Menu prices blend to ${fmtCents(menuBlend, cc)} (popularity-weighted), but Forecast Inputs is running on ${fmtCents(ticket, cc)} per ticket. Every revenue projection is using the lower number until the two agree.`
              : `Forecast Inputs is running on ${fmtCents(ticket, cc)} per ticket, but the menu only blends to ${fmtCents(menuBlend, cc)} (popularity-weighted). The revenue forecast overshoots what the menu can support.`,
            quoted_text: `Menu blend ${fmtCents(menuBlend, cc)} vs Forecast ${fmtCents(ticket, cc)}`,
            units: "currency",
            expected_text: fmtCents(menuBlend, cc),
            source: refWithField(REF_MENU, "prices", "Menu blended ticket"),
            target: refWithField(REF_FINANCIALS, "avg_ticket", "Financials: average ticket"),
          }),
        );
      }
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
  // TIM-2428: typed reference to the metric being checked. Must match the
  // identifier in METRIC_BINDINGS below, which fixes (a) where the value comes
  // from in plan_state and (b) what cited source page renders that same value.
  // The unit test pins (metric value) === (cited-source rendered value) so an
  // audit can never quote a number that contradicts the page it points at.
  metric: AuditMetricKey;
  // Computed value the benchmark is checked against (already in the unit the
  // benchmark expects: percent, USD, count, ratio).
  value: number | null;
  // Renderer for the actual value into a string for the message.
  format: (v: number) => string;
  // The source workspace this value lives in. Derived from METRIC_BINDINGS so
  // the cited source always matches the metric — do not override per check.
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

// TIM-2428: bench key → metric binding. Value + cited source are derived
// together so a check can never quote a number that contradicts its source.
// The benchmark JSON entry decides whether the value is OUT of range; this map
// decides WHAT value is being checked and WHERE the user is sent to fix it.
interface BenchmarkSpec {
  benchKey: string;
  metric: AuditMetricKey;
  format: (v: number) => string;
  criticalFactor?: number;
  usdOnly?: boolean;
}

const BENCHMARK_SPECS: BenchmarkSpec[] = [
  {
    benchKey: "coffee_shop_blended_cogs_pct",
    metric: "financials.cogs.ingredient_blended_pct",
    format: (v) => pctRoundOne(v),
  },
  {
    benchKey: "coffee_shop_labor_pct",
    metric: "financials.labor.annualized_pct_of_revenue",
    format: (v) => pctRoundOne(v),
    criticalFactor: 1.5,
  },
  {
    benchKey: "coffee_shop_rent_pct",
    metric: "financials.lease.annualized_rent_pct_of_revenue",
    format: (v) => pctRoundOne(v),
    criticalFactor: 1.2,
  },
  {
    benchKey: "coffee_shop_avg_ticket_usd",
    metric: "financials.revenue.avg_ticket_usd",
    format: (v) => `$${v.toFixed(2)}`,
    usdOnly: true,
  },
  {
    benchKey: "coffee_shop_ramp_months",
    metric: "financials.revenue.ramp_months",
    format: (v) => `${v} months`,
  },
  {
    benchKey: "coffee_shop_opening_cash_buffer_months",
    metric: "financials.opening_cash_buffer.months",
    format: (v) => `${v.toFixed(1)} months`,
    criticalFactor: 1.5,
  },
  {
    benchKey: "coffee_shop_dscr_threshold",
    metric: "financials.lender_metrics.dscr_y1",
    format: (v) => `${v.toFixed(2)}x`,
    criticalFactor: 1.2,
  },
  {
    benchKey: "coffee_shop_buildout_cost_per_sqft",
    metric: "financials.use_of_funds.buildout_per_sqft",
    format: (v) => `$${Math.round(v).toLocaleString("en-US")}/sqft`,
    usdOnly: true,
  },
];

export function runBenchmarkChecks(input: SourceSuiteCheckInputs): AuditFinding[] {
  const ds = loadBenchmarks();
  const byKey = new Map<string, IndustryBenchmark>(ds.benchmarks.map((b) => [b.key, b]));
  const out: AuditFinding[] = [];
  const state = input.planState;
  const ctx: MetricReadContext = { state };

  for (const spec of BENCHMARK_SPECS) {
    const b = byKey.get(spec.benchKey);
    if (!b) continue;
    const binding = METRIC_BINDINGS[spec.metric];
    const cfg: BenchmarkCheckConfig = {
      key: spec.benchKey,
      metric: spec.metric,
      value: binding.read(ctx),
      format: spec.format,
      source: binding.source,
      criticalFactor: spec.criticalFactor,
      usdOnly: spec.usdOnly,
    };
    const f = buildBenchmarkFinding(cfg, b, state);
    if (f) out.push(f);
  }

  return out;
}

// ── Top-level run ────────────────────────────────────────────────────────────

export function runSourceSuiteAudit(input: SourceSuiteCheckInputs): AuditFinding[] {
  return [...runCrossSuiteChecks(input), ...runBenchmarkChecks(input)];
}
