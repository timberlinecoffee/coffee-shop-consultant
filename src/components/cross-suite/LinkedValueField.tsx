"use client";

// TIM-4114 (UX Phase 6): the one shape for a number borrowed from another
// workspace.
//
// Trent, 2026-08-03: "how the numbers from different workspaces cross reference
// each other and are collected in the financials can cause confusion… There
// should be a very simple way to update this and it should be clear to know
// that this has been updated. Like the default should be that it pulls the
// numbers."
//
// The audit found the platform answering that three different ways — a
// reconciliation banner for equipment, an org-sync panel for hiring, and for
// the menu, a bare box the owner typed into while their own recipes held the
// real answer. This component is the single answer, in the same spirit as
// WorkspaceHeader: the caller supplies the pieces, this decides the shape.
//
// What it always shows, in this order:
//
//   1. the number, and whose it is
//   2. when the pull last ran
//   3. one way to disagree, naming what you would be disagreeing with
//
// The rules behind `view` live in lib/cross-workspace/linked-number.ts, which
// is pure and guarded. Nothing about which number wins is decided here — a
// component that could decide that is how the last version ended up stranded
// on a screen nobody loaded.

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Link2, RefreshCw } from "lucide-react";
import {
  freshnessLabel,
  linkedNumberSentence,
  type LinkedNumberView,
} from "@/lib/cross-workspace/linked-number";

export interface LinkedValueFieldProps {
  /** The field's name, in the owner's words. */
  label: string;
  view: LinkedNumberView;
  /** Renders a value in its own units — "31.4%", "$4,500". */
  format: (value: number) => string;
  /** The owning workspace, named the way the owner would name it. */
  ownerLabel: string;
  ownerHref: string;
  /** What the pulled number is blended from, e.g. "18 priced drinks". */
  basis?: string | null;
  /** When the pull last ran, in ms. Null until the first one completes. */
  syncedAtMs?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Switch back to the pulled number. */
  onUseLinked: () => void;
  /** Take over with your own. */
  onUseOwn: () => void;
  /** The owner's own input, rendered only while their number is in play. */
  input: ReactNode;
  /** Optional disclosure — the per-item breakdown, for instance. */
  children?: ReactNode;
  canEdit: boolean;
  className?: string;
}

/** How often the freshness stamp re-reads the clock. */
const CLOCK_TICK_MS = 30_000;

/**
 * The wall clock, as an external system React subscribes to.
 *
 * Returns null on the server, so "Checked just now" never renders during SSR
 * and then disagrees with the client a moment later — a freshness stamp that
 * flickers on load is worse than no stamp at all.
 *
 * The snapshot is rounded down to the tick so it is stable between ticks;
 * returning a raw Date.now() would hand React a new value on every read and
 * spin forever.
 */
function useClientClock(): number | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      const t = setInterval(onStoreChange, CLOCK_TICK_MS);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / CLOCK_TICK_MS) * CLOCK_TICK_MS,
    () => null,
  );
}

export function LinkedValueField({
  label,
  view,
  format,
  ownerLabel,
  ownerHref,
  basis,
  syncedAtMs,
  onRefresh,
  isRefreshing,
  onUseLinked,
  onUseOwn,
  input,
  children,
  canEdit,
  className,
}: LinkedValueFieldProps) {
  const nowMs = useClientClock();
  const freshness = nowMs === null ? null : freshnessLabel(syncedAtMs, nowMs);
  const sentence = linkedNumberSentence(view, { ownerLabel, format, basis });
  const linked = view.using === "linked";

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="block text-xs font-medium text-[var(--muted-foreground)]">
          {label}
        </span>
        {linked ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--teal)] shrink-0">
            <Link2 className="w-3 h-3" aria-hidden="true" />
            From {ownerLabel}
          </span>
        ) : null}
      </div>

      {linked ? (
        // The pulled number is a readout, not a box. A box invites a
        // keystroke, and a keystroke here silently severs the link — which is
        // the failure this whole phase exists to undo.
        <div className="rounded-xl border border-[var(--teal-bg-750)] bg-[var(--teal-bg-f0f8)] px-3 py-2.5">
          <p className="text-lg font-bold text-[var(--foreground)] tabular-nums leading-tight">
            {view.value === null ? "—" : format(view.value)}
          </p>
        </div>
      ) : (
        input
      )}

      <p className="mt-1.5 text-xs text-[var(--muted-foreground)] leading-snug">
        {sentence}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {linked && freshness ? (
          <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
            {freshness}
          </span>
        ) : null}

        {linked && onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--teal)] hover:underline disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {isRefreshing ? "Checking…" : "Check again"}
          </button>
        ) : null}

        <Link
          href={ownerHref}
          className="text-[11px] font-semibold text-[var(--teal)] hover:underline"
        >
          Open {ownerLabel}
        </Link>

        {canEdit && view.using === "linked" ? (
          <button
            type="button"
            onClick={onUseOwn}
            className="text-[11px] font-semibold text-[var(--muted-foreground)] hover:underline"
          >
            Use my own number
          </button>
        ) : null}

        {canEdit && view.using === "manual" ? (
          <button
            type="button"
            onClick={onUseLinked}
            className="text-[11px] font-semibold text-[var(--teal)] hover:underline"
          >
            Go back to the {ownerLabel} number
          </button>
        ) : null}
      </div>

      {children}
    </div>
  );
}
