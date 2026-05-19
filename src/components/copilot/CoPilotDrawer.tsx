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
import { UPGRADE_PATH, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access";
import { PaywallModal } from "@/components/paywall-modal";
import type { WorkspaceKey } from "@/types/supabase";
import { ThreadBrowser, WORKSPACE_LABELS, type ThreadBrowserItem } from "./ThreadBrowser";
import { MarkdownMessage } from "./MarkdownMessage";
import type {
  CopilotErrorState,
  CopilotFocus,
  CopilotMessage,
} from "./types";
import { useCopilotStream } from "./useCopilotStream";

export interface CoPilotDrawerProps {
  workspaceKey: WorkspaceKey;
  planId: string;
  currentFocus?: CopilotFocus;
  initialTrialMessagesUsed?: number;
}

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

function errorCopy(err: CopilotErrorState): { title: string; cta: string | null; href: string | null } {
  switch (err.code) {
    case "quota":
      return {
        title: err.message,
        cta: "See plans",
        href: UPGRADE_PATH,
      };
    case "trial_exhausted":
      return {
        title: "You've used your 5 free coaching sessions.",
        cta: "See plans",
        href: UPGRADE_PATH,
      };
    case "timeout":
      return {
        title: "Took too long. Try a smaller question.",
        cta: "Retry",
        href: null,
      };
    case "upstream_error":
      return {
        title: "AI service hiccup — your message wasn't sent.",
        cta: "Retry",
        href: null,
      };
    case "network":
      return {
        title: "Connection dropped mid-stream.",
        cta: "Retry",
        href: null,
      };
    case "unauthorized":
      return {
        title: "Please sign in again to keep coaching.",
        cta: "Sign in",
        href: "/login",
      };
    case "paywall":
      if (err.paywallReason === "paused" || err.paywallReason === "expired") {
        return {
          title: "Your plan is paused — reactivate to keep using the co-pilot.",
          cta: "Reactivate",
          href: "/account/billing",
        };
      }
      return {
        title: "A paid plan is required to use the co-pilot.",
        cta: "See plans",
        href: UPGRADE_PATH,
      };
    default:
      return { title: err.message, cta: "Retry", href: null };
  }
}

export function CoPilotDrawer({
  workspaceKey,
  planId,
  currentFocus,
  initialTrialMessagesUsed = 0,
}: CoPilotDrawerProps) {
  const [open, setOpen] = useState(false);
  const [trialMessagesUsed, setTrialMessagesUsed] = useState(initialTrialMessagesUsed);
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  // Track the prop separately so a parent-driven workspace switch resets the active
  // workspace without us calling setState inside an effect body.
  const [workspaceKeyVersion, setWorkspaceKeyVersion] = useState<{ key: WorkspaceKey }>(() => ({
    key: workspaceKey,
  }));
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState<WorkspaceKey>(workspaceKey);
  if (workspaceKeyVersion.key !== workspaceKey) {
    setWorkspaceKeyVersion({ key: workspaceKey });
    setActiveWorkspaceKey(workspaceKey);
  }
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    if (typeof window === "undefined") return newThreadId();
    return localStorage.getItem(`copilot_last_thread_${workspaceKey}`) ?? newThreadId();
  });
  const [activeThreadTitle, setActiveThreadTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);
  const [browserRefreshKey, setBrowserRefreshKey] = useState(0);
  const [loadingThread, setLoadingThread] = useState(false);
  const titleRequestedRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hydratedRef = useRef(false);

  const {
    isStreaming,
    isThinking,
    assistantBuffer,
    error,
    send,
    abort,
    reset,
  } = useCopilotStream();

  const openDrawer = useCallback(() => {
    setOpen(true);
    setBrowserRefreshKey((n) => n + 1);
  }, []);

  const closeDrawer = useCallback(() => {
    abort();
    setOpen(false);
  }, [abort]);

  const handleNewThread = useCallback(() => {
    abort();
    reset();
    setActiveThreadId(newThreadId());
    setActiveWorkspaceKey(workspaceKey);
    setActiveThreadTitle(null);
    setMessages([]);
    setInput("");
    setPendingRetry(null);
  }, [abort, reset, workspaceKey]);

  const handleSelectThread = useCallback(
    async (item: ThreadBrowserItem) => {
      if (item.id === activeThreadId && item.workspace_key === activeWorkspaceKey) return;
      abort();
      reset();
      setLoadingThread(true);
      setActiveThreadId(item.id);
      setActiveWorkspaceKey(item.workspace_key);
      setActiveThreadTitle(item.title);
      setMessages([]);
      setInput("");
      setPendingRetry(null);
      try {
        const res = await fetch(
          `/api/copilot/threads/${encodeURIComponent(item.id)}?planId=${encodeURIComponent(planId)}`,
          { credentials: "same-origin" },
        );
        if (!res.ok) {
          setMessages([]);
          return;
        }
        const payload = (await res.json()) as {
          messages: { role: "user" | "assistant"; content: string }[];
          title: string | null;
          workspace_key: WorkspaceKey;
        };
        setMessages(payload.messages ?? []);
        setActiveThreadTitle(payload.title);
        if (payload.workspace_key) setActiveWorkspaceKey(payload.workspace_key);
      } finally {
        setLoadingThread(false);
      }
    },
    [abort, reset, planId, activeThreadId, activeWorkspaceKey],
  );

  const maybeRequestTitle = useCallback(
    (threadId: string, fullMessages: CopilotMessage[]) => {
      if (titleRequestedRef.current.has(threadId)) return;
      if (activeThreadTitle && activeThreadTitle.trim().length > 0) return;
      if (fullMessages.length < 3) return;
      const firstUser = fullMessages.find((m) => m.role === "user");
      if (!firstUser?.content.trim()) return;
      titleRequestedRef.current.add(threadId);
      void fetch(`/api/copilot/threads/${encodeURIComponent(threadId)}/title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ planId, firstUserMessage: firstUser.content }),
      })
        .then(async (res) => {
          if (!res.ok) {
            titleRequestedRef.current.delete(threadId);
            return null;
          }
          return (await res.json()) as { title?: string };
        })
        .then((payload) => {
          if (payload?.title) {
            setActiveThreadTitle(payload.title);
            setBrowserRefreshKey((n) => n + 1);
          }
        })
        .catch(() => {
          titleRequestedRef.current.delete(threadId);
        });
    },
    [planId, activeThreadTitle],
  );

  const performSend = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || isStreaming) return;

      // TIM-819: Gate at attempt time if trial already exhausted (e.g. dismissed modal on msg 5).
      if (trialMessagesUsed >= COPILOT_FREE_TRIAL_LIMIT) {
        setTrialModalOpen(true);
        return;
      }

      setPendingRetry(trimmed);
      const optimistic: CopilotMessage = { role: "user", content: trimmed };
      const nextHistory = [...messages, optimistic];
      setMessages(nextHistory);
      setInput("");

      const result = await send({
        planId,
        workspaceKey: activeWorkspaceKey,
        threadId: activeThreadId,
        history: messages,
        prompt: trimmed,
      });

      if (!result) return; // Error path; assistant buffer cleared, user msg retained.

      const assistantMessage: CopilotMessage = {
        role: "assistant",
        content: result.assistant,
      };
      const finalMessages = [...nextHistory, assistantMessage];
      setMessages(finalMessages);
      setPendingRetry(null);
      if (result.threadId !== activeThreadId) {
        setActiveThreadId(result.threadId);
      }
      setBrowserRefreshKey((n) => n + 1);
      maybeRequestTitle(result.threadId ?? activeThreadId, finalMessages);

      // TIM-819: Update trial counter from server-confirmed count and show modal at limit.
      if (typeof result.trialMessagesUsed === "number") {
        setTrialMessagesUsed(result.trialMessagesUsed);
        if (result.trialMessagesUsed >= COPILOT_FREE_TRIAL_LIMIT) {
          setTrialModalOpen(true);
        }
      }
    },
    [
      activeThreadId,
      activeWorkspaceKey,
      isStreaming,
      maybeRequestTitle,
      messages,
      planId,
      send,
      trialMessagesUsed,
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

  // External "Ask AI" hook (TIM-619): per-field buttons in workspace editors
  // dispatch `copilot:open-with-prompt` to open the drawer with a seeded prompt
  // so the user can refine a Concept field without retyping context.
  const [externalFocusLabel, setExternalFocusLabel] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; focusLabel?: string }>).detail;
      if (!detail) return;
      openDrawer();
      if (typeof detail.focusLabel === "string") {
        setExternalFocusLabel(detail.focusLabel);
      }
      if (typeof detail.prompt === "string" && detail.prompt.trim().length > 0) {
        setInput(detail.prompt);
      }
    };
    window.addEventListener("copilot:open-with-prompt", handler);
    return () => window.removeEventListener("copilot:open-with-prompt", handler);
  }, [openDrawer]);

  // Reset the external focus label when the user picks a different workspace
  // or starts a fresh thread, so it doesn't stick around stale.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExternalFocusLabel(null);
  }, [activeThreadId, activeWorkspaceKey]);

  // TIM-662: persist active thread so reload can restore it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(`copilot_last_thread_${workspaceKey}`, activeThreadId);
  }, [activeThreadId, workspaceKey]);

  // TIM-662: hydrate messages for the restored thread on first mount.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(`copilot_last_thread_${workspaceKey}`);
    if (!stored) return;
    setActiveThreadId(stored);
    setLoadingThread(true);
    fetch(
      `/api/copilot/threads/${encodeURIComponent(stored)}?planId=${encodeURIComponent(planId)}`,
      { credentials: "same-origin" },
    )
      .then(async (res) => {
        if (!res.ok) return;
        const payload = (await res.json()) as {
          messages: { role: "user" | "assistant"; content: string }[];
          title: string | null;
          workspace_key: WorkspaceKey;
        };
        setMessages(payload.messages ?? []);
        setActiveThreadTitle(payload.title ?? null);
        if (payload.workspace_key) setActiveWorkspaceKey(payload.workspace_key);
      })
      .catch(() => {})
      .finally(() => setLoadingThread(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errorBanner = error ? errorCopy(error) : null;
  const showEmpty =
    !isStreaming && !assistantBuffer && messages.length === 0 && !error && !loadingThread;

  const activeThreadLabel = useMemo(() => {
    if (activeThreadTitle && activeThreadTitle.trim().length > 0) return activeThreadTitle;
    if (messages.length === 0 && !isStreaming) return "New conversation";
    return deriveTitle(messages);
  }, [activeThreadTitle, isStreaming, messages]);

  return (
    <>
      <PaywallModal
        open={trialModalOpen}
        onClose={() => setTrialModalOpen(false)}
        variant="copilot_trial"
      />
      {!open && (
        <button
          type="button"
          aria-label="Open AI co-pilot"
          onClick={openDrawer}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 h-14 px-5 rounded-full bg-[#155e63] text-white shadow-lg shadow-[#155e63]/30 flex items-center gap-2 active:scale-95 transition-transform"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
                  {WORKSPACE_LABELS[activeWorkspaceKey]}
                  {externalFocusLabel && activeWorkspaceKey === workspaceKey
                    ? ` · ${externalFocusLabel}`
                    : currentFocus?.label && activeWorkspaceKey === workspaceKey
                    ? ` · ${currentFocus.label}`
                    : ""}
                </p>
                <h2 className="text-base font-semibold text-[#1a1a1a] truncate">
                  {activeThreadLabel}
                </h2>
              </div>
              {trialMessagesUsed < COPILOT_FREE_TRIAL_LIMIT && initialTrialMessagesUsed !== undefined && (
                <span
                  className={`text-[11px] font-medium whitespace-nowrap ${
                    COPILOT_FREE_TRIAL_LIMIT - trialMessagesUsed <= 2
                      ? "text-amber-600"
                      : "text-[#888]"
                  }`}
                >
                  {trialMessagesUsed === 0
                    ? `${COPILOT_FREE_TRIAL_LIMIT} free messages`
                    : `${COPILOT_FREE_TRIAL_LIMIT - trialMessagesUsed} free messages left`}
                </span>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={closeDrawer}
                className="ml-1 w-8 h-8 rounded-full hover:bg-[#f5f5f5] flex items-center justify-center text-[#888]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </header>

            <ThreadBrowser
              planId={planId}
              activeWorkspaceKey={activeWorkspaceKey}
              activeThreadId={activeThreadId}
              onSelectThread={(item) => void handleSelectThread(item)}
              onNewThread={handleNewThread}
              refreshKey={browserRefreshKey}
            />

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loadingThread && (
                <p className="text-xs text-[#888]">Loading conversation…</p>
              )}

              {showEmpty && (
                <div className="text-sm text-[#666] bg-[#faf9f7] border border-[#efefef] rounded-xl p-4">
                  Ask anything about your {WORKSPACE_LABELS[activeWorkspaceKey].toLowerCase()} plan.
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
                <div className="border border-red-200 bg-red-50 text-red-700 rounded-xl p-3 text-sm flex items-start gap-3">
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
                      ) : errorBanner.cta ? (
                        <button
                          type="button"
                          onClick={handleRetry}
                          className="text-xs font-semibold text-red-800 underline"
                        >
                          {errorBanner.cta}
                        </button>
                      ) : null}
                      {error?.code === "timeout" && (
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
      {isUser ? (
        <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap bg-[#155e63] text-white rounded-br-sm">
          {content}
        </div>
      ) : (
        <div
          className="max-w-[85%] rounded-2xl px-3.5 py-2.5 bg-[#faf9f7] text-[#1a1a1a] border border-[#efefef] rounded-bl-sm"
          aria-live={streaming ? "polite" : undefined}
          aria-atomic={streaming ? "false" : undefined}
        >
          <MarkdownMessage content={content} streaming={streaming} />
        </div>
      )}
    </div>
  );
}

export default CoPilotDrawer;
