"use client";

// TIM-2331: "Regenerate all" workspace-chrome action. Sits as a secondary in
// the business-plan workspace header cluster (Export PDF stays primary).
//
// Flow:
//   1. Click → POST /api/business-plan/regenerate-all to fetch the estimate
//      (the route emits an `estimate` event first; we read just that, then
//      either continue reading the stream or abort if the user cancels).
//   2. Confirm dialog shows section count + credit estimate + sparse-section
//      warning. Cancel closes the stream.
//   3. Confirm → open the unified AI review modal in streaming mode. As each
//      `section:complete` arrives, append a suggestion card. Per-section
//      accept/reject/edit flows through the existing modal.
//   4. Apply → PATCH each accepted section. Reuses /api/business-plan/sections.

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
  /** Hook to open the unified AI review modal. */
  openAIReviewModal: (opts: {
    suggestions: SuggestionPayload[];
    context: { workspace: string; section?: string };
    onApply: (accepted: ApprovedChange[]) => Promise<void>;
    isStreaming?: boolean;
    error?: string | null;
  }) => void;
  /** Hook to update the open modal as more sections stream in. */
  updateAIReviewModal: (patch: {
    suggestions?: SuggestionPayload[];
    isStreaming?: boolean;
    error?: string | null;
  }) => void;
  /** Called after accept; component owns the per-section PATCH. */
  onSectionApplied: (sectionKey: string, finalValue: string) => void;
  /** Called when the user cancels mid-stream. */
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
  updateAIReviewModal,
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

  const handleCancel = useCallback(async () => {
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

    // Suggestions accumulate as `section:complete` events land. The modal
    // preserves user accept/reject choices when this array grows, per the
    // TIM-2331 fix to AIReviewModal's card-state effect.
    const suggestions: SuggestionPayload[] = [];
    const currentByKey = new Map(
      sectionsRef.current.map((s) => [s.key, s.currentContent]),
    );
    const titleByKey = new Map(
      estimate.sections.map((s) => [s.key, s.title]),
    );

    const accept = async (accepted: ApprovedChange[]) => {
      for (const a of accepted) {
        try {
          await fetch(`/api/business-plan/sections/${a.fieldId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_content: a.finalValue }),
          });
          onSectionApplied(a.fieldId, a.finalValue);
        } catch {
          // Surface a soft error; user can retry individual sections inline.
          onError?.(`Failed to save ${titleByKey.get(a.fieldId) ?? a.fieldId}. Try again from the section card.`);
        }
      }
    };

    openAIReviewModal({
      suggestions: [],
      isStreaming: true,
      context: { workspace: "Business Plan", section: "Regenerate all" },
      onApply: accept,
    });

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

            const title = titleByKey.get(sectionKey) ?? sectionKey;
            suggestions.push({
              id: `bp-regen-${sectionKey}`,
              fieldId: sectionKey,
              fieldLabel: title,
              originalValue: currentByKey.get(sectionKey) ?? "",
              proposedValue: draft,
              isStructured: false,
            });
            updateAIReviewModal({ suggestions: [...suggestions] });
          } else if (event === "section:error") {
            const sectionKey = (parsed.sectionKey as string) ?? "";
            const message = (parsed.message as string) ?? "Section failed.";
            const title = titleByKey.get(sectionKey) ?? sectionKey;
            onError?.(`${title}: ${message}`);
          } else if (event === "done") {
            updateAIReviewModal({ isStreaming: false });
          } else if (event === "error") {
            const message = (parsed.message as string) ?? "Stream error";
            updateAIReviewModal({ isStreaming: false, error: message });
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        updateAIReviewModal({
          isStreaming: false,
          error: err instanceof Error ? err.message : "Stream failed",
        });
      }
    } finally {
      setPhase("idle");
      abortController.abort();
    }
  }, [pending, openAIReviewModal, updateAIReviewModal, onSectionApplied, onError]);

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
          onCancel={handleCancel}
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
