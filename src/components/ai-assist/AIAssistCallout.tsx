"use client";

// TIM-881: AIAssistCallout — centered modal for per-field AI improvement.
// States: draft → streaming → review → quota | error
// Reuses consumeSseFrames from the copilot SSE parser.
// Does NOT create a thread; calls /api/copilot/improve directly.
// TIM-2858: `openAIReviewModal` is owned by the parent (concept-editor) so the
// unified review modal survives this component's unmount when the stream
// completes and we close the draft modal.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CollapseButton } from "@/components/ui/CollapseButton";
import type { WorkspaceKey } from "@/types/supabase";
import { consumeSseFrames } from "@/components/copilot/sse";
import type { OpenAIReviewModalOptions } from "@/hooks/useAIReviewModal";
import { aiErrorCopy, type AiErrorFrame } from "@/lib/ai-error-copy";
import { CreditPacksModal } from "@/components/credit-packs-modal";

export interface AIAssistCalloutProps {
  open: boolean;
  onClose: () => void;
  fieldLabel: string;
  moduleLabel: string;
  fieldKey: string;
  workspaceKey: WorkspaceKey;
  planId: string;
  currentValue: string;
  onApply: (newValue: string) => void;
  openAIReviewModal: (opts: OpenAIReviewModalOptions) => void;
}

// TIM-3445: the failed state now carries the server's whole error frame, not
// a pre-flattened string. The old `{ kind: "error"; message }` threw the
// `code` away at the point of capture, so no amount of care further down could
// have rendered the right thing — which is how "out of credits" came to be
// reported as "Something went wrong" with a Try Again button that could never
// work. The separate `quota` phase is gone: paywall and credit states are
// error codes like any other, and now share one derivation.
type Phase =
  | { kind: "draft" }
  | { kind: "streaming"; buffer: string }
  | { kind: "failed"; frame: AiErrorFrame };

export function AIAssistCallout({
  open,
  onClose,
  fieldLabel,
  moduleLabel,
  fieldKey,
  workspaceKey,
  planId,
  currentValue,
  onApply,
  openAIReviewModal,
}: AIAssistCalloutProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "draft" });
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState(currentValue);
  const [creditPacksOpen, setCreditPacksOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reset to draft state when modal opens with a new value.
  useEffect(() => {
    if (open) {
      setPhase({ kind: "draft" });
      setInstruction("");
      setDraft(currentValue);
    }
  }, [open, currentValue]);

  // Escape key closes when not streaming.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase.kind !== "streaming") onClose();
    },
    [phase.kind, onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  // Abort stream on close.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  const startStream = useCallback(
    async (intent: "improve" | "write") => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setPhase({ kind: "streaming", buffer: "" });

      let response: Response;
      try {
        response = await fetch("/api/copilot/improve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId,
            workspaceKey,
            fieldKey,
            draft: intent === "improve" ? draft : "",
            instruction: instruction.trim() || null,
            intent,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setPhase({ kind: "failed", frame: { code: "network" } });
        return;
      }

      if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
        try {
          const payload = (await response.json()) as {
            code?: string;
            error?: string;
            message?: string;
          };
          // Keep the code. This branch used to read `payload.error` alone.
          setPhase({
            kind: "failed",
            frame: { code: payload.code, message: payload.message ?? payload.error },
          });
        } catch {
          setPhase({ kind: "failed", frame: {} });
        }
        return;
      }

      if (!response.body) {
        setPhase({ kind: "failed", frame: { message: "No response from server." } });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let accumulated = "";
      let doneText: string | null = null;
      let errorFrame: AiErrorFrame | null = null;

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const { events, rest } = consumeSseFrames(sseBuffer);
          sseBuffer = rest;

          for (const evt of events) {
            if (evt.event === "text") {
              try {
                const parsed = JSON.parse(evt.data) as { delta?: string };
                if (parsed.delta) {
                  accumulated += parsed.delta;
                  setPhase({ kind: "streaming", buffer: accumulated });
                }
              } catch {
                /* ignore malformed frame */
              }
            } else if (evt.event === "done") {
              try {
                const parsed = JSON.parse(evt.data) as { text?: string };
                if (parsed.text) doneText = parsed.text;
              } catch {
                /* ignore malformed frame */
              }
            } else if (evt.event === "error") {
              // TIM-3445: pass the frame through whole. The old code branched
              // on a hardcoded list of three codes and collapsed everything
              // else to a message string — so any code the list didn't name,
              // `out_of_credits` included, lost its identity right here.
              try {
                errorFrame = JSON.parse(evt.data) as AiErrorFrame;
              } catch {
                errorFrame = {};
              }
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        errorFrame = { code: "network" };
      } finally {
        abortRef.current = null;
      }

      if (errorFrame) {
        setPhase({ kind: "failed", frame: errorFrame });
        return;
      }

      // TIM-1561: route through unified review modal instead of inline compare.
      // TIM-1382: prefer server-normalized done.text over locally-accumulated deltas.
      const suggested = doneText ?? accumulated;
      openAIReviewModal({
        suggestions: [
          {
            id: `ai-assist-${fieldKey}`,
            fieldId: fieldKey,
            fieldLabel: fieldLabel,
            originalValue: currentValue,
            proposedValue: suggested,
            isStructured: false,
          },
        ],
        context: { workspace: moduleLabel, section: fieldLabel },
        onApply: async (accepted) => {
          if (accepted.length > 0) onApply(accepted[0].finalValue);
          onClose();
        },
      });
      // Close the draft modal — review modal takes over.
      onClose();
    },
    [planId, workspaceKey, fieldKey, draft, instruction, fieldLabel, moduleLabel, currentValue, onApply, onClose, openAIReviewModal],
  );

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase({ kind: "draft" });
  }, []);

  const handleTryAgain = useCallback(() => {
    setPhase({ kind: "draft" });
  }, []);

  if (!open) return null;

  const isStreaming = phase.kind === "streaming";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-assist-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={isStreaming ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Dialog card */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[var(--border)]">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--teal)] mb-0.5">
              {moduleLabel}
            </p>
            <h2
              id="ai-assist-title"
              className="text-base font-semibold text-[var(--foreground)]"
            >
              Improve: {fieldLabel}
            </h2>
          </div>
          <CollapseButton
            onClick={onClose}
            size={16}
            className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-4 mt-0.5 shrink-0"
            aria-label="Close"
            disabled={isStreaming}
          />
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* ── Draft state ─────────────────────────────────── */}
          {phase.kind === "draft" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="ai-draft"
                  className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5"
                >
                  Your current text
                </label>
                <textarea
                  id="ai-draft"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] resize-none leading-relaxed"
                />
              </div>

              <div>
                <label
                  htmlFor="ai-instruction"
                  className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5"
                >
                  Instruction{" "}
                  <span className="text-[var(--dark-grey)] font-normal">(optional)</span>
                </label>
                <input
                  id="ai-instruction"
                  type="text"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g. Make it more specific to the neighbourhood"
                  className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void startStream("improve")}
                  disabled={!draft.trim()}
                  className="flex-1 bg-[var(--teal)] text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Improve this
                </button>
                <button
                  type="button"
                  onClick={() => void startStream("write")}
                  className="flex-1 border border-[var(--teal)] text-[var(--teal)] text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[var(--teal)]/5 transition-colors"
                >
                  Write with AI
                </button>
              </div>
            </div>
          )}

          {/* ── Streaming state ──────────────────────────────── */}
          {phase.kind === "streaming" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mb-3" role="status">
                <span
                  className="inline-block w-3 h-3 rounded-full border-2 border-[var(--teal)] border-t-transparent animate-spin shrink-0"
                  aria-hidden="true"
                />
                <span>Writing suggestion...</span>
              </div>

              <div
                className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 min-h-[80px]"
                aria-live="polite"
                aria-atomic="false"
              >
                <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                  {phase.buffer}
                  <span
                    aria-hidden
                    className="ml-0.5 inline-block w-0.5 h-[1em] align-text-bottom bg-[var(--teal)] animate-pulse"
                  />
                </p>
              </div>

              <button
                type="button"
                onClick={handleAbort}
                className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
              >
                Stop
              </button>
            </div>
          )}

          {/* ── Couldn't write ───────────────────────────────────
              One panel for every reason the write didn't happen. The heading,
              the sentence and the button all come from aiErrorCopy(), so a
              state the product expects (spent credits, paywall) reads calmly
              and offers an action that works, while a real failure reads as a
              failure. Previously these were two hand-written blocks and the
              credits case landed in the wrong one. */}
          {phase.kind === "failed" && (() => {
            const copy = aiErrorCopy(phase.frame);
            const tone = copy.isFailure
              ? {
                  box: "border-[var(--error-bg-9)] bg-[var(--error-bg-2)]",
                  text: "text-[var(--error)]",
                }
              : {
                  box: "border-[var(--warning-text-11)]/40 bg-[var(--warning-bg-4)]",
                  text: "text-[var(--warning-text-9)]",
                };
            // 44px minimum touch target (UX audit, 5 Aug: 38 of 38 controls
            // were under it). These are the buttons a stuck user presses.
            const primaryClass =
              "flex-1 text-center min-h-[44px] inline-flex items-center justify-center bg-[var(--teal)] text-white text-sm font-medium px-4 rounded-xl hover:bg-[var(--teal-dark)] transition-colors";

            return (
              <div className="space-y-4">
                <div className={`rounded-xl border px-4 py-3 ${tone.box}`}>
                  <p className={`text-sm font-semibold mb-1 ${tone.text}`}>
                    {copy.heading}
                  </p>
                  <p className={`text-sm leading-relaxed ${tone.text}`}>
                    {copy.body}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {copy.primaryHref ? (
                    <Link href={copy.primaryHref} className={primaryClass}>
                      {copy.primaryLabel}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={
                        copy.primaryAction === "buy_credits"
                          ? () => setCreditPacksOpen(true)
                          : handleTryAgain
                      }
                      className={primaryClass}
                    >
                      {copy.primaryLabel}
                    </button>
                  )}
                  {copy.secondaryLabel && copy.secondaryHref && (
                    <Link
                      href={copy.secondaryHref}
                      className="flex-1 text-center min-h-[44px] inline-flex items-center justify-center border border-[var(--teal)] text-[var(--teal)] text-sm font-medium px-4 rounded-xl hover:bg-[var(--teal)]/5 transition-colors"
                    >
                      {copy.secondaryLabel}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 min-h-[44px] text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* TIM-1687 top-up, reached from the out-of-credits state. The Copilot
          drawer has offered this for months; the field writer never did. */}
      <CreditPacksModal
        open={creditPacksOpen}
        onClose={() => setCreditPacksOpen(false)}
      />
    </div>
  );
}
