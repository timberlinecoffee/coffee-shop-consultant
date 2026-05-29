// TIM-1119: Balance-sheet diagnostic — when the balance sheet shows "out of
// balance", surface the gap amount, the likely cause(s), and a concrete fix
// suggestion in beginner-friendly language.
//
// The diagnostic looks at the last month of the selected year against the full
// 60-month projection so it can spot two common patterns that a single-slice
// inspection would miss:
//
//   1. Working-capital squeeze: inventory + receivables exceed payables, and
//      the difference has no offsetting source of funding.
//   2. Cash trough: the simulated cash balance goes negative during a ramp
//      period and the model has to suppress the deficit to render a balance
//      sheet at all.
//
// The output is consumed by the balance-sheet tab's expandable banner; it is
// not used in math/exports.

import type { MonthlySlice, FinancialInputs } from "./financial-projection.ts";

export const BALANCE_TOLERANCE_CENTS = 2;

export type GapDirection = "assets_exceed" | "le_exceeds_assets";

export type CauseId =
  | "working_capital_unfunded"
  | "cash_trough"
  | "funding_shortfall"
  | "retained_earnings_drift"
  | "unknown";

export interface Cause {
  id: CauseId;
  // Short, beginner-friendly label (e.g. "Working capital not fully funded").
  label: string;
  // Plain-English explanation (1–2 sentences, no jargon).
  explanation: string;
  // Best-effort cents contribution to the imbalance (positive = explains
  // |gap| of this size). Used to rank causes and size the suggested fix.
  contribution_cents: number;
}

export interface SuggestedFix {
  // Beginner-friendly action label (e.g. "Add $12,400 to your opening cash").
  label: string;
  // 1–2 sentence rationale.
  rationale: string;
  // Where to make the change in the planner UI.
  location: "startup_costs" | "forecast_inputs" | "funding_sources";
  // If the fix can be expressed as a delta to a specific input, callers can
  // use this to render a one-click apply button. Amounts are in cents.
  adjustment?: {
    field:
      | "owner_capital_cents"
      | "opening_cash_buffer_cents"
      | "working_capital_reserve_cents"
      | "loan_amount_cents";
    delta_cents: number;
  };
}

export interface BalanceDiagnostic {
  balanced: boolean;
  // Signed gap in cents: (total_assets - total_liabilities_and_equity). A
  // positive value means assets are higher than liabilities+equity; negative
  // means liabilities+equity exceed assets.
  gap_cents: number;
  direction: GapDirection | null;
  // Plain-English headline (e.g. "Assets are $1,240 higher than liabilities
  // plus equity for this period.").
  headline: string;
  // Plain-English one-paragraph summary aimed at non-accountants.
  summary: string;
  // Ranked likely causes (most likely first). Empty when balanced.
  causes: Cause[];
  // Single best fix suggestion when we have enough signal; otherwise null.
  suggested_fix: SuggestedFix | null;
}

// Format a cents value for inline use inside diagnostic strings. Avoids
// pulling in the heavier currency module — the balance-sheet tab passes the
// formatted strings in via a separate helper.
function formatCentsRough(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.round(abs / 100);
  return `${sign}$${dollars.toLocaleString("en-US")}`;
}

interface DiagnoseArgs {
  // The single month (year-end) whose gap we are explaining. Required.
  slice: MonthlySlice;
  // The full projection. Used to find ramp-period cash troughs and the lowest
  // cash month. Optional but strongly recommended.
  allSlices?: MonthlySlice[];
  // The same inputs the slice was computed from. Used to suggest specific
  // input changes. Optional — diagnostic still works without it, just with
  // less specific fix suggestions.
  inputs?: Partial<FinancialInputs>;
}

export function diagnoseBalanceSheet({
  slice,
  allSlices,
  inputs,
}: DiagnoseArgs): BalanceDiagnostic {
  const gap = slice.total_assets_cents - slice.total_liabilities_and_equity_cents;
  const absGap = Math.abs(gap);

  if (absGap < BALANCE_TOLERANCE_CENTS) {
    return {
      balanced: true,
      gap_cents: 0,
      direction: null,
      headline: "Balance sheet checks out.",
      summary:
        "Your total assets equal your liabilities plus equity. That is the basic accounting equation and it is what every balance sheet has to satisfy.",
      causes: [],
      suggested_fix: null,
    };
  }

  const direction: GapDirection = gap > 0 ? "assets_exceed" : "le_exceeds_assets";
  const gapStr = formatCentsRough(absGap);

  // ── Probe likely causes ─────────────────────────────────────────────────

  // (1) Cash trough — the running cash balance went negative somewhere in the
  //     projection and got suppressed at zero on the displayed balance sheet,
  //     which creates an apparent imbalance equal to the largest shortfall.
  let lowestCashCents = slice.cash_cents;
  let lowestCashMonthIndex = slice.month_index;
  let lowestSliceMonth = slice.month;
  let lowestSliceYear = slice.year;
  if (allSlices && allSlices.length > 0) {
    for (const s of allSlices) {
      if (s.cash_cents < lowestCashCents) {
        lowestCashCents = s.cash_cents;
        lowestCashMonthIndex = s.month_index;
        lowestSliceMonth = s.month;
        lowestSliceYear = s.year;
      }
    }
  }
  // cash_cents is already clamped at 0 in computeMonthlySlices, so the floor
  // is 0 by construction — but a "very thin" cash position (well under one
  // month of rent) usually correlates with the suppressed-deficit pattern.
  const monthlyFixedCostsCents =
    (slice.rent_cents ?? 0) + (slice.labor_cents ?? 0) + (slice.utilities_cents ?? 0);
  const cashTrough = lowestCashCents === 0 && monthlyFixedCostsCents > 0;

  // (2) Working-capital squeeze — inventory + AR exceed AP and the user
  //     hasn't provisioned a working-capital reserve. Each $1 of net working
  //     capital needs $1 of funding (equity or debt). If the planner doesn't
  //     reflect that funding, the model shows an imbalance.
  const inventoryCents = slice.inventory_cents ?? 0;
  const arCents = slice.accounts_receivable_cents ?? 0;
  const apCents = slice.accounts_payable_cents ?? 0;
  const netWorkingCapital = inventoryCents + arCents - apCents;

  // (3) Funding shortfall — total startup costs exceed owner capital + loan.
  const ownerCapital = inputs?.owner_capital_cents ?? 0;
  const loanAmount = inputs?.loan_amount_cents ?? 0;
  const openingCashBuffer = inputs?.opening_cash_buffer_cents ?? 0;
  const workingCapitalReserve = inputs?.working_capital_reserve_cents ?? 0;
  const buildoutCents = inputs?.buildout_cost_cents ?? 0;
  const equipmentCents = inputs?.equipment_cost_cents ?? 0;
  const licenseCents = inputs?.license_permits_cents ?? 0;
  const preOpenMarketingCents = inputs?.pre_opening_marketing_cents ?? 0;
  const initialInventoryCents = inputs?.initial_inventory_cents ?? 0;
  const rentDepositsCents = inputs?.rent_deposits_cents ?? 0;

  const totalStartupCents =
    buildoutCents +
    equipmentCents +
    licenseCents +
    preOpenMarketingCents +
    initialInventoryCents +
    rentDepositsCents +
    workingCapitalReserve +
    openingCashBuffer;
  const totalFundingCents = ownerCapital + loanAmount;
  const fundingShortfallCents = totalStartupCents - totalFundingCents;

  // (4) Retained-earnings drift — total_equity_cents and (owner_capital +
  //     retained_earnings) disagree by more than rounding. Catches manual
  //     edits or stale stored values.
  const retainedEarnings = slice.retained_earnings_cents ?? 0;
  const ownerEquity = slice.owner_equity_cents ?? 0;
  const computedEquity = retainedEarnings + ownerEquity;
  const equityDrift = Math.abs(computedEquity - slice.total_equity_cents);

  // Rank: pick whichever cause explains the largest piece of |gap|. When
  // direction is le_exceeds_assets (the common case for an unfunded model)
  // funding/working-capital/cash issues are most plausible.
  const candidates: Cause[] = [];

  if (direction === "le_exceeds_assets") {
    if (fundingShortfallCents > BALANCE_TOLERANCE_CENTS) {
      candidates.push({
        id: "funding_shortfall",
        label: "Startup costs exceed funding sources",
        explanation: `Your startup costs add up to more than your owner capital plus loan. The ${gapStr} gap on the balance sheet is the cash you need but have not raised yet.`,
        contribution_cents: Math.min(absGap, fundingShortfallCents),
      });
    }
    if (cashTrough) {
      candidates.push({
        id: "cash_trough",
        label: "Cash runs out during the ramp",
        explanation: `The model hits ${formatCentsRough(0)} cash in month ${lowestCashMonthIndex} (Year ${lowestSliceYear}, month ${lowestSliceMonth}). The balance sheet cannot show negative cash, so the deficit shows up as a gap of ${gapStr} between assets and liabilities + equity.`,
        contribution_cents: Math.min(absGap, monthlyFixedCostsCents * 2 || absGap),
      });
    }
    if (netWorkingCapital > BALANCE_TOLERANCE_CENTS && workingCapitalReserve < netWorkingCapital) {
      candidates.push({
        id: "working_capital_unfunded",
        label: "Working capital is not funded",
        explanation: `You are carrying ${formatCentsRough(netWorkingCapital)} in inventory and receivables but only ${formatCentsRough(apCents)} in payables. Until you set aside cash to cover that difference, the model has to plug the gap somewhere. That is what you are seeing here.`,
        contribution_cents: Math.min(absGap, netWorkingCapital - workingCapitalReserve),
      });
    }
  } else {
    // direction === "assets_exceed"
    if (equityDrift > BALANCE_TOLERANCE_CENTS) {
      candidates.push({
        id: "retained_earnings_drift",
        label: "Retained earnings do not match cumulative profits",
        explanation: `Your stored equity total disagrees with owner capital + retained earnings by ${formatCentsRough(equityDrift)}. This usually means a forecast input was edited manually after the model was last recomputed.`,
        contribution_cents: equityDrift,
      });
    }
    // Owner-capital surplus: more funding than the model needs, surfaced as
    // an inflated cash position that isn't matched on the equity side.
    if (fundingShortfallCents < -BALANCE_TOLERANCE_CENTS) {
      candidates.push({
        id: "funding_shortfall",
        label: "Funding sources exceed startup costs",
        explanation: `Your owner capital plus loan adds up to ${formatCentsRough(-fundingShortfallCents)} more than your itemized startup costs. The extra cash sits on the assets side without a matching entry on the equity or debt side.`,
        contribution_cents: Math.min(absGap, -fundingShortfallCents),
      });
    }
  }

  if (candidates.length === 0) {
    candidates.push({
      id: "unknown",
      label: "Imbalance source not pinned down",
      explanation:
        "We could not tie the gap to a specific input. Try re-saving the forecast. Most small drifts come from inputs that were edited but not recomputed.",
      contribution_cents: absGap,
    });
  }

  candidates.sort((a, b) => b.contribution_cents - a.contribution_cents);

  // ── Suggested fix ───────────────────────────────────────────────────────
  let suggested_fix: SuggestedFix | null = null;
  const top = candidates[0];

  if (top.id === "funding_shortfall" && direction === "le_exceeds_assets") {
    suggested_fix = {
      label: `Add ${gapStr} to owner capital or loan`,
      rationale:
        "Every dollar of startup cost has to come from somewhere: either money you put in or money you borrow. This closes the funding gap shown above.",
      location: "funding_sources",
      adjustment: {
        field: "owner_capital_cents",
        delta_cents: absGap,
      },
    };
  } else if (top.id === "cash_trough") {
    // Recommend an opening cash buffer large enough to cover the deepest
    // cash trough plus a 1.5x cushion.
    const recommendedBuffer = Math.round(absGap * 1.5);
    suggested_fix = {
      label: `Add ${formatCentsRough(recommendedBuffer)} to your opening cash buffer`,
      rationale: `This covers the cash low point in month ${lowestCashMonthIndex} with a 50% safety margin so a slow month does not put you under.`,
      location: "startup_costs",
      adjustment: {
        field: "opening_cash_buffer_cents",
        delta_cents: recommendedBuffer,
      },
    };
  } else if (top.id === "working_capital_unfunded") {
    const recommendedReserve = Math.max(netWorkingCapital, absGap);
    suggested_fix = {
      label: `Set working capital reserve to ${formatCentsRough(recommendedReserve)}`,
      rationale:
        "Inventory you are holding and money customers owe you both tie up cash. A working capital reserve covers that gap so you are not constantly cash-strapped.",
      location: "startup_costs",
      adjustment: {
        field: "working_capital_reserve_cents",
        delta_cents: recommendedReserve - workingCapitalReserve,
      },
    };
  } else if (top.id === "funding_shortfall" && direction === "assets_exceed") {
    suggested_fix = {
      label: `Reduce owner capital or loan by ${gapStr}`,
      rationale:
        "You have more funding lined up than your startup needs. Either lower the amount you are putting in, lower the loan, or add a corresponding line to startup costs.",
      location: "funding_sources",
      adjustment: {
        field: "owner_capital_cents",
        delta_cents: -absGap,
      },
    };
  } else if (top.id === "retained_earnings_drift") {
    suggested_fix = {
      label: "Re-save the forecast to recompute equity",
      rationale:
        "Equity is computed from owner capital + cumulative net income. Re-saving the model forces a clean recomputation.",
      location: "forecast_inputs",
    };
  }

  const headline =
    direction === "assets_exceed"
      ? `Assets are ${gapStr} higher than liabilities plus equity.`
      : `Liabilities plus equity are ${gapStr} higher than assets.`;

  const summary =
    direction === "assets_exceed"
      ? "Every dollar on the assets side has to be matched by either money you owe (a liability) or money invested (equity). Right now, your assets are larger than both sides combined, which means the model is short an entry on the liabilities or equity side."
      : "Every dollar on the liabilities and equity side has to be matched by an asset of equal value. Right now, the model is showing more debts and invested money than there are assets to cover them, which usually means cash is missing.";

  return {
    balanced: false,
    gap_cents: gap,
    direction,
    headline,
    summary,
    causes: candidates,
    suggested_fix,
  };
}
