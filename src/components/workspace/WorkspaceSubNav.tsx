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
// TIM-2833: right-edge scroll indicator — fades when more tabs exist off-screen.

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
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
};

const TAB_CLASS =
  "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap";

export function WorkspaceSubNav<K extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
  className,
}: WorkspaceSubNavProps<K>) {
  const scrollRef = useRef<HTMLElement>(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function checkOverflow() {
      if (!el) return;
      setShowFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    }

    checkOverflow();
    el.addEventListener("scroll", checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkOverflow);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={`relative ${className ?? "mb-5"}`}>
      <nav
        ref={scrollRef}
        aria-label={ariaLabel}
        className="flex items-center gap-1 bg-white border border-[var(--border)] rounded-xl p-1 overflow-x-auto max-w-full"
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
                <span
                  className={`ml-1 inline-flex items-center justify-center text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? "bg-[var(--bench-yellow-bg)] text-[var(--bench-yellow-text)]"
                      : "bg-[var(--bench-yellow-bg)] text-[var(--bench-yellow-text)]"
                  }`}
                >
                  {t.badge}
                </span>
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
      </nav>
      {/* TIM-2833: right-edge fade signals more tabs beyond the viewport */}
      {showFade && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 rounded-r-xl"
          style={{ background: "linear-gradient(to right, transparent, white)" }}
        />
      )}
    </div>
  );
}
