"use client";

// TIM-2385: Two-phase loading UX for the Business Plan workspace.
// Phase 1 — this overlay renders while a Generate or Regenerate all run is in
// flight. The AI review modal stays CLOSED.
// Phase 2 — the parent closes this overlay and opens the modal in one motion
// once every section has streamed.
//
// Style: TIM-1537 (neutral-cool tokens, teal accent, no em dashes, plain copy).

import { Loader2 } from "lucide-react";

export interface BusinessPlanProgressOverlayProps {
  isOpen: boolean;
  /** Total sections in this run. Single Generate passes 1. */
  total: number;
  /** Sections that have streamed to completion. Increments on section:complete. */
  completed: number;
  /**
   * Display titles of sections that failed mid-run. Each renders as a single
   * "Continuing" advisory line in the overlay so the user knows the run is
   * still progressing.
   */
  failedSectionTitles: string[];
  /** Cancel handler. Calls AbortController.abort() in the parent. */
  onCancel: () => void;
}

export function BusinessPlanProgressOverlay({
  isOpen,
  total,
  completed,
  failedSectionTitles,
  onCancel,
}: BusinessPlanProgressOverlayProps) {
  if (!isOpen) return null;

  const safeTotal = Math.max(total, 1);
  const safeCompleted = Math.min(Math.max(completed, 0), safeTotal);
  const percent = Math.round((safeCompleted / safeTotal) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bp-progress-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[var(--border)]">
        <div className="px-5 py-4 border-b border-[var(--neutral-cool-150)]">
          <h2
            id="bp-progress-title"
            className="text-base font-semibold text-[var(--foreground)]"
          >
            {total > 1 ? "Generating your business plan" : "Generating section"}
          </h2>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <Loader2
              size={18}
              className="animate-spin text-[var(--teal)]"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--foreground)] leading-relaxed">
              Generating section {safeCompleted + (safeCompleted < safeTotal ? 1 : 0)} of {safeTotal}
            </p>
          </div>

          <div
            className="h-1.5 w-full rounded-full bg-[var(--neutral-cool-100)] overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={safeTotal}
            aria-valuenow={safeCompleted}
            aria-label="Sections complete"
          >
            <div
              className="h-full bg-[var(--teal)] transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

          {failedSectionTitles.length > 0 && (
            <ul className="space-y-1 pt-1">
              {failedSectionTitles.map((title) => (
                <li
                  key={title}
                  className="text-xs text-[var(--muted-foreground)] leading-snug"
                >
                  {title} section had an error. Continuing.
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--neutral-cool-150)] flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-[var(--gray-750)] text-[var(--gray-1150)] text-xs font-semibold hover:bg-[var(--neutral-cool-100)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
