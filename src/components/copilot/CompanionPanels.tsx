"use client";

// TIM-2416 — AI Companion v3: mode strip + Check + Benchmark panels.
//
// The drawer hosts three modes — Coach / Check / Benchmark. Coach renders
// the existing chat surface in `CoPilotDrawer`. Check and Benchmark render
// audit-style finding cards (Issue / Why it matters / Suggested fix) in the
// narrow drawer panel. This file owns the slim card variant and the empty /
// scanning / populated states for both scan modes.
//
// Card adjustments vs the Business-Plan Quality Check panel (UX spec §4):
//   - chip + title row is `flex-wrap` so long issue strings don't compress
//     the chip below ~200px panel width.
//   - action row drops the `pl-[76px]` indent — there's no room for it.
//   - card container is `bg-white rounded-xl border px-3 py-3 space-y-2`.

import { useCallback, useMemo, useState } from "react";
import { ArrowRight, BarChart2, ExternalLink, ShieldCheck } from "lucide-react";
import type { AuditFinding, AuditReport, AuditSeverity } from "@/lib/business-plan/audit";
import { stripFindingTags } from "@/lib/business-plan/sanitize-finding-text";

export type CompanionMode = "coach" | "check" | "benchmark";

const SEVERITY_CONFIG: Readonly<Record<AuditSeverity, { label: string; className: string }>> = {
  critical: {
    label: "Fix Before Launch",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  warning: {
    label: "Worth a Look",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  info: {
    label: "Heads-Up",
    className: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
};

function SeverityChip({ level }: { level: AuditSeverity }) {
  const { label, className } = SEVERITY_CONFIG[level];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-none whitespace-nowrap flex-shrink-0 ${className}`}
    >
      {label}
    </span>
  );
}

// ── Slim card for the companion panel. ───────────────────────────────────────

interface CompanionFindingCardProps {
  finding: AuditFinding;
  onApply: (finding: AuditFinding) => void;
  onGoToSource: (finding: AuditFinding) => void;
  onDismiss: (id: string) => void;
  // TIM-2453: when the finding maps to a registered cross-suite resolver
  // conflict AND that conflict is present in today's resolver response, the
  // card swaps its primary CTA for "Review fix options" which dispatches the
  // resolver modal on the same conflict id (no default-conflict fallback).
  crossSuiteConflictId?: string | null;
  onOpenCrossSuite?: (conflictId: string) => void;
}

function CompanionFindingCard({
  finding,
  onApply,
  onGoToSource,
  onDismiss,
  crossSuiteConflictId,
  onOpenCrossSuite,
}: CompanionFindingCardProps) {
  const canApply = Boolean(finding.suggested_replacement);
  const issue = stripFindingTags(finding.issue ?? finding.raw_message);
  const why = stripFindingTags(finding.why_it_matters ?? "");
  const fix = stripFindingTags(
    finding.suggested_fix ??
      (canApply
        ? `Apply the suggested fix to update ${finding.target.field_label ?? finding.target.workspace_label}.`
        : `Open the ${finding.target.workspace_label} workspace to address this.`),
  );
  const hasResolver = Boolean(crossSuiteConflictId && onOpenCrossSuite);
  const openResolver = useCallback(() => {
    if (crossSuiteConflictId && onOpenCrossSuite) onOpenCrossSuite(crossSuiteConflictId);
  }, [crossSuiteConflictId, onOpenCrossSuite]);

  // When a resolver is available, the issue+why+fix region becomes a single
  // interactive button so clicking the surfaced problem opens the modal — the
  // board ask on TIM-2453: "make that link as well, too". Go-to-source and
  // Dismiss stay outside the button so they don't trigger the modal.
  return (
    <div
      className={`bg-white rounded-xl border px-3 py-3 space-y-2 ${
        hasResolver
          ? "border-[var(--teal)]/30 hover:border-[var(--teal)]/60 transition-colors"
          : "border-[var(--border)]"
      }`}
      data-cross-suite-conflict-id={crossSuiteConflictId ?? undefined}
    >
      {hasResolver ? (
        <button
          type="button"
          onClick={openResolver}
          aria-label={`Review fix options for: ${issue}`}
          className="w-full text-left space-y-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] rounded-lg"
        >
          <div className="flex items-start gap-2 flex-wrap">
            <SeverityChip level={finding.severity} />
            <p className="text-sm font-medium text-neutral-950 leading-snug flex-1 min-w-0">
              {issue}
            </p>
          </div>
          {why && (
            <p className="text-xs text-neutral-500 leading-snug">{why}</p>
          )}
          <p className="text-xs text-[var(--teal)] leading-snug">{fix}</p>
        </button>
      ) : (
        <>
          <div className="flex items-start gap-2 flex-wrap">
            <SeverityChip level={finding.severity} />
            <p className="text-sm font-medium text-neutral-950 leading-snug flex-1 min-w-0">
              {issue}
            </p>
          </div>
          {why && (
            <p className="text-xs text-neutral-500 leading-snug">{why}</p>
          )}
          <p className="text-xs text-[var(--teal)] leading-snug">{fix}</p>
        </>
      )}
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {hasResolver ? (
          <button
            type="button"
            className="text-xs font-semibold text-[var(--teal)] hover:underline inline-flex items-center gap-1"
            onClick={openResolver}
            data-testid="cross-suite-review-fix-options"
          >
            Review fix options
            <ArrowRight size={10} aria-hidden="true" />
          </button>
        ) : (
          canApply && (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--teal)] hover:underline"
              onClick={() => onApply(finding)}
            >
              Apply suggestion
            </button>
          )
        )}
        <button
          type="button"
          className="text-xs font-semibold text-neutral-500 hover:text-neutral-950 inline-flex items-center gap-1"
          onClick={() => onGoToSource(finding)}
        >
          <ExternalLink size={10} aria-hidden="true" />
          Go to source
        </button>
        <button
          type="button"
          className="text-xs font-semibold text-neutral-400 hover:text-neutral-500"
          onClick={() => onDismiss(finding.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Mode strip. ──────────────────────────────────────────────────────────────

interface ModeStripProps {
  activeMode: CompanionMode;
  onSelect: (mode: CompanionMode) => void;
}

const MODE_LABEL: Record<CompanionMode, string> = {
  coach: "Coach",
  check: "Check",
  benchmark: "Benchmark",
};

export function ModeStrip({ activeMode, onSelect }: ModeStripProps) {
  return (
    <div className="px-4 py-2 border-b border-[var(--border)]">
      <div
        role="tablist"
        aria-label="Companion mode"
        className="flex items-center gap-1 bg-white border border-[var(--border)] rounded-xl p-1"
      >
        {(["coach", "check", "benchmark"] as const).map((mode) => {
          const active = activeMode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(mode)}
              className={`flex-1 text-center text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? "bg-[var(--teal)] text-white"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {MODE_LABEL[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Severity bucket render helper. ───────────────────────────────────────────

function groupBySeverity(findings: AuditFinding[]): Record<AuditSeverity, AuditFinding[]> {
  const buckets: Record<AuditSeverity, AuditFinding[]> = { critical: [], warning: [], info: [] };
  for (const f of findings) buckets[f.severity].push(f);
  return buckets;
}

interface FindingListProps {
  findings: AuditFinding[];
  onApply: (finding: AuditFinding) => void;
  onGoToSource: (finding: AuditFinding) => void;
  onDismiss: (id: string) => void;
  // TIM-2453: per-finding resolver binding. Resolver returns null when the
  // finding has no registered conflict (or the conflict isn't present in
  // today's resolver response).
  resolverConflictIdFor?: (finding: AuditFinding) => string | null;
  onOpenCrossSuite?: (conflictId: string) => void;
}

function FindingList({
  findings,
  onApply,
  onGoToSource,
  onDismiss,
  resolverConflictIdFor,
  onOpenCrossSuite,
}: FindingListProps) {
  const groups = groupBySeverity(findings);
  const sections: Array<{ key: AuditSeverity; heading: string }> = [
    { key: "critical", heading: "Fix Before Launch" },
    { key: "warning", heading: "Worth a Look" },
    { key: "info", heading: "Heads-Up" },
  ];
  return (
    <div className="space-y-4 pb-4">
      {sections.map((s) => {
        const list = groups[s.key];
        if (list.length === 0) return null;
        return (
          <section key={s.key} aria-label={s.heading}>
            <h3 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              {s.heading}
            </h3>
            <div className="space-y-2">
              {list.map((f) => (
                <CompanionFindingCard
                  key={f.id}
                  finding={f}
                  onApply={onApply}
                  onGoToSource={onGoToSource}
                  onDismiss={onDismiss}
                  crossSuiteConflictId={resolverConflictIdFor?.(f) ?? null}
                  onOpenCrossSuite={onOpenCrossSuite}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Check mode panel. ────────────────────────────────────────────────────────

export interface CheckPanelProps {
  report: AuditReport | null;
  isScanning: boolean;
  error: string | null;
  onRun: () => void;
  onApply: (finding: AuditFinding) => void;
  onGoToSource: (finding: AuditFinding) => void;
  // TIM-2453: when a finding maps to a registered cross-suite conflict, the
  // card swaps its primary CTA for "Review fix options" and dispatches the
  // resolver modal via onOpenCrossSuite.
  resolverConflictIdFor?: (finding: AuditFinding) => string | null;
  onOpenCrossSuite?: (conflictId: string) => void;
}

export function CheckPanel({
  report,
  isScanning,
  error,
  onRun,
  onApply,
  onGoToSource,
  resolverConflictIdFor,
  onOpenCrossSuite,
}: CheckPanelProps) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const visibleFindings = useMemo(() => {
    if (!report) return [] as AuditFinding[];
    return report.findings.filter((f) => !dismissed.has(f.id));
  }, [report, dismissed]);

  if (isScanning) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
        <div
          className="w-8 h-8 rounded-full border-2 border-[var(--teal)] border-t-transparent animate-spin mb-4"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-[var(--foreground)] mb-1">
          Checking your plan...
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          Reviewing all workspaces. About 10 seconds.
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--teal)]/10 flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6 text-[var(--teal)]" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
          Check your plan for issues
        </p>
        <p className="text-sm text-[var(--muted-foreground)] mb-6 max-w-[260px] leading-relaxed">
          Find gaps and things worth fixing before you launch. Covers all your workspaces.
        </p>
        {error && (
          <p className="text-xs text-red-700 mb-4 max-w-[260px]">{error}</p>
        )}
        <button
          type="button"
          onClick={onRun}
          className="bg-[var(--teal)] text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-[var(--teal-dark)] transition-colors"
        >
          Check My Plan
        </button>
      </div>
    );
  }

  if (visibleFindings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--teal)]/10 flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6 text-[var(--teal)]" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
          Your plan looks good
        </p>
        <p className="text-sm text-[var(--muted-foreground)] mb-6 max-w-[240px]">
          No issues found across your workspaces.
        </p>
        <button
          type="button"
          onClick={onRun}
          className="text-xs font-semibold text-[var(--teal)] hover:underline"
        >
          Run again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between pb-3">
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {visibleFindings.length} {visibleFindings.length === 1 ? "item" : "items"} found
        </p>
        <button
          type="button"
          onClick={onRun}
          className="text-[11px] font-semibold text-[var(--teal)] hover:underline"
        >
          Re-check
        </button>
      </div>
      <FindingList
        findings={visibleFindings}
        onApply={onApply}
        onGoToSource={onGoToSource}
        onDismiss={handleDismiss}
        resolverConflictIdFor={resolverConflictIdFor}
        onOpenCrossSuite={onOpenCrossSuite}
      />
    </div>
  );
}

// ── Benchmark mode panel. ────────────────────────────────────────────────────

export interface BenchmarkPanelProps {
  scopeLabel: string;
  report: AuditReport | null;
  isScanning: boolean;
  error: string | null;
  onRun: () => void;
  onApply: (finding: AuditFinding) => void;
  onGoToSource: (finding: AuditFinding) => void;
  // TIM-2453: same hook the Check panel uses — benchmark-mode cross-suite
  // findings (none registered today, but the API is symmetrical so the next
  // pair plugs in without touching this signature).
  resolverConflictIdFor?: (finding: AuditFinding) => string | null;
  onOpenCrossSuite?: (conflictId: string) => void;
}

export function BenchmarkPanel({
  scopeLabel,
  report,
  isScanning,
  error,
  onRun,
  onApply,
  onGoToSource,
  resolverConflictIdFor,
  onOpenCrossSuite,
}: BenchmarkPanelProps) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const visibleFindings = useMemo(() => {
    if (!report) return [] as AuditFinding[];
    return report.findings.filter((f) => !dismissed.has(f.id));
  }, [report, dismissed]);

  if (isScanning) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
        <div
          className="w-8 h-8 rounded-full border-2 border-[var(--teal)] border-t-transparent animate-spin mb-4"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-[var(--foreground)] mb-1">
          Running benchmark...
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          Comparing your numbers now.
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--teal)]/10 flex items-center justify-center mb-4">
          <BarChart2 className="w-6 h-6 text-[var(--teal)]" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
          Compare your numbers to other shops
        </p>
        <p className="text-sm text-[var(--muted-foreground)] mb-2 max-w-[260px] leading-relaxed">
          See how your projections stack up against coffee shops at a similar stage.
        </p>
        <p className="text-xs text-[var(--muted-foreground)] mb-6">{scopeLabel}</p>
        {error && (
          <p className="text-xs text-red-700 mb-4 max-w-[260px]">{error}</p>
        )}
        <button
          type="button"
          onClick={onRun}
          className="bg-[var(--teal)] text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-[var(--teal-dark)] transition-colors"
        >
          Run Benchmark
        </button>
      </div>
    );
  }

  if (visibleFindings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--teal)]/10 flex items-center justify-center mb-4">
          <BarChart2 className="w-6 h-6 text-[var(--teal)]" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
          Your numbers are in range
        </p>
        <p className="text-sm text-[var(--muted-foreground)] mb-2 max-w-[260px] leading-relaxed">
          Nothing stood out against industry benchmarks for this scope.
        </p>
        <p className="text-xs text-[var(--muted-foreground)] mb-6">{scopeLabel}</p>
        <button
          type="button"
          onClick={onRun}
          className="text-xs font-semibold text-[var(--teal)] hover:underline"
        >
          Run again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between pb-3">
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {visibleFindings.length} {visibleFindings.length === 1 ? "item" : "items"} found
        </p>
        <button
          type="button"
          onClick={onRun}
          className="text-[11px] font-semibold text-[var(--teal)] hover:underline"
        >
          Re-run
        </button>
      </div>
      <FindingList
        findings={visibleFindings}
        onApply={onApply}
        onGoToSource={onGoToSource}
        onDismiss={handleDismiss}
        resolverConflictIdFor={resolverConflictIdFor}
        onOpenCrossSuite={onOpenCrossSuite}
      />
    </div>
  );
}
