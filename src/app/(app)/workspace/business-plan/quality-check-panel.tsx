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
//   - Dismiss (TIM-3253): persistent via user_ui_prefs; does not re-surface on reload.
//   - Snooze (TIM-3253): hides for 24h, persists across reloads; shows "Snoozed until" badge.
//
// Tokens locked to UX spec §4 — neutral palette + teal accent, rounded-xl
// borders, matching the Equipment-table row/divider scale.

import { useMemo } from "react";
import { ShieldCheck, RefreshCw, ExternalLink } from "lucide-react";
import { usePlanNotifsMap } from "@/lib/use-plan-notification-pref";
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
  onSnooze: (id: string) => void;
  snoozedUntil?: Date | null;
}

function FindingCard({ finding, onApply, onGoToSource, onDismiss, onSnooze, snoozedUntil }: FindingCardProps) {
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

  if (snoozedUntil) {
    const formatted = snoozedUntil.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    return (
      <div className="bg-white px-4 py-3 flex items-center gap-3">
        <SeverityChip level={finding.severity} />
        <p className="text-xs text-neutral-500 flex-1 min-w-0 truncate">{issue}</p>
        <span className="text-xs text-neutral-400 whitespace-nowrap flex-shrink-0">
          Snoozed Until {formatted}
        </span>
      </div>
    );
  }

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
          onClick={() => onSnooze(finding.id)}
        >
          Snooze 24h
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
  const { isLoaded, storeVersion, getState, dismiss, snooze } = usePlanNotifsMap();

  const visibleFindings = useMemo(() => {
    if (!report) return [] as AuditFinding[];
    if (!isLoaded) return report.findings;
    return report.findings.filter((f) => {
      const s = getState(f.id);
      return !s.isDismissed && !s.isSnoozed;
    });
  // storeVersion changes on every dismiss/snooze, ensuring the memo recomputes
  // even though getState is a stable callback that reads module-scope store.map.
  }, [report, isLoaded, getState, storeVersion]);

  const snoozedFindings = useMemo(() => {
    if (!report || !isLoaded) return [] as AuditFinding[];
    return report.findings.filter((f) => {
      const s = getState(f.id);
      return !s.isDismissed && s.isSnoozed;
    });
  }, [report, isLoaded, getState, storeVersion]);

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
  const hiddenCount = report.findings.length - visibleFindings.length - snoozedFindings.length;

  // State 3: Populated (or All-clear when 0 visible).
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Checked {formattedDate} &mdash; {totalCount} {totalCount === 1 ? "item" : "items"} found
          {hiddenCount > 0 ? ` (${hiddenCount} dismissed)` : ""}
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
                onDismiss={(id) => dismiss(id, "quality_check")}
                onSnooze={(id) => snooze(id, "quality_check")}
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
                onDismiss={(id) => dismiss(id, "quality_check")}
                onSnooze={(id) => snooze(id, "quality_check")}
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
                onDismiss={(id) => dismiss(id, "quality_check")}
                onSnooze={(id) => snooze(id, "quality_check")}
              />
            ))}
          </div>
        </section>
      )}

      {snoozedFindings.length > 0 && (
        <section aria-label="Snoozed findings">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
            Snoozed
          </h2>
          <div className="border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)]">
            {snoozedFindings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                onApply={onApply}
                onGoToSource={onGoToSource}
                onDismiss={(id) => dismiss(id, "quality_check")}
                onSnooze={(id) => snooze(id, "quality_check")}
                snoozedUntil={getState(f.id).snoozedUntil}
              />
            ))}
          </div>
        </section>
      )}

      {totalCount === 0 && snoozedFindings.length === 0 && hiddenCount === 0 && (
        <div className="bg-white rounded-2xl border border-[var(--border)] p-8 flex flex-col items-center justify-center text-center">
          <ShieldCheck className="w-10 h-10 text-[var(--teal)] mb-4" aria-hidden="true" />
          <p className="text-sm font-medium text-neutral-950 mb-1">No issues found</p>
          <p className="text-sm text-neutral-500">
            Your plan looks consistent across all workspaces. Good to go.
          </p>
        </div>
      )}
      {totalCount === 0 && snoozedFindings.length === 0 && hiddenCount > 0 && (
        <div className="bg-white rounded-2xl border border-[var(--border)] p-8 flex flex-col items-center justify-center text-center">
          <ShieldCheck className="w-10 h-10 text-neutral-300 mb-4" aria-hidden="true" />
          <p className="text-sm font-medium text-neutral-950 mb-1">All Findings Dismissed</p>
          <p className="text-sm text-neutral-500">
            {hiddenCount} {hiddenCount === 1 ? "finding" : "findings"} dismissed. Re-check any time to re-scan.
          </p>
        </div>
      )}
    </div>
  );
}
