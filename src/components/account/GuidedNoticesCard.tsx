// TIM-2423: Settings → Preferences → Guided Notices.
//
// Lists every callout the user has dismissed and offers a "Show again" button
// that removes the key from `platform.dismissed-callouts` so the callout
// reappears on next page load. Empty state per the TIM-1537 voice rule:
// sentence case, no em dashes, no AI-cliché vocabulary.

"use client";

import { useDismissedCallouts } from "@/lib/use-callout-dismissed";
import { CALLOUT_REGISTRY, type CalloutKey } from "@/lib/callouts";

type Variant = "stacked-card" | "tab";

export function GuidedNoticesCard({ variant = "stacked-card" }: { variant?: Variant }) {
  const { state, map, resurface } = useDismissedCallouts();
  const isLoading = state === "loading" || state === "idle";

  const entries = Object.entries(map)
    .map(([key, dismissedAt]) => {
      const registry = CALLOUT_REGISTRY[key as CalloutKey];
      return {
        key,
        label: registry?.label ?? key,
        workspace: registry?.workspace ?? "Other",
        dismissedAt,
        known: !!registry,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const wrapperCls =
    variant === "stacked-card"
      ? "bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6"
      : "bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6";

  return (
    <div className={wrapperCls}>
      <h2 className="font-semibold text-[var(--foreground)] mb-1">Guided Notices</h2>
      <p className="text-xs text-[var(--muted-foreground)] mb-4">
        Notices you&apos;ve dismissed across the app. Show one again and it will reappear next
        time you visit that page.
      </p>

      {isLoading ? (
        <p className="text-sm text-[var(--dark-grey)]">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-[var(--dark-grey)]">
          You haven&apos;t dismissed any notices. They&apos;ll appear here when you do.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {entries.map((entry) => (
            <li
              key={entry.key}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--foreground)] truncate">
                  {entry.label}
                </p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {entry.workspace}
                  {!entry.known ? " · retired notice" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => resurface(entry.key)}
                className="text-xs font-semibold text-[var(--teal)] border border-[var(--teal)]/30 rounded-lg px-3 py-1.5 hover:bg-[var(--teal)]/5 transition-colors whitespace-nowrap"
              >
                Show Again
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
