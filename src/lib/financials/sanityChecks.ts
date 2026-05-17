// TIM-717 / TIM-621-AI — plan-aware financial sanity checks.
//
// Pure function: takes the workspace_documents.content blob for the
// `financials` workspace and returns an array of advisory flags. Consumed by:
//   - the workspace save endpoint (writes flags into content.ai_findings)
//   - composePlanSnapshot (so the co-pilot grounds responses in real numbers)
//   - the workspace sidebar UI (renders flags by severity)
//
// Schema reference: TIM-621 plan document, `workspace_documents.content` for
// `workspace_key='financials'`. We accept a loose `unknown` and guard every
// access so we still produce useful flags on partial/legacy plans.

export type FlagSeverity = "info" | "warn" | "error";

export type FlagRuleId =
  | "labor_underbudget"
  | "no_owner_salary"
  | "rent_over_threshold"
  | "no_runway_buffer"
  | "break_even_too_late"
  | "cogs_unrealistic";

export type Flag = {
  rule_id: FlagRuleId;
  severity: FlagSeverity;
  message: string;
  evidence?: string;
};

// Rule constants — sourced from the TIM-621 plan. Industry bands are the
// "why" behind each threshold; tweaking these numbers changes the advice the
// AI gives users, so they are deliberately named and grouped here.
const LABOR_MIN_PCT_OF_REVENUE = 25; // industry norm 30-35%
const RENT_MAX_PCT_OF_REVENUE = 12; // rule of thumb ≤ 10-12%
const COGS_BAND_MIN = 22; // outside band = unrealistic
const COGS_BAND_MAX = 38;
const BREAK_EVEN_MAX_MONTH = 12; // lender comfort threshold
const RUNWAY_RESERVE_MONTHS = 3; // funding must cover ≥3 months of fixed costs

const PROJECTION_MONTHS = 12;

// ---------- shape guards (loose, defensive) ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCents(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toPercent(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sumMonthlyCents(items: unknown[]): number {
  let total = 0;
  for (const item of items) {
    if (isRecord(item)) total += toCents(item.monthly_cents);
  }
  return total;
}

function sumStartupCents(items: unknown[]): number {
  let total = 0;
  for (const item of items) {
    if (isRecord(item)) total += toCents(item.amount_cents);
  }
  return total;
}

function sumFundingCents(items: unknown[]): number {
  let total = 0;
  for (const item of items) {
    if (isRecord(item)) total += toCents(item.amount_cents);
  }
  return total;
}

// Treat both the canonical schema role 'owner' and any label that matches
// /owner/i as owner roles, so a typed label like "Owner-operator" is caught.
function isOwnerRole(item: Record<string, unknown>): boolean {
  if (item.role === "owner") return true;
  const label = typeof item.label === "string" ? item.label : "";
  return /owner/i.test(label);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  // Compact USD format — no Intl dep so this works in the unit test runner.
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ---------- the rules ----------

export function runFinancialsSanityChecks(content: unknown): Flag[] {
  const flags: Flag[] = [];
  if (!isRecord(content)) return flags;

  const pnl = isRecord(content.monthly_pnl) ? content.monthly_pnl : {};
  const startup = arrayField(content.startup_costs);
  const funding = arrayField(content.funding);

  const revenueItems = arrayField(pnl.revenue);
  const laborItems = arrayField(pnl.labor);
  const fixedItems = arrayField(pnl.fixed_costs);

  const monthlyRevenue = sumMonthlyCents(revenueItems);
  const monthlyLabor = sumMonthlyCents(laborItems);
  const monthlyFixed = sumMonthlyCents(fixedItems);
  const rentItem = fixedItems.find(
    (item): item is Record<string, unknown> =>
      isRecord(item) && item.category === "rent",
  );
  const monthlyRent = rentItem ? toCents(rentItem.monthly_cents) : 0;

  const cogsPct = toPercent(pnl.cogs_percent);
  const monthlyCogs =
    cogsPct !== null && monthlyRevenue > 0
      ? Math.round(monthlyRevenue * (cogsPct / 100))
      : 0;

  const startupTotal = sumStartupCents(startup);
  const fundingTotal = sumFundingCents(funding);

  // Rule 1 — labor_underbudget
  if (monthlyRevenue > 0 && monthlyLabor > 0) {
    const laborPct = (monthlyLabor / monthlyRevenue) * 100;
    if (laborPct < LABOR_MIN_PCT_OF_REVENUE) {
      flags.push({
        rule_id: "labor_underbudget",
        severity: "warn",
        message: `Labor is only ${formatPct(laborPct)} of projected revenue. First-shop industry norm is 30–35%. Underbudgeting labor is the #1 reason new cafes burn out.`,
        evidence: `labor ${formatCurrency(monthlyLabor)}/mo vs revenue ${formatCurrency(monthlyRevenue)}/mo`,
      });
    }
  }

  // Rule 2 — no_owner_salary
  const ownerLines = laborItems.filter(
    (item): item is Record<string, unknown> => isRecord(item) && isOwnerRole(item),
  );
  if (ownerLines.length > 0) {
    const ownerPay = ownerLines.reduce((sum, item) => sum + toCents(item.monthly_cents), 0);
    if (ownerPay === 0) {
      flags.push({
        rule_id: "no_owner_salary",
        severity: "warn",
        message: "Owner role has $0/mo. An owner who doesn't pay themselves can't survive a slow month — bake a draw into the P&L now, even if it's modest.",
        evidence: `owner monthly_cents = 0 across ${ownerLines.length} owner line(s)`,
      });
    }
  }

  // Rule 3 — rent_over_threshold
  if (monthlyRevenue > 0 && monthlyRent > 0) {
    const rentPct = (monthlyRent / monthlyRevenue) * 100;
    if (rentPct > RENT_MAX_PCT_OF_REVENUE) {
      flags.push({
        rule_id: "rent_over_threshold",
        severity: "warn",
        message: `Rent is ${formatPct(rentPct)} of projected revenue. Industry rule of thumb is ≤ 10–12%; anything higher squeezes the margin shops survive on.`,
        evidence: `rent ${formatCurrency(monthlyRent)}/mo vs revenue ${formatCurrency(monthlyRevenue)}/mo`,
      });
    }
  }

  // Rule 4 — no_runway_buffer
  // Fire if funding doesn't cover startup costs, OR if leftover funding after
  // build-out doesn't cover ≥3 months of fixed operating costs. Most shops
  // fail in months 4–9 because they only funded the build-out.
  if (fundingTotal > 0 || startupTotal > 0 || monthlyFixed > 0) {
    if (fundingTotal < startupTotal) {
      flags.push({
        rule_id: "no_runway_buffer",
        severity: "error",
        message: `Funding (${formatCurrency(fundingTotal)}) is below startup costs (${formatCurrency(startupTotal)}). You haven't fully funded build-out, let alone a runway buffer.`,
        evidence: `funding ${formatCurrency(fundingTotal)} < startup ${formatCurrency(startupTotal)}`,
      });
    } else if (monthlyFixed > 0) {
      const reserve = fundingTotal - startupTotal;
      const reserveMonths = reserve / monthlyFixed;
      if (reserveMonths < RUNWAY_RESERVE_MONTHS) {
        flags.push({
          rule_id: "no_runway_buffer",
          severity: "warn",
          message: `After build-out you'd have ~${reserveMonths.toFixed(1)} months of fixed-cost runway. Aim for ≥${RUNWAY_RESERVE_MONTHS} months — most shops fail in months 4–9 because they only funded the build-out.`,
          evidence: `reserve ${formatCurrency(reserve)} ÷ fixed ${formatCurrency(monthlyFixed)}/mo`,
        });
      }
    }
  }

  // Rule 5 — break_even_too_late
  // Pure projection on the same numbers the charts use (TIM-716): when
  // cumulative profit clears zero, that's break-even.
  if (monthlyRevenue > 0) {
    const monthlyNet = monthlyRevenue - monthlyCogs - monthlyLabor - monthlyFixed;
    let breakEvenMonth: number | null = null;
    if (monthlyNet > 0) {
      let cumulative = -startupTotal;
      for (let m = 1; m <= PROJECTION_MONTHS; m += 1) {
        cumulative += monthlyNet;
        if (cumulative >= 0) {
          breakEvenMonth = m;
          break;
        }
      }
    }
    if (breakEvenMonth === null || breakEvenMonth > BREAK_EVEN_MAX_MONTH) {
      flags.push({
        rule_id: "break_even_too_late",
        severity: "warn",
        message:
          breakEvenMonth === null
            ? `On these numbers you never reach break-even within 12 months. Lenders won't underwrite past month 12 — revisit revenue or cost assumptions.`
            : `Projected break-even at month ${breakEvenMonth}. Lender comfort threshold is month 12 or sooner.`,
        evidence:
          breakEvenMonth === null
            ? `monthly net ${formatCurrency(monthlyNet)} given startup ${formatCurrency(startupTotal)}`
            : `month ${breakEvenMonth}`,
      });
    }
  }

  // Rule 6 — cogs_unrealistic
  if (cogsPct !== null) {
    if (cogsPct < COGS_BAND_MIN || cogsPct > COGS_BAND_MAX) {
      flags.push({
        rule_id: "cogs_unrealistic",
        severity: cogsPct < COGS_BAND_MIN ? "warn" : "error",
        message: `COGS at ${formatPct(cogsPct)} is outside the industry band of 25–32% (acceptable 22–38%). ${cogsPct < COGS_BAND_MIN ? "A figure this low usually means you forgot milk, syrups, cups, or waste." : "Margins this thin won't survive a rent or supplier price hike."}`,
        evidence: `cogs_percent = ${cogsPct}`,
      });
    }
  }

  return flags;
}

export type AiFindings = {
  last_run_at: string;
  flags: Flag[];
};

// Convenience: build the persisted `ai_findings` block in one place so the
// workspace API and any background recompute job stay consistent.
export function buildAiFindings(content: unknown, now: Date = new Date()): AiFindings {
  return {
    last_run_at: now.toISOString(),
    flags: runFinancialsSanityChecks(content),
  };
}
