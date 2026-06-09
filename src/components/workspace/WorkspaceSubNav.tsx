"use client";

// TIM-1793: Canonical workspace sub-page nav. Single source of truth for the
// pill-style tab strip that sits left-aligned under every workspace header,
// matching the Financials reference (see spec TIM-1792). Supports both
// in-page tab state (button + onSelect) and route navigation (href + Link) so
// every Groundwork workspace renders the same chrome instead of hand-rolling
// its own — that drift is what TIM-1791 flagged.
//
// Style is locked to the canonical tokens from the spec:
//   container: bg-white border border-[var(--border)] rounded-xl p-1, overflow-x-auto
//   active tab: bg-[var(--teal)] text-white
//   inactive tab: text-[var(--muted-foreground)] hover:text-[var(--foreground)]
// Do NOT recreate this markup in a workspace — import this component.
//
// TIM-2569: overflowTabs + overflowLabel props for progressive-disclosure
// dropdown. When overflowTabs is provided, primary tabs render normally and
// a dropdown trigger appears at the end labelled overflowLabel + " ▾". The
// trigger shows teal border-b-2 active state when any overflow tab is active.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type WorkspaceSubNavTab<K extends string = string> = {
  key: K;
  label: string;
  /** When set, the tab renders as a route link instead of a button. */
  href?: string;
  /** Optional leading icon (lucide). */
  Icon?: LucideIcon;
  /** Yellow badge count (e.g. flagged benchmark chips). Hidden when 0. */
  badge?: number;
};

type WorkspaceSubNavProps<K extends string> = {
  tabs: ReadonlyArray<WorkspaceSubNavTab<K>>;
  active: K;
  /** Required for in-page (button) tabs; ignored for link tabs. */
  onSelect?: (key: K) => void;
  ariaLabel?: string;
  /** Spacing below the nav. Defaults to the canonical `mb-5`. */
  className?: string;
  /** TIM-2569: tabs hidden behind the overflow dropdown trigger. */
  overflowTabs?: ReadonlyArray<WorkspaceSubNavTab<K>>;
  /** TIM-2569: label for the overflow trigger. Defaults to "Reports". */
  overflowLabel?: string;
};

const TAB_CLASS =
  "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap";

function TabBadge({ badge, active }: { badge: number; active: boolean }) {
  void active;
  return (
    <span className="ml-1 inline-flex items-center justify-center text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded-full bg-[var(--bench-yellow-bg)] text-[var(--bench-yellow-text)]">
      {badge}
    </span>
  );
}

export function WorkspaceSubNav<K extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
  className,
  overflowTabs,
  overflowLabel = "Reports",
}: WorkspaceSubNavProps<K>) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [dropdownOpen]);

  const overflowIsActive = overflowTabs?.some((t) => t.key === active) ?? false;

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex items-center gap-1 bg-white border border-[var(--border)] rounded-xl p-1 overflow-x-auto max-w-full ${
        className ?? "mb-5"
      }`}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        const stateClass = isActive
          ? "bg-[var(--teal)] text-white"
          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]";
        const Icon = t.Icon;
        const content = (
          <>
            {Icon ? <Icon size={13} aria-hidden="true" /> : null}
            {t.label}
            {t.badge != null && t.badge > 0 ? (
              <TabBadge badge={t.badge} active={isActive} />
            ) : null}
          </>
        );

        if (t.href) {
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={`${TAB_CLASS} ${stateClass}`}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={t.key}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect?.(t.key)}
            className={`${TAB_CLASS} ${stateClass}`}
          >
            {content}
          </button>
        );
      })}

      {overflowTabs && overflowTabs.length > 0 && (
        <div ref={dropdownRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
            className={`${TAB_CLASS} ${
              overflowIsActive
                ? "border-b-2 border-[var(--teal)] text-[var(--teal)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {overflowLabel}
            <ChevronDown
              size={14}
              className={`ml-0.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {dropdownOpen && (
            <div
              role="menu"
              className="absolute top-full left-0 mt-1 z-50 bg-[var(--card)] border border-neutral-200 rounded-md shadow-sm p-1 min-w-[180px]"
            >
              {overflowTabs.map((t) => {
                const isActive = t.key === active;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="menuitem"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      onSelect?.(t.key);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-sm flex items-center justify-between gap-2 transition-colors ${
                      isActive
                        ? "text-[var(--teal)] font-medium bg-[var(--muted)]"
                        : "text-[var(--foreground)] hover:bg-[var(--muted)] cursor-pointer"
                    }`}
                  >
                    <span>{t.label}</span>
                    {t.badge != null && t.badge > 0 ? (
                      <TabBadge badge={t.badge} active={isActive} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
