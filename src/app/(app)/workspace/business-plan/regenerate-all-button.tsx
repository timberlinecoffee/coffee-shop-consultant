"use client";

// TIM-2331: "Regenerate all" workspace-chrome action. Sits as a secondary in
// the business-plan workspace header cluster (Export PDF stays primary).
//
// TIM-2385: Two-phase loading UX. While each section streams in, the unified
// AI review modal stays CLOSED and a compact progress overlay shows
// "Generating section N of M". On SSE `done` we close the overlay and open
// the modal in one motion with every accepted section already populated.
//
// TIM-2360: stall detection. If no SSE event arrives for 30s while streaming,
// abort the stream, close the overlay, and surface "Connection stalled" with
// a "Retry remaining N sections" button. Retry re-invokes the route with
// { only: [missingSectionKeys] } so completed sections are not re-generated.
//
// Flow:
//   1. Click → POST /api/business-plan/regenerate-all to fetch the estimate
//      (the route emits an `estimate` event first; we read just that, then
//      either continue reading the stream or abort if the user cancels).
//   2. Confirm dialog shows section count + credit estimate + sparse-section
//      warning. Cancel closes the stream.
//   3. Confirm → open the progress overlay (not the modal). Buffer suggestions
//      in component state, increment the counter on `section:complete`.
//   4. On `done` → close overlay and open the AI review modal with every
//      section. Per-section accept/reject flows through the existing modal.
//   5. Apply → PATCH each accepted section. Reuses /api/business-plan/sections.

import { useCallback, useRef, useState } from "react";
import { Sparkles, ShieldAlert } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { WorkspaceActionMenuItem } from "@/components/workspace/WorkspaceActionMenu";
import type {
  ApprovedChange,
  SuggestionPayload,
} from "@/components/ai-assist/AIReviewModal";
import type { OpenProgressOverlayOptions } from "@/hooks/useBusinessPlanProgressOverlay";
import type { AuditReport } from "@/lib/business-plan/audit";

interface EstimatePayload {
  run_id: string;
  sections: Array<{ key: string; title: string }>;
  estimated_credits: number;
  credits_remaining: number;
  sparse_sections: Array<{ key: string; title: string }>;
  billing_mode: "credits" | "beta_waiver";
}

interface SectionCurrent {
  key: string;
  title: string;
  currentContent: string;
}

export interface RegenerateAllButtonProps {
  /**
   * TIM-2413: render mode. `"button"` (default) keeps the standalone
   * WorkspaceActionButton. `"menuitem"` renders inside a WorkspaceActionMenu
   * popover and accepts a `closeMenu` callback so the menu dismisses on click.
   */
  renderAs?: "button" | "menuitem";
  /** Required when `renderAs === "menuitem"`. */
  closeMenu?: () => void;
  disabled?: boolean;
  /** Current visible content per section, used as the originalValue for diff. */
  getCurrentSections: () => SectionCurrent[];
  /** Open the unified AI review modal (Phase 2 — once `done` arrives). */
  openAIReviewModal: (opts: {
    suggestions: SuggestionPayload[];
    context: { workspace: string; section?: string };
    onApply: (accepted: ApprovedChange[]) => Promise<void>;
    error?: string | null;
  }) => void;
  /** Open the progress overlay (Phase 1 — during streaming). */
  openProgressOverlay: (opts: OpenProgressOverlayOptions) => void;
  /** Increment counter / append failed-section title on the open overlay. */
  updateProgressOverlay: (patch: {
    completed?: number;
    failedSectionTitle?: string;
  }) => void;
  /** Close the progress overlay when streaming finishes or the user cancels. */
  closeProgressOverlay: () => void;
  /** Called after accept; component owns the per-section PATCH. */
  onSectionApplied: (sectionKey: string, finalValue: string) => void;
  /** Called when a non-recoverable error fires the run. */
  onError?: (msg: string) => void;
  /**
   * TIM-2394 pre-flight gate. Runs the Plan Quality Check v2 audit against the
   * SOURCE suites before any regen happens. Returns the AuditReport so this
   * component can decide whether to surface the preflight dialog (when findings
   * exist) or jump straight to the estimate step. Implementations should hit
   * /api/business-plan/audit which already caches by source-suite state hash.
   */
  runPreflightAudit?: () => Promise<AuditReport | null>;
  /**
   * TIM-2394 — invoked when the user clicks "Fix these first" in the preflight
   * dialog. Parent should switch the workspace to the Quality Check tab,
   * surface the report findings, and dismiss the regen flow.
   */
  onFixFirst?: (report: AuditReport) => void;
}

// TIM-2360: "stalled" added for connection-stall detection flow.
// TIM-2394: "preflighting" + "preflight" added for the source-suite quality gate.
type Phase = "idle" | "preflighting" | "preflight" | "estimating" | "confirming" | "streaming" | "stalled";

interface PendingEstimate {
  estimate: EstimatePayload;
  // Hand off the partly-read stream to the streaming step.
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buf: string;
  abortController: AbortController;
  /** Only regenerate these section keys — null means all sections. */
  only: string[] | null;
}

// TIM-2360: 30s of silence → stall state.
const STALL_TIMEOUT_MS = 30_000;

export function RegenerateAllButton({
  renderAs = "button",
  closeMenu,
  disabled,
  getCurrentSections,
  openAIReviewModal,
  openProgressOverlay,
  updateProgressOverlay,
  closeProgressOverlay,
  onSectionApplied,
  onError,
  runPreflightAudit,
  onFixFirst,
}: RegenerateAllButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState<PendingEstimate | null>(null);
  // TIM-2394: AuditReport captured in the preflight step. We hold it in state
  // so the dialog can render the findings and pass them to onFixFirst.
  const [preflightReport, setPreflightReport] = useState<AuditReport | null>(null);
  const sectionsRef = useRef<SectionCurrent[]>([]);
  // TIM-2360: track section keys so retry can pass only= the remaining ones.
  const completedKeysRef = useRef<Set<string>>(new Set());
  const allEstimatedKeysRef = useRef<string[]>([]);
  // Signals the stream was interrupted by the stall timer rather than user cancel.
  const stalledRef = useRef(false);

  const fail = useCallback(
    (msg: string) => {
      setPhase("idle");
      setPending(null);
      onError?.(msg);
    },
    [onError],
  );

  // Shared fetch-and-estimate helper used by both handleClick and handleRetryRemaining.
  const fetchEstimate = useCallback(async (onlyKeys: string[] | null): Promise<PendingEstimate | null> => {
    const abortController = new AbortController();
    try {
      const body = onlyKeys ? JSON.stringify({ only: onlyKeys }) : "{}";
      const res = await fetch("/api/business-plan/regenerate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: abortController.signal,
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.status === 402) {
          fail("AI credits required. Upgrade your plan to regenerate the full plan.");
        } else if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          const mins = retryAfter ? Math.ceil(Number(retryAfter) / 60) : null;
          fail(
            mins
              ? `Regenerate all is limited to 2 runs per hour. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`
              : "Regenerate all is limited to 2 runs per hour. Please wait and try again.",
          );
        } else {
          fail(((j.error as string) ?? "Request failed").toString());
        }
        return null;
      }

      const reader = res.body?.getReader();
      if (!reader) { fail("No response stream"); return null; }

      const decoder = new TextDecoder();
      let buf = "";
      let estimate: EstimatePayload | null = null;

      while (estimate === null) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = ""; let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (event === "estimate" && data) {
            try { estimate = JSON.parse(data) as EstimatePayload; } catch {
              fail("Malformed estimate payload");
              await reader.cancel();
              return null;
            }
            break;
          }
          if (event === "error" && data) {
            try { const p = JSON.parse(data) as { message?: string }; fail(p.message ?? "Stream error"); }
            catch { fail("Stream error"); }
            await reader.cancel();
            return null;
          }
        }
      }

      if (!estimate) { fail("Server did not send an estimate."); return null; }
      return { estimate, reader, decoder, buf, abortController, only: onlyKeys };
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        fail(err instanceof Error ? err.message : "Request failed");
      }
      return null;
    }
  }, [fail]);

  // TIM-2394: shared step that fetches the estimate and pivots the UI into
  // the existing confirm dialog. Extracted so both the cold-start path and the
  // "Generate anyway" continuation from the preflight dialog reuse it.
  const advanceToEstimate = useCallback(async () => {
    completedKeysRef.current = new Set();
    allEstimatedKeysRef.current = [];
    stalledRef.current = false;
    sectionsRef.current = getCurrentSections();
    setPhase("estimating");
    const result = await fetchEstimate(null);
    if (!result) { setPhase("idle"); return; }
    allEstimatedKeysRef.current = result.estimate.sections.map((s) => s.key);
    setPending(result);
    setPhase("confirming");
  }, [fetchEstimate, getCurrentSections]);

  const handleClick = useCallback(async () => {
    if (phase !== "idle") return;

    // TIM-2394 pre-flight gate. If a runPreflightAudit handler is wired and the
    // returned report carries findings, surface the preflight dialog instead of
    // jumping straight to the estimate. If the audit fails or has no findings,
    // proceed directly to the existing estimate-then-confirm flow.
    if (runPreflightAudit) {
      setPhase("preflighting");
      let report: AuditReport | null = null;
      try {
        report = await runPreflightAudit();
      } catch {
        report = null;
      }
      if (report && report.findings.length > 0) {
        setPreflightReport(report);
        setPhase("preflight");
        return;
      }
    }

    await advanceToEstimate();
  }, [phase, runPreflightAudit, advanceToEstimate]);

  // TIM-2394 — user accepted the preflight findings and chose to fix the
  // source suites first. Hand the report back to the parent and dismiss the
  // regen flow entirely.
  const handlePreflightFixFirst = useCallback(() => {
    if (preflightReport) onFixFirst?.(preflightReport);
    setPreflightReport(null);
    setPhase("idle");
  }, [preflightReport, onFixFirst]);

  // TIM-2394 — user dismissed the preflight gate and chose to regenerate
  // anyway. Continue with the existing estimate-then-confirm flow.
  const handlePreflightGenerateAnyway = useCallback(async () => {
    setPreflightReport(null);
    await advanceToEstimate();
  }, [advanceToEstimate]);

  // TIM-2360: retry remaining sections after a stall. Skips confirm dialog
  // and goes straight to estimating → confirming with the remaining keys.
  const handleRetryRemaining = useCallback(async () => {
    const remaining = allEstimatedKeysRef.current.filter(
      (k) => !completedKeysRef.current.has(k),
    );
    if (remaining.length === 0) { setPhase("idle"); return; }
    stalledRef.current = false;
    setPhase("estimating");

    const result = await fetchEstimate(remaining);
    if (!result) { setPhase("idle"); return; }
    setPending(result);
    setPhase("confirming");
  }, [fetchEstimate]);

  const handleCancelConfirm = useCallback(async () => {
    if (pending) {
      pending.abortController.abort();
      await pending.reader.cancel().catch(() => {});
    }
    setPending(null);
    setPhase("idle");
  }, [pending]);

  const handleConfirm = useCallback(async () => {
    if (!pending) return;
    const { estimate, reader, decoder, abortController } = pending;
    let buf = pending.buf;
    // TIM-3018: capture run_id from the estimate payload for accept/reject calls.
    const runId = estimate.run_id;
    setPhase("streaming");
    setPending(null);

    // TIM-2385: Phase 1 — render the progress overlay. The AI review modal
    // stays closed until every section has streamed; the user sees only the
    // counter incrementing.
    let cancelledByUser = false;
    const handleStreamCancel = () => {
      cancelledByUser = true;
      abortController.abort();
      reader.cancel().catch(() => {});
      closeProgressOverlay();
    };
    openProgressOverlay({
      total: estimate.sections.length,
      onCancel: handleStreamCancel,
    });

    // Suggestions buffered locally and handed to the modal in one motion on
    // SSE `done`. Order matches estimate.sections (canonical section order)
    // because we push in arrival order which mirrors the server's loop.
    const suggestions: SuggestionPayload[] = [];
    const currentByKey = new Map(
      sectionsRef.current.map((s) => [s.key, s.currentContent]),
    );
    const titleByKey = new Map(
      estimate.sections.map((s) => [s.key, s.title]),
    );

    // TIM-2342: accumulate estimated_claims per section key.
    const claimsByKey = new Map<string, unknown[]>();
    const failedTitles: string[] = [];

    // TIM-3018: accept/reject now route through the draft-aware endpoints so
    // draft rows are marked accepted/rejected and Shape C is enforced server-side.
    // Fall back to the legacy PATCH when runId is absent (keeps old streams
    // working during a rolling deploy window).
    const accept = async (accepted: ApprovedChange[]) => {
      const failed: string[] = [];
      const acceptedFieldIds = new Set(accepted.map((a) => a.fieldId));

      for (const a of accepted) {
        try {
          let res: Response;
          if (runId) {
            res = await fetch(
              `/api/business-plan/regenerate-all/runs/${runId}/sections/${a.fieldId}/accept`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ finalValue: a.finalValue }),
              },
            );
          } else {
            res = await fetch(`/api/business-plan/sections/${a.fieldId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                user_content: a.finalValue,
                estimated_claims_json: claimsByKey.get(a.fieldId) ?? [],
              }),
            });
          }
          if (!res.ok) {
            failed.push(titleByKey.get(a.fieldId) ?? a.fieldId);
          } else {
            onSectionApplied(a.fieldId, a.finalValue);
          }
        } catch {
          failed.push(titleByKey.get(a.fieldId) ?? a.fieldId);
        }
      }

      // TIM-3018: mark non-accepted sections as rejected so draft rows resolve.
      // Fire-and-forget — user_content is never touched by reject (Shape C).
      if (runId) {
        for (const s of suggestions) {
          if (!acceptedFieldIds.has(s.fieldId)) {
            fetch(
              `/api/business-plan/regenerate-all/runs/${runId}/sections/${s.fieldId}/reject`,
              { method: "POST" },
            ).catch(() => {});
          }
        }
      }

      if (failed.length > 0) {
        throw new Error(
          failed.length === accepted.length
            ? "Couldn't save these changes. Please try again."
            : `Couldn't save ${failed.length} of ${accepted.length} changes. Please try again.`,
        );
      }
    };

    // TIM-2360: stall detection — abort stream and surface stall dialog
    // if no meaningful SSE event arrives for 30s.
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalledRef.current = true;
        abortController.abort();
        reader.cancel().catch(() => {});
      }, STALL_TIMEOUT_MS);
    };

    let streamError: string | null = null;
    try {
      resetStallTimer();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          let event = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!event || !data) continue;
          // Heartbeats keep the TCP connection open but don't indicate
          // section progress — don't reset the stall timer for them.
          if (event !== "heartbeat") resetStallTimer();

          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(data) as Record<string, unknown>; }
          catch { continue; }

          if (event === "section:complete") {
            const sectionKey = (parsed.sectionKey as string) ?? "";
            const draft = (parsed.draft as string) ?? "";
            if (!sectionKey || !draft) continue;

            // TIM-2360: track completed keys so retry knows what to skip.
            completedKeysRef.current.add(sectionKey);

            const claims = Array.isArray(parsed.estimated_claims)
              ? (parsed.estimated_claims as unknown[])
              : [];
            claimsByKey.set(sectionKey, claims);

            const consistencyRaw = Array.isArray(parsed.consistency_contradictions)
              ? parsed.consistency_contradictions
              : [];
            const consistencyContradictions = consistencyRaw
              .map((c) => {
                if (!c || typeof c !== "object") return null;
                const obj = c as Record<string, unknown>;
                const kind = obj.kind;
                const claimA = typeof obj.claim_a === "string" ? obj.claim_a : "";
                const claimB = typeof obj.claim_b === "string" ? obj.claim_b : "";
                const explanation = typeof obj.explanation === "string" ? obj.explanation : "";
                if (!claimA || !claimB) return null;
                const normalizedKind = (kind === "numerical" || kind === "categorical" || kind === "temporal" || kind === "other") ? kind : "other";
                return { kind: normalizedKind as "numerical" | "categorical" | "temporal" | "other", claim_a: claimA, claim_b: claimB, explanation };
              })
              .filter((c): c is NonNullable<typeof c> => c !== null);

            const title = titleByKey.get(sectionKey) ?? sectionKey;
            suggestions.push({
              id: `bp-regen-${sectionKey}`,
              fieldId: sectionKey,
              fieldLabel: title,
              originalValue: currentByKey.get(sectionKey) ?? "",
              proposedValue: draft,
              isStructured: false,
              consistencyContradictions,
            });
            updateProgressOverlay({ completed: suggestions.length });
          } else if (event === "section:revised") {
            // TIM-2337: cross-section entity unification ran on the server.
            const sectionKey = (parsed.sectionKey as string) ?? "";
            const draft = (parsed.draft as string) ?? "";
            if (!sectionKey || !draft) continue;
            const idx = suggestions.findIndex((s) => s.fieldId === sectionKey);
            if (idx >= 0) {
              suggestions[idx] = { ...suggestions[idx], proposedValue: draft };
            }
          } else if (event === "section:error") {
            const sectionKey = (parsed.sectionKey as string) ?? "";
            const title = titleByKey.get(sectionKey) ?? sectionKey;
            failedTitles.push(title);
            updateProgressOverlay({ failedSectionTitle: title });
          } else if (event === "done") {
            // Continue the loop so any trailing section:revised events on the
            // same SSE chunk land before we close the stream.
          } else if (event === "error") {
            streamError = (parsed.message as string) ?? "Stream error";
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        streamError = err instanceof Error ? err.message : "Stream failed";
      }
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
      closeProgressOverlay();
      abortController.abort();
    }

    if (cancelledByUser) { setPhase("idle"); return; }

    // TIM-2360: stall → show stall dialog instead of opening the modal.
    if (stalledRef.current) {
      setPhase("stalled");
      return;
    }

    if (streamError) { onError?.(streamError); }

    setPhase("idle");

    // TIM-2385: Phase 2 — only open the modal if at least one section streamed
    // successfully. Failed sections are surfaced via the modal banner below.
    if (suggestions.length === 0) {
      if (failedTitles.length > 0) {
        onError?.(`Regenerate all finished with no successful sections. Failed: ${failedTitles.join(", ")}.`);
      }
      return;
    }

    const errorBanner = failedTitles.length > 0
      ? `${failedTitles.length} of ${estimate.sections.length} sections failed and are not shown: ${failedTitles.join(", ")}.`
      : null;

    openAIReviewModal({
      suggestions: [...suggestions],
      context: { workspace: "Business Plan", section: "Regenerate all" },
      onApply: accept,
      error: errorBanner,
    });
  }, [
    pending,
    openAIReviewModal,
    openProgressOverlay,
    updateProgressOverlay,
    closeProgressOverlay,
    onSectionApplied,
    onError,
  ]);

  const isBusy = phase !== "idle";
  const label =
    phase === "preflighting"
      ? "Checking..."
      : phase === "estimating"
        ? "Estimating..."
        : phase === "streaming"
          ? "Regenerating..."
          : "Regenerate All";

  const runFromTrigger = () => {
    closeMenu?.();
    void handleClick();
  };

  return (
    <>
      {renderAs === "menuitem" ? (
        <WorkspaceActionMenuItem
          Icon={Sparkles}
          label={label}
          onClick={runFromTrigger}
          disabled={disabled || isBusy}
          aria-label="Regenerate all sections from current platform data"
        />
      ) : (
        <WorkspaceActionButton
          onClick={handleClick}
          disabled={disabled || isBusy}
          aria-label="Regenerate all sections from current platform data"
          title="Regenerate all sections from current platform data"
        >
          <Sparkles size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
          <span>{label}</span>
        </WorkspaceActionButton>
      )}

      {phase === "preflight" && preflightReport && (
        <RegenerateAllPreflightDialog
          report={preflightReport}
          onFixFirst={handlePreflightFixFirst}
          onGenerateAnyway={handlePreflightGenerateAnyway}
          onCancel={() => { setPreflightReport(null); setPhase("idle"); }}
        />
      )}

      {phase === "confirming" && pending && (() => {
        const { estimate } = pending;
        const isBetaWaived = estimate.billing_mode === "beta_waiver";
        const insufficient = !isBetaWaived && estimate.credits_remaining < estimate.estimated_credits;
        return (
          <ConfirmDialog
            title="Regenerate the full business plan?"
            body={
              <div className="space-y-3">
                <p className="text-sm text-[var(--foreground)] leading-relaxed">
                  All {estimate.sections.length} sections will be regenerated from your current
                  platform data. You will review each draft before anything saves.
                </p>
                <div className="rounded-lg bg-[var(--neutral-cool-50)] border border-[var(--neutral-cool-150)] px-3 py-2.5 text-xs text-[var(--foreground)]">
                  {isBetaWaived ? (
                    <span>Beta waiver active: no credits will be charged.</span>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Estimated cost</span>
                        <span className="font-semibold">
                          {estimate.estimated_credits} credit{estimate.estimated_credits === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[var(--muted-foreground)] mt-0.5">
                        <span>Credits remaining</span>
                        <span>{estimate.credits_remaining}</span>
                      </div>
                    </>
                  )}
                </div>
                {insufficient && (
                  <div className="rounded-lg bg-[var(--warning-bg-3,#fff7ed)] border border-[var(--warning-bg,#fed7aa)] px-3 py-2 text-xs text-[var(--warning-dark,#9a3412)]">
                    You do not have enough credits for a full regenerate. Some later sections may
                    fail with an out-of-credits error.
                  </div>
                )}
                {estimate.sparse_sections.length > 0 && (
                  <div className="rounded-lg bg-[var(--neutral-cool-50)] border border-[var(--neutral-cool-150)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                    {estimate.sparse_sections.length} of {estimate.sections.length} sections may be
                    generic because their source workspaces are sparse:{" "}
                    <span className="text-[var(--foreground)]">
                      {estimate.sparse_sections.map((s) => s.title).join(", ")}
                    </span>
                    . You can cancel and fill those first.
                  </div>
                )}
              </div>
            }
            confirmLabel="Regenerate All"
            onCancel={handleCancelConfirm}
            onConfirm={handleConfirm}
            maxWidth="md"
          />
        );
      })()}

      {phase === "stalled" && (
        <RegenerateAllStalledDialog
          completedCount={completedKeysRef.current.size}
          totalCount={allEstimatedKeysRef.current.length}
          onDismiss={() => setPhase("idle")}
          onRetry={handleRetryRemaining}
        />
      )}
    </>
  );
}

// TIM-2394 — pre-flight dialog. Surfaced when the source-suite quality check
// found issues BEFORE the user pays for a regen run. Two actions: route the
// user into Quality Check to fix the source workspaces, or proceed anyway.
interface PreflightProps {
  report: AuditReport;
  onFixFirst: () => void;
  onGenerateAnyway: () => void;
  onCancel: () => void;
}

function RegenerateAllPreflightDialog({ report, onFixFirst, onGenerateAnyway, onCancel }: PreflightProps) {
  const { critical, warning, info, total } = report.stats;
  const bullets = report.findings.slice(0, 3);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regen-preflight-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[var(--border)]">
        <div className="px-5 py-4 border-b border-[var(--neutral-cool-150)] flex items-start gap-3">
          <ShieldAlert
            className="w-5 h-5 mt-0.5 text-amber-600 flex-shrink-0"
            aria-hidden="true"
          />
          <div>
            <h2 id="regen-preflight-title" className="text-base font-semibold text-[var(--foreground)]">
              Check your plan before regenerating
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              We found {total} {total === 1 ? "item" : "items"} worth fixing in your source workspaces.
              Your Business Plan will be generated from this data, so fixing them first means a stronger plan.
            </p>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="rounded-lg bg-[var(--neutral-cool-50)] border border-[var(--neutral-cool-150)] px-3 py-2.5 text-xs text-[var(--foreground)] space-y-1">
            {critical > 0 && (
              <div className="flex justify-between">
                <span className="text-red-700 font-semibold">Fix before launch</span>
                <span className="font-semibold">{critical}</span>
              </div>
            )}
            {warning > 0 && (
              <div className="flex justify-between">
                <span className="text-amber-700 font-semibold">Worth a look</span>
                <span className="font-semibold">{warning}</span>
              </div>
            )}
            {info > 0 && (
              <div className="flex justify-between">
                <span className="text-neutral-600 font-semibold">Heads-up</span>
                <span className="font-semibold">{info}</span>
              </div>
            )}
          </div>
          {bullets.length > 0 && (
            <ul className="space-y-1.5 text-xs text-[var(--foreground)]">
              {bullets.map((f) => (
                <li key={f.id} className="leading-snug">
                  &middot; {f.issue ?? f.raw_message}
                </li>
              ))}
              {total > bullets.length && (
                <li className="text-[var(--muted-foreground)] leading-snug">
                  &middot; {total - bullets.length} more in the Quality Check tab
                </li>
              )}
            </ul>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--neutral-cool-150)] flex justify-between gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-[var(--muted-foreground)] text-xs font-semibold hover:text-[var(--foreground)] transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onGenerateAnyway}
              className="px-3 py-1.5 rounded-lg border border-[var(--gray-750)] text-[var(--gray-1150)] text-xs font-semibold hover:bg-[var(--neutral-cool-100)] transition-colors"
            >
              Generate Anyway
            </button>
            <button
              type="button"
              onClick={onFixFirst}
              className="px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-xs font-semibold hover:bg-[var(--teal-deep)] transition-colors"
            >
              Fix These First
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// TIM-2360: stall detection dialog — shown when no SSE event arrives for 30s.
interface StalledProps {
  completedCount: number;
  totalCount: number;
  onDismiss: () => void;
  onRetry: () => void;
}

function RegenerateAllStalledDialog({ completedCount, totalCount, onDismiss, onRetry }: StalledProps) {
  const remaining = totalCount - completedCount;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regen-stalled-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[var(--border)]">
        <div className="px-5 py-4 border-b border-[var(--neutral-cool-150)]">
          <h2 id="regen-stalled-title" className="text-base font-semibold text-[var(--foreground)]">
            Connection stalled
          </h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-[var(--foreground)] leading-relaxed">
            {completedCount > 0
              ? `${completedCount} of ${totalCount} sections completed and saved. The connection stopped before finishing the remaining ${remaining}.`
              : "The connection to the generation server stopped before any sections completed."}
          </p>
          {remaining > 0 && (
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
              Completed sections were saved automatically. You can retry the remaining {remaining} section{remaining === 1 ? "" : "s"} without losing progress.
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--neutral-cool-150)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-lg border border-[var(--gray-750)] text-[var(--gray-1150)] text-xs font-semibold hover:bg-[var(--neutral-cool-100)] transition-colors"
          >
            Dismiss
          </button>
          {remaining > 0 && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-xs font-semibold hover:bg-[var(--teal-deep)] transition-colors"
            >
              Retry remaining {remaining} section{remaining === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
