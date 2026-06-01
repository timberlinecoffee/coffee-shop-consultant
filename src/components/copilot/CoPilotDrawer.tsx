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
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Maximize2, Menu, Minimize2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UPGRADE_PATH, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access";
import { PaywallModal } from "@/components/paywall-modal";
import type { WorkspaceKey } from "@/types/supabase";
import {
  COPILOT_AI_DISCLAIMER,
  COPILOT_NAME,
  COPILOT_SUBTITLE,
} from "@/lib/copilot/branding";
import {
  GENERAL_CONVERSATION_LABEL,
  ThreadBrowser,
  WORKSPACE_LABELS,
  type ConversationScope,
  type ThreadBrowserItem,
} from "./ThreadBrowser";
import { MarkdownMessage } from "./MarkdownMessage";
import type {
  CopilotErrorState,
  CopilotFocus,
  CopilotMessage,
} from "./types";
import { useCopilotStream } from "./useCopilotStream";
import { useAIReviewModal } from "@/hooks/useAIReviewModal";

// TIM-1149 / TIM-1151: Resizable / expandable panel constants.
// Expanded mode is a true full-width overlay (TIM-1151 founder feedback) —
// it ignores PANEL_MAX_WIDTH so the chat takes the whole workspace area.
const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 1100;
const PANEL_DEFAULT_WIDTH = 448;
const PANEL_WIDTH_STORAGE_KEY = "copilot_panel_width_v1";
const PANEL_EXPANDED_STORAGE_KEY = "copilot_panel_expanded_v1";
const CONVERSATIONS_RAIL_STORAGE_KEY = "brew-conversations-open";

function readNumber(key: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

const FREE_TRIAL_COPILOT_LIMIT = 5;

type CreditsState =
  | { mode: "trial"; trialUsed: number; trialLimit: number; trialRemaining: number }
  | { mode: "credits"; remaining: number }
  | null;

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
    case "trial_exhausted":
      return {
        title: "You've used your 5 trial messages — upgrade to keep planning with Copilot.",
        cta: "See plans",
        href: UPGRADE_PATH,
      };
    case "quota":
      return {
        title: err.message,
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
  const [activeScope, setActiveScope] = useState<ConversationScope>(workspaceKey);
  if (workspaceKeyVersion.key !== workspaceKey) {
    setWorkspaceKeyVersion({ key: workspaceKey });
    setActiveScope(workspaceKey);
  }
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    if (typeof window === "undefined") return newThreadId();
    return localStorage.getItem(`copilot_last_thread_${workspaceKey}`) ?? newThreadId();
  });
  // TIM-1149: Resizable / expandable panel state.
  const [panelWidth, setPanelWidth] = useState<number>(PANEL_DEFAULT_WIDTH);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [railOpen, setRailOpen] = useState<boolean>(false);
  const [isConversationsSheetOpen, setIsConversationsSheetOpen] = useState<boolean>(false);
  const [activeThreadTitle, setActiveThreadTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);
  const [browserRefreshKey, setBrowserRefreshKey] = useState(0);
  const [loadingThread, setLoadingThread] = useState(false);
  const [credits, setCredits] = useState<CreditsState>(null);
  const titleRequestedRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hydratedRef = useRef(false);

  // Derived constants — placed before effects so they're stable references in deps arrays.
  const isMobile = viewportWidth < 640;
  const sheetOpen = open && isMobile;

  const {
    isStreaming,
    isThinking,
    assistantBuffer,
    error,
    trialRemaining,
    pendingSuggestions,
    clearSuggestions,
    send,
    abort,
    reset,
  } = useCopilotStream();

  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();

  // Keep local trial count in sync with the server after each message.
  useEffect(() => {
    if (trialRemaining === null) return;
    setCredits((prev) => {
      if (prev?.mode !== "trial") return prev;
      const used = FREE_TRIAL_COPILOT_LIMIT - trialRemaining;
      return { ...prev, trialUsed: used, trialRemaining };
    });
  }, [trialRemaining]);

  const openDrawer = useCallback(() => {
    setOpen(true);
    setBrowserRefreshKey((n) => n + 1);
    // TIM-1500: always refetch on open so plan upgrades reflect immediately
    // without a full page reload. Cheap call, no rate concern.
    void fetch("/api/credits", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as CreditsState & Record<string, unknown>;
        setCredits(data as CreditsState);
      })
      .catch(() => {});
  }, []);

  const closeDrawer = useCallback(() => {
    abort();
    setOpen(false);
    setIsConversationsSheetOpen(false);
  }, [abort]);

  const handleNewThread = useCallback(
    (scope: ConversationScope = workspaceKey) => {
      abort();
      reset();
      setActiveThreadId(newThreadId());
      setActiveScope(scope);
      setActiveThreadTitle(null);
      setMessages([]);
      setInput("");
      setPendingRetry(null);
    },
    [abort, reset, workspaceKey],
  );

  const handleRenameThread = useCallback(
    (threadId: string, newTitle: string) => {
      if (threadId === activeThreadId) {
        setActiveThreadTitle(newTitle);
      }
      setBrowserRefreshKey((n) => n + 1);
    },
    [activeThreadId],
  );

  const handleDeleteThread = useCallback(
    (threadId: string) => {
      if (threadId === activeThreadId) {
        handleNewThread();
      }
      setBrowserRefreshKey((n) => n + 1);
    },
    [activeThreadId, handleNewThread],
  );

  const handleSelectThread = useCallback(
    async (item: ThreadBrowserItem) => {
      if (item.id === activeThreadId && item.workspace_key === activeScope) return;
      abort();
      reset();
      setLoadingThread(true);
      setActiveThreadId(item.id);
      setActiveScope(item.workspace_key);
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
          workspace_key: WorkspaceKey | null;
        };
        setMessages(payload.messages ?? []);
        setActiveThreadTitle(payload.title);
        // TIM-1149: workspace_key may be null (general conversation).
        setActiveScope(payload.workspace_key ?? null);
      } finally {
        setLoadingThread(false);
      }
    },
    [abort, reset, planId, activeThreadId, activeScope],
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
        workspaceKey: activeScope,
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

      if (result.trialRemaining !== null) {
        const newUsed = FREE_TRIAL_COPILOT_LIMIT - result.trialRemaining;
        setTrialMessagesUsed(newUsed);
        if (newUsed >= COPILOT_FREE_TRIAL_LIMIT) {
          setTrialModalOpen(true);
        }
      }
    },
    [
      activeThreadId,
      activeScope,
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

  // TIM-880: WorkspaceTopBar dispatches `workspace-copilot-open` from its Co-pilot
  // button. Wire it to openDrawer so clicking that button actually opens the drawer.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("workspace-copilot-open", openDrawer);
    return () => window.removeEventListener("workspace-copilot-open", openDrawer);
  }, [openDrawer]);

  // Reset the external focus label when the user picks a different workspace
  // or starts a fresh thread, so it doesn't stick around stale.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExternalFocusLabel(null);
  }, [activeThreadId, activeScope]);

  // TIM-662: persist active thread so reload can restore it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(`copilot_last_thread_${workspaceKey}`, activeThreadId);
  }, [activeThreadId, workspaceKey]);

  // TIM-1149: hydrate panel width + expanded preference from localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedWidth = readNumber(PANEL_WIDTH_STORAGE_KEY);
    if (storedWidth !== null) {
      setPanelWidth(Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, storedWidth)));
    }
    const storedExpanded = window.localStorage.getItem(PANEL_EXPANDED_STORAGE_KEY);
    if (storedExpanded === "1") setIsExpanded(true);
    const storedRail = window.localStorage.getItem(CONVERSATIONS_RAIL_STORAGE_KEY);
    if (storedRail === "1") setRailOpen(true);
  }, []);

  // TIM-1149: persist panel width and expanded state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
  }, [panelWidth]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PANEL_EXPANDED_STORAGE_KEY, isExpanded ? "1" : "0");
  }, [isExpanded]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CONVERSATIONS_RAIL_STORAGE_KEY, railOpen ? "1" : "0");
  }, [railOpen]);

  // TIM-1149: track viewport width so we can clamp the panel responsively.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setViewportWidth(window.innerWidth);
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // TIM-1149: drag-to-resize. Mouse down on the handle starts dragging; mouse
  // move (window-level) sets new width; mouse up ends. Touch parallel for mobile.
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (clientX: number) => {
      const next = window.innerWidth - clientX;
      const clamped = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, next));
      setPanelWidth(clamped);
    };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) onMove(t.clientX);
    };
    const stop = () => setIsDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", stop);
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stop);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [isDragging]);

  // TIM-1149: ESC closes the desktop panel.
  useEffect(() => {
    if (!open || isMobile) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isMobile, closeDrawer]);

  // TIM-1562: ESC must also dismiss the mobile sheet (WAI-ARIA dialog pattern).
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, closeDrawer]);

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
          workspace_key: WorkspaceKey | null;
        };
        setMessages(payload.messages ?? []);
        setActiveThreadTitle(payload.title ?? null);
        // TIM-1149: workspace_key may be null (general conversation).
        setActiveScope(payload.workspace_key ?? null);
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

  // TIM-1149 / TIM-1151: compute the on-screen panel width. Expanded mode is a
  // true full-width overlay over the workspace (founder feedback) — bypass the
  // PANEL_MAX_WIDTH clamp so the chat takes the entire viewport. Default mode
  // stays clamped to a comfortable reading width. On phones we always go
  // full-bleed so the drawer stays usable.
  const computedPanelWidth = useMemo(() => {
    if (viewportWidth < 640) return viewportWidth;
    if (isExpanded) return viewportWidth;
    return Math.max(
      PANEL_MIN_WIDTH,
      Math.min(PANEL_MAX_WIDTH, panelWidth, viewportWidth - 16),
    );
  }, [isExpanded, panelWidth, viewportWidth]);

  const scopeHeaderLabel =
    activeScope === null
      ? GENERAL_CONVERSATION_LABEL
      : WORKSPACE_LABELS[activeScope];

  return (
    <>
      {/* TIM-1561: AI review modal for suggestions from chat. */}
      {AIReviewModalNode}
      <PaywallModal
        open={trialModalOpen}
        onClose={() => setTrialModalOpen(false)}
        variant="copilot_trial"
      />
      {!open && (
        <button
          type="button"
          aria-label={`Open ${COPILOT_NAME} (${COPILOT_SUBTITLE})`}
          onClick={openDrawer}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 h-14 px-5 rounded-full ai-gradient-bg text-white shadow-lg flex items-center gap-2 active:scale-95 transition-transform"
        >
          <Sparkles aria-hidden className="w-4 h-4" />
          <span className="text-sm font-semibold">{COPILOT_NAME}</span>
        </button>
      )}

      <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            aria-label={`Close ${COPILOT_NAME}`}
            onClick={closeDrawer}
            className="flex-1 bg-black/40"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`${COPILOT_NAME}: ${COPILOT_SUBTITLE}`}
            style={{ width: computedPanelWidth }}
            className="relative bg-[var(--background)] flex flex-col h-full shadow-xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* TIM-1149: drag-to-resize handle on the left edge. Hidden on
                mobile and when the panel is expanded to full-width (no room
                to resize). */}
            {!isMobile && !isExpanded && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panel"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDoubleClick={() => setPanelWidth(PANEL_DEFAULT_WIDTH)}
                className={`absolute top-0 left-0 h-full w-1.5 cursor-col-resize z-10 group ${
                  isDragging ? "bg-[var(--teal)]/40" : "hover:bg-[var(--teal)]/20"
                }`}
                title="Drag to resize · double-click to reset"
              >
                <span className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-[2px] h-12 rounded-full bg-[var(--teal)]/30 group-hover:bg-[var(--teal)]/60 pointer-events-none" />
              </div>
            )}

            <header className="px-4 pt-4 pb-3 border-b border-[var(--border)] flex items-start gap-2">
              <button
                type="button"
                aria-label="Conversations"
                onClick={() => isMobile ? setIsConversationsSheetOpen(true) : setRailOpen((v) => !v)}
                title="Conversations"
                className="mt-0.5 w-8 h-8 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center text-[var(--neutral-cool-600)] shrink-0"
              >
                <Menu aria-hidden className="w-4 h-4" />
              </button>
              <div className={cn("shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5", isStreaming ? "ai-streaming-avatar" : "bg-[var(--teal)]/10 text-[var(--teal)]")}>
                <Sparkles aria-hidden className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-[var(--foreground)] truncate">
                    {COPILOT_NAME}
                  </h2>
                  <span className="text-[11px] uppercase tracking-wide text-[var(--neutral-cool-600)] font-medium">
                    {COPILOT_SUBTITLE}
                  </span>
                  {credits?.mode === "trial" && (
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        credits.trialRemaining <= 1
                          ? "bg-amber-100 text-amber-700"
                          : "bg-[var(--teal)]/10 text-[var(--teal)]"
                      }`}
                    >
                      {credits.trialRemaining} of {credits.trialLimit} trial messages left
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--neutral-cool-600)] truncate">
                  {scopeHeaderLabel}
                  {externalFocusLabel && activeScope === workspaceKey
                    ? ` · ${externalFocusLabel}`
                    : currentFocus?.label && activeScope === workspaceKey
                    ? ` · ${currentFocus.label}`
                    : ""}
                  {` · ${activeThreadLabel}`}
                </p>
              </div>
              {trialMessagesUsed < COPILOT_FREE_TRIAL_LIMIT && initialTrialMessagesUsed !== undefined && (
                <span
                  className={`text-[11px] font-medium whitespace-nowrap mt-1 ${
                    COPILOT_FREE_TRIAL_LIMIT - trialMessagesUsed <= 2
                      ? "text-amber-600"
                      : "text-[var(--neutral-cool-600)]"
                  }`}
                >
                  {trialMessagesUsed === 0
                    ? `${COPILOT_FREE_TRIAL_LIMIT} free`
                    : `${COPILOT_FREE_TRIAL_LIMIT - trialMessagesUsed} free left`}
                </span>
              )}
              {!isMobile && (
                <button
                  type="button"
                  aria-label={isExpanded ? "Restore panel size" : "Expand panel"}
                  aria-pressed={isExpanded}
                  onClick={() => setIsExpanded((v) => !v)}
                  className="ml-1 w-8 h-8 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center text-[var(--neutral-cool-600)]"
                  title={isExpanded ? "Restore" : "Expand"}
                >
                  {isExpanded ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={closeDrawer}
                className="w-8 h-8 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center text-[var(--neutral-cool-600)]"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex flex-1 overflow-hidden min-h-0">
              <AnimatePresence initial={false}>
                {!isMobile && railOpen && (
                  <motion.div
                    key="conversation-rail"
                    initial={{ width: 0 }}
                    animate={{ width: 240 }}
                    exit={{ width: 0 }}
                    transition={{ duration: 0.1, ease: "easeOut" }}
                    className="shrink-0 border-r border-[var(--border)] overflow-hidden"
                  >
                    <div className="w-[240px] h-full flex flex-col bg-[var(--surface-warm-50)]">
                      <ThreadBrowser
                        variant="fill"
                        planId={planId}
                        activeScope={activeScope}
                        activeThreadId={activeThreadId}
                        currentWorkspaceKey={workspaceKey}
                        onSelectThread={(item) => void handleSelectThread(item)}
                        onNewThread={handleNewThread}
                        onRenameThread={handleRenameThread}
                        onDeleteThread={handleDeleteThread}
                        refreshKey={browserRefreshKey}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loadingThread && (
                <p className="text-xs text-[var(--neutral-cool-600)]">Loading conversation…</p>
              )}

              {showEmpty && (
                <div className="text-sm text-[var(--gray-1100)] bg-[var(--background)] border border-[var(--border)] rounded-xl p-4">
                  {activeScope === null
                    ? `Ask ${COPILOT_NAME} anything about your plan. This conversation isn't tied to a specific workspace — useful for cross-cutting questions like cash flow, opening sequencing, or "is this realistic?"`
                    : `Ask anything about your ${WORKSPACE_LABELS[activeScope].toLowerCase()} plan. ${COPILOT_NAME} can see your plan snapshot across every workspace.`}
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
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--teal)]/10 text-[var(--teal)] text-xs font-medium"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] animate-pulse" />
                      Thinking…
                    </div>
                  )}
                  {assistantBuffer && (
                    <MessageBubble role="assistant" content={assistantBuffer} streaming />
                  )}
                </div>
              )}

              {/* TIM-1561: "Review N suggestions" CTA when Scout emits a suggestions event. */}
              {pendingSuggestions && !isStreaming && (
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => {
                      if (!pendingSuggestions) return;
                      const { suggestions, context } = pendingSuggestions;
                      openAIReviewModal({
                        suggestions,
                        context,
                        onApply: async () => {
                          clearSuggestions();
                        },
                      });
                    }}
                    className="flex items-center gap-2 bg-[var(--teal)] text-white rounded-full px-4 py-2 text-sm font-semibold hover:bg-[var(--teal-dark)] transition-colors"
                  >
                    <Sparkles size={14} aria-hidden />
                    {`Review ${pendingSuggestions.suggestions.length} suggestion${pendingSuggestions.suggestions.length === 1 ? "" : "s"}`}
                  </button>
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
                          onClick={() => handleNewThread()}
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

            <motion.div
              className="border-t border-[var(--border)] safe-area-pb"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: 0.1 }}
            >
              <form
                onSubmit={handleSubmit}
                className="px-3 pt-3 pb-1 flex items-end gap-2"
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
                  placeholder={`Ask ${COPILOT_NAME}…`}
                  rows={1}
                  disabled={isStreaming}
                  className="flex-1 resize-none rounded-xl border border-[var(--gray-600)] bg-[var(--background)] px-3 py-2 text-sm focus-visible:outline-none focus:ring-2 focus:ring-[var(--teal)]/40 disabled:bg-[var(--surface-warm-50)] disabled:text-[var(--neutral-cool-600)]"
                />
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={abort}
                    className="h-10 px-3 rounded-xl bg-[var(--foreground)]/10 text-[var(--foreground)] text-sm font-semibold"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="h-10 px-4 rounded-xl bg-[var(--teal)] text-white text-sm font-semibold disabled:opacity-40"
                  >
                    Send
                  </button>
                )}
              </form>
              {/* TIM-1149: persistent AI-mistake disclaimer. Low-emphasis, doesn't
                  steal chat space. Visible on every conversation view. */}
              <p
                role="note"
                className="px-3 pb-2 pt-0.5 text-[10.5px] leading-tight text-[var(--neutral-cool-650)] text-center"
              >
                {COPILOT_AI_DISCLAIMER}
              </p>
            </motion.div>
            </div>
            </div>
            <AnimatePresence>
              {isMobile && isConversationsSheetOpen && (
                <>
                  <motion.div
                    className="absolute inset-0 z-10 bg-black/40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsConversationsSheetOpen(false)}
                  />
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Conversations"
                    className="absolute bottom-0 inset-x-0 z-20 flex flex-col bg-[var(--background)] rounded-t-2xl border-t border-[var(--border)]"
                    style={{ height: "60vh" }}
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <div className="flex justify-center pt-2 pb-1 shrink-0" aria-hidden>
                      <div className="w-10 h-1 rounded-full bg-[var(--neutral-cool-300)]" />
                    </div>
                    <ThreadBrowser
                      variant="fill"
                      planId={planId}
                      activeScope={activeScope}
                      activeThreadId={activeThreadId}
                      currentWorkspaceKey={workspaceKey}
                      onSelectThread={(item) => {
                        setIsConversationsSheetOpen(false);
                        void handleSelectThread(item);
                      }}
                      onNewThread={(scope) => {
                        setIsConversationsSheetOpen(false);
                        handleNewThread(scope);
                      }}
                      onRenameThread={handleRenameThread}
                      onDeleteThread={handleDeleteThread}
                      refreshKey={browserRefreshKey}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.aside>
        </motion.div>
      )}
      </AnimatePresence>
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
        <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap bg-[var(--teal)] text-white rounded-br-sm">
          {content}
        </div>
      ) : (
        <div
          className="max-w-[85%] rounded-2xl px-3.5 py-2.5 bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-bl-sm"
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
