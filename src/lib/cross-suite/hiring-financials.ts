// TIM-2426/TIM-2452: Hiring ↔ Financials headcount/payroll resolver.
//
// Pure detector: precomputed inputs in, one CrossSuiteConflict (or null) out.
// The data layer owns DB reads, the apply layer owns DB writes.
//
// TIM-2452 rewrite addresses board-rejected v1:
//   1. Canonical labor % is the financials side (Y1 budgeted payroll / Y1
//      revenue) — matches the consistency engine. Every label binds to it.
//   2. The "raise the budget" path no longer fires when the budget already
//      covers hiring's cost. When hiring's planned spend is BELOW the budget,
//      the path is reframed as "Update your financial plan to reflect the
//      hiring plan" (downward sync) and includes the headcount move so the
//      remaining mismatch is actually resolved.
//   3. Benchmark "within band" is computed numerically, never asserted.
//   4. Gap label leads with whichever side of the conflict is load-bearing —
//      headcount delta first when the budget has slack, the dollar gap first
//      when it overshoots. Band breach gets its own headline alert.
//   5. Phased-hires path differentiates itself from raise/sync by talking
//      about start-date staging instead of dollar moves.

import type {
  CrossSuiteConflict,
  ResolutionPath,
  DownstreamEffect,
} from "./types.ts";

export interface HiringRoleInput {
  id: string;
  role_title: string;
  headcount: number;
  monthly_cost_cents: number | null;
  start_date: string | null;
}

export interface FinancialsLaborInput {
  total_headcount: number;
  monthly_loaded_cost_cents: number;
}

export interface HiringFinancialsInputs {
  hiringRoles: HiringRoleInput[];
  financialsLabor: FinancialsLaborInput;
  monthlyRevenueCents: number;
  laborPctBand: { min: number; max: number; source: string } | null;
  currencyCode?: string;
}

function sumHeadcount(rows: HiringRoleInput[]): number {
  let total = 0;
  for (const r of rows) {
    const hc = Number(r.headcount ?? 0);
    if (Number.isFinite(hc) && hc > 0) total += Math.floor(hc);
  }
  return total;
}

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

function pickDeferralCandidates(
  rows: HiringRoleInput[],
  countToDefer: number,
): HiringRoleInput[] {
  if (countToDefer <= 0) return [];
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

function suggestionId(parts: string[]): string {
  return `cross_suite:${parts.join(":")}`;
}

// Classify a labor % against the benchmark band. Numerical, never visual.
type BandClassification = "below" | "within" | "above";
function classifyAgainstBand(
  pct: number,
  band: { min: number; max: number } | null,
): BandClassification | null {
  if (!band) return null;
  if (pct < band.min) return "below";
  if (pct > band.max) return "above";
  return "within";
}

function describeBandPosition(
  pct: number,
  band: { min: number; max: number } | null,
): string {
  const c = classifyAgainstBand(pct, band);
  if (!c || !band) return "";
  if (c === "within") return `within the ${fmtPct(band.min)} to ${fmtPct(band.max)} benchmark band`;
  if (c === "above") return `above the ${fmtPct(band.max)} benchmark ceiling`;
  return `below the ${fmtPct(band.min)} benchmark floor`;
}

export function detectHiringFinancialsConflict(
  input: HiringFinancialsInputs,
): CrossSuiteConflict | null {
  const cc = input.currencyCode ?? "USD";
  const hiringHeadcount = sumHeadcount(input.hiringRoles);
  const finHeadcount = Math.max(0, Math.floor(input.financialsLabor.total_headcount));

  // No conflict if either side is empty or both already agree on headcount.
  if (hiringHeadcount === 0 || finHeadcount === 0) return null;
  if (hiringHeadcount === finHeadcount) return null;

  const hiringMonthlyCents = sumHiringMonthlyPayrollCents(input.hiringRoles);
  const finMonthlyCents = input.financialsLabor.monthly_loaded_cost_cents;
  const monthlyRevenue = Math.max(0, input.monthlyRevenueCents);

  // ── Single source of truth for labor as % of revenue. ─────────────────────
  // Canonical = financials side = Y1 budgeted payroll / Y1 revenue. Matches
  // the consistency engine and the P&L. Every label in this resolver binds
  // to either `canonicalLaborPct` (the budgeted plan) or `hiringSideLaborPct`
  // (what the hiring suite would cost) — they are NEVER conflated.
  const canonicalLaborPct = monthlyRevenue > 0 ? finMonthlyCents / monthlyRevenue : 0;
  const hiringSideLaborPct = monthlyRevenue > 0 ? hiringMonthlyCents / monthlyRevenue : 0;

  const band = input.laborPctBand;
  const canonicalBandClass = classifyAgainstBand(canonicalLaborPct, band);

  // ── Benchmark zone 3 — anchor on canonical (financials) % ─────────────────
  const benchmark = (() => {
    if (!band || monthlyRevenue <= 0) return null;
    return {
      label: "Specialty shops at your revenue level typically spend",
      rangeLabel: `${fmtPct(band.min)} to ${fmtPct(band.max)} of revenue on labor`,
      rangeMin: band.min,
      rangeMax: band.max,
      currentValue: canonicalLaborPct,
      currentLabel: `Your budgeted payroll runs at ${fmtPct(canonicalLaborPct)} of revenue (${describeBandPosition(canonicalLaborPct, band)})`,
      anchorMinLabel: `${fmtUsdCents(Math.round(monthlyRevenue * band.min), cc)}/month`,
      anchorMaxLabel: `${fmtUsdCents(Math.round(monthlyRevenue * band.max), cc)}/month`,
      source: band.source,
    };
  })();

  // Promote a band breach to a top-level alert so the modal can headline it
  // — keeps the dollar slack from reading as exonerating.
  const bandBreachAlert = (() => {
    if (!band || monthlyRevenue <= 0) return undefined;
    if (canonicalBandClass === "above") {
      return `Your budgeted payroll runs at ${fmtPct(canonicalLaborPct)} of revenue, above the ${fmtPct(band.max)} ceiling for specialty cafes. Lenders flag this; either revenue needs to climb or labor needs to come down.`;
    }
    if (canonicalBandClass === "below") {
      return `Your budgeted payroll runs at ${fmtPct(canonicalLaborPct)} of revenue, below the ${fmtPct(band.min)} floor. Double-check the headcount and pay assumptions are realistic.`;
    }
    return undefined;
  })();

  // ── Side A snapshot (Hiring) ──────────────────────────────────────────────
  const suiteA = {
    suiteKey: "hiring",
    suiteLabel: "Hiring & Onboarding",
    fieldLabel: "People planned",
    displayValue: `${hiringHeadcount} ${hiringHeadcount === 1 ? "person" : "people"}`,
    displaySubvalue:
      hiringMonthlyCents > 0
        ? `${fmtUsdCents(hiringMonthlyCents, cc)}/month planned payroll`
        : undefined,
    deepLinkHref: "/workspace/hiring",
  };

  // ── Side B snapshot (Financials) ──────────────────────────────────────────
  const suiteB = {
    suiteKey: "financials",
    suiteLabel: "Financials",
    fieldLabel: "People budgeted",
    displayValue: `${finHeadcount} ${finHeadcount === 1 ? "person" : "people"}`,
    displaySubvalue:
      finMonthlyCents > 0
        ? `${fmtUsdCents(finMonthlyCents, cc)}/month budgeted payroll`
        : undefined,
    deepLinkHref: "/workspace/financials",
  };

  const hiringIsHigher = hiringHeadcount > finHeadcount;
  const headcountDelta = Math.abs(hiringHeadcount - finHeadcount);
  const costDeltaCents = hiringMonthlyCents - finMonthlyCents; // +ve = hiring overshoots budget
  const hiringOvershootsBudget = costDeltaCents > 0;

  // ── Gap label — frame around what's actually load-bearing ─────────────────
  const gapLabel = (() => {
    if (hiringOvershootsBudget) {
      return `Hiring would run ${fmtUsdCents(Math.abs(costDeltaCents), cc)}/month over the budgeted payroll.`;
    }
    // Hiring cost ≤ budget. Lead with headcount; treat the dollar gap as slack
    // so the modal doesn't read as "everything's fine, just a few extra people".
    const headcountLine = `Headcount gap: hiring plan ${hiringIsHigher ? "+" : "-"}${headcountDelta} ${headcountDelta === 1 ? "person" : "people"} vs financials.`;
    if (costDeltaCents < 0 && hiringIsHigher) {
      return `${headcountLine} (Budgeted payroll has ${fmtUsdCents(Math.abs(costDeltaCents), cc)}/month of slack at hiring's pay assumptions.)`;
    }
    return headcountLine;
  })();

  // Statement — same frame as gap label; voice mandate (no em-dashes,
  // no "leverage/unlock/elevate").
  const statement = (() => {
    if (hiringOvershootsBudget) {
      return "Your hiring plan and your financial plan disagree on how many people you'll have on payroll, and the hiring plan would cost more than the budget.";
    }
    return "Your hiring plan and your financial plan disagree on how many people you'll have on payroll.";
  })();

  // ── Paths ─────────────────────────────────────────────────────────────────

  // Path A — Trim hiring to match financials. Always available.
  const trimCandidates = hiringIsHigher
    ? pickDeferralCandidates(input.hiringRoles, headcountDelta)
    : [];
  const pathATrim: ResolutionPath = {
    id: "trim_hiring",
    label: hiringIsHigher
      ? "Trim the hiring plan to match your budget"
      : "Reduce financial headcount to match the hiring plan",
    summary: hiringIsHigher
      ? `Defer ${headcountDelta} role${headcountDelta === 1 ? "" : "s"} so the hiring plan matches the ${finHeadcount}-person budget. Operations runs leaner from day one.`
      : `Drop the financials payroll line to ${hiringHeadcount} people so both plans show the same headcount.`,
    downstreamEffects: hiringIsHigher
      ? buildTrimEffects(
          trimCandidates,
          hiringSideLaborPct,
          canonicalLaborPct,
          band,
          cc,
          hiringMonthlyCents,
          finMonthlyCents,
        )
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

  // Path B — Sync financials to the hiring plan. ONE path, different copy
  // depending on which direction the dollars move. Always bumps headcount
  // alongside the dollar change so the conflict actually resolves.
  const pathBSync: ResolutionPath = (() => {
    if (!hiringIsHigher) {
      // Inverted case (rare): hiring < financials → bump hiring to match.
      return {
        id: "raise_budget",
        label: "Increase hiring to match the financial plan",
        summary: `Add ${headcountDelta} role${headcountDelta === 1 ? "" : "s"} to the hiring plan so the headcount matches Financials' ${finHeadcount}-person budget.`,
        downstreamEffects: [
          {
            suite: "Hiring",
            field: "Roles",
            from: `${hiringHeadcount} planned`,
            to: `${finHeadcount} planned (${headcountDelta} new role${headcountDelta === 1 ? "" : "s"})`,
            risk: "info",
          },
        ],
        suggestions: [],
      };
    }
    if (hiringOvershootsBudget) {
      // Standard "raise budget" — dollars actually go UP.
      return {
        id: "raise_budget",
        label: "Raise the payroll budget to cover all planned hires",
        summary: `Keep all ${hiringHeadcount} hires. Increase Financials payroll budget from ${fmtUsdCents(finMonthlyCents, cc)} to ${fmtUsdCents(hiringMonthlyCents, cc)}/month and bump headcount on the financial plan to ${hiringHeadcount}.`,
        downstreamEffects: buildSyncEffects({
          hiringHeadcount,
          finHeadcount,
          hiringMonthlyCents,
          finMonthlyCents,
          monthlyRevenue,
          band,
          cc,
        }),
        suggestions: buildSyncSuggestions(hiringMonthlyCents, hiringHeadcount, cc),
      };
    }
    // Inverted dollars: hiring headcount higher, but hiring's per-head pay is
    // lower so the budget already has slack. The "raise the budget" copy is
    // wrong here; reframe as a downward sync.
    const slackCents = Math.abs(costDeltaCents);
    return {
      id: "raise_budget",
      label: "Update your financial plan to reflect the hiring plan",
      summary: `Sync Financials to ${hiringHeadcount} people at ${fmtUsdCents(hiringMonthlyCents, cc)}/month, matching the hiring plan. The budget actually drops by ${fmtUsdCents(slackCents, cc)}/month at hiring's pay assumptions.`,
      downstreamEffects: buildSyncEffects({
        hiringHeadcount,
        finHeadcount,
        hiringMonthlyCents,
        finMonthlyCents,
        monthlyRevenue,
        band,
        cc,
      }),
      suggestions: buildSyncSuggestions(hiringMonthlyCents, hiringHeadcount, cc),
    };
  })();

  // Path C — Phased hires. Only meaningful when hiring overshoots the budget
  // AND the benchmark says labor is above the ceiling. Otherwise the "phase"
  // story collapses into "trim now, possibly add later" with no clear trigger
  // and reads as a near-duplicate of trim_hiring.
  let pathCPhase: ResolutionPath | null = null;
  const phaseMonths = 3;
  const phaseEligible =
    hiringIsHigher &&
    hiringOvershootsBudget &&
    trimCandidates.length > 0 &&
    band !== null &&
    canonicalBandClass === "above";
  if (phaseEligible) {
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
      label: "Stage the hires — open with fewer, scale up once revenue confirms",
      summary: `Open day one with ${finHeadcount} people, then push the last ${headcountDelta} start date${headcountDelta === 1 ? "" : "s"} out to month ${phaseMonths + 1}. No budget change; the gap closes by delaying spend until revenue trajectory is proven.`,
      downstreamEffects: buildPhaseEffects(
        trimCandidates,
        hiringMonthlyCents,
        finMonthlyCents,
        monthlyRevenue,
        band,
        phaseMonths,
        cc,
      ),
      suggestions: phasedSuggestions,
    };
  }

  const paths = pathCPhase ? [pathATrim, pathBSync, pathCPhase] : [pathATrim, pathBSync];

  // Recommended path picking.
  // - If phased is on the table (budget overshoot + band breach), phased wins:
  //   it both saves money today and keeps labor% within band early.
  // - Otherwise if hiring overshoots budget, trim is recommended (safest move).
  // - When the budget has slack, sync downward is recommended — accepting the
  //   hiring plan costs less than the budget and resolves headcount mismatch.
  // - When hiring is lower than financials, the only meaningful move is the
  //   "increase hiring" path; recommend it.
  const recommendedPathId = (() => {
    if (pathCPhase) return "phased_hires";
    if (!hiringIsHigher) return "raise_budget";
    if (hiringOvershootsBudget) return "trim_hiring";
    return "raise_budget"; // downward sync
  })();

  return {
    id: "hiring_financials_headcount",
    kind: "numeric",
    statement,
    suiteA,
    suiteB,
    gapLabel,
    bandBreachAlert,
    benchmark,
    paths,
    recommendedPathId,
  };
}

// Two synced suggestions: bump the financials payroll budget AND bump the
// personnel headcount, so accepting the path fully resolves the conflict
// rather than leaving the headcount side stale.
function buildSyncSuggestions(
  hiringMonthlyCents: number,
  hiringHeadcount: number,
  cc: string,
) {
  return [
    {
      id: suggestionId(["hiring_financials_headcount", "raise_budget", "financials", "payroll", "monthly_cents"]),
      fieldId: "cross_suite:hiring_financials_headcount:raise_budget:financials:payroll:monthly_cents",
      fieldLabel: "Financials — Monthly payroll budget",
      originalValue: "(current)",
      proposedValue: fmtUsdCents(hiringMonthlyCents, cc),
      isStructured: true,
      workspaceLabel: "Financials",
    },
    {
      id: suggestionId(["hiring_financials_headcount", "raise_budget", "financials", "personnel", "headcount"]),
      fieldId: "cross_suite:hiring_financials_headcount:raise_budget:financials:personnel:headcount",
      fieldLabel: "Financials — Total budgeted headcount",
      originalValue: "(current)",
      proposedValue: String(hiringHeadcount),
      isStructured: true,
      workspaceLabel: "Financials",
    },
  ];
}

function buildSyncEffects(args: {
  hiringHeadcount: number;
  finHeadcount: number;
  hiringMonthlyCents: number;
  finMonthlyCents: number;
  monthlyRevenue: number;
  band: { min: number; max: number } | null;
  cc: string;
}): DownstreamEffect[] {
  const { hiringHeadcount, finHeadcount, hiringMonthlyCents, finMonthlyCents, monthlyRevenue, band, cc } = args;
  const out: DownstreamEffect[] = [];
  const delta = hiringMonthlyCents - finMonthlyCents;
  out.push({
    suite: "Financials",
    field: "Budgeted headcount",
    from: `${finHeadcount} ${finHeadcount === 1 ? "person" : "people"}`,
    to: `${hiringHeadcount} ${hiringHeadcount === 1 ? "person" : "people"}`,
    risk: "info",
  });
  out.push({
    suite: "Financials",
    field: "Monthly payroll budget",
    from: `${fmtUsdCents(finMonthlyCents, cc)}/month`,
    to: `${fmtUsdCents(hiringMonthlyCents, cc)}/month`,
    risk: "info",
  });
  if (delta !== 0) {
    out.push({
      suite: "Financials",
      field: "Monthly net change",
      from: "—",
      to: delta > 0
        ? `Payroll increases by ${fmtUsdCents(delta, cc)}/month`
        : `Payroll decreases by ${fmtUsdCents(-delta, cc)}/month`,
      risk: delta > 0 ? "warn" : "info",
    });
  }
  if (band && monthlyRevenue > 0) {
    const newPct = hiringMonthlyCents / monthlyRevenue;
    const cls = classifyAgainstBand(newPct, band);
    const risk: DownstreamEffect["risk"] = cls === "above" ? "block" : cls === "below" ? "warn" : "info";
    out.push({
      suite: "Plan",
      field: "Labor as % of revenue",
      from: fmtPct(finMonthlyCents / monthlyRevenue),
      to: fmtPct(newPct),
      risk,
      note: describeBandPosition(newPct, band),
    });
  }
  return out;
}

function buildTrimEffects(
  toDefer: Array<{ role_title: string; headcount: number; monthly_cost_cents: number | null }>,
  hiringSideLaborPct: number,
  canonicalLaborPct: number,
  band: { min: number; max: number } | null,
  cc: string,
  hiringMonthlyCents: number,
  finMonthlyCents: number,
): DownstreamEffect[] {
  const out: DownstreamEffect[] = [];
  out.push({
    suite: "Hiring",
    field: "Monthly payroll if all planned roles are filled",
    from: `${fmtUsdCents(hiringMonthlyCents, cc)}/month`,
    to: `${fmtUsdCents(finMonthlyCents, cc)}/month`,
    risk: "info",
  });
  if (band) {
    // Trim only changes the HIRING-side number. The Financials BUDGET — and
    // therefore the canonical labor % — does not move. Be explicit so the
    // owner doesn't read this as a fix for a band breach.
    out.push({
      suite: "Plan",
      field: "Hiring plan cost as % of revenue",
      from: fmtPct(hiringSideLaborPct),
      to: fmtPct(canonicalLaborPct),
      risk: "info",
      note: `Matches the budgeted labor % after trim, ${describeBandPosition(canonicalLaborPct, band)}`,
    });
    out.push({
      suite: "Plan",
      field: "Budgeted labor as % of revenue",
      from: fmtPct(canonicalLaborPct),
      to: `${fmtPct(canonicalLaborPct)} (unchanged)`,
      risk: classifyAgainstBand(canonicalLaborPct, band) === "above" ? "warn" : "info",
      note: `Trim adjusts the hiring plan only; the budget still runs ${describeBandPosition(canonicalLaborPct, band)}`,
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
  const startPct = monthlyRevenue > 0 ? finMonthlyCents / monthlyRevenue : 0;
  const fullPct = monthlyRevenue > 0 ? hiringMonthlyCents / monthlyRevenue : 0;
  out.push({
    suite: "Financials",
    field: `Months 1–${phaseMonths} payroll`,
    from: `${fmtUsdCents(hiringMonthlyCents, cc)}/month (planned)`,
    to: `${fmtUsdCents(finMonthlyCents, cc)}/month (actual, with deferred starts)`,
    risk: "info",
    note: band && monthlyRevenue > 0
      ? `${fmtPct(startPct)} of revenue, ${describeBandPosition(startPct, band)}`
      : undefined,
  });
  out.push({
    suite: "Financials",
    field: `Month ${phaseMonths + 1}+ payroll`,
    from: "—",
    to: `${fmtUsdCents(hiringMonthlyCents, cc)}/month once deferred roles start`,
    risk: classifyAgainstBand(fullPct, band) === "above" ? "warn" : "info",
    note: band && monthlyRevenue > 0
      ? `${fmtPct(fullPct)} of revenue, ${describeBandPosition(fullPct, band)} — assumes revenue trajectory confirmed`
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
