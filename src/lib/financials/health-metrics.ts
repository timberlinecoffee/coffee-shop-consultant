// TIM-2525: Financial Health metrics — pure computation shared by the
// workspace panel (client) and the dashboard server component.

import {
  type MonthlySlice,
  type FinancialInputs,
  sumSlices,
} from "@/lib/financial-projection";

// ── Types ─────────────────────────────────────────────────────────────────────

export type HealthTier = "green" | "yellow" | "red";

export interface HealthMetric {
  key: string;
  label: string;
  formattedValue: string;
  tier: HealthTier;
  thresholds: string;
  whatItMeans: string;
}

// ── Tier helpers ──────────────────────────────────────────────────────────────

function laborTier(pct: number): HealthTier {
  if (pct < 30) return "green";
  if (pct <= 35) return "yellow";
  return "red";
}
function cogsTier(pct: number): HealthTier {
  if (pct < 32) return "green";
  if (pct <= 38) return "yellow";
  return "red";
}
function breakEvenTier(month: number): HealthTier {
  if (month < 6) return "green";
  if (month <= 12) return "yellow";
  return "red";
}
function workingCapitalTier(ratio: number): HealthTier {
  if (ratio > 1.5) return "green";
  if (ratio >= 1.0) return "yellow";
  return "red";
}

// ── Copy helpers ──────────────────────────────────────────────────────────────

function laborCopy(pct: number, tier: HealthTier): string {
  const f = pct.toFixed(1);
  if (tier === "green")
    return `Labor at ${f}% is within the healthy range. You have room before it becomes a squeeze.`;
  if (tier === "yellow")
    return `Labor at ${f}% is approaching the caution zone. Opening months often run a little high. Plan to get below 30% once you reach full volume.`;
  return `Labor at ${f}% is above the 35% red line for coffee shops. Review your staffing schedule or raise average ticket to bring this down.`;
}

function cogsCopy(pct: number, tier: HealthTier): string {
  const f = pct.toFixed(1);
  if (tier === "green")
    return `COGS at ${f}% is in good shape. You're keeping ingredient and supply costs low relative to revenue.`;
  if (tier === "yellow")
    return `COGS at ${f}% is in the caution range. Double-check your pour sizes, supplier costs, and pricing to make sure margins hold.`;
  return `COGS at ${f}% is above the 38% threshold. Ingredient and supply costs are eating too much of each sale. Revisit your COGS percentage or prices.`;
}

function breakEvenCopy(month: number | null, tier: HealthTier): string {
  if (month === null)
    return "Your projections don't show a profitable month in the 5-year window. Check your costs and revenue assumptions.";
  if (tier === "green")
    return `Profitability projected by Month ${month} is strong. Getting profitable this quickly gives you a real cash cushion early on.`;
  if (tier === "yellow")
    return `Month ${month} is your first projected profit. That's within a reasonable range, but watch cash flow carefully through the ramp.`;
  return `Your first profitable month doesn't arrive until Month ${month}. That's a long runway. Make sure your funding covers the losses until then.`;
}

function workingCapitalCopy(ratio: number, tier: HealthTier): string {
  const f = ratio.toFixed(2);
  if (tier === "green")
    return `Your funding is ${f}× your opening costs. You have a real cushion for unexpected expenses and slow early months.`;
  if (tier === "yellow")
    return `Your funding is ${f}× your opening costs. Tight but workable. Any overrun in startup costs or slow early months will strain cash. Consider keeping a reserve.`;
  return `Your funding (${f}×) is below your opening costs. You may run short before you open or in the first months. Revisit your funding plan.`;
}

// ── Main computation ──────────────────────────────────────────────────────────

export function computeFinancialHealthMetrics(
  slices: MonthlySlice[],
  financialInputs: FinancialInputs
): HealthMetric[] {
  const y1 = slices.filter((s) => s.year === 1);
  if (y1.length === 0) return [];

  const totals = sumSlices(y1);
  const nr = totals.net_revenue_cents ?? 0;
  if (nr <= 0) return [];

  const metrics: HealthMetric[] = [];

  // 1. Labor % of revenue
  const totalLabor = (totals.labor_cents ?? 0) + (totals.labor_cogs_cents ?? 0);
  const laborPct = (totalLabor / nr) * 100;
  const lTier = laborTier(laborPct);
  metrics.push({
    key: "labor_pct",
    label: "Labor % of Revenue",
    formattedValue: `${laborPct.toFixed(1)}%`,
    tier: lTier,
    thresholds: "Green < 30% | Yellow 30–35% | Red > 35%",
    whatItMeans: laborCopy(laborPct, lTier),
  });

  // 2. COGS % of revenue
  const cogsPct = ((totals.total_cogs_cents ?? 0) / nr) * 100;
  const cTier = cogsTier(cogsPct);
  metrics.push({
    key: "cogs_pct",
    label: "COGS % of Revenue",
    formattedValue: `${cogsPct.toFixed(1)}%`,
    tier: cTier,
    thresholds: "Green < 32% | Yellow 32–38% | Red > 38%",
    whatItMeans: cogsCopy(cogsPct, cTier),
  });

  // 3. Break-even month — first month_index where net_income_cents >= 0
  const beSlice = slices.find((s) => s.net_income_cents >= 0);
  const beMonth = beSlice?.month_index ?? null;
  const beTier = beMonth !== null ? breakEvenTier(beMonth) : "red";
  metrics.push({
    key: "break_even_month",
    label: "Break-Even Month",
    formattedValue: beMonth !== null ? `Month ${beMonth}` : "Not in range",
    tier: beTier,
    thresholds: "Green < Month 6 | Yellow Month 6–12 | Red > Month 12",
    whatItMeans: breakEvenCopy(beMonth, beTier),
  });

  // 4. Working capital vs opening costs ratio
  const totalFunding =
    financialInputs.owner_capital_cents + financialInputs.loan_amount_cents;
  const startupTotal =
    financialInputs.buildout_cost_cents +
    financialInputs.equipment_cost_cents +
    financialInputs.rent_deposits_cents +
    financialInputs.license_permits_cents +
    financialInputs.pre_opening_marketing_cents +
    financialInputs.initial_inventory_cents +
    financialInputs.startup_supplies_cents +
    financialInputs.professional_fees_cents;

  if (startupTotal > 0 && totalFunding > 0) {
    const ratio = totalFunding / startupTotal;
    const wTier = workingCapitalTier(ratio);
    metrics.push({
      key: "working_capital",
      label: "Working Capital vs Opening Costs",
      formattedValue: `${ratio.toFixed(2)}×`,
      tier: wTier,
      thresholds: "Green > 1.5× | Yellow 1–1.5× | Red < 1×",
      whatItMeans: workingCapitalCopy(ratio, wTier),
    });
  }

  return metrics;
}

// ── Tier styles (shared by panel + dashboard card) ────────────────────────────

export const TIER_STYLES: Record<
  HealthTier,
  { wrap: string; dot: string; chip: string; chipLabel: string }
> = {
  green: {
    wrap: "border-green-200 bg-green-50",
    dot: "bg-green-500",
    chip: "bg-green-100 text-green-800",
    chipLabel: "On track",
  },
  yellow: {
    wrap: "border-amber-200 bg-amber-50",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-900",
    chipLabel: "Watch",
  },
  red: {
    wrap: "border-red-200 bg-red-50",
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-800",
    chipLabel: "Needs attention",
  },
};

// ── Summary helper ─────────────────────────────────────────────────────────────

export function worstTier(metrics: HealthMetric[]): HealthTier {
  if (metrics.some((m) => m.tier === "red")) return "red";
  if (metrics.some((m) => m.tier === "yellow")) return "yellow";
  return "green";
}
