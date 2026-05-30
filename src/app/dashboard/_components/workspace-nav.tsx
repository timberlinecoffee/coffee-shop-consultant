// TIM-1286: dashboard workspace list. Replaces the old wall of small bordered
// tiles + loud status pills (which read as cluttered and unprofessional) with
// a clean, grouped list. Each phase (Plan / Set Up / Launch / Operate) is a
// single card of hairline-divided rows. Every row carries a one-line "why I'd
// click it" blurb so it reads as a real destination, plus a quiet status dot
// instead of a loud pill. Taxonomy comes from the shared manifest, so the
// dashboard and the sidebar stay in lockstep.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  WORKSPACE_CATEGORY_LABEL,
  WORKSPACE_CATEGORY_ORDER,
  type WorkspaceCategory,
  type WorkspaceNavItem,
} from "@/lib/workspace-manifest";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";
import {
  WORKSPACE_STATUS_LABEL,
  type WorkspaceStatus,
} from "@/lib/workspace-status";

// Short, plainspoken descriptor per phase — gives the grouping meaning without
// reintroducing clutter. No emojis, no em dashes.
const CATEGORY_BLURB: Record<WorkspaceCategory, string> = {
  plan: "Get the concept and the numbers right before you commit.",
  setup: "Lock in the place, the menu, and the gear.",
  launch: "Hire, build buzz, and open the doors.",
  operate: "Keep the shop running smoothly once you are open.",
};

// Locked rows used to read "Coming soon", which is platform-speak (Voice
// Mandate, TIM-196). Each phase unlocks once the preceding phase is in hand, so
// the copy names that phase plainly. The first phase has nothing before it.
const LOCKED_COPY: Record<WorkspaceCategory, string> = {
  plan: "Available as you get started.",
  setup: "Available after the Plan phase.",
  launch: "Available after the Set Up phase.",
  operate: "Available after the Launch phase.",
};

function statusDotClass(status: WorkspaceStatus): string {
  switch (status) {
    case "complete":
      return "bg-[var(--teal)]";
    case "in_progress":
      return "bg-amber-400";
    case "not_started":
      return "bg-[var(--warm-1000)]";
  }
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function WorkspaceRow({ item }: { item: WorkspaceNavItem }) {
  const Icon = WORKSPACE_ICONS[item.icon];

  if (!item.isUnlocked) {
    const lockedCopy = LOCKED_COPY[item.category];
    return (
      <div
        aria-disabled="true"
        title={lockedCopy}
        className="flex items-center gap-4 px-4 py-3.5 select-none"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--surface-warm-100)] text-[var(--neutral-cool-400)]">
          <LockIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-[var(--dark-grey)]">{item.label}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-[var(--gray-900)]">{lockedCopy}</span>
        </span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--teal)]/[0.035]"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--teal)]/[0.07] text-[var(--teal)] transition-colors group-hover:bg-[var(--teal)]/10">
        {Icon ? <Icon width={18} height={18} strokeWidth={1.75} aria-hidden="true" /> : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[var(--foreground)] transition-colors group-hover:text-[var(--teal)]">
          {item.label}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-[var(--muted-foreground)]">
          {item.blurb}
        </span>
      </span>

      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDotClass(item.status)}`}
        aria-hidden="true"
      />
      <span className="sr-only">{WORKSPACE_STATUS_LABEL[item.status]}</span>

      <ChevronRight
        size={18}
        className="flex-shrink-0 text-[var(--warm-850)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--teal)]"
        aria-hidden="true"
      />
    </Link>
  );
}

export function WorkspaceNav({ items }: { items: WorkspaceNavItem[] }) {
  return (
    <div className="mb-10">
      <div className="space-y-6">
        {WORKSPACE_CATEGORY_ORDER.map((category) => {
          const groupItems = items.filter((item) => item.category === category);
          if (groupItems.length === 0) return null;
          return (
            <section key={category}>
              <div className="mb-3 px-1">
                <h2 className="text-base font-bold text-[var(--foreground)] leading-tight">
                  {WORKSPACE_CATEGORY_LABEL[category]}
                </h2>
                <p className="text-xs text-[var(--neutral-cool-650)] mt-1">{CATEGORY_BLURB[category]}</p>
              </div>
              <div className="divide-y divide-[var(--warm-500)] overflow-hidden rounded-xl border border-[var(--warm-550)] bg-white">
                {groupItems.map((item) => (
                  <WorkspaceRow key={item.moduleNumber} item={item} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
