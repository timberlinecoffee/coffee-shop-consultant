"use client";

import { useCallback, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import type { WorkspaceKey } from "@/types/supabase";
import { consumeSseFrames } from "./sse";
import {
  GAP_MS,
  TTFT_MS,
  fromHttpError,
  parseErrorFrame,
  shouldAutoRetry,
  timeoutError,
  trackVisibleError,
} from "./errors";
import type { CopilotErrorState, CopilotMessage } from "./types";

interface SendArgs {
  planId: string;
  workspaceKey: WorkspaceKey;
  threadId: string;
  history: CopilotMessage[];
  prompt: string;
}

interface AttemptResult {
  outcome: "success" | "error" | "aborted";
  error: CopilotErrorState | null;
  threadId: string;
  modelUsed: string | null;
  assistant: string;
}

interface UseCopilotStreamResult {
  isStreaming: boolean;
  isThinking: boolean;
  assistantBuffer: string;
  error: CopilotErrorState | null;
  lastThreadId: string | null;
  lastModelUsed: string | null;
  send: (args: SendArgs) => Promise<{
    threadId: string;
    modelUsed: string | null;
    assistant: string;
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
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setAssistantBuffer("");
    setError(null);
    setIsThinking(false);
    setIsStreaming(false);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setIsThinking(false);
  }, []);

  const runAttempt = useCallback(
    async ({
      planId,
      workspaceKey,
      threadId,
      history,
      prompt,
    }: SendArgs): Promise<AttemptResult> => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      setAssistantBuffer("");
      setIsStreaming(true);
      setIsThinking(false);

      const messages: CopilotMessage[] = [
        ...history,
        { role: "user", content: prompt },
      ];

      // Client-side TTFT + gap watchdogs (defense-in-depth on top of server timers).
      // If the server already emits a timeout error frame we'll see that first; if the
      // pipe goes silent (proxy ate the heartbeat, fetch hung), these fire instead.
      let ttftTimer: ReturnType<typeof setTimeout> | null = null;
      let gapTimer: ReturnType<typeof setTimeout> | null = null;
      let watchdogError: CopilotErrorState | null = null;

      const clearTimers = () => {
        if (ttftTimer) {
          clearTimeout(ttftTimer);
          ttftTimer = null;
        }
        if (gapTimer) {
          clearTimeout(gapTimer);
          gapTimer = null;
        }
      };

      const tripWatchdog = (kind: "ttft" | "gap") => {
        if (watchdogError) return;
        watchdogError = timeoutError(kind);
        clearTimers();
        controller.abort();
      };

      ttftTimer = setTimeout(() => tripWatchdog("ttft"), TTFT_MS);

      const noteChunk = () => {
        if (ttftTimer) {
          clearTimeout(ttftTimer);
          ttftTimer = null;
        }
        if (gapTimer) clearTimeout(gapTimer);
        gapTimer = setTimeout(() => tripWatchdog("gap"), GAP_MS);
      };

      let response: Response;
      try {
        response = await fetch("/api/copilot/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, workspaceKey, threadId, messages }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimers();
        if (watchdogError) {
          return {
            outcome: "error",
            error: watchdogError,
            threadId,
            modelUsed: null,
            assistant: "",
          };
        }
        if ((err as { name?: string }).name === "AbortError") {
          return {
            outcome: "aborted",
            error: null,
            threadId,
            modelUsed: null,
            assistant: "",
          };
        }
        return {
          outcome: "error",
          error: {
            code: "network",
            message:
              err instanceof Error ? err.message : "Network request failed.",
          },
          threadId,
          modelUsed: null,
          assistant: "",
        };
      }

      if (!response.ok) {
        clearTimers();
        let payload: unknown = null;
        if (response.headers.get("content-type")?.includes("application/json")) {
          try {
            payload = await response.json();
          } catch {
            /* empty */
          }
        }
        return {
          outcome: "error",
          error: fromHttpError(response.status, payload),
          threadId,
          modelUsed: null,
          assistant: "",
        };
      }

      if (!response.body) {
        clearTimers();
        return {
          outcome: "error",
          error: { code: "upstream_error", message: "No response body." },
          threadId,
          modelUsed: null,
          assistant: "",
        };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      let lastTextAt = 0;
      let lastThinkingAt = 0;
      let resolvedThreadId = threadId;
      let resolvedModelUsed: string | null = null;
      let serverError: CopilotErrorState | null = null;

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = consumeSseFrames(buffer);
          buffer = rest;
          for (const evt of events) {
            // Any framed event is liveness — reset the gap watchdog (and clear TTFT).
            noteChunk();
            if (evt.event === "thinking") {
              lastThinkingAt = Date.now();
              if (lastThinkingAt > lastTextAt) setIsThinking(true);
            } else if (evt.event === "text") {
              try {
                const parsed = JSON.parse(evt.data) as { delta?: string };
                if (parsed.delta) {
                  assistant += parsed.delta;
                  setAssistantBuffer(assistant);
                  lastTextAt = Date.now();
                  setIsThinking(false);
                }
              } catch {
                /* ignore malformed text frame */
              }
            } else if (evt.event === "error") {
              serverError = parseErrorFrame(evt.data);
            } else if (evt.event === "done") {
              try {
                const parsed = JSON.parse(evt.data) as {
                  threadId?: string;
                  modelUsed?: string;
                };
                if (parsed.threadId) resolvedThreadId = parsed.threadId;
                if (parsed.modelUsed) resolvedModelUsed = parsed.modelUsed;
              } catch {
                /* done frame without payload is fine */
              }
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          // Aborted either by us (watchdog or user) or by the network.
          clearTimers();
          if (watchdogError) {
            return {
              outcome: "error",
              error: watchdogError,
              threadId: resolvedThreadId,
              modelUsed: resolvedModelUsed,
              assistant,
            };
          }
          return {
            outcome: "aborted",
            error: null,
            threadId: resolvedThreadId,
            modelUsed: resolvedModelUsed,
            assistant,
          };
        }
        clearTimers();
        return {
          outcome: "error",
          error: {
            code: "network",
            message:
              err instanceof Error ? err.message : "Stream connection lost.",
          },
          threadId: resolvedThreadId,
          modelUsed: resolvedModelUsed,
          assistant,
        };
      } finally {
        clearTimers();
        setIsStreaming(false);
        setIsThinking(false);
        if (abortRef.current === controller) abortRef.current = null;
      }

      if (watchdogError) {
        return {
          outcome: "error",
          error: watchdogError,
          threadId: resolvedThreadId,
          modelUsed: resolvedModelUsed,
          assistant,
        };
      }

      if (serverError) {
        return {
          outcome: "error",
          error: serverError,
          threadId: resolvedThreadId,
          modelUsed: resolvedModelUsed,
          assistant,
        };
      }

      return {
        outcome: "success",
        error: null,
        threadId: resolvedThreadId,
        modelUsed: resolvedModelUsed,
        assistant,
      };
    },
    [],
  );

  const send = useCallback<UseCopilotStreamResult["send"]>(
    async (args) => {
      setError(null);

      let attempt = await runAttempt(args);

      // Auto-retry once silently for timeouts, per TIM-606 spec / TIM-635.
      if (
        attempt.outcome === "error" &&
        attempt.error &&
        shouldAutoRetry(attempt.error.code)
      ) {
        attempt = await runAttempt(args);
      }

      if (attempt.outcome === "aborted") {
        return null;
      }

      if (attempt.outcome === "error" && attempt.error) {
        setError(attempt.error);
        trackVisibleError(
          attempt.error,
          { workspaceKey: args.workspaceKey, modelUsed: attempt.modelUsed },
          track,
        );
        return null;
      }

      setLastThreadId(attempt.threadId);
      setLastModelUsed(attempt.modelUsed);

      return {
        threadId: attempt.threadId,
        modelUsed: attempt.modelUsed,
        assistant: attempt.assistant,
      };
    },
    [runAttempt],
  );

  return {
    isStreaming,
    isThinking,
    assistantBuffer,
    error,
    lastThreadId,
    lastModelUsed,
    send,
    abort,
    reset,
  };
}
