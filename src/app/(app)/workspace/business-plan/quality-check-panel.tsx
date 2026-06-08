"use client";

// TIM-2356: Plan Quality Check report panel.
//
// Renders three states from the UX spec (TIM-2355 ux-spec doc):
//   1. Empty — no scan run yet
//   2. Scanning — POST /api/business-plan/audit in flight
//   3. Populated — findings grouped by severity (Fix Before Launch / Worth a Look / Heads-Up)
//
// Behavior:
//   - Findings render with the plain-language synthesis fields when the audit
//     produced them; raw_message is the fallback.
//   - Apply suggestion routes through the shared AI review modal (never
//     auto-applies; spec line 235 + memory).
//   - Go to source emits an action the parent wires (deep-link into the
//     target workspace).
//   - Dismiss hides the card locally; the next re-check re-surfaces it.
//
// Tokens locked to UX spec §4 — neutral palette + teal accent, rounded-xl
// borders, matching the Equipment-table row/divider scale.

import { useCallback, useMemo, useState } from "react";
import { ShieldCheck, RefreshCw, ExternalLink } from "lucide-react";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import type { AuditFinding, AuditReport, AuditSeverity } from "@/lib/business-plan/audit";
import { stripFindingTags } from "@/lib/business-plan/sanitize-finding-text";

// ── Severity chip — matches UX spec §3 + token map. ──────────────────────────

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

// ── FindingCard. ─────────────────────────────────────────────────────────────

interface FindingCardProps {
  finding: AuditFinding;
  onApply: (finding: AuditFinding) => void;
  onGoToSource: (finding: AuditFinding) => void;
  onDismiss: (id: string) => void;
}

function FindingCard({ finding, onApply, onGoToSource, onDismiss }: FindingCardProps) {
  const canApply = Boolean(finding.suggested_replacement);
  // Plain-language synthesis fields are the headline; raw_message is the
  // fallback when synthesis failed for this finding (Haiku timeout, etc.).
  const issue = stripFindingTags(finding.issue ?? finding.raw_message);
  const why = stripFindingTags(finding.why_it_matters ?? "");
  const fix = stripFindingTags(
    finding.suggested_fix ??
      (canApply
        ? `Apply the suggested fix to update ${finding.target.field_label ?? finding.target.workspace_label}.`
        : `Open the ${finding.target.workspace_label} workspace to address this.`),
  );
  return (
    <div className="bg-white px-4 py-4">
      <div className="flex items-start gap-3">
        <SeverityChip level={finding.severity} />
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-neutral-950 leading-snug">
            {issue}
          </p>
          {why && (
            <p className="text-xs text-neutral-500 leading-snug">
              {why}
            </p>
          )}
          <p className="text-xs text-[var(--teal)] leading-snug">
            {fix}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 pl-[76px]">
        {canApply && (
          <button
            type="button"
            className="text-xs font-semibold text-[var(--teal)] hover:underline"
            onClick={() => onApply(finding)}
          >
            Apply suggestion
          </button>
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

// ── Panel. ───────────────────────────────────────────────────────────────────

export interface QualityCheckPanelProps {
  report: AuditReport | null;
  isChecking: boolean;
  checkError: string | null;
  onCheckPlan: () => void;
  onApply: (finding: AuditFinding) => void;
  onGoToSource: (finding: AuditFinding) => void;
}

export function QualityCheckPanel({
  report,
  isChecking,
  checkError,
  onCheckPlan,
  onApply,
  onGoToSource,
}: QualityCheckPanelProps) {
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

  const grouped = useMemo(() => {
    const buckets: Record<AuditSeverity, AuditFinding[]> = { critical: [], warning: [], info: [] };
    for (const f of visibleFindings) buckets[f.severity].push(f);
    return buckets;
  }, [visibleFindings]);

  // State 2: Scanning.
  if (isChecking) {
    return (
      <div className="bg-white rounded-2xl border border-[var(--border)] p-8 flex flex-col items-center justify-center text-center min-h-[320px]">
        <div
          className="w-10 h-10 rounded-full border-2 border-[var(--teal)] border-t-transparent animate-spin mb-4"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-neutral-950 mb-1">
          Checking your plan...
        </p>
        <p className="text-sm text-neutral-500 max-w-sm">
          Reviewing all workspaces for gaps and inconsistencies. This takes about 10 seconds.
        </p>
      </div>
    );
  }

  // State 1: Empty — no scan yet.
  if (!report) {
    return (
      <div className="bg-white rounded-2xl border border-[var(--border)] p-8 flex flex-col items-center justify-center text-center min-h-[320px]">
        <ShieldCheck className="w-10 h-10 text-neutral-300 mb-4" aria-hidden="true" />
        <p className="text-sm font-medium text-neutral-950 mb-1">
          Your plan has not been checked yet
        </p>
        <p className="text-sm text-neutral-500 mb-6 max-w-sm">
          Click &ldquo;Check Plan&rdquo; to scan all your workspaces for gaps, mismatches,
          and things worth fixing before you launch.
        </p>
        {checkError && (
          <p className="text-xs text-red-700 mb-4 max-w-sm">{checkError}</p>
        )}
        <WorkspaceActionButton variant="primary" onClick={onCheckPlan} disabled={isChecking}>
          <ShieldCheck size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
          Check Plan
        </WorkspaceActionButton>
      </div>
    );
  }

  const totalCount = visibleFindings.length;
  const checkedAt = new Date(report.generated_at);
  const formattedDate = checkedAt.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  // State 3: Populated (or All-clear when 0 visible).
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Checked {formattedDate} &mdash; {totalCount} {totalCount === 1 ? "item" : "items"} found
          {report.stats.total !== totalCount ? ` (${report.stats.total - totalCount} dismissed)` : ""}
        </p>
        <WorkspaceActionButton onClick={onCheckPlan} disabled={isChecking} aria-label="Re-check">
          <RefreshCw size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
          <span>Re-check</span>
        </WorkspaceActionButton>
      </div>

      {checkError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {checkError}
        </div>
      )}

      {grouped.critical.length > 0 && (
        <section aria-label="Fix Before Launch findings">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
            Fix Before Launch
          </h2>
          <div className="border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)]">
            {grouped.critical.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                onApply={onApply}
                onGoToSource={onGoToSource}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        </section>
      )}

      {grouped.warning.length > 0 && (
        <section aria-label="Worth a Look findings">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
            Worth a Look
          </h2>
          <div className="border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)]">
            {grouped.warning.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                onApply={onApply}
                onGoToSource={onGoToSource}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        </section>
      )}

      {grouped.info.length > 0 && (
        <section aria-label="Heads-Up findings">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
            Heads-Up
          </h2>
          <div className="border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)]">
            {grouped.info.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                onApply={onApply}
                onGoToSource={onGoToSource}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        </section>
      )}

      {totalCount === 0 && (
        <div className="bg-white rounded-2xl border border-[var(--border)] p-8 flex flex-col items-center justify-center text-center">
          <ShieldCheck className="w-10 h-10 text-[var(--teal)] mb-4" aria-hidden="true" />
          <p className="text-sm font-medium text-neutral-950 mb-1">No issues found</p>
          <p className="text-sm text-neutral-500">
            Your plan looks consistent across all workspaces. Good to go.
          </p>
        </div>
      )}
    </div>
  );
}
