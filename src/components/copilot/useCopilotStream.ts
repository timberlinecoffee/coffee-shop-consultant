"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceKey } from "@/types/supabase";
import { consumeSseFrames } from "./sse";
import type {
  CopilotErrorState,
  CopilotMessage,
} from "./types";
import type { SuggestionPayload } from "@/components/ai-assist/AIReviewModal";

// TIM-1795: single knobs for the pre-stream "thinking" beat and the typewriter
// reveal cadence. Tune the feel here without touching the streaming logic.
const THINKING_MIN_MS = 2500; // minimum perceived "thinking" beat before text reveals
const REVEAL_CHARS_PER_SEC = 38; // typewriter reveal speed (comfortable 30–45 char/s reading pace)
const REVEAL_MAX_BACKLOG = 280; // cap unrevealed chars mid-stream so reveal never drifts far behind
const REVEAL_DRAIN_SECONDS = 0.5; // once the stream ends, finish the remaining reveal within this window

// TIM-1561: typed suggestions payload emitted by the SSE `suggestions` event.
// TIM-2381: sourceToolName differentiates suggest_workspace_changes proposals
// (which get the "Review changes →" label) from lower-level tool results.
export interface SuggestionsEvent {
  suggestions: SuggestionPayload[];
  context: { workspace: string; section?: string; sourceToolName?: string };
}

interface SendArgs {
  planId: string;
  // TIM-1149: null means a general (workspace-less) conversation.
  workspaceKey: WorkspaceKey | null;
  threadId: string;
  history: CopilotMessage[];
  prompt: string;
}

interface UseCopilotStreamResult {
  isStreaming: boolean;
  isThinking: boolean;
  assistantBuffer: string;
  error: CopilotErrorState | null;
  lastThreadId: string | null;
  lastModelUsed: string | null;
  trialRemaining: number | null;
  // TIM-1671: credit balance after the last turn (null for non-credit accounts).
  creditsRemaining: number | null;
  // TIM-1561: set when the stream emits a `suggestions` event.
  pendingSuggestions: SuggestionsEvent | null;
  clearSuggestions: () => void;
  send: (args: SendArgs) => Promise<{
    threadId: string;
    modelUsed: string | null;
    assistant: string;
    trialRemaining: number | null;
    creditsRemaining: number | null;
  } | null>;
  abort: () => void;
  reset: () => void;
}

export function useCopilotStream(): UseCopilotStreamResult {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [assistantBuffer, setAssistantBuffer] = useState("");
  const [error, setError] = useState<CopilotErrorState | null>(null);
  const [lastThreadId, setLastThreadId] = useState<string | null>(null);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
  const [trialRemaining, setTrialRemaining] = useState<number | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  // TIM-1561: populated when the SSE stream emits a `suggestions` event.
  const [pendingSuggestions, setPendingSuggestions] = useState<SuggestionsEvent | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // TIM-1795: display-layer state for the thinking beat + typewriter reveal.
  // `assistantBuffer` is the *revealed* text; the full streamed text lives in
  // `targetTextRef` and the loop advances `assistantBuffer` toward it at a
  // steady cadence after a minimum thinking beat.
  const targetTextRef = useRef("");
  const revealedRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastTickRef = useRef(0);
  const revealAccRef = useRef(0);
  const streamEndedRef = useRef(false);
  const drainRateRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const revealDoneRef = useRef<(() => void) | null>(null);
  const tickRef = useRef<() => void>(() => {});

  const clearSuggestions = useCallback(() => setPendingSuggestions(null), []);

  const stopReveal = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Flush to the full target and resolve any send() awaiting the reveal.
  const settleReveal = useCallback(() => {
    const full = targetTextRef.current;
    revealedRef.current = full.length;
    if (full) setAssistantBuffer(full);
    setIsThinking(false);
    stopReveal();
    const resolve = revealDoneRef.current;
    revealDoneRef.current = null;
    resolve?.();
  }, [stopReveal]);

  const tick = useCallback(() => {
    const now = performance.now();
    const target = targetTextRef.current;
    const elapsed = now - startedAtRef.current;

    // Hold the minimum thinking beat before the first character appears. If the
    // model itself runs longer than the beat, text reveals as soon as it lands
    // (no stacked delay) because by then `elapsed` already exceeds the beat.
    if (elapsed < THINKING_MIN_MS && revealedRef.current === 0) {
      lastTickRef.current = now;
      rafRef.current = requestAnimationFrame(tickRef.current);
      return;
    }

    if (revealedRef.current < target.length) {
      const dt = now - lastTickRef.current;
      // After the stream ends, drain the remaining backlog at a fixed rate
      // (computed once at end) so it finishes within the drain window and never
      // lags noticeably behind completion.
      const rate =
        streamEndedRef.current && drainRateRef.current > 0
          ? drainRateRef.current
          : REVEAL_CHARS_PER_SEC;
      revealAccRef.current += (dt / 1000) * rate;
      let next = revealedRef.current + Math.floor(revealAccRef.current);
      revealAccRef.current -= Math.floor(revealAccRef.current);
      // Mid-stream catch-up: never let the backlog exceed the cap so long
      // answers don't drift behind the model's actual generation.
      if (!streamEndedRef.current && target.length - next > REVEAL_MAX_BACKLOG) {
        next = target.length - REVEAL_MAX_BACKLOG;
      }
      if (next > revealedRef.current) {
        revealedRef.current = Math.min(next, target.length);
        setIsThinking(false);
        setAssistantBuffer(target.slice(0, revealedRef.current));
      }
    }
    lastTickRef.current = now;

    if (streamEndedRef.current && revealedRef.current >= target.length) {
      settleReveal();
      return;
    }
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [settleReveal]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);
  useEffect(() => () => stopReveal(), [stopReveal]);

  const reset = useCallback(() => {
    stopReveal();
    revealDoneRef.current?.();
    revealDoneRef.current = null;
    targetTextRef.current = "";
    revealedRef.current = 0;
    revealAccRef.current = 0;
    streamEndedRef.current = false;
    setAssistantBuffer("");
    setError(null);
    setIsThinking(false);
    setIsStreaming(false);
    setPendingSuggestions(null);
  }, [stopReveal]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopReveal();
    streamEndedRef.current = true;
    revealDoneRef.current?.();
    revealDoneRef.current = null;
    setIsStreaming(false);
    setIsThinking(false);
  }, [stopReveal]);

  const send = useCallback<UseCopilotStreamResult["send"]>(
    async ({ planId, workspaceKey, threadId, history, prompt }) => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      setError(null);
      setAssistantBuffer("");
      setIsStreaming(true);
      // TIM-1795: show the thinking beat immediately on send, then prime the
      // typewriter reveal loop.
      setIsThinking(true);
      targetTextRef.current = "";
      revealedRef.current = 0;
      revealAccRef.current = 0;
      streamEndedRef.current = false;
      drainRateRef.current = 0;
      const revealStart = performance.now();
      startedAtRef.current = revealStart;
      lastTickRef.current = revealStart;
      stopReveal();
      rafRef.current = requestAnimationFrame(tickRef.current);

      const messages: CopilotMessage[] = [
        ...history,
        { role: "user", content: prompt },
      ];

      let response: Response;
      try {
        response = await fetch("/api/copilot/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, workspaceKey, threadId, messages }),
          signal: controller.signal,
        });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          setIsStreaming(false);
          return null;
        }
        const message =
          err instanceof Error ? err.message : "Network request failed.";
        setError({ code: "network", message });
        setIsStreaming(false);
        return null;
      }

      if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
        try {
          const payload = (await response.json()) as { error?: string };
          setError({
            code: "upstream_error",
            message: payload.error ?? "Request failed.",
          });
        } catch {
          setError({ code: "upstream_error", message: "Request failed." });
        }
        setIsStreaming(false);
        return null;
      }

      if (!response.body) {
        setError({ code: "upstream_error", message: "No response body." });
        setIsStreaming(false);
        return null;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      let resolvedThreadId = threadId;
      let resolvedModelUsed: string | null = null;
      let resolvedTrialRemaining: number | null = null;
      let resolvedCreditsRemaining: number | null = null;
      let finalError: CopilotErrorState | null = null;

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = consumeSseFrames(buffer);
          buffer = rest;
          for (const evt of events) {
            if (evt.event === "thinking") {
              // TIM-1795: the thinking beat is owned by the reveal loop (it
              // shows until the first character is typed), so model `thinking`
              // frames need no extra handling here.
            } else if (evt.event === "text") {
              try {
                const parsed = JSON.parse(evt.data) as { delta?: string };
                if (parsed.delta) {
                  assistant += parsed.delta;
                  // Feed the typewriter loop instead of dumping the buffer.
                  targetTextRef.current = assistant;
                }
              } catch {
                /* ignore malformed text frame */
              }
            } else if (evt.event === "error") {
              try {
                const parsed = JSON.parse(evt.data) as {
                  code?: string;
                  message?: string;
                  reason?: string;
                };
                finalError = {
                  code: (parsed.code as CopilotErrorState["code"]) ?? "upstream_error",
                  message: parsed.message ?? "Something went wrong.",
                  paywallReason: parsed.reason as CopilotErrorState["paywallReason"],
                };
              } catch {
                finalError = {
                  code: "upstream_error",
                  message: "Stream ended with an unknown error.",
                };
              }
            } else if (evt.event === "suggestions") {
              // TIM-1561: structured suggestions payload — triggers review modal in CoPilotDrawer.
              try {
                const parsed = JSON.parse(evt.data) as SuggestionsEvent;
                if (parsed.suggestions?.length) setPendingSuggestions(parsed);
              } catch {
                /* ignore malformed suggestions frame */
              }
            } else if (evt.event === "done") {
              try {
                const parsed = JSON.parse(evt.data) as {
                  threadId?: string;
                  modelUsed?: string;
                  trialRemaining?: number | null;
                  creditsRemaining?: number | null;
                };
                if (parsed.threadId) resolvedThreadId = parsed.threadId;
                if (parsed.modelUsed) resolvedModelUsed = parsed.modelUsed;
                if (typeof parsed.trialRemaining === "number") resolvedTrialRemaining = parsed.trialRemaining;
                if (typeof parsed.creditsRemaining === "number") resolvedCreditsRemaining = parsed.creditsRemaining;
              } catch {
                /* done frame without payload is fine */
              }
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          finalError = {
            code: "network",
            message:
              err instanceof Error ? err.message : "Stream connection lost.",
          };
        }
      } finally {
        abortRef.current = null;
      }

      if (finalError) {
        stopReveal();
        revealDoneRef.current?.();
        revealDoneRef.current = null;
        setIsStreaming(false);
        setIsThinking(false);
        setError(finalError);
        return null;
      }

      // TIM-1795: let the typewriter finish revealing before resolving so the
      // committed message and the streamed bubble never disagree (no jump).
      // Fix the drain rate once so the remaining backlog clears within the
      // drain window rather than decaying with a long tail.
      drainRateRef.current = Math.max(
        REVEAL_CHARS_PER_SEC,
        (targetTextRef.current.length - revealedRef.current) / REVEAL_DRAIN_SECONDS,
      );
      streamEndedRef.current = true;
      await new Promise<void>((resolve) => {
        if (rafRef.current === null || revealedRef.current >= targetTextRef.current.length) {
          settleReveal();
          resolve();
        } else {
          revealDoneRef.current = resolve;
        }
      });
      setIsStreaming(false);
      setIsThinking(false);

      setLastThreadId(resolvedThreadId);
      setLastModelUsed(resolvedModelUsed);
      if (resolvedTrialRemaining !== null) setTrialRemaining(resolvedTrialRemaining);
      if (resolvedCreditsRemaining !== null) setCreditsRemaining(resolvedCreditsRemaining);

      return {
        threadId: resolvedThreadId,
        modelUsed: resolvedModelUsed,
        assistant,
        trialRemaining: resolvedTrialRemaining,
        creditsRemaining: resolvedCreditsRemaining,
      };
    },
    [settleReveal, stopReveal],
  );

  return {
    isStreaming,
    isThinking,
    assistantBuffer,
    error,
    lastThreadId,
    lastModelUsed,
    trialRemaining,
    creditsRemaining,
    pendingSuggestions,
    clearSuggestions,
    send,
    abort,
    reset,
  };
}
