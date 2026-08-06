// TIM-3448: tell the owner's numbers apart from ours.
//
// The 5 August audit's deepest finding: thirty seconds after signup, before
// entering anything, an account showed 1,669 customers a week, $4,200 rent,
// seven staff, and "Financials — 7 of 7 steps done · 100%". Add one $5.50 flat
// white and the P&L projected $541,185 of cash at a 52.7% net margin.
//
// Every one of those pieces works exactly as built. The failure is that the
// product cannot tell its own suggestions from the owner's decisions, so it
// counts its guesses as their progress and reports its own template back to
// them as a finished business.
//
// The seeded values are not the problem and are not being deleted — they come
// from a real calibration (TIM-2519 / 2521 / 2522 / 2557) that sets rent,
// startup costs, funding and footfall from shop type and city, and a blank
// financial model is genuinely worse for a first-time owner. What was missing
// is the distinction. This module supplies it.
//
// HOW: at creation, fingerprint each step's seeded inputs and store them on the
// model. A step is the owner's when its inputs no longer match the fingerprint.
// Deriving rather than flag-keeping is deliberate — there are fifteen edit call
// sites funnelling through one update function that does not know which step
// changed, and a flag one of them forgot to clear would recreate this exact bug
// in a form that is harder to see.
//
// Plans created before this shipped have no fingerprints. They are treated as
// entirely owner-owned, which is the honest reading (we cannot know what they
// touched) and is non-destructive: no existing account loses a completion it
// already had.
//
// No runtime `@/` imports — must stay loadable from `node --test`.

/** The seven steps the Financials workspace counts. */
export const FINANCIAL_STEP_KEYS = [
  "daily_traffic",
  "revenue",
  "running_costs",
  "staffing",
  "startup",
  "funding",
  "growth",
] as const;

export type FinancialStepKey = (typeof FINANCIAL_STEP_KEYS)[number];

/** Where a step's current values came from. */
export type StepProvenance =
  /** The owner has changed something here. Counts toward completion. */
  | "owner"
  /** Still exactly as we seeded it. Shown, but not counted, and labelled. */
  | "seeded"
  /** No fingerprints recorded — a plan predating TIM-3448. Treated as owner's. */
  | "unknown";

export type SeedFingerprints = Partial<Record<FinancialStepKey, string>>;

/**
 * The shape this module needs off a MonthlyProjections. Deliberately structural
 * rather than importing the real type, so this file stays free of `@/` imports.
 */
export interface FingerprintableModel {
  daily_flow?: Record<string, number> | null;
  weekly_schedule?: Record<string, { open?: boolean; open_time?: string; close_time?: string }> | null;
  avg_ticket_cents?: number | null;
  cogs_pct?: number | null;
  forecast_lines?: Array<{ id?: string; category?: string; value?: number; mode?: string }> | null;
  personnel?: Array<{ id?: string; headcount?: number; pay_amount_cents?: number; hours_per_week?: number }> | null;
  // Structural, not `Record<string, number>`: the real StartupCosts is a named
  // interface with no index signature, and demanding one here would force a
  // cast at every call site — which is how the MonthlySlice mismatch in
  // TIM-3444 hid for as long as it did.
  startup_costs?: object | null;
  funding_sources?: Array<{ id?: string; amount_cents?: number; term_months?: number; annual_rate_pct?: number }> | null;
  income_tax_pct?: number | null;
  sales_tax_pct?: number | null;
  growth_monthly_pct?: number | null;
  growth_custom_monthly?: number[] | null;
  ramp_months?: number | null;
  ramp_multipliers?: number[] | null;
  seed_fingerprints?: SeedFingerprints | null;
}

/** Stable stringify: key order cannot change the fingerprint. */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The inputs each step actually asks the owner for.
 *
 * Only fields a human edits on that step belong here. Including a derived or
 * unrelated field would make an untouched step look touched the moment
 * something else changed, which is the failure this module exists to prevent —
 * in the opposite direction.
 */
function stepInputs(step: FinancialStepKey, mp: FingerprintableModel): unknown {
  switch (step) {
    case "daily_traffic":
      return {
        daily_flow: mp.daily_flow ?? null,
        weekly_schedule: mp.weekly_schedule ?? null,
      };
    case "revenue":
      return { avg_ticket_cents: mp.avg_ticket_cents ?? null, cogs_pct: mp.cogs_pct ?? null };
    case "running_costs":
      return (mp.forecast_lines ?? [])
        .filter((l) => l.category === "overhead" || l.category === "cogs")
        .map((l) => ({ id: l.id ?? null, mode: l.mode ?? null, value: l.value ?? null }));
    case "staffing":
      return (mp.personnel ?? []).map((p) => ({
        id: p.id ?? null,
        headcount: p.headcount ?? null,
        pay_amount_cents: p.pay_amount_cents ?? null,
        hours_per_week: p.hours_per_week ?? null,
      }));
    case "startup":
      return mp.startup_costs ?? null;
    case "funding":
      return (mp.funding_sources ?? []).map((f) => ({
        id: f.id ?? null,
        amount_cents: f.amount_cents ?? null,
        term_months: f.term_months ?? null,
        annual_rate_pct: f.annual_rate_pct ?? null,
      }));
    case "growth":
      return {
        income_tax_pct: mp.income_tax_pct ?? null,
        sales_tax_pct: mp.sales_tax_pct ?? null,
        growth_monthly_pct: mp.growth_monthly_pct ?? null,
        growth_custom_monthly: mp.growth_custom_monthly ?? null,
        ramp_months: mp.ramp_months ?? null,
        ramp_multipliers: mp.ramp_multipliers ?? null,
      };
  }
}

/** The fingerprint of one step's current inputs. */
export function stepFingerprint(step: FinancialStepKey, mp: FingerprintableModel): string {
  return canonical(stepInputs(step, mp));
}

/**
 * Stamp a freshly-seeded model. Call this at creation, AFTER calibration has
 * written its city- and shop-type-specific values — the fingerprint has to
 * record what the owner will actually be shown, not the pre-calibration
 * template, or every calibrated step would read as already edited.
 */
export function buildSeedFingerprints(mp: FingerprintableModel): SeedFingerprints {
  const out: SeedFingerprints = {};
  for (const step of FINANCIAL_STEP_KEYS) out[step] = stepFingerprint(step, mp);
  return out;
}

/** Where this step's values came from, right now. */
export function stepProvenance(step: FinancialStepKey, mp: FingerprintableModel): StepProvenance {
  const prints = mp.seed_fingerprints;
  if (!prints || typeof prints !== "object") return "unknown";
  const seeded = prints[step];
  if (typeof seeded !== "string") return "unknown";
  return stepFingerprint(step, mp) === seeded ? "seeded" : "owner";
}

/** True when this step's numbers are still ours, so it must not count as done. */
export function isUntouchedSeed(step: FinancialStepKey, mp: FingerprintableModel): boolean {
  return stepProvenance(step, mp) === "seeded";
}

/** Steps the owner has actually made decisions about. */
export function ownerTouchedSteps(mp: FingerprintableModel): FinancialStepKey[] {
  return FINANCIAL_STEP_KEYS.filter((s) => stepProvenance(s, mp) !== "seeded");
}

/**
 * The sentence a seeded step shows.
 *
 * Deliberately not an apology and not a warning. These are useful starting
 * numbers; the owner simply has not agreed to them yet, and the screen should
 * say which of those two things is true. Mirrors the honesty standard set by
 * `readOnlyReason()` in TIM-3442.
 */
export function seededStepNotice(cityLabel?: string | null): string {
  return cityLabel
    ? `Typical numbers for ${cityLabel} — they're a starting point, not your plan yet. Change anything here and this step counts as yours.`
    : "These are typical starting numbers, not your plan yet. Change anything here and this step counts as yours.";
}
