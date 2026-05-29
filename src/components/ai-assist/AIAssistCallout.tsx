"use client";

// TIM-881: AIAssistCallout — centered modal for per-field AI improvement.
// States: draft → streaming → review → quota | error
// Reuses consumeSseFrames from the copilot SSE parser.
// Does NOT create a thread; calls /api/copilot/improve directly.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Components } from "react-markdown";
import type { WorkspaceKey } from "@/types/supabase";
import { consumeSseFrames } from "@/components/copilot/sse";

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
}

type Phase =
  | { kind: "draft" }
  | { kind: "streaming"; buffer: string }
  | { kind: "review"; suggested: string }
  | { kind: "quota"; reason?: string }
  | { kind: "error"; message: string };

const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--foreground)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
};

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
}: AIAssistCalloutProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "draft" });
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState(currentValue);
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
        setPhase({ kind: "error", message: "Network error. Check your connection and try again." });
        return;
      }

      if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
        try {
          const payload = (await response.json()) as { error?: string };
          setPhase({ kind: "error", message: payload.error ?? "Request failed." });
        } catch {
          setPhase({ kind: "error", message: "Request failed." });
        }
        return;
      }

      if (!response.body) {
        setPhase({ kind: "error", message: "No response from server." });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let accumulated = "";
      let doneText: string | null = null;
      let finalError: string | null = null;
      let quotaState: { reason?: string } | null = null;

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
              try {
                const parsed = JSON.parse(evt.data) as {
                  code?: string;
                  message?: string;
                  reason?: string;
                };
                if (parsed.code === "quota" || parsed.code === "paywall" || parsed.code === "trial_exhausted") {
                  quotaState = { reason: parsed.reason };
                } else {
                  finalError = parsed.message ?? "Something went wrong. Please try again.";
                }
              } catch {
                finalError = "Stream ended with an unknown error.";
              }
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        finalError = err instanceof Error ? err.message : "Connection lost.";
      } finally {
        abortRef.current = null;
      }

      if (quotaState) {
        setPhase({ kind: "quota", reason: quotaState.reason });
        return;
      }

      if (finalError) {
        setPhase({ kind: "error", message: finalError });
        return;
      }

      setPhase({ kind: "review", suggested: doneText ?? accumulated });
    },
    [planId, workspaceKey, fieldKey, draft, instruction],
  );

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase({ kind: "draft" });
  }, []);

  const handleApply = useCallback(() => {
    if (phase.kind !== "review") return;
    onApply(phase.suggested);
    onClose();
  }, [phase, onApply, onClose]);

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
          <button
            type="button"
            onClick={isStreaming ? undefined : onClose}
            disabled={isStreaming}
            aria-label="Close"
            className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-4 mt-0.5 shrink-0"
          >
            <X size={16} aria-hidden="true" />
          </button>
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
                  className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] resize-none leading-relaxed"
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
                  className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)]"
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
                  Write this for me
                </button>
              </div>
            </div>
          )}

          {/* ── Streaming state ──────────────────────────────── */}
          {phase.kind === "streaming" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mb-3">
                <span
                  className="inline-block w-3 h-3 rounded-full border-2 border-[var(--teal)] border-t-transparent animate-spin shrink-0"
                  aria-hidden="true"
                />
                <span>Writing suggestion...</span>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 min-h-[80px]">
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

          {/* ── Review state ─────────────────────────────────── */}
          {phase.kind === "review" && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] mb-2">
                  Current version
                </p>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed whitespace-pre-wrap">
                    {currentValue.trim() || <span className="italic">Empty</span>}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--teal)] mb-2">
                  Suggested version
                </p>
                <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-500)] px-4 py-3">
                  <div className="text-sm text-[var(--foreground)] leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                      components={MD_COMPONENTS}
                    >
                      {phase.suggested}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 bg-[var(--teal)] text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[var(--teal-dark)] transition-colors"
                >
                  Use this version
                </button>
                <button
                  type="button"
                  onClick={handleTryAgain}
                  className="flex-1 border border-[var(--gray-700)] text-[var(--muted-foreground)] text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[var(--gray-200)] transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* ── Quota state ──────────────────────────────────── */}
          {phase.kind === "quota" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--warning-text-11)]/40 bg-[var(--warning-bg-4)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--warning-text-9)] mb-1">
                  AI credits used up
                </p>
                <p className="text-sm text-[var(--warning-text-9)] leading-relaxed">
                  {phase.reason === "paused"
                    ? "Your subscription is paused. Reactivate to keep using AI features."
                    : phase.reason === "expired"
                    ? "Your subscription has expired. Renew to continue."
                    : "You've run out of AI credits for this month. Upgrade for more."}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={
                    phase.reason === "paused" || phase.reason === "expired"
                      ? "/account/billing"
                      : "/pricing"
                  }
                  className="flex-1 text-center bg-[var(--teal)] text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[var(--teal-dark)] transition-colors"
                >
                  {phase.reason === "paused" || phase.reason === "expired"
                    ? "Reactivate"
                    : "Upgrade plan"}
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* ── Error state ──────────────────────────────────── */}
          {phase.kind === "error" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--error-bg-9)] bg-[var(--error-bg-2)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--error)] mb-1">
                  Something went wrong
                </p>
                <p className="text-sm text-[var(--error)] leading-relaxed">
                  {phase.message}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTryAgain}
                  className="flex-1 border border-[var(--teal)] text-[var(--teal)] text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[var(--teal)]/5 transition-colors"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
