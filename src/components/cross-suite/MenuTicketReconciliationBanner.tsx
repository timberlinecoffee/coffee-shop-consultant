"use client";

// TIM-2482 (F13) + TIM-3583 tone revision — Menu per-item blend vs Forecast
// Inputs avg ticket reconciliation banner. Mounted in both the Financials and
// Menu-Pricing workspaces.
//
// TIM-3583 (2026-07-02): the underlying detector now only fires when the
// forecast is BELOW the per-item blend (the physically impossible case).
// A forecast above the blend is a normal multi-item ticket and the detector
// stays silent. Given the tighter fire condition, this banner uses a neutral
// advisory tone (slate/teal) rather than the previous amber warning — the
// remaining surfaces are informational nudges, not error states.
//
// Renders nothing when the resolver does not surface a menu_ticket_mismatch
// (no menu items, forecast at or above blend, drift under tolerance).

import { Info } from "lucide-react";
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
      ? `Forecast Inputs ${forecastValue} is below the menu per-item blend ${menuValue}. Open review.`
      : `Forecast Inputs ${forecastValue} is below the menu per-item blend ${menuValue}. Open review.`;

  return (
    <>
      <div
        className={`rounded-lg border border-[var(--teal-bg-750)] bg-[var(--teal-bg-f0f8)] px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className ?? ""}`}
      >
        <Info className="w-4 h-4 text-[var(--teal)] shrink-0" aria-hidden="true" />
        <p className="text-xs text-[var(--foreground)] leading-snug flex-1 min-w-0">
          <span className="font-semibold">Forecast ticket {forecastValue}</span>
          <span className="text-[var(--muted-foreground)] mx-1.5">is below the</span>
          <span className="font-semibold">per-item blend {menuValue}</span>
        </p>
        <button
          type="button"
          onClick={() => openResolverById("menu_ticket_mismatch")}
          aria-label={ariaLabel}
          className="text-xs font-semibold text-[var(--teal)] underline-offset-4 underline hover:no-underline px-1 py-0.5 rounded shrink-0"
        >
          Review
        </button>
      </div>
      {ResolverNode}
      {AIReviewModalNode}
    </>
  );
}
