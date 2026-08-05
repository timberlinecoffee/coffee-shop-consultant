// TIM-2593: Financial snapshot data for the Home v2 dashboard.
// Loads the user's financial model and computes the 4 key metrics shown in
// the FinancialSnapshotCard: monthly revenue, break-even revenue, daily
// customers needed, and opening capital runway.
//
// TIM-4102 (T1-C): every metric now carries the REASON it could not be
// computed instead of collapsing to 0. Home used to render those zeros as an
// em dash, so a missing input and a real calculation failure looked identical
// to the owner — and both looked like broken software.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeMonthlyProjections,
  computeMonthlyProjections,
  computeBreakEvenModel,
  type MonthlyProjections,
} from "@/lib/financial-projection";
import {
  deriveBreakEvenStatus,
  deriveRunwayStatus,
  deriveRevenueStatus,
  type BreakEvenBlockedReason,
  type RunwayBlockedReason,
  type RevenueBlockedReason,
} from "./metric-status";

export interface FinancialSnapshot {
  monthlyRevenueCents: number;
  // TIM-4103 (T1-B): revenue once the ramp finishes — the same figure the
  // Financials workspace implies with its daily sales line. Home showed only
  // month 1, Financials only the mature number, and nothing said they were
  // measuring different moments. Both come from the same projection rows.
  matureMonthlyRevenueCents: number;
  rampMonths: number;
  breakEvenRevenueCents: number;
  dailyCustomersNeeded: number;
  runwayMonths: number;
  currencyCode: string;
  // TIM-4102 (T1-C): set when the matching figure is not a real number. The
  // card renders the reason as guidance instead of showing a dash.
  revenueBlockedReason?: RevenueBlockedReason;
  breakEvenBlockedReason?: BreakEvenBlockedReason;
  runwayBlockedReason?: RunwayBlockedReason;
}

// TIM-4102 (T1-C): NOT a shortcut, despite appearances.
//
// The T1-C spec flagged this as Home quietly excluding equipment costs while
// the Financials workspace included them. That premise is wrong, and the
// correction matters more than the "fix" would have: computeMonthlyProjections
// does not read this argument at all. Its own comment (TIM-1169) records that
// the legacy equipment financed-cost path was retired and the parameter
// hard-coded to {0, 0} in the workspace back in TIM-1029. Equipment reaches
// the projection through startup_costs.equipment_cents on the normalized
// model — which Home passes identically to everywhere else — where it is
// depreciated straight-line.
//
// Verified: the xlsx and pdf export routes also pass {0, 0}. So Home's
// projection already matches the Financials workspace exactly. Passing a real
// equipment total here would change nothing. Left in place, renamed, and
// documented so the next reader does not re-file this same bug.
const RETIRED_EQUIPMENT_ARG = { total_cost_cents: 0, financed_cost_cents: 0 };

export async function loadFinancialSnapshot(
  supabase: SupabaseClient,
  planId: string
): Promise<FinancialSnapshot | null> {
  let currencyCode = "USD";
  try {
    const { data: modelRow } = await supabase
      .from("financial_models")
      .select("forecast_inputs")
      .eq("plan_id", planId)
      .maybeSingle();

    // No financial model at all is a genuine zero-state, not a failure. The
    // card has its own "Fill in your financial model" copy for this.
    if (!modelRow) return null;

    const raw = (modelRow as Record<string, unknown>).forecast_inputs;
    const mp: MonthlyProjections = normalizeMonthlyProjections(raw ?? {});
    currencyCode = mp.currency_code ?? "USD";

    const rows = computeMonthlyProjections(mp, RETIRED_EQUIPMENT_ARG);
    const m1 = rows[0];
    // A model row that exists but yields no month 1 is a real failure, not an
    // empty state. Pre-T1-C this returned null and rendered as "you haven't
    // started yet", which sent the owner looking in the wrong place.
    if (!m1) {
      console.error("[financial-snapshot] no month-1 row produced", { planId });
      return failedSnapshot(currencyCode);
    }

    // TIM-4103 (T1-B): the first month AFTER the ramp. monthRevenueFactor
    // returns exactly 1.0 there (k = 1 in both simple and custom growth
    // modes), so it is full trade before any growth is compounded on top —
    // which is precisely what the Financials daily sales figure describes.
    // Read straight out of the rows we already have; no second calculation,
    // so the two figures cannot drift apart.
    const rampMonths = Math.max(
      0,
      Math.min(rows.length - 1, mp.ramp_months ?? 0)
    );
    const matureRow = rows[rampMonths] ?? m1;

    const avgTicketCents = mp.avg_ticket_cents ?? 750;
    // TIM-3444: the `as unknown as MonthlySlice` cast that used to sit here was
    // load-bearing in the worst way — it silenced the one check that would have
    // caught computeBreakEvenModel reading a slice-only field off a plain row.
    // The signature now takes the row type, so no cast is needed and the next
    // shape mismatch fails the build instead of the dashboard.
    const breakEven = computeBreakEvenModel(
      m1,
      mp.forecast_lines ?? [],
      avgTicketCents
    );

    const openDaysPerWeek = Object.values(mp.weekly_schedule ?? {}).filter(
      (d) => d && (d as { open: boolean }).open
    ).length || 6;
    const openDaysPerMonth = Math.max(1, Math.round((openDaysPerWeek * 52) / 12));

    const totalFundingCents = (mp.funding_sources ?? []).reduce(
      (sum, s) => sum + (s.amount_cents || 0),
      0
    );
    const monthlyBurnCents = m1.total_opex_cents + m1.cogs_cents;
    const runwayMonths =
      monthlyBurnCents > 0
        ? Math.round((totalFundingCents / monthlyBurnCents) * 10) / 10
        : 0;

    const revenueStatus = deriveRevenueStatus({
      monthlyRevenueCents: m1.revenue_cents,
    });
    const breakEvenStatus = deriveBreakEvenStatus({
      model: breakEven,
      avgTicketCents,
      netRevenueCents: m1.net_revenue_cents,
    });
    const runwayStatus = deriveRunwayStatus({
      totalFundingCents,
      monthlyBurnCents,
    });

    return {
      monthlyRevenueCents: m1.revenue_cents,
      matureMonthlyRevenueCents: matureRow.revenue_cents,
      rampMonths,
      breakEvenRevenueCents: breakEven?.breakEvenRevenueCents ?? 0,
      dailyCustomersNeeded:
        breakEven && isFinite(breakEven.breakEvenTransactions)
          ? Math.ceil(breakEven.breakEvenTransactions / openDaysPerMonth)
          : 0,
      runwayMonths,
      currencyCode,
      ...(revenueStatus.ok ? {} : { revenueBlockedReason: revenueStatus.reason }),
      ...(breakEvenStatus.ok
        ? {}
        : { breakEvenBlockedReason: breakEvenStatus.reason }),
      ...(runwayStatus.ok ? {} : { runwayBlockedReason: runwayStatus.reason }),
    };
  } catch (err) {
    // TIM-4102 (T1-C): was a bare `catch { return null }`. Any error silently
    // produced the same empty card an owner with no model sees, so a real
    // defect was indistinguishable from "nothing entered yet" — and nobody
    // was told. Log it, and tell the owner it is our problem to fix.
    console.error("[financial-snapshot] load failed", { planId, err });
    return failedSnapshot(currencyCode);
  }
}

function failedSnapshot(currencyCode: string): FinancialSnapshot {
  return {
    monthlyRevenueCents: 0,
    matureMonthlyRevenueCents: 0,
    rampMonths: 0,
    breakEvenRevenueCents: 0,
    dailyCustomersNeeded: 0,
    runwayMonths: 0,
    currencyCode,
    revenueBlockedReason: "compute_failed",
    breakEvenBlockedReason: "compute_failed",
    runwayBlockedReason: "compute_failed",
  };
}
