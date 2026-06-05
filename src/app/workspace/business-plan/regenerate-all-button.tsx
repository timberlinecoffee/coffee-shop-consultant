"use client";

// TIM-2331: "Regenerate all" workspace-chrome action. Sits as a secondary in
// the business-plan workspace header cluster (Export PDF stays primary).
//
// TIM-2385: Two-phase loading UX. While each section streams in, the unified
// AI review modal stays CLOSED and a compact progress overlay shows
// "Generating section N of M". On SSE `done` we close the overlay and open
// the modal in one motion with every accepted section already populated.
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
import { Sparkles } from "lucide-react";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import type {
  ApprovedChange,
  SuggestionPayload,
} from "@/components/ai-assist/AIReviewModal";
import type { OpenProgressOverlayOptions } from "@/hooks/useBusinessPlanProgressOverlay";

interface EstimatePayload {
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
}

type Phase = "idle" | "estimating" | "confirming" | "streaming";

interface PendingEstimate {
  estimate: EstimatePayload;
  // Hand off the partly-read stream to the streaming step.
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buf: string;
  abortController: AbortController;
}

export function RegenerateAllButton({
  disabled,
  getCurrentSections,
  openAIReviewModal,
  openProgressOverlay,
  updateProgressOverlay,
  closeProgressOverlay,
  onSectionApplied,
  onError,
}: RegenerateAllButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState<PendingEstimate | null>(null);
  const sectionsRef = useRef<SectionCurrent[]>([]);

  const fail = useCallback(
    (msg: string) => {
      setPhase("idle");
      setPending(null);
      onError?.(msg);
    },
    [onError],
  );

  const handleClick = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("estimating");

    const abortController = new AbortController();
    try {
      const res = await fetch("/api/business-plan/regenerate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
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
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        fail("No response stream");
        return;
      }

      const decoder = new TextDecoder();
      let buf = "";
      let estimate: EstimatePayload | null = null;

      // Read until the `estimate` event lands, then pause the stream.
      while (estimate === null) {
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
          if (event === "estimate" && data) {
            try {
              estimate = JSON.parse(data) as EstimatePayload;
            } catch {
              fail("Malformed estimate payload");
              await reader.cancel();
              return;
            }
            break;
          }
          if (event === "error" && data) {
            try {
              const parsed = JSON.parse(data) as { message?: string };
              fail(parsed.message ?? "Stream error");
            } catch {
              fail("Stream error");
            }
            await reader.cancel();
            return;
          }
        }
      }

      if (estimate === null) {
        fail("Server did not send an estimate.");
        return;
      }

      sectionsRef.current = getCurrentSections();
      setPending({ estimate, reader, decoder, buf, abortController });
      setPhase("confirming");
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      fail(err instanceof Error ? err.message : "Request failed");
    }
  }, [phase, fail, getCurrentSections]);

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

    // TIM-2342: accumulate estimated_claims per section key as section:complete
    // events arrive. On Apply, PATCH them alongside user_content so the
    // export-gate modal can read them back later.
    const claimsByKey = new Map<string, unknown[]>();
    const failedTitles: string[] = [];

    const accept = async (accepted: ApprovedChange[]) => {
      for (const a of accepted) {
        try {
          await fetch(`/api/business-plan/sections/${a.fieldId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_content: a.finalValue,
              estimated_claims_json: claimsByKey.get(a.fieldId) ?? [],
            }),
          });
          onSectionApplied(a.fieldId, a.finalValue);
        } catch {
          onError?.(`Failed to save ${titleByKey.get(a.fieldId) ?? a.fieldId}. Try again from the section card.`);
        }
      }
    };

    try {
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
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(data) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (event === "section:complete") {
            const sectionKey = (parsed.sectionKey as string) ?? "";
            const draft = (parsed.draft as string) ?? "";
            if (!sectionKey || !draft) continue;

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
            // Patch the existing buffered suggestion's proposedValue in place
            // so the modal (opened after `done`) shows the unified spelling.
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
            const message = (parsed.message as string) ?? "Stream error";
            onError?.(message);
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        onError?.(err instanceof Error ? err.message : "Stream failed");
      }
    } finally {
      closeProgressOverlay();
      setPhase("idle");
      abortController.abort();
    }

    // TIM-2385: Phase 2 — only open the modal if the user didn't cancel and at
    // least one section streamed successfully. Failed sections are surfaced
    // via the modal banner below.
    if (cancelledByUser) return;
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

  return (
    <>
      <WorkspaceActionButton
        onClick={handleClick}
        disabled={disabled || isBusy}
        aria-label="Regenerate all sections from current platform data"
        title="Regenerate all sections from current platform data"
      >
        <Sparkles size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
        <span className="hidden min-[1536px]:inline">
          {phase === "estimating"
            ? "Estimating..."
            : phase === "streaming"
              ? "Regenerating..."
              : "Regenerate all"}
        </span>
      </WorkspaceActionButton>

      {phase === "confirming" && pending && (
        <RegenerateAllConfirmDialog
          estimate={pending.estimate}
          onCancel={handleCancelConfirm}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}

interface ConfirmProps {
  estimate: EstimatePayload;
  onCancel: () => void;
  onConfirm: () => void;
}

function RegenerateAllConfirmDialog({ estimate, onCancel, onConfirm }: ConfirmProps) {
  const isBetaWaived = estimate.billing_mode === "beta_waiver";
  const insufficient = !isBetaWaived && estimate.credits_remaining < estimate.estimated_credits;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regen-all-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[var(--border)]">
        <div className="px-5 py-4 border-b border-[var(--neutral-cool-150)]">
          <h2 id="regen-all-title" className="text-base font-semibold text-[var(--foreground)]">
            Regenerate the full business plan?
          </h2>
        </div>
        <div className="px-5 py-4 space-y-3">
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
        <div className="px-5 py-3 border-t border-[var(--neutral-cool-150)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-[var(--gray-750)] text-[var(--gray-1150)] text-xs font-semibold hover:bg-[var(--neutral-cool-100)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-xs font-semibold hover:bg-[var(--teal-deep)] transition-colors"
          >
            Regenerate all
          </button>
        </div>
      </div>
    </div>
  );
}
