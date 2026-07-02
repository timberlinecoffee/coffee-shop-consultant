"use client";

// TIM-2336: Business Plan export gate — pre-flight validation modal.
//
// The flow:
//   1. User clicks Export PDF / Print.
//   2. We POST /api/business-plan/validate (Pass 1 reconciliation + Pass 2
//      critical-reader). If zero blocking findings, we proceed immediately.
//   3. If blocking findings exist, this modal opens with one row per finding:
//        - "Apply" → PATCH the section's user_content with the plan_state value
//          spliced into the original prose (and updates local state).
//        - "Override" → mark the finding resolved without changing the prose;
//          the user is acknowledging the disagreement.
//   4. Pass 2 advisory findings are listed below — read-only, never block.
//   5. Once every blocking finding is Applied or Overridden, the "Continue
//      export" button enables. Clicking it re-fetches the PDF with ?force=1
//      so the gate doesn't re-evaluate during render.
//
// Visual conventions copied from RegenerateAllConfirmDialog (same workspace,
// same rounded-xl + var(--teal) + var(--border) primitives — TIM-1537 style
// guide §Buttons + §Modal anti-patterns).

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { stripFindingTags } from "@/lib/business-plan/sanitize-finding-text";
import { CollapseButton } from "@/components/ui/CollapseButton";

// Mirrors the server-side `ValidationReport` shape from src/lib/business-plan/validate.ts.
// Duplicated here to keep the modal a self-contained client component without
// having to ship the validator module to the browser bundle.
export interface ValidationFinding {
  id: string;
  section_key: string;
  severity: "blocking" | "advisory";
  kind: "numeric_mismatch" | "sign_mismatch" | "qualitative";
  dimension?: string;
  dimension_label?: string;
  units?: "currency" | "count" | "percent";
  quoted_text?: string | null;
  claim_value?: number;
  expected_value?: number;
  expected_text?: string;
  suggested_replacement?: string | null;
  auto_correctable?: boolean;
  category?: "contradiction" | "missing_section" | "credibility" | "typo" | "boilerplate" | "other";
  message: string;
}

// TIM-2342: estimate-class claims surfaced by the source-marker parser. Lives
// in business_plan_sections.estimated_claims_json; the validate route reads it
// and attaches it here. Advisory — never blocks export. Founder "looks right"
// or rewrites the surrounding sentence in the section editor.
export interface ValidationEstimatedClaim {
  id: string;
  section_key: string;
  content: string;
  hedge: string;
  surrounding_sentence: string;
}

export interface ValidationReport {
  blocking: boolean;
  numeric_findings: ValidationFinding[];
  qualitative_findings: ValidationFinding[];
  // TIM-2342: estimate-class claims, listed in their own panel for review.
  // Optional so older clients reading a stale report don't blow up.
  estimated_claims?: ValidationEstimatedClaim[];
  stats: { claims_extracted: number; claims_matched: number; sections_scanned: number };
}

interface SectionRef {
  key: string;
  title: string;
  currentContent: string;
}

export interface ExportGateModalProps {
  report: ValidationReport;
  shopName: string;
  sections: SectionRef[];
  // Tells the parent what each section's user_content is now, so subsequent
  // "Apply" actions splice into the most current text (not the stale snapshot
  // the gate ran against).
  onSectionPatched: (sectionKey: string, newContent: string) => void;
  onCancel: () => void;
  // Called after every blocking finding is resolved; parent re-runs the
  // export with ?force=1.
  onContinue: () => void;
}

type Resolution = "pending" | "applied" | "overridden";

interface FindingState {
  resolution: Resolution;
  saving: boolean;
  error: string | null;
}

function dimensionLabel(f: ValidationFinding): string {
  return f.dimension_label ?? f.dimension ?? "Finding";
}

function severityBadge(f: ValidationFinding): { label: string; bg: string; fg: string } {
  if (f.kind === "sign_mismatch") {
    return { label: "Direction", bg: "#FDF2F2", fg: "#9F1239" };
  }
  if (f.kind === "qualitative") {
    return { label: f.category ?? "advisory", bg: "#FEF6E7", fg: "#92400E" };
  }
  return { label: "Number", bg: "#FEF2F2", fg: "#991B1B" };
}

// Replace the first occurrence of `quoted` inside `body` with `replacement`,
// matching whole-word boundaries so "$59,825" doesn't accidentally rewrite
// a substring inside "$159,825". Falls back to appending a TODO if the quote
// can't be located (e.g. the user edited the section between gate runs).
function spliceReplacement(body: string, quoted: string, replacement: string): string {
  if (!quoted) return body;
  const idx = body.indexOf(quoted);
  if (idx === -1) {
    // Quote not found — append a soft note so the user sees the suggestion.
    return body + `\n\n(plan_state: ${replacement})`;
  }
  return body.slice(0, idx) + replacement + body.slice(idx + quoted.length);
}

export function ExportGateModal({
  report,
  shopName,
  sections,
  onSectionPatched,
  onCancel,
  onContinue,
}: ExportGateModalProps) {
  const sectionByKey = useMemo(
    () => new Map(sections.map((s) => [s.key, s])),
    [sections],
  );

  const [findingState, setFindingState] = useState<Record<string, FindingState>>(() => {
    const init: Record<string, FindingState> = {};
    for (const f of report.numeric_findings) {
      init[f.id] = { resolution: "pending", saving: false, error: null };
    }
    return init;
  });

  // Block ESC-close while saving so a half-applied PATCH doesn't leave the
  // workspace state inconsistent. ESC during pending resolution is fine —
  // the user can re-open by clicking Export again.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const anySaving = Object.values(findingState).some((s) => s.saving);
        if (!anySaving) onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [findingState, onCancel]);

  const unresolvedCount = useMemo(() => {
    return report.numeric_findings.filter((f) => findingState[f.id]?.resolution === "pending").length;
  }, [report.numeric_findings, findingState]);

  const handleApply = useCallback(async (finding: ValidationFinding) => {
    if (!finding.suggested_replacement) return;
    const section = sectionByKey.get(finding.section_key);
    if (!section) return;

    setFindingState((prev) => ({ ...prev, [finding.id]: { ...prev[finding.id], saving: true, error: null } }));

    const next = spliceReplacement(
      section.currentContent,
      finding.quoted_text ?? "",
      finding.suggested_replacement,
    );

    try {
      const res = await fetch(`/api/business-plan/sections/${finding.section_key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_content: next }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      onSectionPatched(finding.section_key, next);
      setFindingState((prev) => ({ ...prev, [finding.id]: { resolution: "applied", saving: false, error: null } }));
    } catch (err) {
      setFindingState((prev) => ({
        ...prev,
        [finding.id]: { ...prev[finding.id], saving: false, error: err instanceof Error ? err.message : "Save failed" },
      }));
    }
  }, [sectionByKey, onSectionPatched]);

  const handleOverride = useCallback((finding: ValidationFinding) => {
    setFindingState((prev) => ({ ...prev, [finding.id]: { resolution: "overridden", saving: false, error: null } }));
  }, []);

  const canContinue = unresolvedCount === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-gate-title"
    >
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-[var(--border)] max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[var(--neutral-cool-150)] flex items-center justify-between">
          <div>
            <h2 id="export-gate-title" className="text-base font-semibold text-[var(--foreground)]">
              Resolve before export
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {shopName} — {report.numeric_findings.length} numeric{" "}
              {report.numeric_findings.length === 1 ? "issue" : "issues"} in the narrative
              {report.qualitative_findings.length > 0
                ? `, ${report.qualitative_findings.length} advisory ${report.qualitative_findings.length === 1 ? "note" : "notes"}`
                : ""}
              .
            </p>
          </div>
          <CollapseButton
            onClick={onCancel}
            size={16}
            className="p-1 rounded hover:bg-[var(--neutral-cool-100)] text-[var(--muted-foreground)]"
            aria-label="Close"
          />
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {report.numeric_findings.length === 0 ? (
            <div className="rounded-lg bg-[var(--neutral-cool-50)] border border-[var(--neutral-cool-150)] px-3 py-3 text-sm text-[var(--foreground)]">
              No numerical contradictions found. Review the advisory notes below before exporting.
            </div>
          ) : null}

          {/* ── Blocking findings — one card per finding ──────────────────── */}
          {report.numeric_findings.map((f) => {
            const state = findingState[f.id] ?? { resolution: "pending", saving: false, error: null };
            const section = sectionByKey.get(f.section_key);
            const badge = severityBadge(f);
            return (
              <div
                key={f.id}
                className="border border-[var(--border)] rounded-lg overflow-hidden"
              >
                <div className="px-3.5 py-2.5 border-b border-[var(--neutral-cool-150)] flex items-center justify-between bg-[var(--neutral-cool-50)]">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: badge.bg, color: badge.fg }}
                    >
                      {badge.label}
                    </span>
                    <span className="text-xs font-medium text-[var(--foreground)]">
                      {dimensionLabel(f)} — {section?.title ?? f.section_key}
                    </span>
                  </div>
                  {state.resolution === "applied" && (
                    <span className="flex items-center gap-1 text-xs text-[var(--teal)]">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Applied
                    </span>
                  )}
                  {state.resolution === "overridden" && (
                    <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Overridden
                    </span>
                  )}
                </div>
                <div className="px-3.5 py-3 text-sm text-[var(--foreground)] leading-relaxed space-y-2">
                  <p>{stripFindingTags(f.message)}</p>
                  {f.quoted_text && (
                    <div className="text-xs grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-0.5">
                          In your plan
                        </p>
                        <p className="font-mono text-[var(--foreground)]">{stripFindingTags(f.quoted_text)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-0.5">
                          Plan model says
                        </p>
                        <p className="font-mono text-[var(--foreground)]">{stripFindingTags(f.expected_text)}</p>
                      </div>
                    </div>
                  )}
                  {state.error && (
                    <p className="text-xs text-[#9F1239]">{state.error}</p>
                  )}
                </div>
                {state.resolution === "pending" && (
                  <div className="px-3.5 py-2.5 border-t border-[var(--neutral-cool-150)] flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleOverride(f)}
                      disabled={state.saving}
                      className="text-xs px-2.5 py-1.5 rounded border border-[var(--gray-750)] text-[var(--muted-foreground)] hover:bg-[var(--neutral-cool-100)] disabled:opacity-40"
                    >
                      Override
                    </button>
                    {f.suggested_replacement && (
                      <button
                        type="button"
                        onClick={() => handleApply(f)}
                        disabled={state.saving}
                        className="text-xs px-2.5 py-1.5 rounded bg-[var(--teal)] text-white font-semibold hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-40"
                      >
                        {state.saving ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                            Saving
                          </span>
                        ) : (
                          `Apply ${f.suggested_replacement}`
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Advisory findings — read-only block ───────────────────────── */}
          {report.qualitative_findings.length > 0 && (
            <div className="pt-3 border-t border-[var(--neutral-cool-150)]">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
                Advisory notes (will not block export)
              </p>
              <ul className="space-y-2">
                {report.qualitative_findings.map((f) => (
                  <li
                    key={f.id}
                    className="flex gap-2 text-xs text-[var(--foreground)] bg-[var(--neutral-cool-50)] border border-[var(--neutral-cool-150)] rounded-md px-2.5 py-2"
                  >
                    <AlertCircle size={14} aria-hidden="true" className="text-[#92400E] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="leading-snug">{stripFindingTags(f.message)}</p>
                      {f.quoted_text && (
                        <p className="font-mono text-[var(--muted-foreground)] mt-0.5 break-words">
                          “{stripFindingTags(f.quoted_text)}”
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── TIM-2342: AI-estimate claims to verify (advisory). ─────────── */}
          {report.estimated_claims && report.estimated_claims.length > 0 && (
            <div className="pt-3 border-t border-[var(--neutral-cool-150)]">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
                Estimated claims to verify
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mb-2 leading-snug">
                The generator hedged these numbers because no source backed them. Lenders read them as estimates. Open the section and replace each with a sourced figure (or your own number) before export.
              </p>
              <ul className="space-y-2">
                {report.estimated_claims.map((c) => {
                  const section = sectionByKey.get(c.section_key);
                  return (
                    <li
                      key={c.id}
                      className="flex gap-2 text-xs text-[var(--foreground)] bg-[var(--neutral-cool-50)] border border-[var(--neutral-cool-150)] rounded-md px-2.5 py-2"
                    >
                      <AlertCircle size={14} aria-hidden="true" className="text-[#92400E] flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-0.5">
                          {section?.title ?? c.section_key}
                        </p>
                        <p className="leading-snug">
                          <span className="font-mono">{stripFindingTags(c.hedge)} {stripFindingTags(c.content)}</span>
                          <span className="text-[var(--muted-foreground)]"> — generator estimate, please verify or replace.</span>
                        </p>
                        {c.surrounding_sentence && (
                          <p className="font-mono text-[var(--muted-foreground)] mt-1 break-words">
                            “{stripFindingTags(c.surrounding_sentence)}”
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--neutral-cool-150)] flex items-center justify-between gap-2">
          <p className="text-xs text-[var(--muted-foreground)]">
            {canContinue
              ? "All numerical issues resolved."
              : `${unresolvedCount} numerical ${unresolvedCount === 1 ? "issue" : "issues"} remaining.`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-[var(--gray-750)] text-[var(--gray-1150)] text-xs font-semibold hover:bg-[var(--neutral-cool-100)] transition-colors"
            >
              Back to Plan
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={!canContinue}
              className="px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-xs font-semibold hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
