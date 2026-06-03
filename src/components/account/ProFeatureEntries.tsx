"use client";

// TIM-1956 Phase 2C: client-side Pro-feature entry points on the Account page.
// Renders two locked-state rows for Starter users — Office Hours and
// multi-project — each of which opens the ProUpgradePrompt with the matching
// Marketing v3 microcopy. Pro/trial users see plain "available" rows and the
// modal is not wired up.
//
// We keep this as a single component (rather than wiring Office Hours and
// multi-project as their own pages) because Phase 2C scope is upgrade-prompt
// surfacing only — the Office Hours calendar (2F) and multi-project picker
// (2G) ship later.

import { useState } from "react";
import Link from "next/link";
import { ProUpgradePrompt, type ProFeatureKey } from "@/components/pro-upgrade-prompt";

interface ProFeatureEntriesProps {
  isPro: boolean;
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

interface FeatureRow {
  feature: ProFeatureKey;
  label: string;
  blurb: string;
}

const ROWS: FeatureRow[] = [
  {
    feature: "office_hours",
    label: "Weekly Office Hours",
    blurb: "Live Q&A every week with Trent. Live + recordings.",
  },
  {
    feature: "multi_project",
    label: "Additional Projects",
    blurb: "Plan more than one shop or location side-by-side.",
  },
];

export function ProFeatureEntries({ isPro }: ProFeatureEntriesProps) {
  const [prompted, setPrompted] = useState<ProFeatureKey | null>(null);

  return (
    <>
      <div className="bg-white rounded-2xl border border-[var(--border)] p-6">
        <h2 className="font-semibold text-[var(--foreground)] mb-4">
          Pro Features
        </h2>
        <div className="divide-y divide-[var(--border)]">
          {ROWS.map((row) => {
            const labelEl = (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  {!isPro && (
                    <span className="text-[var(--neutral-cool-400)]">
                      <LockIcon />
                    </span>
                  )}
                  <span>{row.label}</span>
                </div>
                <p className="text-xs text-[var(--dark-grey)] mt-1">
                  {row.blurb}
                </p>
              </div>
            );

            if (isPro) {
              return (
                <div
                  key={row.feature}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  {labelEl}
                  <span className="text-xs font-medium text-[var(--teal)]">
                    Included
                  </span>
                </div>
              );
            }

            return (
              <button
                key={row.feature}
                type="button"
                onClick={() => setPrompted(row.feature)}
                className="flex items-center gap-4 py-4 first:pt-0 last:pb-0 w-full text-left hover:bg-[var(--surface-warm-100)] -mx-2 px-2 rounded-lg transition-colors"
                data-testid={`pro-feature-entry-${row.feature}`}
              >
                {labelEl}
                <span className="text-xs font-medium text-[var(--teal)] underline">
                  Upgrade
                </span>
              </button>
            );
          })}
        </div>
        {!isPro && (
          <p className="text-xs text-[var(--dark-grey)] mt-4">
            On Starter today. <Link href="/pricing" className="text-[var(--teal)] hover:underline">See what Pro adds.</Link>
          </p>
        )}
      </div>

      <ProUpgradePrompt
        open={prompted !== null}
        onClose={() => setPrompted(null)}
        feature={prompted ?? "generic"}
      />
    </>
  );
}
