// TIM-2482 (F13) + TIM-3583 semantic revision.
//
// Pure detector matching the hiring-financials.ts shape: precomputed inputs in,
// one CrossSuiteConflict (or null) out. Data layer (cross-suite-resolver
// route.ts) owns DB reads; apply layer owns DB writes.
//
// TIM-3583 (2026-07-02): the original detector fired whenever the forecast
// avg ticket drifted from the popularity-weighted per-item blend in either
// direction. That produced a false positive for the common case where a
// customer buys more than one item per transaction: e.g. items blend to $5.50,
// founder models an $11.12 combo ticket (food + drink), detector claimed
// "inconsistency" even though the ticket was correct. `menuBlendedTicketCents`
// is a *per-item* average, not a per-ticket forecast; a forecast above the
// blend just implies multiple items per basket.
//
// New rule: only fire when the forecast is meaningfully BELOW the per-item
// blend. That's the physically impossible case — customers can't spend less
// than the cheapest thing on the menu on average — and it's what the F13
// audit finding was really pointing at ("$7.50 forecast default lingers while
// menu blend is $8.20"). Forecasts above the blend are silent; the plausible
// multi-item ticket is normal and no longer surfaces a warning.
//
// Tolerance — 5% relative AND 25¢ absolute (both must clear). Tighter than
// that triggers false positives on penny-rounding edits.

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
//
// TIM-3583: only meaningful when forecast is BELOW the per-item blend. A
// forecast above the blend is a plausible multi-item ticket and is silent.
export function isMenuTicketDriftMeaningful(
  menuBlendedTicketCents: number | null,
  forecastAvgTicketCents: number,
): boolean {
  if (menuBlendedTicketCents === null || menuBlendedTicketCents <= 0) return false;
  if (forecastAvgTicketCents <= 0) return false;
  if (forecastAvgTicketCents >= menuBlendedTicketCents) return false;
  const delta = menuBlendedTicketCents - forecastAvgTicketCents;
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

  // Detector only fires when forecast < menu blend (isMenuTicketDriftMeaningful
  // guarantees this). Multi-item combos where forecast > blend are silent —
  // that's a normal basket and no longer treated as a mismatch.
  const deltaCents = menuCents - forecastCents; // always > 0 at this point
  const itemCount = input.activeMenuItemCount;

  const suiteA = {
    suiteKey: "menu-pricing",
    suiteLabel: "Menu & Pricing",
    fieldLabel: "Blended item price from menu",
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

  const statement =
    "Your forecast ticket is below the popularity-weighted per-item price on the menu. On average, a customer buys at least one item — a forecast under the single-item price will structurally understate every revenue projection.";

  const gapLabel = `Gap: forecast ${fmtCents(forecastCents, cc)} is ${fmtCents(deltaCents, cc)} below the ${fmtCents(menuCents, cc)} per-item blend.`;

  // ── Path A — Raise Forecast Inputs to at least the per-item blend ─────────
  // Recommended: the forecast can't be lower than the cheapest single item on
  // average. This lifts the forecast to the per-item blend; the owner is free
  // to raise it further if their real basket is multi-item.
  const pathASync: ResolutionPath = {
    id: "sync_forecast_to_menu",
    label: "Raise Forecast Inputs to the per-item blend",
    summary: `Update Financials → Forecast Inputs avg ticket from ${fmtCents(forecastCents, cc)} to ${fmtCents(menuCents, cc)} so the revenue forecast reflects at least one item per ticket. Raise further if the typical basket includes more than one item.`,
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

  // ── Path B — Lower menu prices to match the forecast (rare) ──────────────
  // No structured field write — re-pricing the menu is a human judgement
  // call. We surface the intent so the owner can act in the Menu workspace.
  const pathBPinMenu: ResolutionPath = {
    id: "reprice_menu_to_forecast",
    label: "Lower menu prices to match Forecast Inputs",
    summary: `Adjust menu prices in Menu & Pricing so the popularity-weighted blend lands at ${fmtCents(forecastCents, cc)}. Use only if the current menu is genuinely mispriced relative to your target ticket.`,
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
  // Detector only fires when menu > forecast, so raising forecast to menu is
  // always an upward move. Break-even transactions drop because each ticket
  // covers more fixed cost.
  const delta = menuCents - forecastCents;
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
      to: "Daily and monthly revenue scale up proportionally with the higher ticket",
      risk: "info",
    },
    {
      suite: "Plan",
      field: "Break-even point",
      from: "(empty)",
      to: "Break-even transactions drop (each ticket covers more fixed cost)",
      risk: "info",
      note: `Ticket moves up ${fmtCents(delta, cc)} per transaction`,
    },
  ];
}
