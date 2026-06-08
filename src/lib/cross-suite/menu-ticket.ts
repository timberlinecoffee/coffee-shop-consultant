// TIM-2482 (F13): Menu ↔ Forecast Inputs avg ticket resolver.
//
// Pure detector matching the hiring-financials.ts shape: precomputed inputs in,
// one CrossSuiteConflict (or null) out. Data layer (cross-suite-resolver
// route.ts) owns DB reads; apply layer owns DB writes.
//
// Problem framing — from the F13 audit finding:
//   ForecastInputs.avg_ticket_cents drives every revenue surface (P&L, break-
//   even, ratios, runway). Founder builds an $8.20-blended menu in Menu-
//   Pricing, never opens Forecast Inputs, all financials silently run on the
//   $7.50 default. The Menu workspace had per-item MSRP but no
//   blendedTicketCentsFromMenu() selector, so no path existed to reconcile
//   the two surfaces.
//
// Resolution paths surfaced to the owner:
//   A. Sync Forecast Inputs to the menu blend (typical fix — menu reflects
//      reality, forecast lags).
//   B. Update the menu to match the forecast ticket (when the forecast is
//      pinned to a known POS reading or external benchmark).
//
// Tolerance — 5% relative OR 25¢ absolute, whichever is wider. Tighter than
// that triggers false positives on every penny-rounding edit; wider than that
// lets a $1 drift hide.

import type {
  CrossSuiteConflict,
  ResolutionPath,
  DownstreamEffect,
} from "./types.ts";

export interface MenuTicketMismatchInputs {
  // Pre-blended menu ticket (cents). Caller computes via
  // blendedTicketCentsFromMenu() and passes null when the menu has no priced
  // items.
  menuBlendedTicketCents: number | null;
  // Current Forecast Inputs avg_ticket_cents — the value that actually drives
  // the financial projections.
  forecastAvgTicketCents: number;
  // Active menu item count (post-archive, post-zero-price filter). Used in the
  // statement so the owner sees how big the menu sample is.
  activeMenuItemCount: number;
  currencyCode?: string;
}

// Tolerance constants are exported so the workspace banner and the detector
// agree on what counts as a meaningful drift.
export const MENU_TICKET_REL_TOLERANCE = 0.05; // 5% relative
export const MENU_TICKET_ABS_TOLERANCE_CENTS = 25; // 25¢ absolute floor

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
// render — keeps the "what counts as a drift" decision in one place.
export function isMenuTicketDriftMeaningful(
  menuBlendedTicketCents: number | null,
  forecastAvgTicketCents: number,
): boolean {
  if (menuBlendedTicketCents === null || menuBlendedTicketCents <= 0) return false;
  if (forecastAvgTicketCents <= 0) return false;
  const delta = Math.abs(menuBlendedTicketCents - forecastAvgTicketCents);
  const rel = delta / Math.max(forecastAvgTicketCents, 1);
  return delta >= MENU_TICKET_ABS_TOLERANCE_CENTS && rel >= MENU_TICKET_REL_TOLERANCE;
}

export function detectMenuTicketMismatch(
  input: MenuTicketMismatchInputs,
): CrossSuiteConflict | null {
  const cc = input.currencyCode ?? "USD";
  const menuCents = input.menuBlendedTicketCents;
  const forecastCents = Math.max(0, Math.round(input.forecastAvgTicketCents));

  // Either side missing → nothing to reconcile. The Menu workspace shows its
  // own "Add a priced item" empty state; we don't reproduce it here.
  if (menuCents === null || menuCents <= 0) return null;
  if (forecastCents <= 0) return null;
  if (input.activeMenuItemCount <= 0) return null;
  if (!isMenuTicketDriftMeaningful(menuCents, forecastCents)) return null;

  const deltaCents = menuCents - forecastCents; // +ve = menu blend higher than forecast
  const menuHigher = deltaCents > 0;
  const itemCount = input.activeMenuItemCount;

  const suiteA = {
    suiteKey: "menu-pricing",
    suiteLabel: "Menu & Pricing",
    fieldLabel: "Blended ticket from menu",
    displayValue: `${fmtCents(menuCents, cc)}`,
    displaySubvalue: `Popularity-weighted across ${itemCount} priced item${itemCount === 1 ? "" : "s"}`,
    deepLinkHref: "/workspace/menu-pricing",
  };
  const suiteB = {
    suiteKey: "financials",
    suiteLabel: "Financials",
    fieldLabel: "Forecast Inputs avg ticket",
    displayValue: `${fmtCents(forecastCents, cc)}`,
    displaySubvalue: "Drives revenue, break-even, ratios, runway",
    deepLinkHref: "/workspace/financials",
  };

  const statement = menuHigher
    ? "Your menu prices imply a higher average ticket than your financial plan is forecasting. Until they agree, every revenue projection runs on the lower number."
    : "Your financial plan is forecasting a higher average ticket than the menu actually supports. Until they agree, every revenue projection overshoots what the menu can produce.";

  const gapLabel = `Gap: ${fmtCents(Math.abs(deltaCents), cc)}/ticket between menu blend and Forecast Inputs.`;

  // ── Path A — Sync Forecast Inputs to the menu blend (typical fix) ─────────
  const pathASync: ResolutionPath = {
    id: "sync_forecast_to_menu",
    label: "Sync Forecast Inputs to the menu blend",
    summary: `Update Financials → Forecast Inputs avg ticket from ${fmtCents(forecastCents, cc)} to ${fmtCents(menuCents, cc)} so the revenue forecast reflects the priced menu. Recommended when the menu is the source of truth.`,
    downstreamEffects: buildSyncForecastEffects(forecastCents, menuCents, cc),
    suggestions: [
      {
        id: suggestionId(["menu_ticket_mismatch", "sync_forecast_to_menu", "financials", "forecast", "avg_ticket_cents"]),
        fieldId: "cross_suite:menu_ticket_mismatch:sync_forecast_to_menu:financials:forecast:avg_ticket_cents",
        fieldLabel: "Financials -- Forecast avg ticket",
        originalValue: fmtCents(forecastCents, cc),
        proposedValue: fmtCents(menuCents, cc),
        isStructured: true,
        workspaceLabel: "Financials",
      },
    ],
  };

  // ── Path B — Pin the menu to match the forecast (rare; POS-anchored) ─────
  // No structured field write — re-pricing the menu is a human judgement
  // call. We surface the intent so the owner can act in the Menu workspace.
  const pathBPinMenu: ResolutionPath = {
    id: "reprice_menu_to_forecast",
    label: "Reprice the menu to match Forecast Inputs",
    summary: `Adjust menu prices in Menu & Pricing so the popularity-weighted blend lands at ${fmtCents(forecastCents, cc)}. Use when the forecast is anchored to a POS reading or external benchmark you don't want to move.`,
    downstreamEffects: [
      {
        suite: "Menu & Pricing",
        field: "Item prices",
        from: `Current blend ${fmtCents(menuCents, cc)}`,
        to: `Target blend ${fmtCents(forecastCents, cc)}`,
        risk: "warn",
        note: "Repricing is a per-item decision; the Menu workspace is the right place to make it.",
      },
      {
        suite: "Financials",
        field: "Forecast avg ticket",
        from: `${fmtCents(forecastCents, cc)} (unchanged)`,
        to: `${fmtCents(forecastCents, cc)} (unchanged)`,
        risk: "info",
      },
    ],
    suggestions: [],
  };

  return {
    id: "menu_ticket_mismatch",
    kind: "numeric",
    statement,
    suiteA,
    suiteB,
    gapLabel,
    benchmark: null,
    paths: [pathASync, pathBPinMenu],
    recommendedPathId: "sync_forecast_to_menu",
  };
}

function buildSyncForecastEffects(
  forecastCents: number,
  menuCents: number,
  cc: string,
): DownstreamEffect[] {
  const delta = menuCents - forecastCents;
  const direction = delta > 0 ? "up" : "down";
  return [
    {
      suite: "Financials",
      field: "Forecast Inputs avg ticket",
      from: `${fmtCents(forecastCents, cc)}`,
      to: `${fmtCents(menuCents, cc)}`,
      risk: "info",
    },
    {
      suite: "Financials",
      field: "Revenue projection",
      from: "(empty)",
      to: delta > 0
        ? `Daily and monthly revenue scale up proportionally with the higher ticket`
        : `Daily and monthly revenue scale down proportionally with the lower ticket`,
      risk: delta > 0 ? "info" : "warn",
    },
    {
      suite: "Plan",
      field: "Break-even point",
      from: "(empty)",
      to: delta > 0
        ? "Break-even transactions drop (each ticket covers more fixed cost)"
        : "Break-even transactions rise (each ticket covers less fixed cost)",
      risk: delta > 0 ? "info" : "warn",
      note: `Ticket moves ${direction} ${fmtCents(Math.abs(delta), cc)} per transaction`,
    },
  ];
}
