"use client";

import { useCallback, useRef, useState } from "react";
import type { WorkspaceKey } from "@/types/supabase";
import { consumeSseFrames } from "./sse";
import type {
  CopilotErrorState,
  CopilotMessage,
} from "./types";
import type { SuggestionPayload } from "@/components/ai-assist/AIReviewModal";

// TIM-1561: typed suggestions payload emitted by the SSE `suggestions` event.
export interface SuggestionsEvent {
  suggestions: SuggestionPayload[];
  context: { workspace: string; section?: string };
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

  const clearSuggestions = useCallback(() => setPendingSuggestions(null), []);

  const reset = useCallback(() => {
    setAssistantBuffer("");
    setError(null);
    setIsThinking(false);
    setIsStreaming(false);
    setPendingSuggestions(null);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setIsThinking(false);
  }, []);

  const send = useCallback<UseCopilotStreamResult["send"]>(
    async ({ planId, workspaceKey, threadId, history, prompt }) => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      setError(null);
      setAssistantBuffer("");
      setIsStreaming(true);
      setIsThinking(false);

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
      let lastTextAt = 0;
      let lastThinkingAt = 0;
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
              lastThinkingAt = Date.now();
              // Pill stays on while thinking is fresher than text.
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
        setIsStreaming(false);
        setIsThinking(false);
        abortRef.current = null;
      }

      if (finalError) {
        setError(finalError);
        return null;
      }

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
    [],
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
