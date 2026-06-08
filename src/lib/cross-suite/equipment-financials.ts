// TIM-2481 (F12): Buildout grid total ↔ Financials startup_costs.equipment_cents
// resolver.
//
// Pure detector matching the hiring-financials.ts / menu-ticket.ts shape:
// precomputed inputs in, one CrossSuiteConflict (or null) out. Data layer
// (cross-suite-resolver route.ts) owns DB reads; apply layer owns DB writes.
//
// Problem framing — from the F12 audit finding (mirrors source-suite-checks.ts
// Check 2 / src:capex_equipment_mismatch):
//   The buildout grid in Equipment & Supplies is the per-item source of truth
//   for what a founder is buying. The Financials startup_costs.equipment_cents
//   line is a lump sum that flows into Use of Funds and the depreciation
//   schedule. If the founder later adds or removes items in the grid but
//   never updates the lump sum (or vice versa), lenders trace every CapEx
//   dollar back to the equipment list and the trace silently breaks.
//
// Resolution paths surfaced to the owner:
//   A. Sync Financials equipment lump sum to the buildout grid total (typical
//      fix — the grid reflects reality, the lump sum lags).
//   B. Re-edit the buildout grid items so the total matches Financials (rare;
//      used when the lump sum was the lender-anchored figure).
//
// Tolerance — max($100, 1% of the financials capex side). Matches the audit
// check exactly so the resolver and the audit agree on what counts as a real
// mismatch (no false positives on penny rounding; no quiet $1k drift).

import type {
  CrossSuiteConflict,
  ResolutionPath,
  DownstreamEffect,
} from "./types.ts";

export interface EquipmentMismatchInputs {
  // Sum of (unit_cost_cents * quantity) across active, non-archived items in
  // the Equipment & Supplies workspace. Caller computes; passes 0 when no
  // priced items exist.
  buildoutGridTotalCents: number;
  // Current startup_costs.equipment_cents on the financial model. Drives the
  // capex / depreciation lines. 0 when never entered.
  financialsEquipmentCents: number;
  // Count of active (non-archived, priced) buildout items. Used in the
  // statement so the owner sees how big the equipment list is.
  activeBuildoutItemCount: number;
  currencyCode?: string;
}

// Tolerance — both sides must clear. Exported so the workspace banner and the
// detector agree on what counts as a meaningful drift. Mirrors
// source-suite-checks.ts Check 2 (src:capex_equipment_mismatch).
export const EQUIPMENT_REL_TOLERANCE = 0.01; // 1% relative
export const EQUIPMENT_ABS_TOLERANCE_CENTS = 10_000; // $100 absolute floor

function fmtCents(cents: number, cc = "USD"): string {
  const dollars = Math.round(cents) / 100;
  const abs = Math.abs(dollars);
  const symbol = cc === "USD" ? "$" : `${cc} `;
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${dollars < 0 ? "-" : ""}${symbol}${formatted}`;
}

function suggestionId(parts: string[]): string {
  return `cross_suite:${parts.join(":")}`;
}

// Exported so workspace banners can call this once and decide whether to
// render — keeps the "what counts as a drift" decision in one place. The
// tolerance is `max(abs, capex * rel)` so a small plan ($5k equipment)
// doesn't fire on a $40 difference and a big plan ($500k equipment) still
// fires on a $5,001 difference.
export function isEquipmentDriftMeaningful(
  buildoutGridTotalCents: number,
  financialsEquipmentCents: number,
): boolean {
  if (buildoutGridTotalCents <= 0) return false;
  if (financialsEquipmentCents <= 0) return false;
  const delta = Math.abs(buildoutGridTotalCents - financialsEquipmentCents);
  const tolerance = Math.max(
    EQUIPMENT_ABS_TOLERANCE_CENTS,
    Math.round(financialsEquipmentCents * EQUIPMENT_REL_TOLERANCE),
  );
  return delta > tolerance;
}

export function detectEquipmentMismatch(
  input: EquipmentMismatchInputs,
): CrossSuiteConflict | null {
  const cc = input.currencyCode ?? "USD";
  const gridCents = Math.max(0, Math.round(input.buildoutGridTotalCents));
  const finCents = Math.max(0, Math.round(input.financialsEquipmentCents));

  // Either side missing → nothing to reconcile. The buildout workspace shows
  // its own "Add equipment" empty state; we don't reproduce it here.
  if (gridCents <= 0) return null;
  if (finCents <= 0) return null;
  if (input.activeBuildoutItemCount <= 0) return null;
  if (!isEquipmentDriftMeaningful(gridCents, finCents)) return null;

  const deltaCents = gridCents - finCents; // +ve = grid total > financials lump sum
  const gridHigher = deltaCents > 0;
  const itemCount = input.activeBuildoutItemCount;

  const suiteA = {
    suiteKey: "buildout-equipment",
    suiteLabel: "Equipment & Supplies",
    fieldLabel: "Buildout grid total",
    displayValue: `${fmtCents(gridCents, cc)}`,
    displaySubvalue: `Sum of ${itemCount} priced item${itemCount === 1 ? "" : "s"}`,
    deepLinkHref: "/workspace/buildout-equipment",
  };
  const suiteB = {
    suiteKey: "financials",
    suiteLabel: "Financials",
    fieldLabel: "Use of Funds: Equipment",
    displayValue: `${fmtCents(finCents, cc)}`,
    displaySubvalue: "Drives capex, depreciation, opening total",
    deepLinkHref: "/workspace/financials",
  };

  const statement = gridHigher
    ? "Your equipment list adds up to more than your financial plan has budgeted. Lenders trace every CapEx dollar back to the equipment list; until the two agree, that trace breaks."
    : "Your financial plan has budgeted more for equipment than your equipment list adds up to. Lenders trace every CapEx dollar back to the equipment list; until the two agree, the trace breaks.";

  const gapLabel = `Gap: ${fmtCents(Math.abs(deltaCents), cc)} between the buildout grid and Financials Use of Funds.`;

  // ── Path A — Sync Financials to the buildout grid (typical fix) ──────────
  const pathASync: ResolutionPath = {
    id: "sync_financials_to_buildout",
    label: "Sync Financials equipment line to the buildout grid",
    summary: `Update Financials → startup_costs equipment from ${fmtCents(finCents, cc)} to ${fmtCents(gridCents, cc)} so the capex line reflects the priced equipment list. Recommended when the buildout grid is the source of truth.`,
    downstreamEffects: buildSyncFinancialsEffects(finCents, gridCents, cc),
    suggestions: [
      {
        id: suggestionId([
          "equipment_mismatch",
          "sync_financials_to_buildout",
          "financials",
          "startup",
          "equipment_cents",
        ]),
        fieldId:
          "cross_suite:equipment_mismatch:sync_financials_to_buildout:financials:startup:equipment_cents",
        fieldLabel: "Financials -- Equipment line (startup_costs)",
        originalValue: fmtCents(finCents, cc),
        proposedValue: fmtCents(gridCents, cc),
        isStructured: true,
        workspaceLabel: "Financials",
      },
    ],
  };

  // ── Path B — Pin the buildout grid to match Financials (rare) ────────────
  // No structured field write — re-editing the equipment list is a per-item
  // decision. We surface the intent so the owner can act in the buildout
  // workspace.
  const pathBPinGrid: ResolutionPath = {
    id: "reprice_buildout_to_financials",
    label: "Re-edit the buildout grid to match the Financials line",
    summary: `Adjust items in Equipment & Supplies so the grid total lands at ${fmtCents(finCents, cc)}. Use when the Financials capex line is anchored to a lender commitment or external bid you don't want to move.`,
    downstreamEffects: [
      {
        suite: "Equipment & Supplies",
        field: "Item costs",
        from: `Current total ${fmtCents(gridCents, cc)}`,
        to: `Target total ${fmtCents(finCents, cc)}`,
        risk: "warn",
        note: "Re-pricing is a per-item decision; the Equipment & Supplies workspace is the right place to make it.",
      },
      {
        suite: "Financials",
        field: "Use of Funds: Equipment",
        from: `${fmtCents(finCents, cc)} (unchanged)`,
        to: `${fmtCents(finCents, cc)} (unchanged)`,
        risk: "info",
      },
    ],
    suggestions: [],
  };

  return {
    id: "equipment_mismatch",
    kind: "numeric",
    statement,
    suiteA,
    suiteB,
    gapLabel,
    benchmark: null,
    paths: [pathASync, pathBPinGrid],
    recommendedPathId: "sync_financials_to_buildout",
  };
}

function buildSyncFinancialsEffects(
  finCents: number,
  gridCents: number,
  cc: string,
): DownstreamEffect[] {
  const delta = gridCents - finCents;
  const direction = delta > 0 ? "up" : "down";
  return [
    {
      suite: "Financials",
      field: "Use of Funds: Equipment",
      from: `${fmtCents(finCents, cc)}`,
      to: `${fmtCents(gridCents, cc)}`,
      risk: "info",
    },
    {
      suite: "Financials",
      field: "Opening startup total",
      from: "(empty)",
      to: delta > 0
        ? `Total opening cost rises by ${fmtCents(Math.abs(delta), cc)}`
        : `Total opening cost drops by ${fmtCents(Math.abs(delta), cc)}`,
      risk: delta > 0 ? "warn" : "info",
    },
    {
      suite: "Plan",
      field: "Depreciation schedule",
      from: "(empty)",
      to: delta > 0
        ? "Annual equipment depreciation rises proportionally with the higher capex base"
        : "Annual equipment depreciation drops proportionally with the lower capex base",
      risk: "info",
      note: `Equipment moves ${direction} ${fmtCents(Math.abs(delta), cc)} on the capex line`,
    },
  ];
}
