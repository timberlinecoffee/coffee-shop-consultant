// TIM-2426: Hiring ↔ Financials headcount/payroll resolver.
//
// First implementation of the cross-suite resolver pattern. Detects when the
// Hiring & Onboarding suite plans for a different number of people than the
// Financials suite budgets for, and builds the three resolution paths the
// modal renders.
//
// Pure: takes precomputed inputs, returns one CrossSuiteConflict (or null).
// The data layer (the GET route) owns all DB reads. The apply layer (the
// AIReviewModal onApply handoff + POST route) owns all DB writes.

import type { CrossSuiteConflict, ResolutionPath, DownstreamEffect } from "./types.ts";

// Input shape — what the GET route gathers from hiring_plan_roles +
// financial_models.forecast_inputs and hands the pure detector.
export interface HiringRoleInput {
  id: string;
  role_title: string;
  headcount: number;
  monthly_cost_cents: number | null;
  start_date: string | null;
}

export interface FinancialsLaborInput {
  // total_headcount summed across financial_models.forecast_inputs.personnel.
  total_headcount: number;
  // Steady-state monthly payroll the financials currently model. Computed by
  // the existing buildPlanState() pass.
  monthly_loaded_cost_cents: number;
}

export interface HiringFinancialsInputs {
  // Hiring suite rows. Already filtered to non-archived in the data layer.
  hiringRoles: HiringRoleInput[];
  // Financials suite labor totals.
  financialsLabor: FinancialsLaborInput;
  // Y1 monthly revenue used for the benchmark band. Pass 0 to skip the
  // benchmark (no revenue forecast yet → no comparable band).
  monthlyRevenueCents: number;
  // Industry benchmark range for labor as % of revenue. The detector reads
  // this from the loaded benchmarks dataset; passing it in keeps the function
  // pure and easy to unit-test.
  laborPctBand: { min: number; max: number; source: string } | null;
  // Currency code for display formatting. Default USD.
  currencyCode?: string;
}

// Sum the headcount column. Negative / non-finite values are clamped to 0 so
// a single bad row doesn't make the detector fire spurious totals.
function sumHeadcount(rows: HiringRoleInput[]): number {
  let total = 0;
  for (const r of rows) {
    const hc = Number(r.headcount ?? 0);
    if (Number.isFinite(hc) && hc > 0) total += Math.floor(hc);
  }
  return total;
}

// Sum monthly_cost_cents × headcount across hiring_plan_roles. Mirrors how the
// hiring workspace renders its own payroll subtotal column.
function sumHiringMonthlyPayrollCents(rows: HiringRoleInput[]): number {
  let total = 0;
  for (const r of rows) {
    const hc = Math.max(0, Number(r.headcount ?? 0));
    const cost = Number(r.monthly_cost_cents ?? 0);
    if (!Number.isFinite(hc) || !Number.isFinite(cost)) continue;
    total += Math.round(hc * cost);
  }
  return Math.round(total);
}

function fmtUsdCents(cents: number, cc = "USD"): string {
  const dollars = Math.round(cents) / 100;
  const abs = Math.abs(dollars);
  const symbol = cc === "USD" ? "$" : `${cc} `;
  const formatted = Math.round(abs).toLocaleString("en-US");
  return `${dollars < 0 ? "-" : ""}${symbol}${formatted}`;
}

function fmtPct(value: number): string {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

// Pick the lowest-priority hiring rows to defer for Path A / Path C — newest
// rows first (highest created_at, but we only have id + role_title in scope;
// the GET route already passes them ordered by created_at so we just take from
// the end).
function pickDeferralCandidates(
  rows: HiringRoleInput[],
  countToDefer: number,
): HiringRoleInput[] {
  if (countToDefer <= 0) return [];
  // Walk from the end of the list collecting positive-headcount roles until we
  // have enough headcount to defer. Each role contributes role.headcount slots;
  // when we hit the target the loop stops.
  const out: HiringRoleInput[] = [];
  let collected = 0;
  for (let i = rows.length - 1; i >= 0 && collected < countToDefer; i--) {
    const r = rows[i];
    if (!r || !Number.isFinite(r.headcount) || r.headcount <= 0) continue;
    out.unshift(r);
    collected += r.headcount;
  }
  return out;
}

// Add N months to a YYYY-MM-DD string. Pure date math, no Date() side-effects.
// Returns null when the input doesn't parse.
function shiftMonths(iso: string | null, monthsToAdd: number): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + monthsToAdd;
  const d = Number(m[3]);
  const newY = y + Math.floor(mo / 12);
  const newM = ((mo % 12) + 12) % 12;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${newY}-${pad(newM + 1)}-${pad(d)}`;
}

// Make a stable suggestion id from the conflict + path + record + field.
function suggestionId(parts: string[]): string {
  return `cross_suite:${parts.join(":")}`;
}

export function detectHiringFinancialsConflict(
  input: HiringFinancialsInputs,
): CrossSuiteConflict | null {
  const cc = input.currencyCode ?? "USD";
  const hiringHeadcount = sumHeadcount(input.hiringRoles);
  const finHeadcount = Math.max(0, Math.floor(input.financialsLabor.total_headcount));

  // No conflict if either side is unset (one suite empty isn't a contradiction,
  // it's a not-yet-filled-in workspace).
  if (hiringHeadcount === 0 || finHeadcount === 0) return null;
  // No conflict if both agree on headcount.
  if (hiringHeadcount === finHeadcount) return null;

  const hiringMonthlyCents = sumHiringMonthlyPayrollCents(input.hiringRoles);
  const finMonthlyCents = input.financialsLabor.monthly_loaded_cost_cents;
  const gapCents = hiringMonthlyCents - finMonthlyCents;

  const monthlyRevenue = Math.max(0, input.monthlyRevenueCents);
  const currentLaborPct = monthlyRevenue > 0
    ? hiringMonthlyCents / monthlyRevenue
    : 0;

  // Benchmark zone (zone 3) — only when we have both a revenue figure to anchor
  // dollar values AND a band from the dataset.
  const benchmark = (() => {
    if (!input.laborPctBand || monthlyRevenue <= 0) return null;
    const { min, max, source } = input.laborPctBand;
    return {
      label: "Specialty shops at your revenue level typically spend",
      rangeLabel: `${fmtPct(min)} to ${fmtPct(max)} of revenue`,
      rangeMin: min,
      rangeMax: max,
      currentValue: currentLaborPct,
      currentLabel: `Your hiring plan: ${fmtPct(currentLaborPct)} of revenue`,
      anchorMinLabel: `${fmtUsdCents(Math.round(monthlyRevenue * min), cc)}/month`,
      anchorMaxLabel: `${fmtUsdCents(Math.round(monthlyRevenue * max), cc)}/month`,
      source,
    };
  })();

  // ── Side A snapshot (Hiring) ───────────────────────────────────────────────
  const suiteA = {
    suiteKey: "hiring",
    suiteLabel: "Hiring & Onboarding",
    fieldLabel: "People planned",
    displayValue: `${hiringHeadcount} ${hiringHeadcount === 1 ? "person" : "people"}`,
    displaySubvalue:
      hiringMonthlyCents > 0
        ? `${fmtUsdCents(hiringMonthlyCents, cc)}/month payroll`
        : undefined,
    deepLinkHref: "/workspace/hiring",
  };

  // ── Side B snapshot (Financials) ───────────────────────────────────────────
  const suiteB = {
    suiteKey: "financials",
    suiteLabel: "Financials",
    fieldLabel: "People budgeted",
    displayValue: `${finHeadcount} ${finHeadcount === 1 ? "person" : "people"}`,
    displaySubvalue:
      finMonthlyCents > 0
        ? `${fmtUsdCents(finMonthlyCents, cc)}/month payroll`
        : undefined,
    deepLinkHref: "/workspace/financials",
  };

  const gapLabel = gapCents !== 0
    ? `Gap: ${fmtUsdCents(Math.abs(gapCents), cc)}/month ${gapCents > 0 ? "over budget" : "under budget"}`
    : undefined;

  // ── Build the three resolution paths ───────────────────────────────────────

  // The headcount difference. When Hiring > Financials the overshoot is the
  // delta on the hiring side; otherwise it's roles missing in financials.
  const headcountDelta = Math.abs(hiringHeadcount - finHeadcount);
  const hiringIsHigher = hiringHeadcount > finHeadcount;

  // Path A — Trim hiring to match financials.
  const trimCandidates = hiringIsHigher
    ? pickDeferralCandidates(input.hiringRoles, headcountDelta)
    : [];
  const pathATrim: ResolutionPath = {
    id: "trim_hiring",
    label: hiringIsHigher
      ? "Trim the hiring plan to match your budget"
      : "Reduce financial headcount to match the hiring plan",
    summary: hiringIsHigher
      ? `Reduce from ${hiringHeadcount} → ${finHeadcount} people. Remove the last ${headcountDelta} role${headcountDelta === 1 ? "" : "s"} before opening.`
      : `Reduce financials payroll line so it covers ${hiringHeadcount} people, matching the hiring plan.`,
    downstreamEffects: hiringIsHigher
      ? buildTrimEffects(trimCandidates, hiringMonthlyCents, finMonthlyCents, monthlyRevenue, input.laborPctBand, cc)
      : [
          {
            suite: "Financials",
            field: "Payroll line",
            from: `${finHeadcount} people, ${fmtUsdCents(finMonthlyCents, cc)}/month`,
            to: `${hiringHeadcount} people, ${fmtUsdCents(hiringMonthlyCents, cc)}/month`,
            risk: "info",
          },
        ],
    suggestions: hiringIsHigher
      ? trimCandidates.map((r) => ({
          id: suggestionId(["hiring_financials_headcount", "trim_hiring", "hiring", r.id, "headcount"]),
          fieldId: `cross_suite:hiring_financials_headcount:trim_hiring:hiring:${r.id}:headcount`,
          fieldLabel: `Hiring — ${r.role_title || "Untitled role"} headcount`,
          originalValue: String(r.headcount),
          proposedValue: "0",
          isStructured: true,
          workspaceLabel: "Hiring & Onboarding",
        }))
      : [],
  };

  // Path B — Raise financials budget to cover the hiring plan.
  const pathBRaise: ResolutionPath = {
    id: "raise_budget",
    label: hiringIsHigher
      ? "Raise the payroll budget to cover all planned hires"
      : "Increase hiring to match the financial plan",
    summary: hiringIsHigher
      ? `Keep all ${hiringHeadcount} hires. Update Financials payroll budget from ${fmtUsdCents(finMonthlyCents, cc)} to ${fmtUsdCents(hiringMonthlyCents, cc)}/month.`
      : `Add ${headcountDelta} role${headcountDelta === 1 ? "" : "s"} to the hiring plan so the headcount matches Financials.`,
    downstreamEffects: hiringIsHigher
      ? buildRaiseEffects(hiringMonthlyCents, finMonthlyCents, monthlyRevenue, input.laborPctBand, cc)
      : [
          {
            suite: "Hiring",
            field: "Roles",
            from: `${hiringHeadcount} planned`,
            to: `${finHeadcount} planned (${headcountDelta} new role${headcountDelta === 1 ? "" : "s"})`,
            risk: "info",
          },
        ],
    suggestions: hiringIsHigher
      ? [
          {
            id: suggestionId(["hiring_financials_headcount", "raise_budget", "financials", "payroll", "monthly_cents"]),
            fieldId: "cross_suite:hiring_financials_headcount:raise_budget:financials:payroll:monthly_cents",
            fieldLabel: "Financials — Monthly payroll budget",
            originalValue: fmtUsdCents(finMonthlyCents, cc),
            proposedValue: fmtUsdCents(hiringMonthlyCents, cc),
            isStructured: true,
            workspaceLabel: "Financials",
          },
        ]
      : [],
  };

  // Path C — Phased hires (only meaningful when hiring exceeds budget AND
  // benchmark suggests starting at the lower end). Otherwise we omit and the
  // modal falls back to the two main paths.
  let pathCPhase: ResolutionPath | null = null;
  if (hiringIsHigher && trimCandidates.length > 0) {
    const phaseMonths = 3; // open at finHeadcount, add the rest in month 4
    const phasedSuggestions = trimCandidates
      .filter((r) => r.start_date)
      .map((r) => ({
        id: suggestionId(["hiring_financials_headcount", "phased_hires", "hiring", r.id, "start_date"]),
        fieldId: `cross_suite:hiring_financials_headcount:phased_hires:hiring:${r.id}:start_date`,
        fieldLabel: `Hiring — ${r.role_title || "Untitled role"} start date`,
        originalValue: r.start_date ?? "—",
        proposedValue: shiftMonths(r.start_date, phaseMonths) ?? "(shift +3 months)",
        isStructured: true,
        workspaceLabel: "Hiring & Onboarding",
      }));
    pathCPhase = {
      id: "phased_hires",
      label: "Phase the hires — open with fewer, scale up later",
      summary: `Open with ${finHeadcount} people (within benchmark). Bring on the remaining ${trimCandidates.reduce((a, r) => a + r.headcount, 0)} in month ${phaseMonths + 1} once revenue trajectory is confirmed.`,
      downstreamEffects: buildPhaseEffects(
        trimCandidates,
        hiringMonthlyCents,
        finMonthlyCents,
        monthlyRevenue,
        input.laborPctBand,
        phaseMonths,
        cc,
      ),
      suggestions: phasedSuggestions,
    };
  }

  const paths = pathCPhase ? [pathATrim, pathBRaise, pathCPhase] : [pathATrim, pathBRaise];

  // Pick recommended: when benchmark shows the current hiring puts the plan
  // above the band AND phased is available, Phase wins. Otherwise Trim.
  const recommendedPathId = (() => {
    if (pathCPhase && benchmark && benchmark.currentValue > benchmark.rangeMax) return "phased_hires";
    if (hiringIsHigher) return "trim_hiring";
    return "raise_budget";
  })();

  return {
    id: "hiring_financials_headcount",
    kind: "numeric",
    statement:
      "Your hiring plan and financial plan disagree on how many people you'll have on payroll.",
    suiteA,
    suiteB,
    gapLabel,
    benchmark,
    paths,
    recommendedPathId,
  };
}

function buildTrimEffects(
  toDefer: Array<{ role_title: string; headcount: number; monthly_cost_cents: number | null }>,
  hiringMonthlyCents: number,
  finMonthlyCents: number,
  monthlyRevenue: number,
  band: { min: number; max: number } | null,
  cc: string,
): DownstreamEffect[] {
  const out: DownstreamEffect[] = [];
  out.push({
    suite: "Financials",
    field: "Monthly payroll",
    from: `${fmtUsdCents(hiringMonthlyCents, cc)}/month`,
    to: `${fmtUsdCents(finMonthlyCents, cc)}/month`,
    risk: "info",
  });
  if (band && monthlyRevenue > 0) {
    const newPct = finMonthlyCents / monthlyRevenue;
    const inRange = newPct >= band.min && newPct <= band.max;
    out.push({
      suite: "Plan",
      field: "Labor as % of revenue",
      from: `${fmtPct(hiringMonthlyCents / monthlyRevenue)}`,
      to: `${fmtPct(newPct)}`,
      risk: inRange ? "info" : "warn",
      note: inRange ? "within benchmark band" : "still outside benchmark band",
    });
  }
  for (const role of toDefer) {
    out.push({
      suite: "Hiring",
      field: role.role_title || "Untitled role",
      from: `${role.headcount} planned`,
      to: "deferred (headcount 0)",
      risk: "info",
    });
  }
  out.push({
    suite: "Operations",
    field: "Coverage risk",
    from: "—",
    to: "Morning rush may need schedule tightening with fewer hands",
    risk: "warn",
  });
  return out;
}

function buildRaiseEffects(
  hiringMonthlyCents: number,
  finMonthlyCents: number,
  monthlyRevenue: number,
  band: { min: number; max: number } | null,
  cc: string,
): DownstreamEffect[] {
  const out: DownstreamEffect[] = [];
  const delta = hiringMonthlyCents - finMonthlyCents;
  out.push({
    suite: "Financials",
    field: "Monthly payroll",
    from: `${fmtUsdCents(finMonthlyCents, cc)}/month`,
    to: `${fmtUsdCents(hiringMonthlyCents, cc)}/month`,
    risk: "info",
  });
  out.push({
    suite: "Financials",
    field: "Monthly net change",
    from: "—",
    to: `${fmtUsdCents(-delta, cc)} (payroll increases by ${fmtUsdCents(delta, cc)}/month)`,
    risk: "warn",
  });
  if (band && monthlyRevenue > 0) {
    const newPct = hiringMonthlyCents / monthlyRevenue;
    const above = newPct > band.max;
    out.push({
      suite: "Plan",
      field: "Labor as % of revenue",
      from: fmtPct(finMonthlyCents / monthlyRevenue),
      to: fmtPct(newPct),
      risk: above ? "block" : "info",
      note: above
        ? "outside benchmark range — lenders will flag this"
        : "within benchmark band",
    });
  }
  return out;
}

function buildPhaseEffects(
  toDefer: Array<{ role_title: string; headcount: number; start_date: string | null }>,
  hiringMonthlyCents: number,
  finMonthlyCents: number,
  monthlyRevenue: number,
  band: { min: number; max: number } | null,
  phaseMonths: number,
  cc: string,
): DownstreamEffect[] {
  const out: DownstreamEffect[] = [];
  out.push({
    suite: "Financials",
    field: `Months 1–${phaseMonths} payroll`,
    from: `${fmtUsdCents(hiringMonthlyCents, cc)}/month`,
    to: `${fmtUsdCents(finMonthlyCents, cc)}/month`,
    risk: "info",
    note: band && monthlyRevenue > 0
      ? `${fmtPct(finMonthlyCents / monthlyRevenue)} of revenue — within ${fmtPct(band.min)}-${fmtPct(band.max)} band`
      : undefined,
  });
  out.push({
    suite: "Financials",
    field: `Month ${phaseMonths + 1}+ payroll`,
    from: "—",
    to: `${fmtUsdCents(hiringMonthlyCents, cc)}/month`,
    risk: "info",
    note: band && monthlyRevenue > 0
      ? `${fmtPct(hiringMonthlyCents / monthlyRevenue)} of revenue — assumes revenue trajectory confirmed`
      : undefined,
  });
  for (const role of toDefer) {
    out.push({
      suite: "Hiring",
      field: `${role.role_title || "Untitled role"} start date`,
      from: role.start_date ?? "month 1",
      to: shiftMonths(role.start_date, phaseMonths) ?? `month ${phaseMonths + 1}`,
      risk: "info",
    });
  }
  out.push({
    suite: "Operations",
    field: "Coverage trigger",
    from: "—",
    to: `Add the remaining hires when month-${phaseMonths} revenue confirms the forecast`,
    risk: "info",
  });
  return out;
}
