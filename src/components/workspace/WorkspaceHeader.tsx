"use client";

// TIM-1894 (board Item 3) + TIM-1937 (board reopen): canonical workspace page
// header. Single source of truth for the title row at the top of every
// Groundwork workspace, locked to the Financials reference the board chose:
//
//   <header mb-6 flex items-start justify-between gap-4 [≥1200px: nowrap]>
//     left column (min-w-0): icon + h1 (text-[28px] bold) then description <p>
//     right column (shrink-0, ml-auto): action cluster — kept on the title row
//       at the viewports the board uses (≥1200px); at narrower widths it wraps
//       to a new row but stays RIGHT-aligned (no wrap-and-left-align — the
//       TIM-1937 bug — and no horizontal overflow on mobile).
//
// Every workspace MUST render its header through this component instead of
// hand-rolling the markup — that hand-rolling is the drift the board rejected.
// The sub-nav still renders separately, immediately below, via WorkspaceSubNav.
//
// ── TIM-4107 (UX Phase 2): the standard now covers the whole top of the page ──
//
// The audit behind this: eleven workspace headers looked drastically different
// to the owner. Every one of them already rendered through this component —
// but it only governed the TITLE ROW. It said nothing about which actions
// exist, what order they sit in, whether a save status appears, or whether
// progress appears. So eleven screens each answered those questions alone:
//
//   • printing had five different names
//   • progress appeared on 4 of 11 screens
//   • save status appeared on 3 of 11, though all 11 have a Save button
//   • which button was emphasised was arbitrary — the AI action on some
//     screens, "Add location" on another, nothing at all on five
//
// So the slots below are STRUCTURAL. A caller supplies the pieces; this
// component decides the order they appear in. That is the whole point: a
// workspace can no longer choose to put Save in the middle, or emphasise two
// things, or quietly omit its progress line.
//
// Fixed order, left to right:
//
//   [ scout ] [ primaryAction ] [ overflow ] [ save ]
//
// Rules the slots encode:
//   • `scout` is always first and never emphasised. One name — "Ask Scout"
//     (TIM-4106). It is an offer of help, not the main event.
//   • `primaryAction` is AT MOST ONE, and is THE NEXT REAL THING TO DO on this
//     screen — not the AI action. Trent's ruling 2026-08-02. Emphasising the
//     AI button teaches people to reach for AI before thinking; AI stays
//     available everywhere, just never the loudest thing in the room.
//   • `overflow` is the ⋯ menu: printing, exporting, guided tours, resets.
//   • `save` is a SaveStatusAndButton so the status text always sits directly
//     left of the Save button, per TIM-1937.
//   • `progress` and `alert` render BELOW the title row, in that order, so the
//     rhythm is identical on every screen.
//
// `actions` is the pre-Phase-2 escape hatch and is DEPRECATED. It renders the
// cluster verbatim, which is exactly the freedom that caused the drift. Phase 3
// migrates each workspace off it; do not add new callers.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { progressView, type WorkspaceProgress } from "./workspace-progress";

type WorkspaceHeaderProps = {
  /** Leading title icon (lucide), rendered teal at w-5 h-5 like Financials. */
  Icon: LucideIcon;
  title: string;
  description: ReactNode;

  /** Scout. Always rendered first, always secondary. */
  scout?: ReactNode;
  /**
   * The single most useful REAL next step on this screen, or nothing.
   * Exactly one, never two. Not the AI action.
   */
  primaryAction?: ReactNode;
  /** The ⋯ menu — printing, exporting, tours, resets. */
  overflow?: ReactNode;
  /** A SaveStatusAndButton. Always last in the cluster. */
  save?: ReactNode;

  /** Where the owner is up to. Renders below the title row. */
  progress?: WorkspaceProgress;
  /** One amber band, below progress. Conflicts and blocking notices. */
  alert?: ReactNode;

  /**
   * @deprecated Pre-Phase-2 free-form cluster. Use scout / primaryAction /
   * overflow / save so the order is enforced rather than chosen.
   */
  actions?: ReactNode;

  /** Spacing below the header. Defaults to the canonical `mb-6`. */
  className?: string;
};

export function WorkspaceHeader({
  Icon,
  title,
  description,
  scout,
  primaryAction,
  overflow,
  save,
  progress,
  alert,
  actions,
  className,
}: WorkspaceHeaderProps) {
  const structured = scout ?? primaryAction ?? overflow ?? save;
  const hasCluster = Boolean(structured || actions);

  // TIM-3417 (TIM-3411 #9 SERIOUS): at ≤640px stack title above actions in a
  // stable, predictable order — title row first, action cluster on its own row
  // below, right-aligned wrap. Title gets `truncate min-w-0` so a long title
  // never pushes the action cluster around. ≥640px–1199px keep the same-row
  // attempt with predictable wrap; ≥1200px keep the canonical Financials
  // single-row layout.
  return (
    <div className={className ?? "mb-6"}>
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 min-[1200px]:flex-nowrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <Icon
              className="w-5 h-5 text-[var(--teal)] flex-shrink-0"
              aria-hidden="true"
            />
            <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight truncate min-w-0">
              {title}
            </h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            {description}
          </p>
        </div>
        {hasCluster ? (
          <div className="flex flex-wrap items-center justify-end gap-3 sm:shrink-0 sm:ml-auto min-[1200px]:flex-nowrap">
            {/* Order is fixed here, not by the caller. */}
            {structured ? (
              <>
                {scout}
                {primaryAction}
                {overflow}
                {save}
              </>
            ) : (
              actions
            )}
          </div>
        ) : null}
      </header>

      {progress ? <WorkspaceProgressLine progress={progress} /> : null}

      {alert ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm text-amber-900">
          {alert}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceProgressLine({ progress }: { progress: WorkspaceProgress }) {
  const view = progressView(progress);
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          {view.label}
        </span>
        {view.pct !== null ? (
          <span className="text-xs font-semibold text-[var(--teal)] tabular-nums">
            {view.pct}%
          </span>
        ) : null}
      </div>
      {view.showBar ? (
        <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--teal)] transition-all duration-300"
            style={{ width: `${view.pct ?? 0}%` }}
            role="progressbar"
            aria-valuenow={view.pct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={view.label}
          />
        </div>
      ) : null}
    </div>
  );
}
