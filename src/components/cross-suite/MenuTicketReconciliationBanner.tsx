"use client";

// TIM-2482 (F13) — Menu blended ticket vs Forecast Inputs avg ticket
// reconciliation banner. Mounted in both the Financials and Menu-Pricing
// workspaces. Renders inline ("Menu blended ticket $8.20 / Forecast Inputs
// $7.50 — Sync") with a button that opens the cross-suite resolver modal on
// the menu_ticket_mismatch conflict.
//
// Renders nothing when the resolver does not surface a menu_ticket_mismatch
// (no menu items, no drift, drift under tolerance). Renders no banner when
// the detector itself decides the drift is not meaningful — keeps the UI
// out of the way when there's nothing to do.

import { AlertTriangle } from "lucide-react";
import { useCrossSuiteConflictResolver } from "./useCrossSuiteConflictResolver";

export interface MenuTicketReconciliationBannerProps {
  // The workspace this banner is mounted in, used in copy + aria-label so the
  // surface reads naturally on both sides ("Menu blended ticket … sync to
  // Forecast Inputs" vs "Forecast Inputs ticket … sync from menu").
  origin: "financials" | "menu";
  className?: string;
}

export function MenuTicketReconciliationBanner({
  origin,
  className,
}: MenuTicketReconciliationBannerProps) {
  const { conflicts, openResolverById, ResolverNode, AIReviewModalNode } =
    useCrossSuiteConflictResolver();

  const conflict = conflicts.find((c) => c.id === "menu_ticket_mismatch");
  if (!conflict) {
    // Still render the modal nodes so they exist for other callers (no-op
    // when there's nothing open — preserves the pattern from
    // ConflictNoticeBadge).
    return (
      <>
        {ResolverNode}
        {AIReviewModalNode}
      </>
    );
  }

  // suiteA = menu-pricing, suiteB = financials (from detector).
  const menuValue = conflict.suiteA.displayValue;
  const forecastValue = conflict.suiteB.displayValue;
  const ariaLabel =
    origin === "menu"
      ? `Menu blended ticket ${menuValue} differs from Forecast Inputs ${forecastValue}. Open reconciliation.`
      : `Forecast Inputs ${forecastValue} differs from menu blended ticket ${menuValue}. Open reconciliation.`;

  return (
    <>
      <div
        className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className ?? ""}`}
      >
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
        <p className="text-xs text-amber-900 leading-snug flex-1 min-w-0">
          <span className="font-semibold">Menu blended ticket {menuValue}</span>
          <span className="text-amber-700 mx-1.5">/</span>
          <span className="font-semibold">Forecast Inputs {forecastValue}</span>
        </p>
        <button
          type="button"
          onClick={() => openResolverById("menu_ticket_mismatch")}
          aria-label={ariaLabel}
          className="text-xs font-semibold text-amber-900 underline-offset-4 underline hover:no-underline px-1 py-0.5 rounded shrink-0"
        >
          Sync
        </button>
      </div>
      {ResolverNode}
      {AIReviewModalNode}
    </>
  );
}
