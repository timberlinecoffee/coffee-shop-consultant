// TIM-2593: Financial snapshot data for the Home v2 dashboard.
// Loads the user's financial model and computes the 4 key metrics shown in
// the FinancialSnapshotCard: monthly revenue, break-even revenue, daily
// customers needed, and opening capital runway.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeMonthlyProjections,
  computeMonthlyProjections,
  computeBreakEvenModel,
  type MonthlyProjections,
  type MonthlySlice,
} from "@/lib/financial-projection";

export interface FinancialSnapshot {
  monthlyRevenueCents: number;
  breakEvenRevenueCents: number;
  dailyCustomersNeeded: number;
  runwayMonths: number;
  currencyCode: string;
}

const EMPTY_EQUIPMENT = { total_cost_cents: 0, financed_cost_cents: 0 };

export async function loadFinancialSnapshot(
  supabase: SupabaseClient,
  planId: string
): Promise<FinancialSnapshot | null> {
  try {
    const { data: modelRow } = await supabase
      .from("financial_models")
      .select("forecast_inputs")
      .eq("plan_id", planId)
      .maybeSingle();

    if (!modelRow) return null;

    const raw = (modelRow as Record<string, unknown>).forecast_inputs;
    const mp: MonthlyProjections = normalizeMonthlyProjections(raw ?? {});

    const rows = computeMonthlyProjections(mp, EMPTY_EQUIPMENT);
    const m1 = rows[0];
    if (!m1) return null;

    const avgTicketCents = mp.avg_ticket_cents ?? 750;
    const breakEven = computeBreakEvenModel(
      m1 as unknown as MonthlySlice,
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

    return {
      monthlyRevenueCents: m1.revenue_cents,
      breakEvenRevenueCents: breakEven?.breakEvenRevenueCents ?? 0,
      dailyCustomersNeeded:
        breakEven && isFinite(breakEven.breakEvenTransactions)
          ? Math.ceil(breakEven.breakEvenTransactions / openDaysPerMonth)
          : 0,
      runwayMonths,
      currencyCode: mp.currency_code ?? "USD",
    };
  } catch {
    return null;
  }
}
