// TIM-4102 (T1-C): why a headline number could not be calculated, and what to
// tell the owner to do about it.
//
// The bug this replaces: financial-snapshot.ts computed break-even, and when
// computeBreakEvenModel returned null it fell back to `breakEvenRevenueCents: 0`.
// Home renders 0 as an em dash. So the REASON was computed and then thrown
// away, and the owner was shown a dash with no cause — which reads as "the
// software is broken" rather than "you haven't entered your fixed costs yet".
//
// Every deriver here is pure and takes already-computed values, so this module
// has no runtime imports at all (the BreakEvenModel import is type-only and is
// erased). That keeps it loadable by `node --experimental-strip-types` under
// `npm test`, which cannot resolve the "@/" alias.
//
// House rule this encodes: a metric is either a number or a sentence naming
// the action that would produce the number. Never a bare absence.

import type { BreakEvenModel } from "@/lib/financial-projection";

// ── Break-even ───────────────────────────────────────────────────────────────

export type BreakEvenBlockedReason =
  // No sales modelled yet, so there is nothing to break even against.
  | "no_revenue"
  // Average ticket is zero, so "customers needed" has no denominator.
  | "no_avg_ticket"
  // Break-even solved to zero because no fixed monthly costs are entered.
  // This is a real answer, but a useless one, and rendering it as 0 (and then
  // as a dash) hid the fact that an input was missing.
  | "no_fixed_costs"
  // Variable costs consume every dollar of sales, so no volume ever covers
  // fixed costs. Break-even is genuinely infinite — a real, important finding.
  | "no_contribution_margin"
  // Our fault, not the owner's.
  | "compute_failed";

export interface BreakEvenStatusInput {
  // Result of computeBreakEvenModel(), or null when it declined to compute.
  model: BreakEvenModel | null;
  // The ticket price handed to the model, in cents.
  avgTicketCents: number;
  // Month-1 net revenue, in cents. computeBreakEvenModel returns null when
  // this is <= 0, so we need it to tell "no sales yet" apart from "no ticket".
  netRevenueCents: number;
  // Set when the surrounding computation threw.
  computeThrew?: boolean;
}

export type MetricStatus<TReason> =
  | { ok: true }
  | { ok: false; reason: TReason };

export function deriveBreakEvenStatus(
  input: BreakEvenStatusInput
): MetricStatus<BreakEvenBlockedReason> {
  if (input.computeThrew) return { ok: false, reason: "compute_failed" };

  if (!input.model) {
    // Mirror computeBreakEvenModel's own guards, most-specific first, so the
    // message names the input the owner actually needs to fill in.
    if (input.netRevenueCents <= 0) return { ok: false, reason: "no_revenue" };
    if (input.avgTicketCents <= 0) return { ok: false, reason: "no_avg_ticket" };
    return { ok: false, reason: "compute_failed" };
  }

  const { contributionMarginPct, fixedCostsCents, breakEvenRevenueCents } =
    input.model;

  if (contributionMarginPct <= 0) {
    return { ok: false, reason: "no_contribution_margin" };
  }
  if (fixedCostsCents <= 0) {
    return { ok: false, reason: "no_fixed_costs" };
  }
  if (!Number.isFinite(breakEvenRevenueCents) || breakEvenRevenueCents <= 0) {
    return { ok: false, reason: "compute_failed" };
  }
  return { ok: true };
}

// Voice: name the action, in the owner's words, not the field's name. These
// are read by someone who has never opened a coffee shop and does not know
// what "contribution margin" means.
export const BREAK_EVEN_BLOCKED_COPY: Record<BreakEvenBlockedReason, string> = {
  no_revenue: "Add how many customers you expect each day to see this.",
  no_avg_ticket: "Add what an average customer spends to see this.",
  no_fixed_costs: "Add your fixed monthly costs, like rent, to see this.",
  no_contribution_margin:
    "Your costs use up every dollar of sales, so there is no break-even point yet. Lower your cost of goods or raise your prices.",
  compute_failed: "We couldn't calculate this. Try re-saving your Financials.",
};

// Shown inside the Financials workspace, where the owner is already standing
// in front of the inputs. Slightly more direct than the Home wording.
export const BREAK_EVEN_BLOCKED_WORKSPACE_COPY: Record<
  BreakEvenBlockedReason,
  string
> = {
  no_revenue: "your daily customer counts are still empty",
  no_avg_ticket: "your average ticket is still zero",
  no_fixed_costs: "no fixed monthly costs have been entered",
  no_contribution_margin:
    "your cost of goods uses up every dollar of sales, so no amount of volume covers your fixed costs",
  compute_failed: "we hit an error working it out",
};

// ── Runway ───────────────────────────────────────────────────────────────────

export type RunwayBlockedReason =
  | "no_funding"
  | "no_monthly_costs"
  | "compute_failed";

export function deriveRunwayStatus(input: {
  totalFundingCents: number;
  monthlyBurnCents: number;
  computeThrew?: boolean;
}): MetricStatus<RunwayBlockedReason> {
  if (input.computeThrew) return { ok: false, reason: "compute_failed" };
  if (input.monthlyBurnCents <= 0) {
    return { ok: false, reason: "no_monthly_costs" };
  }
  if (input.totalFundingCents <= 0) return { ok: false, reason: "no_funding" };
  return { ok: true };
}

export const RUNWAY_BLOCKED_COPY: Record<RunwayBlockedReason, string> = {
  no_funding: "Add the money you're putting in to see this.",
  no_monthly_costs: "Add your monthly running costs to see this.",
  compute_failed: "We couldn't calculate this. Try re-saving your Financials.",
};

// ── Monthly revenue ──────────────────────────────────────────────────────────

// Revenue never rendered a dash — it rendered a confident "$0", which is the
// same failure wearing a better suit. Zero projected sales is not a
// measurement, it is a missing input.
export type RevenueBlockedReason = "no_revenue" | "compute_failed";

export function deriveRevenueStatus(input: {
  monthlyRevenueCents: number;
  computeThrew?: boolean;
}): MetricStatus<RevenueBlockedReason> {
  if (input.computeThrew) return { ok: false, reason: "compute_failed" };
  if (input.monthlyRevenueCents <= 0) return { ok: false, reason: "no_revenue" };
  return { ok: true };
}

export const REVENUE_BLOCKED_COPY: Record<RevenueBlockedReason, string> = {
  no_revenue: "Add how many customers you expect each day to see this.",
  compute_failed: "We couldn't calculate this. Try re-saving your Financials.",
};

// ── Revenue ramp (TIM-4103 / T1-B) ───────────────────────────────────────────
//
// Home showed month 1 of the ramp. Financials showed mature daily sales. On a
// typical plan those are roughly three times apart, and NEITHER SCREEN SAID SO
// — both numbers were correct, and together they read as a bug.
//
// This is not a maths problem, it is a labelling one. Showing both figures
// side by side, named, turns the product's most confusing contradiction into
// the thing a first-time owner most needs to understand: a new shop does not
// open at full trade, and the ramp is the plan, not a mistake.

export interface RevenueRamp {
  // Month 1 of the projection, with the ramp multiplier applied.
  firstMonthCents: number;
  // The first month after the ramp finishes — the growth factor there is
  // exactly 1.0, so this is "full trade, before any growth". Taken from the
  // same projection rows as the first-month figure; nothing is recomputed.
  matureCents: number;
  rampMonths: number;
}

// Only worth two numbers when there is genuinely a ramp and the gap is visible.
// A plan with no ramp, or a 2% difference, is better served by one clean figure
// than by a distinction the owner has to squint at.
const RAMP_VISIBLE_THRESHOLD = 0.05;

export function showsRevenueRamp(r: RevenueRamp): boolean {
  if (r.rampMonths <= 0) return false;
  if (r.firstMonthCents <= 0 || r.matureCents <= 0) return false;
  const gap = Math.abs(r.matureCents - r.firstMonthCents) / r.matureCents;
  return gap >= RAMP_VISIBLE_THRESHOLD;
}

// The teaching line. Deliberately explains WHY rather than just labelling the
// two figures: the ramp is a deliberate assumption the owner can change, not a
// quirk of our arithmetic.
export function rampExplanation(rampMonths: number): string {
  const months = rampMonths === 1 ? "month" : "months";
  return `New shops take time to fill. Your plan assumes ${rampMonths} ${months} of building up to full trade — that ramp is why these two numbers differ.`;
}
