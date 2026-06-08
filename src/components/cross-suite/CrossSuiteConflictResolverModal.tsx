"use client";

// TIM-2426: Cross-Suite Conflict Resolver — modal shell (UX spec §3 / §6).
//
// Visual canon (per spec §7):
//   - Modal shell matches AIReviewModal.tsx — backdrop, card, close button.
//   - Suite snapshot cards (zone 2) reuse the two-column FactConflict layout.
//   - Path cards (zone 4) match the ValidationFinding severity treatment.
//   - Recommended badge uses the existing green-50/700 tokens.
//   - Benchmark range bar uses existing stone-200 / green-500 / amber-500 tokens.
//
// Voice mandate enforced in copy: no em dashes, no "leverage/unlock/elevate".
//
// This component is presentational. State + apply-on-accept is owned by the
// useCrossSuiteConflictResolver hook in this same folder.

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import type {
  CrossSuiteConflict,
  CrossSuiteSnapshot,
  CrossSuiteBenchmark,
  ResolutionPath,
  DownstreamEffect,
} from "@/lib/cross-suite/types";

export interface CrossSuiteConflictResolverModalProps {
  isOpen: boolean;
  conflict: CrossSuiteConflict | null;
  onClose: () => void;
  onAcceptPath: (path: ResolutionPath) => void;
  onDismiss: () => void;
}

export function CrossSuiteConflictResolverModal({
  isOpen,
  conflict,
  onClose,
  onAcceptPath,
  onDismiss,
}: CrossSuiteConflictResolverModalProps) {
  // ESC closes the modal — same a11y contract as AIReviewModal.
  useEffect(() => {
    if (!isOpen) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [isOpen, onClose]);

  if (!isOpen || !conflict) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Resolve cross-suite conflict"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <Header conflict={conflict} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <Zone1Statement statement={conflict.statement} />
          {conflict.bandBreachAlert && <BandBreachAlert message={conflict.bandBreachAlert} />}
          <Zone2Snapshots
            suiteA={conflict.suiteA}
            suiteB={conflict.suiteB}
            suiteC={conflict.suiteC}
            gapLabel={conflict.gapLabel}
          />
          {conflict.benchmark && <Zone3Benchmark benchmark={conflict.benchmark} />}
          <Zone4Paths
            paths={conflict.paths}
            recommendedPathId={conflict.recommendedPathId}
            onAcceptPath={onAcceptPath}
          />
        </div>
        <Zone5Footer onDismiss={onDismiss} />
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header({ conflict, onClose }: { conflict: CrossSuiteConflict; onClose: () => void }) {
  const title = `Conflict: ${conflict.suiteA.suiteLabel} vs. ${conflict.suiteB.suiteLabel}`;
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[var(--border)]">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-[var(--foreground)] truncate">{title}</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Zone 1: plain-language conflict statement ─────────────────────────────────

function Zone1Statement({ statement }: { statement: string }) {
  return (
    <section aria-label="What's wrong">
      <p className="text-base text-[var(--foreground)] leading-relaxed">{statement}</p>
    </section>
  );
}

// ── Band-breach alert (TIM-2452 fix #4) ──────────────────────────────────────
//
// When the canonical labor % is outside the SCA band, the band breach is the
// load-bearing problem. Without this alert the dollar gap label (which may
// read "$515/month under budget") makes the modal feel exonerating.

function BandBreachAlert({ message }: { message: string }) {
  return (
    <section
      aria-label="Benchmark band alert"
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-sm text-amber-900 leading-relaxed">{message}</p>
    </section>
  );
}

// ── Zone 2: side-by-side current state ────────────────────────────────────────

function Zone2Snapshots({
  suiteA,
  suiteB,
  suiteC,
  gapLabel,
}: {
  suiteA: CrossSuiteSnapshot;
  suiteB: CrossSuiteSnapshot;
  suiteC?: CrossSuiteSnapshot;
  gapLabel?: string;
}) {
  const cols = suiteC ? 3 : 2;
  return (
    <section aria-label="Current state in both suites">
      <div
        className={`grid gap-3 ${cols === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"}`}
      >
        <SnapshotCard snapshot={suiteA} />
        <SnapshotCard snapshot={suiteB} />
        {suiteC && <SnapshotCard snapshot={suiteC} />}
      </div>
      {gapLabel && (
        <p className="mt-3 text-sm text-center font-medium text-amber-700">{gapLabel}</p>
      )}
    </section>
  );
}

function SnapshotCard({ snapshot }: { snapshot: CrossSuiteSnapshot }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {snapshot.suiteLabel}
      </div>
      <div className="mt-1 text-xs text-[var(--muted-foreground)]">{snapshot.fieldLabel}</div>
      <div className="mt-2 text-xl font-semibold text-[var(--foreground)]">
        {snapshot.displayValue}
      </div>
      {snapshot.displaySubvalue && (
        <div className="text-sm text-[var(--muted-foreground)] mt-0.5">
          {snapshot.displaySubvalue}
        </div>
      )}
      {snapshot.deepLinkHref && (
        <a
          href={snapshot.deepLinkHref}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--teal)] hover:underline"
        >
          Open {snapshot.suiteLabel}
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

// ── Zone 3: benchmark grounding ───────────────────────────────────────────────

function Zone3Benchmark({ benchmark }: { benchmark: CrossSuiteBenchmark }) {
  return (
    <section aria-label="Industry benchmark" className="rounded-xl bg-[var(--muted)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)] mb-1">
        Industry benchmark
      </div>
      <p className="text-sm text-[var(--foreground)] leading-relaxed">
        {benchmark.label}{" "}
        <span className="font-medium">{benchmark.rangeLabel}</span>.{" "}
        <span className="font-medium">{benchmark.currentLabel}</span>.
      </p>
      <BenchmarkRangeBar benchmark={benchmark} />
      {benchmark.anchorMinLabel && benchmark.anchorMaxLabel && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Benchmark band at your revenue: {benchmark.anchorMinLabel} to {benchmark.anchorMaxLabel}.
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">Source: {benchmark.source}</p>
    </section>
  );
}

function BenchmarkRangeBar({ benchmark }: { benchmark: CrossSuiteBenchmark }) {
  // Bar runs from 0 to max(rangeMax * 1.4, currentValue * 1.1) so the user's
  // value always fits even when they're well above the band.
  const upper = Math.max(benchmark.rangeMax * 1.4, benchmark.currentValue * 1.1, 0.01);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / upper) * 100))}%`;
  const inRange =
    benchmark.currentValue >= benchmark.rangeMin && benchmark.currentValue <= benchmark.rangeMax;
  return (
    <div className="mt-3 mb-1">
      <div className="relative h-3 rounded-full bg-stone-200">
        {/* Benchmark band */}
        <div
          className="absolute h-full rounded-full bg-green-500/30"
          style={{
            left: pct(benchmark.rangeMin),
            width: `calc(${pct(benchmark.rangeMax)} - ${pct(benchmark.rangeMin)})`,
          }}
          aria-hidden="true"
        />
        {/* Current value marker */}
        <div
          className={`absolute top-0 -mt-0.5 h-4 w-1 rounded-sm ${inRange ? "bg-green-600" : "bg-amber-500"}`}
          style={{ left: pct(benchmark.currentValue) }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// ── Zone 4: resolution paths ──────────────────────────────────────────────────

function Zone4Paths({
  paths,
  recommendedPathId,
  onAcceptPath,
}: {
  paths: ResolutionPath[];
  recommendedPathId: string;
  onAcceptPath: (path: ResolutionPath) => void;
}) {
  // Sort: recommended first, then by id.
  const sorted = useMemo(() => {
    return [...paths].sort((a, b) => {
      if (a.id === recommendedPathId) return -1;
      if (b.id === recommendedPathId) return 1;
      return a.id.localeCompare(b.id);
    });
  }, [paths, recommendedPathId]);

  return (
    <section aria-label="Resolution options">
      <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
        Choose a path forward
      </div>
      <div className="space-y-3">
        {sorted.map((path) => (
          <PathCard
            key={path.id}
            path={path}
            isRecommended={path.id === recommendedPathId}
            onAccept={() => onAcceptPath(path)}
          />
        ))}
      </div>
    </section>
  );
}

function PathCard({
  path,
  isRecommended,
  onAccept,
}: {
  path: ResolutionPath;
  isRecommended: boolean;
  onAccept: () => void;
}) {
  const [expanded, setExpanded] = useState(isRecommended);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-[var(--foreground)]">{path.label}</h3>
            {isRecommended && (
              <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                Recommended
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 leading-relaxed">
            {path.summary}
          </p>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-lg bg-[var(--background)] p-3 border border-[var(--border)]">
            <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
              Downstream effects
            </div>
            <DownstreamEffectsList effects={path.downstreamEffects} />
          </div>
        </div>
      )}
      <div className="border-t border-[var(--border)] px-4 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          {expanded ? "Hide details" : "Show details"}
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={path.suggestions.length === 0}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--teal)] text-white text-sm font-medium px-3 py-1.5 hover:bg-[var(--teal-dark,theme(colors.teal.600))] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Review changes
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function DownstreamEffectsList({ effects }: { effects: DownstreamEffect[] }) {
  if (effects.length === 0) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">No downstream changes.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {effects.map((e, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <EffectRiskIcon risk={e.risk} />
          <div className="min-w-0 flex-1">
            <div className="text-[var(--foreground)]">
              <span className="font-medium">{e.suite}</span> · {e.field}
            </div>
            <div className="text-[var(--muted-foreground)] text-xs">
              {e.from} <ArrowRight className="inline w-3 h-3 -mt-0.5" aria-hidden="true" /> {e.to}
            </div>
            {e.note && (
              <div className={`text-xs mt-0.5 ${effectRiskTextClass(e.risk)}`}>{e.note}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EffectRiskIcon({ risk }: { risk?: DownstreamEffect["risk"] }) {
  if (risk === "block") {
    return <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />;
  }
  if (risk === "warn") {
    return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" aria-hidden="true" />;
  }
  return <Info className="w-4 h-4 text-[var(--teal)] flex-shrink-0 mt-0.5" aria-hidden="true" />;
}

function effectRiskTextClass(risk?: DownstreamEffect["risk"]): string {
  if (risk === "block") return "text-red-700";
  if (risk === "warn") return "text-amber-700";
  return "text-[var(--muted-foreground)]";
}

// ── Zone 5: footer actions ────────────────────────────────────────────────────

function Zone5Footer({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="border-t border-[var(--border)] px-6 py-3 flex items-center justify-between gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        Nothing changes until you accept a path and review the suggestions.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline-offset-2 hover:underline"
      >
        Dismiss for now
      </button>
    </div>
  );
}

// Re-export CheckCircle2 to avoid unused-import lint when severity icons change.
export const _checkMark = CheckCircle2;
