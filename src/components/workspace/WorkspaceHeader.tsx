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
// Inside the action cluster, the SaveIndicator+Save pair must render through
// SaveStatusAndButton so the saved-status text always sits immediately to the
// left of the Save button with no other action between them.
//
// Every workspace MUST render its header through this component instead of
// hand-rolling the markup — that hand-rolling is the drift the board rejected
// (business-plan stacked its actions in a separate toolbar below the header;
// marketing / operations-playbook pushed the description beneath the title row).
// The sub-nav still renders separately, immediately below, via WorkspaceSubNav.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type WorkspaceHeaderProps = {
  /** Leading title icon (lucide), rendered teal at w-5 h-5 like Financials. */
  Icon: LucideIcon;
  title: string;
  description: ReactNode;
  /**
   * Right-side action cluster: WorkspaceActionButton(s) + (where the page has
   * a manual Save) a single SaveStatusAndButton at the end of the row.
   * Omit on pages that have no page-level actions (e.g. Hiring, Menu) — the
   * header then renders title-only, still on the canonical band.
   */
  actions?: ReactNode;
  /** Spacing below the header. Defaults to the canonical `mb-6`. */
  className?: string;
};

export function WorkspaceHeader({
  Icon,
  title,
  description,
  actions,
  className,
}: WorkspaceHeaderProps) {
  return (
    <header
      className={`flex flex-wrap items-start justify-between gap-4 min-[1200px]:flex-nowrap ${
        className ?? "mb-6"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon
            className="w-5 h-5 text-[var(--teal)] flex-shrink-0"
            aria-hidden="true"
          />
          <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight whitespace-nowrap">
            {title}
          </h1>
        </div>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex items-center gap-3 shrink-0 ml-auto flex-wrap min-[1200px]:flex-nowrap">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
