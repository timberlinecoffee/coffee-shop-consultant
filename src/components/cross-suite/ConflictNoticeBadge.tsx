"use client";

// TIM-2426: ConflictNoticeBadge — the entry point that replaces today's
// terse cross-workspace notice (UX spec §3a/§6).
//
// Renders nothing when there are no conflicts. Renders a single amber pill
// with a count when one or more conflicts exist; clicking opens the resolver.
// When there are 2+ conflicts the badge briefly cycles through them — for
// TIM-2426 we just open the first; multi-conflict picker is a follow-up.

import { AlertTriangle } from "lucide-react";
import { useCrossSuiteConflictResolver } from "./useCrossSuiteConflictResolver";

export interface ConflictNoticeBadgeProps {
  // For workspace-header mount: optional className lets the host page adjust
  // spacing if it wraps the badge in a custom row.
  className?: string;
}

export function ConflictNoticeBadge({ className }: ConflictNoticeBadgeProps) {
  const { conflictCount, openResolver, ResolverNode, AIReviewModalNode } =
    useCrossSuiteConflictResolver();

  if (conflictCount === 0) {
    return (
      <>
        {ResolverNode}
        {AIReviewModalNode}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => openResolver(0)}
        className={`inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 transition-colors ${className ?? ""}`}
        aria-label={
          conflictCount === 1
            ? "Review the conflict between your hiring plan and financial plan"
            : `Review ${conflictCount} conflicts between source suites`
        }
      >
        <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
        {conflictCount === 1
          ? "Resolve plan conflict"
          : `Resolve ${conflictCount} plan conflicts`}
      </button>
      {ResolverNode}
      {AIReviewModalNode}
    </>
  );
}
