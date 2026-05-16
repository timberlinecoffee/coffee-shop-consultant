"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceKey } from "@/types/supabase";
import { errorCopy } from "./errors";
import type {
  CopilotFocus,
  CopilotMessage,
  CopilotThreadSummary,
} from "./types";
import { useCopilotStream } from "./useCopilotStream";

export interface CoPilotDrawerProps {
  workspaceKey: WorkspaceKey;
  planId: string;
  currentFocus?: CopilotFocus;
}

interface ThreadRow {
  thread_id: string | null;
  title: string | null;
  last_message_at: string | null;
  workspace_key: WorkspaceKey | null;
  model_used: string | null;
  messages: unknown;
}

const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  concept: "Concept",
  location_lease: "Location & Lease",
  financials: "Financials",
  menu_pricing: "Menu & Pricing",
  buildout_equipment: "Build-out & Equipment",
  launch_plan: "Launch Plan",
};

function newThreadId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function deriveTitle(messages: CopilotMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const trimmed = firstUser.content.trim();
  if (!trimmed) return "New conversation";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}


export function CoPilotDrawer({
  workspaceKey,
  planId,
  currentFocus,
}: CoPilotDrawerProps) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<CopilotThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string>(() => newThreadId());
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const {
    isStreaming,
    isThinking,
    assistantBuffer,
    error,
    send,
    abort,
    reset,
  } = useCopilotStream();

  const supabase = useMemo(() => createClient(), []);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError(null);
    const { data, error: queryError } = await supabase
      .from("ai_conversations")
      .select("thread_id, title, last_message_at, workspace_key, model_used, messages")
      .eq("plan_id", planId)
      .eq("workspace_key", workspaceKey)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (queryError) {
      setThreadsError(queryError.message);
      setThreadsLoading(false);
      return;
    }

    const rows = (data ?? []) as ThreadRow[];
    const summaries: CopilotThreadSummary[] = rows
      .filter((row): row is ThreadRow & { thread_id: string; workspace_key: WorkspaceKey } =>
        Boolean(row.thread_id) && Boolean(row.workspace_key),
      )
      .map((row) => ({
        threadId: row.thread_id,
        title: row.title,
        lastMessageAt: row.last_message_at ?? new Date(0).toISOString(),
        workspaceKey: row.workspace_key,
        modelUsed: row.model_used,
      }));

    setThreads(summaries);
    setThreadsLoading(false);
  }, [supabase, planId, workspaceKey]);

  const openDrawer = useCallback(() => {
    setOpen(true);
    void loadThreads();
  }, [loadThreads]);

  const closeDrawer = useCallback(() => {
    abort();
    setOpen(false);
  }, [abort]);

  const loadThread = useCallback(
    async (threadId: string) => {
      const { data, error: queryError } = await supabase
        .from("ai_conversations")
        .select("messages")
        .eq("plan_id", planId)
        .eq("workspace_key", workspaceKey)
        .eq("thread_id", threadId)
        .maybeSingle();

      if (queryError || !data) {
        setMessages([]);
        return;
      }

      const raw = data.messages;
      if (!Array.isArray(raw)) {
        setMessages([]);
        return;
      }
      const parsed: CopilotMessage[] = raw
        .filter(
          (entry): entry is { role: "user" | "assistant"; content: string } =>
            typeof entry === "object" &&
            entry !== null &&
            "role" in entry &&
            "content" in entry &&
            (entry as { role: unknown }).role !== "system",
        )
        .map((entry) => ({
          role: entry.role,
          content: String(entry.content ?? ""),
        }));
      setMessages(parsed);
    },
    [supabase, planId, workspaceKey],
  );

  const handleSelectThread = useCallback(
    async (threadId: string) => {
      abort();
      reset();
      setActiveThreadId(threadId);
      await loadThread(threadId);
    },
    [abort, reset, loadThread],
  );

  const handleNewThread = useCallback(() => {
    abort();
    reset();
    setActiveThreadId(newThreadId());
    setMessages([]);
    setInput("");
    setPendingRetry(null);
  }, [abort, reset]);

  const performSend = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || isStreaming) return;
      setPendingRetry(trimmed);
      const optimistic: CopilotMessage = { role: "user", content: trimmed };
      const nextHistory = [...messages, optimistic];
      setMessages(nextHistory);
      setInput("");

      const result = await send({
        planId,
        workspaceKey,
        threadId: activeThreadId,
        history: messages,
        prompt: trimmed,
      });

      if (!result) return; // Error path; assistant buffer cleared, user msg retained.

      const assistantMessage: CopilotMessage = {
        role: "assistant",
        content: result.assistant,
      };
      setMessages([...nextHistory, assistantMessage]);
      setPendingRetry(null);
      if (result.threadId !== activeThreadId) {
        setActiveThreadId(result.threadId);
      }
      void loadThreads();
    },
    [
      activeThreadId,
      isStreaming,
      loadThreads,
      messages,
      planId,
      send,
      workspaceKey,
    ],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void performSend(input);
    },
    [input, performSend],
  );

  const handleRetry = useCallback(() => {
    if (!pendingRetry) return;
    // Drop the optimistic user message we left in place so we can re-send fresh.
    setMessages((current) => {
      if (current.length === 0) return current;
      const last = current[current.length - 1];
      if (last.role === "user" && last.content === pendingRetry) {
        return current.slice(0, -1);
      }
      return current;
    });
    reset();
    void performSend(pendingRetry);
  }, [pendingRetry, performSend, reset]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, assistantBuffer, isThinking, error]);

  const errorBanner = error ? errorCopy(error) : null;
  const showEmpty = !isStreaming && !assistantBuffer && messages.length === 0 && !error;
  const activeThreadLabel = useMemo(() => {
    if (messages.length === 0 && !isStreaming) return "New conversation";
    const persisted = threads.find((t) => t.threadId === activeThreadId);
    if (persisted?.title) return persisted.title;
    return deriveTitle(messages);
  }, [activeThreadId, isStreaming, messages, threads]);

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open AI co-pilot"
          onClick={openDrawer}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 h-14 px-5 rounded-full bg-[#155e63] text-white shadow-lg shadow-[#155e63]/30 flex items-center gap-2 active:scale-95 transition-transform"
        >
          <span aria-hidden className="text-lg">✦</span>
          <span className="text-sm font-semibold">Co-pilot</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close co-pilot"
            onClick={closeDrawer}
            className="flex-1 bg-black/40"
          />
          <aside
            role="dialog"
            aria-label="AI co-pilot"
            className="w-full max-w-md bg-white flex flex-col h-full shadow-xl"
          >
            <header className="px-4 pt-4 pb-3 border-b border-[#efefef] flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-[#888] font-semibold">
                  {WORKSPACE_LABELS[workspaceKey]}
                  {currentFocus?.label ? ` · ${currentFocus.label}` : ""}
                </p>
                <h2 className="text-base font-semibold text-[#1a1a1a] truncate">
                  {activeThreadLabel}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleNewThread}
                className="text-xs font-medium text-[#155e63] hover:underline whitespace-nowrap"
              >
                + New
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={closeDrawer}
                className="ml-1 w-8 h-8 rounded-full hover:bg-[#f5f5f5] flex items-center justify-center text-[#888]"
              >
                ✕
              </button>
            </header>

            <details className="border-b border-[#efefef] group" open={messages.length === 0}>
              <summary className="px-4 py-2 text-xs font-medium text-[#666] cursor-pointer list-none flex items-center justify-between">
                <span>Conversations ({threads.length})</span>
                <span className="text-[#aaa] group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="max-h-48 overflow-y-auto px-2 pb-2">
                {threadsLoading ? (
                  <p className="px-2 py-3 text-xs text-[#888]">Loading threads…</p>
                ) : threadsError ? (
                  <p className="px-2 py-3 text-xs text-red-600">Couldn&apos;t load threads.</p>
                ) : threads.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-[#888]">No saved conversations yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {threads.map((thread) => {
                      const selected = thread.threadId === activeThreadId;
                      return (
                        <li key={thread.threadId}>
                          <button
                            type="button"
                            onClick={() => void handleSelectThread(thread.threadId)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                              selected
                                ? "bg-[#155e63]/10 text-[#155e63]"
                                : "hover:bg-[#f7f6f3] text-[#1a1a1a]"
                            }`}
                          >
                            <span className="block truncate font-medium">
                              {thread.title?.trim() || "Untitled conversation"}
                            </span>
                            <span className="block text-[11px] text-[#888]">
                              {new Date(thread.lastMessageAt).toLocaleString()}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </details>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {showEmpty && (
                <div className="text-sm text-[#666] bg-[#faf9f7] border border-[#efefef] rounded-xl p-4">
                  Ask anything about your {WORKSPACE_LABELS[workspaceKey].toLowerCase()} plan.
                  The co-pilot can see your plan snapshot across every workspace.
                </div>
              )}

              {messages.map((msg, idx) => (
                <MessageBubble key={idx} role={msg.role} content={msg.content} />
              ))}

              {(assistantBuffer || isThinking) && (
                <div className="space-y-2">
                  {isThinking && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#155e63]/10 text-[#155e63] text-xs font-medium"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#155e63] animate-pulse" />
                      Thinking…
                    </div>
                  )}
                  {assistantBuffer && (
                    <MessageBubble role="assistant" content={assistantBuffer} streaming />
                  )}
                </div>
              )}

              {errorBanner && (
                <div
                  role="alert"
                  aria-live="assertive"
                  data-testid={`copilot-error-${error?.code}`}
                  className="border border-red-200 bg-red-50 text-red-700 rounded-xl p-3 text-sm flex items-start gap-3"
                >
                  <span aria-hidden>!</span>
                  <div className="flex-1">
                    <p className="font-medium">{errorBanner.title}</p>
                    <div className="mt-2 flex gap-3">
                      {errorBanner.cta && errorBanner.href ? (
                        <Link
                          href={errorBanner.href}
                          className="text-xs font-semibold text-red-800 underline"
                        >
                          {errorBanner.cta}
                        </Link>
                      ) : errorBanner.retryable && errorBanner.cta ? (
                        <button
                          type="button"
                          onClick={handleRetry}
                          className="text-xs font-semibold text-red-800 underline"
                        >
                          {errorBanner.cta}
                        </button>
                      ) : null}
                      {errorBanner.showSmallerQuestion && (
                        <button
                          type="button"
                          onClick={handleNewThread}
                          className="text-xs font-semibold text-red-800 underline"
                        >
                          Smaller question
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t border-[#efefef] px-3 py-3 flex items-end gap-2 safe-area-pb"
            >
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void performSend(input);
                  }
                }}
                placeholder="Ask the co-pilot…"
                rows={1}
                disabled={isStreaming}
                className="flex-1 resize-none rounded-xl border border-[#e5e3df] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#155e63]/40 disabled:bg-[#f7f6f3] disabled:text-[#888]"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={abort}
                  className="h-10 px-3 rounded-xl bg-[#1a1a1a]/10 text-[#1a1a1a] text-sm font-semibold"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="h-10 px-4 rounded-xl bg-[#155e63] text-white text-sm font-semibold disabled:opacity-40"
                >
                  Send
                </button>
              )}
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-[#155e63] text-white rounded-br-sm"
            : "bg-[#faf9f7] text-[#1a1a1a] border border-[#efefef] rounded-bl-sm"
        }`}
      >
        {content}
        {streaming && <span className="ml-1 inline-block w-1.5 h-3 align-text-bottom bg-current animate-pulse" />}
      </div>
    </div>
  );
}

export default CoPilotDrawer;
