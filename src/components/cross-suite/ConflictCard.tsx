"use client";

// TIM-2597: ConflictCard — v2 replacement for the global ConflictNoticeBadge
// amber pill, rendered behind ui_revamp_v2.
//
// Shows each detected cross-suite conflict as an inline card with a specific
// plain-language description and a "Fix this" CTA that opens the resolver
// modal for that conflict.
//
// Renders nothing (other than modal nodes) when no conflicts are detected,
// mirroring the ConflictNoticeBadge zero-state behavior.
//
// Style guide: Cards > Inline reconciliation. Tokens: --card, --border,
// --foreground, --muted-foreground, --teal. NO amber tokens — this is the v2
// path. Existing reference: src/components/cross-suite/ConflictNoticeBadge.tsx.

import { ArrowRightLeft } from "lucide-react";
import { useCrossSuiteConflictResolver } from "./useCrossSuiteConflictResolver";

export interface ConflictCardProps {
  className?: string;
}

export function ConflictCard({ className }: ConflictCardProps) {
  const { conflicts, openResolver, ResolverNode, AIReviewModalNode } =
    useCrossSuiteConflictResolver();

  if (conflicts.length === 0) {
    // Still mount modal nodes so the resolver is available for other triggers
    // on this page (e.g. Scout Check-mode cards that openResolverById).
    return (
      <>
        {ResolverNode}
        {AIReviewModalNode}
      </>
    );
  }

  return (
    <>
      <div className={`space-y-3 ${className ?? ""}`}>
        {conflicts.map((conflict, i) => (
          <div
            key={conflict.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 flex items-start gap-3"
          >
            {/* Icon */}
            <div
              className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center"
              aria-hidden="true"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--foreground)] leading-snug">
                {conflict.statement}
              </p>

              {conflict.gapLabel && (
                <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-snug">
                  {conflict.gapLabel}
                </p>
              )}

              {/* Source labels + CTA */}
              <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                <span className="text-xs text-[var(--muted-foreground)]">
                  {conflict.suiteA.suiteLabel} vs {conflict.suiteB.suiteLabel}
                </span>
                <button
                  type="button"
                  onClick={() => openResolver(i)}
                  className="text-xs font-semibold text-[var(--teal)] hover:underline leading-none"
                  aria-label={`Fix conflict: ${conflict.statement}`}
                >
                  Fix this
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {ResolverNode}
      {AIReviewModalNode}
    </>
  );
}
