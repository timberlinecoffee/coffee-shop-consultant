"use client";

// TIM-1894 (board Item 3): canonical workspace page header. Single source of
// truth for the title row that sits at the top of every Groundwork workspace,
// locked to the Financials reference the board chose:
//
//   <header mb-6 flex items-start justify-between gap-4 flex-wrap>
//     left column (min-w-0): icon + h1 (text-[28px] bold) then description <p>
//     right column (shrink-0): action cluster — SaveIndicator + WorkspaceActionButton(s),
//                              exactly one variant="primary" + outlined secondaries
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
   * Right-side action cluster: SaveIndicator + WorkspaceActionButton(s).
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
      className={`flex items-start justify-between gap-4 flex-wrap ${
        className ?? "mb-6"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon
            className="w-5 h-5 text-[var(--teal)] flex-shrink-0"
            aria-hidden="true"
          />
          <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">
            {title}
          </h1>
        </div>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex items-center gap-3 flex-wrap shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}
