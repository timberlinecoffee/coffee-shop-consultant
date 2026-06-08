"use client";

// TIM-2481 (F12) — Buildout grid total vs Financials startup_costs.equipment
// reconciliation banner. Mounted in both the Financials and Equipment &
// Supplies workspaces. Renders inline ("Buildout grid $55,000 / Financials
// $50,000 — Sync") with a button that opens the cross-suite resolver modal
// on the equipment_mismatch conflict.
//
// Renders nothing visible when the resolver does not surface an
// equipment_mismatch (no items, no drift, drift under tolerance). The
// detector itself decides what counts as meaningful — keeps the UI out of
// the way when there's nothing to do.
//
// Pattern: mirrors MenuTicketReconciliationBanner (TIM-2482). Same useCallout
// hook, same modal mount approach. Style guide section consulted: "Banners →
// Inline reconciliation pill". Existing component reference:
// src/components/cross-suite/MenuTicketReconciliationBanner.tsx.

import { AlertTriangle } from "lucide-react";
import { useCrossSuiteConflictResolver } from "./useCrossSuiteConflictResolver";

export interface EquipmentReconciliationBannerProps {
  // The workspace this banner is mounted in, used in copy + aria-label so the
  // surface reads naturally on both sides ("Buildout grid … sync to Financials"
  // vs "Financials equipment … sync from buildout grid").
  origin: "financials" | "buildout";
  className?: string;
}

export function EquipmentReconciliationBanner({
  origin,
  className,
}: EquipmentReconciliationBannerProps) {
  const { conflicts, openResolverById, ResolverNode, AIReviewModalNode } =
    useCrossSuiteConflictResolver();

  const conflict = conflicts.find((c) => c.id === "equipment_mismatch");
  if (!conflict) {
    // Still render the modal nodes so they exist for other callers (no-op
    // when there's nothing open — preserves the pattern from
    // ConflictNoticeBadge / MenuTicketReconciliationBanner).
    return (
      <>
        {ResolverNode}
        {AIReviewModalNode}
      </>
    );
  }

  // suiteA = buildout-equipment, suiteB = financials (from detector).
  const gridValue = conflict.suiteA.displayValue;
  const finValue = conflict.suiteB.displayValue;
  const ariaLabel =
    origin === "buildout"
      ? `Buildout grid total ${gridValue} differs from Financials equipment line ${finValue}. Open reconciliation.`
      : `Financials equipment line ${finValue} differs from buildout grid total ${gridValue}. Open reconciliation.`;

  return (
    <>
      <div
        className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className ?? ""}`}
      >
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
        <p className="text-xs text-amber-900 leading-snug flex-1 min-w-0">
          <span className="font-semibold">Buildout grid {gridValue}</span>
          <span className="text-amber-700 mx-1.5">/</span>
          <span className="font-semibold">Financials {finValue}</span>
        </p>
        <button
          type="button"
          onClick={() => openResolverById("equipment_mismatch")}
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
