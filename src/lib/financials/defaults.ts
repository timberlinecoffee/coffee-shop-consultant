import type { FinancialsContent } from "../../types/financials.ts";

export const EMPTY_FINANCIALS: FinancialsContent = {
  schema_version: 1,
  startup_costs: [],
  monthly_pnl: {
    revenue: [],
    cogs_percent: 28,
    labor: [],
    fixed_costs: [],
  },
  break_even: {},
  funding: [],
};
