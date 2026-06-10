"use client";

// TIM-2592: Scout v2 — persistent right rail (desktop) + mobile bottom sheet.
// Renders when ui_revamp_v2 flag is on. v1 CoPilotDrawer overlay untouched.
//
// Groundwork UI Consistency Protocol (TIM-1536/TIM-1538):
//   Style-guide section: Design Tokens, Nav components, Modals / Sheet overlays
//   Reference: src/components/copilot/CoPilotDrawer.tsx — inner panel content,
//     header chrome, mode strip, message bubbles, input form
//   Tokens used: --teal, --background, --foreground, --border, --card,
//     --muted-foreground, --neutral-cool-100/600/300, --surface-warm-50
//   No new colors, fonts, or radii. Voice Mandate observed throughout.

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
import { ChevronLeft, ChevronRight, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { UPGRADE_PATH, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access";
import { PaywallModal } from "@/components/paywall-modal";
import { CreditPacksModal } from "@/components/credit-packs-modal";
import type { WorkspaceKey } from "@/types/supabase";
import {
  COPILOT_AI_DISCLAIMER,
  COPILOT_NAME,
  COPILOT_SUBTITLE,
} from "@/lib/copilot/branding";
import {
  WORKSPACE_LABELS,
  type ConversationScope,
  type ThreadBrowserItem,
} from "./ThreadBrowser";
import { PastChatsDrawer } from "./PastChatsDrawer";
import { MarkdownMessage } from "./MarkdownMessage";
import type {
  CopilotErrorState,
  CopilotFocus,
  CopilotMessage,
} from "./types";
import { useCopilotStream } from "./useCopilotStream";
import { useAIReviewModal, type ApprovedChange, type SuggestionPayload } from "@/hooks/useAIReviewModal";
import { parseEquipmentCostFieldId } from "@/lib/cross-workspace-apply";
import { parseFactValue } from "@/lib/cross-workspace-sync";
import {
  BenchmarkPanel,
  CheckPanel,
  ModeStrip,
  type CompanionMode,
} from "./CompanionPanels";
import { ImportPanel } from "./ImportPanel";
import { stripFindingTags } from "@/lib/business-plan/sanitize-finding-text";
import type { AuditFinding, AuditReport } from "@/lib/business-plan/audit";
import { useCrossSuiteConflictResolver } from "@/components/cross-suite/useCrossSuiteConflictResolver";
import { crossSuiteConflictIdForAuditFinding } from "@/lib/cross-suite/audit-mapping";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useScoutRailContext } from "@/lib/scout-rail-context";

// ── Constants ──────────────────────────────────────────────────────────────

const RAIL_COLLAPSED_KEY = "scout_rail_collapsed_v1";
const FREE_TRIAL_COPILOT_LIMIT_LOCAL = 5;

type CreditsState =
  | { mode: "trial"; trialUsed: number; trialLimit: number; trialRemaining: number }
  | { mode: "credits"; remaining: number; monthlyGrant?: number }
  | null;

// ── Helper functions (shared with CoPilotDrawer) ────────────────────────────

const MENU_VALID_UNITS = new Set(["g", "ml", "oz", "each", "piece"]);

async function applyMenuPricingProposal(accepted: ApprovedChange[]): Promise<void> {
  for (const change of accepted) {
    let payload: {
      name?: string;
      category_name?: string;
      description?: string;
      price_cents?: number;
      recipe_ingredients?: Array<{ name: string; amount: number; unit: string }>;
    };
    try {
      payload = JSON.parse(change.finalValue) as typeof payload;
    } catch {
      continue;
    }
    if (!payload.name) continue;
    const catRes = await fetch("/api/workspaces/menu-pricing/categories", { credentials: "same-origin" });
    if (!catRes.ok) continue;
    const categories = (await catRes.json()) as Array<{ id: string; name: string }>;
    const wantedName = (payload.category_name ?? "").toLowerCase();
    const matchedCat =
      categories.find((c) => c.name.toLowerCase() === wantedName) ?? categories[0];
    if (!matchedCat) continue;
    const recipeLines = payload.recipe_ingredients ?? [];
    const ingredientIds: (string | null)[] = [];
    for (const line of recipeLines) {
      const unit = MENU_VALID_UNITS.has(line.unit) ? line.unit : "oz";
      const res = await fetch("/api/workspaces/menu-pricing/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: line.name, package_size: line.amount > 0 ? line.amount : 1, package_unit: unit, package_cost_cents: 0 }),
      });
      ingredientIds.push(res.ok ? ((await res.json()) as { id: string }).id : null);
    }
    const itemRes = await fetch("/api/workspaces/menu-pricing/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        name: payload.name,
        category_id: matchedCat.id,
        price_cents: typeof payload.price_cents === "number" ? payload.price_cents : 0,
        notes: payload.description ?? null,
      }),
    });
    if (!itemRes.ok) continue;
    const newItem = (await itemRes.json()) as { id: string };
    for (let i = 0; i < recipeLines.length; i++) {
      const ingId = ingredientIds[i];
      const line = recipeLines[i];
      if (!ingId || !line) continue;
      const unit = MENU_VALID_UNITS.has(line.unit) ? line.unit : "oz";
      await fetch("/api/workspaces/menu-pricing/item-ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ menu_item_id: newItem.id, ingredient_id: ingId, amount: line.amount, unit }),
      });
    }
  }
}

async function applyEquipmentCostChanges(accepted: ApprovedChange[]): Promise<void> {
  for (const change of accepted) {
    const meta = parseEquipmentCostFieldId(change.fieldId);
    if (!meta) continue;
    const priceCents = parseFactValue("currency_cents", change.finalValue);
    if (priceCents === null || typeof priceCents !== "number") throw new Error(`"${change.finalValue}" is not a valid cost.`);
    if (meta.action === "reprice" && meta.item_id) {
      const res = await fetch(`/api/workspaces/financials/equipment/${meta.item_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ unit_cost_cents: priceCents, quantity: meta.quantity }),
      });
      if (!res.ok) throw new Error(`Couldn't update ${meta.name}. Please try again.`);
    } else {
      const res = await fetch(`/api/workspaces/financials/equipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: meta.name, category: meta.category ? meta.category.toLowerCase() : undefined, quantity: meta.quantity, unit_cost_cents: priceCents, source: "ai_suggested" }),
      });
      if (!res.ok) throw new Error(`Couldn't add ${meta.name}. Please try again.`);
    }
  }
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
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || "New conversation";
}

function errorCopy(err: CopilotErrorState) {
  switch (err.code) {
    case "trial_exhausted":
      return { title: `You've used all 5 trial messages. Upgrade to keep planning with ${COPILOT_NAME}.`, cta: "See plans", href: UPGRADE_PATH };
    case "out_of_credits":
      return { title: err.message, cta: "Upgrade plan", href: UPGRADE_PATH, showBuyCredits: true };
    case "quota":
      return { title: err.message, cta: "See plans", href: UPGRADE_PATH };
    case "timeout":
      return { title: "Took too long. Try a smaller question.", cta: "Retry", href: null };
    case "upstream_error":
      return { title: "AI service hiccup. Your message wasn't sent.", cta: "Retry", href: null };
    case "network":
      return { title: "Connection dropped mid-stream.", cta: "Retry", href: null };
    case "unauthorized":
      return { title: "Please sign in again to keep coaching.", cta: "Sign in", href: "/login" };
    case "paywall":
      if (err.paywallReason === "paused" || err.paywallReason === "expired")
        return { title: `Your plan is paused. Reactivate to keep using ${COPILOT_NAME}.`, cta: "Reactivate", href: "/account/billing" };
      return { title: `A paid plan is required to use ${COPILOT_NAME}.`, cta: "See plans", href: UPGRADE_PATH };
    default:
      return { title: err.message, cta: "Retry", href: null };
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ScoutRailProps {
  workspaceKey: WorkspaceKey;
  planId: string;
  currentFocus?: CopilotFocus;
  initialTrialMessagesUsed?: number;
  onApplySuggestions?: (accepted: ApprovedChange[]) => Promise<void>;
  defaultMode?: CompanionMode;
  defaultScopeOverride?: ConversationScope;
}

// ── ScoutRailInner — the shared panel content rendered in both rail + sheet ──

interface ScoutPanelProps extends ScoutRailProps {
  onCollapse?: () => void;
  showCollapseButton?: boolean;
}

function ScoutPanel({
  workspaceKey,
  planId,
  currentFocus,
  initialTrialMessagesUsed = 0,
  onApplySuggestions,
  defaultMode = "coach",
  defaultScopeOverride,
  onCollapse,
  showCollapseButton = false,
}: ScoutPanelProps) {
  const [activeMode, setActiveMode] = useState<CompanionMode>(defaultMode);
  const [checkReport, setCheckReport] = useState<AuditReport | null>(null);
  const [checkScanning, setCheckScanning] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [benchmarkReport, setBenchmarkReport] = useState<AuditReport | null>(null);
  const [benchmarkScanning, setBenchmarkScanning] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [trialMessagesUsed, setTrialMessagesUsed] = useState(initialTrialMessagesUsed);
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [creditsAddedToast, setCreditsAddedToast] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("credits_added") === "1";
  });
  const [workspaceKeyVersion, setWorkspaceKeyVersion] = useState<{ key: WorkspaceKey }>(() => ({ key: workspaceKey }));
  const initialScope: ConversationScope = defaultScopeOverride !== undefined ? defaultScopeOverride : workspaceKey;
  const [activeScope, setActiveScope] = useState<ConversationScope>(initialScope);
  if (workspaceKeyVersion.key !== workspaceKey) {
    setWorkspaceKeyVersion({ key: workspaceKey });
    setActiveScope(initialScope);
  }
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    if (typeof window === "undefined") return newThreadId();
    return localStorage.getItem(`copilot_last_thread_${workspaceKey}`) ?? newThreadId();
  });
  const [pastChatsOpen, setPastChatsOpen] = useState(false);
  const [activeThreadTitle, setActiveThreadTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);
  const [browserRefreshKey, setBrowserRefreshKey] = useState(0);
  const [loadingThread, setLoadingThread] = useState(false);
  const [credits, setCredits] = useState<CreditsState>(null);
  const [consistencyConflicts, setConsistencyConflicts] = useState<SuggestionPayload[] | null>(null);
  const [, setConsistencyChecking] = useState(false);
  const titleRequestedRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hydratedRef = useRef(false);

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
  const {
    conflicts: crossSuiteConflicts,
    openResolverById: openCrossSuiteResolverById,
    ResolverNode: CrossSuiteResolverNode,
    AIReviewModalNode: CrossSuiteAIReviewModalNode,
  } = useCrossSuiteConflictResolver();

  const resolverConflictIdFor = useCallback(
    (finding: AuditFinding): string | null => {
      const id = crossSuiteConflictIdForAuditFinding(finding);
      if (!id) return null;
      return crossSuiteConflicts.some((c) => c.id === id) ? id : null;
    },
    [crossSuiteConflicts],
  );
  const handleOpenCrossSuiteResolver = useCallback((id: string) => openCrossSuiteResolverById(id), [openCrossSuiteResolverById]);

  useEffect(() => {
    if (trialRemaining === null) return;
    setCredits((prev) => {
      if (prev?.mode !== "trial") return prev;
      const used = FREE_TRIAL_COPILOT_LIMIT_LOCAL - trialRemaining;
      return { ...prev, trialUsed: used, trialRemaining };
    });
  }, [trialRemaining]);

  // Fetch credits on mount (rail is always visible, not just when opened).
  useEffect(() => {
    void fetch("/api/credits", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as CreditsState & Record<string, unknown>;
        setCredits(data as CreditsState);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!creditsAddedToast) return;
    void fetch("/api/credits", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as CreditsState & Record<string, unknown>;
        setCredits(data as CreditsState);
      })
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    params.delete("credits_added");
    const search = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (search ? `?${search}` : "") + window.location.hash);
    const t = setTimeout(() => setCreditsAddedToast(false), 6000);
    return () => clearTimeout(t);
  }, [creditsAddedToast]);

  const handleNewThread = useCallback(
    (scope: ConversationScope = workspaceKey) => {
      abort(); reset();
      setActiveThreadId(newThreadId());
      setActiveScope(scope);
      setActiveThreadTitle(null);
      setMessages([]);
      setInput("");
      setPendingRetry(null);
    },
    [abort, reset, workspaceKey],
  );

  const handleRenameThread = useCallback((threadId: string, newTitle: string) => {
    if (threadId === activeThreadId) setActiveThreadTitle(newTitle);
    setBrowserRefreshKey((n) => n + 1);
  }, [activeThreadId]);

  const handleDeleteThread = useCallback((threadId: string) => {
    if (threadId === activeThreadId) handleNewThread();
    setBrowserRefreshKey((n) => n + 1);
  }, [activeThreadId, handleNewThread]);

  const handleConsistencyApply = useCallback(async (accepted: ApprovedChange[]) => {
    const failed: string[] = [];
    for (const change of accepted) {
      try {
        const res = await fetch("/api/copilot/consistency", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ factId: change.fieldId, value: change.finalValue }),
        });
        if (!res.ok) failed.push(change.fieldId);
      } catch {
        failed.push(change.fieldId);
      }
    }
    if (failed.length > 0) {
      throw new Error(failed.length === accepted.length
        ? "Couldn't save these changes. Please try again."
        : `Couldn't save ${failed.length} of ${accepted.length} changes. Please try again.`);
    }
    setConsistencyConflicts(null);
  }, []);

  const runCheckScan = useCallback(async () => {
    setCheckError(null); setCheckScanning(true);
    try {
      const res = await fetch("/api/business-plan/audit", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({}) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Check failed (${res.status})`);
      }
      const data = (await res.json()) as { report: AuditReport | null };
      setCheckReport(data.report);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setCheckScanning(false);
    }
  }, []);

  const runBenchmarkScan = useCallback(async (scope: ConversationScope) => {
    setBenchmarkError(null); setBenchmarkScanning(true);
    try {
      const res = await fetch("/api/companion/benchmark", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ scope }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Compare failed (${res.status})`);
      }
      const data = (await res.json()) as { report: AuditReport | null };
      setBenchmarkReport(data.report);
    } catch (err) {
      setBenchmarkError(err instanceof Error ? err.message : "Compare failed");
    } finally {
      setBenchmarkScanning(false);
    }
  }, []);

  const handleApplyFinding = useCallback((finding: AuditFinding) => {
    if (!finding.suggested_replacement) return;
    const fieldId = finding.target.field ?? finding.source.field ?? finding.id;
    const fieldLabel = finding.target.field_label ?? finding.source.field_label ?? "Source value";
    const replacement = stripFindingTags(finding.suggested_replacement);
    const original = stripFindingTags(finding.quoted_text ?? "");
    openAIReviewModal({
      suggestions: [{ id: `companion-${finding.id}`, fieldId, fieldLabel, originalValue: original, proposedValue: replacement, isStructured: false }],
      context: { workspace: finding.target.workspace ?? "plan", section: finding.target.field_label ?? undefined },
      onApply: async () => {},
    });
  }, [openAIReviewModal]);

  const handleGoToFindingSource = useCallback((finding: AuditFinding) => {
    const target = finding.target.workspace;
    const map: Record<string, string> = {
      financials: "/workspace/financials", labor: "/workspace/hiring", hiring: "/workspace/hiring",
      "buildout-equipment": "/workspace/buildout-equipment", buildout_equipment: "/workspace/buildout-equipment",
      "menu-pricing": "/workspace/menu-pricing", menu_pricing: "/workspace/menu-pricing",
      "launch-plan": "/workspace/launch-plan", opening_month_plan: "/workspace/opening-month-plan",
      "location-lease": "/workspace/location-lease", location_lease: "/workspace/location-lease",
      lease: "/workspace/location-lease", "real-estate": "/workspace/location-lease",
      "business-plan": "/workspace/business-plan", business_plan: "/workspace/business-plan",
    };
    const href = map[target];
    if (href) window.location.href = href;
  }, []);

  // TIM-2416 — open-in-mode external trigger.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: CompanionMode; scope?: ConversationScope }>).detail;
      if (!detail) return;
      if (detail.mode) setActiveMode(detail.mode);
      if (detail.scope !== undefined) setActiveScope(detail.scope);
    };
    window.addEventListener("copilot:open-in-mode", handler);
    return () => window.removeEventListener("copilot:open-in-mode", handler);
  }, []);

  // TIM-880: workspace-copilot-open event (v2: just switch to coach mode).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setActiveMode("coach");
    window.addEventListener("workspace-copilot-open", handler);
    return () => window.removeEventListener("workspace-copilot-open", handler);
  }, []);

  const handleSelectThread = useCallback(async (item: ThreadBrowserItem) => {
    if (item.id === activeThreadId && item.workspace_key === activeScope) return;
    abort(); reset();
    setLoadingThread(true);
    setActiveThreadId(item.id);
    setActiveScope(item.workspace_key);
    setActiveThreadTitle(item.title);
    setMessages([]); setInput(""); setPendingRetry(null);
    try {
      const res = await fetch(`/api/copilot/threads/${encodeURIComponent(item.id)}?planId=${encodeURIComponent(planId)}`, { credentials: "same-origin" });
      if (!res.ok) { setMessages([]); return; }
      const payload = (await res.json()) as { messages: { role: "user" | "assistant"; content: string }[]; title: string | null; workspace_key: WorkspaceKey | null };
      setMessages(payload.messages ?? []);
      setActiveThreadTitle(payload.title);
      setActiveScope(payload.workspace_key ?? null);
    } finally {
      setLoadingThread(false);
    }
  }, [abort, reset, planId, activeThreadId, activeScope]);

  const maybeRequestTitle = useCallback((threadId: string, fullMessages: CopilotMessage[]) => {
    if (titleRequestedRef.current.has(threadId)) return;
    if (activeThreadTitle?.trim()) return;
    if (fullMessages.length < 3) return;
    const firstUser = fullMessages.find((m) => m.role === "user");
    if (!firstUser?.content.trim()) return;
    titleRequestedRef.current.add(threadId);
    void fetch(`/api/copilot/threads/${encodeURIComponent(threadId)}/title`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ planId, firstUserMessage: firstUser.content }),
    })
      .then(async (res) => {
        if (!res.ok) { titleRequestedRef.current.delete(threadId); return null; }
        return (await res.json()) as { title?: string };
      })
      .then((payload) => {
        if (payload?.title) { setActiveThreadTitle(payload.title); setBrowserRefreshKey((n) => n + 1); }
      })
      .catch(() => { titleRequestedRef.current.delete(threadId); });
  }, [planId, activeThreadTitle]);

  const performSend = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming) return;
    if (trialMessagesUsed >= COPILOT_FREE_TRIAL_LIMIT) { setTrialModalOpen(true); return; }
    setPendingRetry(trimmed);
    const optimistic: CopilotMessage = { role: "user", content: trimmed };
    const nextHistory = [...messages, optimistic];
    setMessages(nextHistory);
    setInput("");
    const result = await send({ planId, workspaceKey: activeScope, threadId: activeThreadId, history: messages, prompt: trimmed });
    if (!result) return;
    const assistantMessage: CopilotMessage = { role: "assistant", content: result.assistant };
    const finalMessages = [...nextHistory, assistantMessage];
    setMessages(finalMessages);
    setPendingRetry(null);
    if (result.threadId !== activeThreadId) setActiveThreadId(result.threadId);
    setBrowserRefreshKey((n) => n + 1);
    maybeRequestTitle(result.threadId ?? activeThreadId, finalMessages);
    if (result.trialRemaining !== null) {
      const newUsed = FREE_TRIAL_COPILOT_LIMIT_LOCAL - result.trialRemaining;
      setTrialMessagesUsed(newUsed);
      if (newUsed >= COPILOT_FREE_TRIAL_LIMIT) setTrialModalOpen(true);
    }
    if (result.creditsRemaining !== null) {
      setCredits((prev) => prev?.mode === "credits" ? { ...prev, remaining: result.creditsRemaining! } : prev);
    }
  }, [activeThreadId, activeScope, isStreaming, maybeRequestTitle, messages, planId, send, trialMessagesUsed]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void performSend(input);
  }, [input, performSend]);

  const handleRetry = useCallback(() => {
    if (!pendingRetry) return;
    setMessages((current) => {
      if (current.length === 0) return current;
      const last = current[current.length - 1];
      if (last.role === "user" && last.content === pendingRetry) return current.slice(0, -1);
      return current;
    });
    reset();
    void performSend(pendingRetry);
  }, [pendingRetry, performSend, reset]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, assistantBuffer, isThinking, error]);

  const [externalFocusLabel, setExternalFocusLabel] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; focusLabel?: string }>).detail;
      if (!detail) return;
      if (typeof detail.focusLabel === "string") setExternalFocusLabel(detail.focusLabel);
      if (typeof detail.prompt === "string" && detail.prompt.trim().length > 0) setInput(detail.prompt);
    };
    window.addEventListener("copilot:open-with-prompt", handler);
    return () => window.removeEventListener("copilot:open-with-prompt", handler);
  }, []);

  useEffect(() => {
    setExternalFocusLabel(null);
  }, [activeThreadId, activeScope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(`copilot_last_thread_${workspaceKey}`, activeThreadId);
  }, [activeThreadId, workspaceKey]);

  // Hydrate messages on mount.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(`copilot_last_thread_${workspaceKey}`);
    if (!stored) return;
    setActiveThreadId(stored);
    setLoadingThread(true);
    fetch(`/api/copilot/threads/${encodeURIComponent(stored)}?planId=${encodeURIComponent(planId)}`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return;
        const payload = (await res.json()) as { messages: { role: "user" | "assistant"; content: string }[]; title: string | null; workspace_key: WorkspaceKey | null };
        setMessages(payload.messages ?? []);
        setActiveThreadTitle(payload.title ?? null);
        setActiveScope(payload.workspace_key ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingThread(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errorBanner = error ? errorCopy(error) : null;
  const showEmpty = !isStreaming && !assistantBuffer && messages.length === 0 && !error && !loadingThread;

  const activeThreadLabel = useMemo(() => {
    if (activeThreadTitle?.trim()) return activeThreadTitle;
    if (messages.length === 0 && !isStreaming) return "New conversation";
    return deriveTitle(messages);
  }, [activeThreadTitle, isStreaming, messages]);

  const scopeNoun = activeScope === null ? "your whole plan" : `your ${WORKSPACE_LABELS[activeScope]}`;
  const scopeHeaderLabel = (() => {
    if (activeMode === "check") return `Checking ${scopeNoun}`;
    if (activeMode === "benchmark") return `Comparing ${scopeNoun} to industry averages`;
    return `Asking about ${scopeNoun}`;
  })();

  return (
    <>
      {AIReviewModalNode}
      {CrossSuiteResolverNode}
      {CrossSuiteAIReviewModalNode}
      <PaywallModal open={trialModalOpen} onClose={() => setTrialModalOpen(false)} variant="copilot_trial" />
      <CreditPacksModal open={buyCreditsOpen} onClose={() => setBuyCreditsOpen(false)} />

      {/* Header */}
      <header className="px-3 pt-3 pb-2 border-b border-[var(--border)] flex items-start gap-2 shrink-0">
        <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5", isStreaming ? "ai-streaming-avatar" : "bg-[var(--teal)]/10 text-[var(--teal)]")}>
          <Sparkles aria-hidden className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="text-sm font-semibold text-[var(--foreground)] truncate">{COPILOT_NAME}</h2>
            <span className="text-[10px] uppercase tracking-wide text-[var(--neutral-cool-600)] font-medium">{COPILOT_SUBTITLE}</span>
            {credits?.mode === "trial" && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${credits.trialRemaining <= 1 ? "bg-amber-100 text-amber-700" : "bg-[var(--teal)]/10 text-[var(--teal)]"}`}>
                {credits.trialRemaining} of {credits.trialLimit} left
              </span>
            )}
            {credits?.mode === "credits" && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${credits.remaining <= 5 ? "bg-amber-100 text-amber-700" : "bg-[var(--teal)]/10 text-[var(--teal)]"}`}>
                {credits.monthlyGrant ? `${credits.remaining}/${credits.monthlyGrant} credits` : `${credits.remaining} credits`}
              </span>
            )}
          </div>
          <p className="text-[10px] text-[var(--neutral-cool-600)] truncate">
            {scopeHeaderLabel}
            {externalFocusLabel && activeScope === workspaceKey ? ` · ${externalFocusLabel}` : currentFocus?.label && activeScope === workspaceKey ? ` · ${currentFocus.label}` : ""}
            {` · ${activeThreadLabel}`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Past chats"
          aria-pressed={pastChatsOpen}
          title="Past chats"
          onClick={() => setPastChatsOpen((v) => !v)}
          className="mt-0.5 w-7 h-7 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center text-[var(--neutral-cool-600)] shrink-0"
        >
          <Clock aria-hidden className="w-3.5 h-3.5" />
        </button>
        {showCollapseButton && onCollapse && (
          <button
            type="button"
            aria-label="Collapse Scout"
            onClick={onCollapse}
            title="Collapse"
            className="mt-0.5 w-7 h-7 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center text-[var(--neutral-cool-600)] shrink-0"
          >
            <ChevronRight aria-hidden className="w-3.5 h-3.5" />
          </button>
        )}
      </header>

      {/* Mode strip */}
      <ModeStrip activeMode={activeMode} onSelect={setActiveMode} />

      {/* Content + input */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {activeMode === "check" && (
            <CheckPanel report={checkReport} isScanning={checkScanning} error={checkError} onRun={() => void runCheckScan()} onApply={handleApplyFinding} onGoToSource={handleGoToFindingSource} resolverConflictIdFor={resolverConflictIdFor} onOpenCrossSuite={handleOpenCrossSuiteResolver} />
          )}
          {activeMode === "benchmark" && (
            <BenchmarkPanel scopeLabel={scopeHeaderLabel} report={benchmarkReport} isScanning={benchmarkScanning} error={benchmarkError} onRun={() => void runBenchmarkScan(activeScope)} onApply={handleApplyFinding} onGoToSource={handleGoToFindingSource} resolverConflictIdFor={resolverConflictIdFor} onOpenCrossSuite={handleOpenCrossSuiteResolver} />
          )}
          {activeMode === "import" && (
            <ImportPanel
              planId={planId}
              source="companion"
              creditBalance={credits?.mode === "credits" ? credits.remaining : null}
              openReview={({ suggestions, onApply }) => openAIReviewModal({ suggestions: suggestions as SuggestionPayload[], context: { workspace: "document_import" }, onApply })}
            />
          )}
          {activeMode === "coach" && loadingThread && <p className="text-xs text-[var(--neutral-cool-600)]">Loading conversation…</p>}
          {activeMode === "coach" && showEmpty && (
            <div className="text-sm text-[var(--gray-1100)] bg-[var(--background)] border border-[var(--border)] rounded-xl p-3">
              <p className="text-xs font-semibold text-[var(--teal)] mb-1.5 uppercase tracking-wide">
                {activeScope === null ? "Asking about your whole plan" : `Asking about your ${WORKSPACE_LABELS[activeScope]}`}
              </p>
              {activeScope === null
                ? `Ask anything. ${COPILOT_NAME} can see all your workspaces.`
                : `Ask anything about your ${WORKSPACE_LABELS[activeScope].toLowerCase()}. ${COPILOT_NAME} can see your numbers across every workspace.`}
            </div>
          )}
          {activeMode === "coach" && messages.map((msg, idx) => (
            <MessageBubble key={idx} role={msg.role} content={msg.content} />
          ))}
          {activeMode === "coach" && (assistantBuffer || isThinking) && (
            <div className="space-y-2">
              {isThinking && (
                <div role="status" aria-live="polite" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--teal)]/10 text-[var(--teal)] text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] animate-pulse" />
                  Thinking…
                </div>
              )}
              {assistantBuffer && <MessageBubble role="assistant" content={assistantBuffer} streaming />}
            </div>
          )}
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
                    onApply: async (accepted: ApprovedChange[]) => {
                      const actionable = accepted.filter((c) => c.fieldId !== "timeline_mismatch" && c.fieldId !== "derived");
                      const equipmentCost = actionable.filter((c) => parseEquipmentCostFieldId(c.fieldId));
                      const rest = actionable.filter((c) => !parseEquipmentCostFieldId(c.fieldId));
                      if (equipmentCost.length > 0) await applyEquipmentCostChanges(equipmentCost);
                      if (context.workspace === "menu_pricing") {
                        await applyMenuPricingProposal(rest);
                      } else if (onApplySuggestions && rest.length > 0) {
                        await onApplySuggestions(rest);
                      }
                      clearSuggestions();
                    },
                  });
                }}
                className="flex items-center gap-2 bg-[var(--teal)] text-white rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-[var(--teal-dark)] transition-colors"
              >
                <Sparkles size={12} aria-hidden />
                {`Review ${pendingSuggestions.suggestions.length} suggestion${pendingSuggestions.suggestions.length === 1 ? "" : "s"}`}
              </button>
            </div>
          )}
          {consistencyConflicts && !isStreaming && (
            <div className="flex">
              <button
                type="button"
                onClick={() => {
                  if (!consistencyConflicts) return;
                  openAIReviewModal({ suggestions: consistencyConflicts, context: { workspace: "consistency", section: "Plan consistency" }, onApply: handleConsistencyApply });
                }}
                className="flex items-center gap-2 bg-[var(--teal)] text-white rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-[var(--teal-dark)] transition-colors"
              >
                <Sparkles size={12} aria-hidden />
                {`Review ${consistencyConflicts.length} plan ${consistencyConflicts.length === 1 ? "conflict" : "conflicts"}`}
              </button>
            </div>
          )}
          {errorBanner && (
            <div className="border border-red-200 bg-red-50 text-red-700 rounded-xl p-3 text-sm flex items-start gap-3">
              <span aria-hidden>!</span>
              <div className="flex-1">
                <p className="font-medium text-xs">{errorBanner.title}</p>
                <div className="mt-1.5 flex gap-2">
                  {errorBanner.cta && errorBanner.href ? (
                    <Link href={errorBanner.href} className="text-xs font-semibold text-red-800 underline">{errorBanner.cta}</Link>
                  ) : errorBanner.cta ? (
                    <button type="button" onClick={handleRetry} className="text-xs font-semibold text-red-800 underline">{errorBanner.cta}</button>
                  ) : null}
                  {(errorBanner as { showBuyCredits?: boolean }).showBuyCredits && (
                    <button type="button" onClick={() => setBuyCreditsOpen(true)} className="text-xs font-semibold text-red-800 underline">Buy more credits</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input — only in Coach mode */}
        {activeMode === "coach" && (
          <div className="border-t border-[var(--border)] safe-area-pb">
            <form onSubmit={handleSubmit} className="px-3 pt-2 pb-1 flex items-end gap-2">
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
                className="flex-1 resize-none rounded-xl border border-[var(--gray-600)] bg-[var(--background)] px-2.5 py-2 text-sm focus-visible:outline-none focus:ring-2 focus:ring-[var(--teal)]/40 disabled:bg-[var(--surface-warm-50)] disabled:text-[var(--neutral-cool-600)]"
              />
              {isStreaming ? (
                <button type="button" onClick={abort} className="h-9 px-2.5 rounded-xl bg-[var(--foreground)]/10 text-[var(--foreground)] text-xs font-semibold">Stop</button>
              ) : (
                <button type="submit" disabled={!input.trim()} className="h-9 px-3 rounded-xl bg-[var(--teal)] text-white text-xs font-semibold disabled:opacity-40">Send</button>
              )}
            </form>
            <p role="note" className="px-3 pb-2 pt-0.5 text-[9.5px] leading-tight text-[var(--neutral-cool-650)] text-center">{COPILOT_AI_DISCLAIMER}</p>
          </div>
        )}
      </div>

      {/* Past chats drawer */}
      <PastChatsDrawer
        open={pastChatsOpen}
        onClose={() => setPastChatsOpen(false)}
        planId={planId}
        activeScope={activeScope}
        activeThreadId={activeThreadId}
        currentWorkspaceKey={workspaceKey}
        onSelectThread={(item) => { setPastChatsOpen(false); void handleSelectThread(item); }}
        onNewThread={(scope) => { setPastChatsOpen(false); handleNewThread(scope); }}
        onRenameThread={handleRenameThread}
        onDeleteThread={handleDeleteThread}
        refreshKey={browserRefreshKey}
      />
    </>
  );
}

// ── Collapsed icon strip ─────────────────────────────────────────────────────

const MODE_ICONS: Record<CompanionMode, React.ReactNode> = {
  coach: <Sparkles className="w-4 h-4" aria-hidden />,
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  benchmark: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  import: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
};

interface IconStripProps {
  onExpand: (mode: CompanionMode) => void;
}

function IconStrip({ onExpand }: IconStripProps) {
  return (
    <div className="flex flex-col items-center py-4 gap-3 flex-1">
      <button
        type="button"
        aria-label="Expand Scout"
        onClick={() => onExpand("coach")}
        title="Expand Scout"
        className="w-8 h-8 rounded-full bg-[var(--teal)]/10 text-[var(--teal)] flex items-center justify-center hover:bg-[var(--teal)]/20 transition-colors"
      >
        <ChevronLeft aria-hidden className="w-4 h-4" />
      </button>
      <div className="w-px h-3 bg-[var(--border)]" aria-hidden />
      {(["coach", "check", "benchmark", "import"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-label={`Open ${mode} mode`}
          onClick={() => onExpand(mode)}
          title={mode === "benchmark" ? "Compare" : mode === "import" ? "Load Data" : mode.charAt(0).toUpperCase() + mode.slice(1)}
          className="w-8 h-8 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center text-[var(--neutral-cool-600)] transition-colors"
        >
          {MODE_ICONS[mode]}
        </button>
      ))}
    </div>
  );
}

// ── ScoutRail (top-level, desktop + mobile) ───────────────────────────────────

export function ScoutRail(props: ScoutRailProps) {
  const { setExpanded } = useScoutRailContext();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(RAIL_COLLAPSED_KEY) === "1";
  });
  const [activeModeForExpand, setActiveModeForExpand] = useState<CompanionMode>("coach");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setViewportWidth(window.innerWidth);
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Persist collapse state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(RAIL_COLLAPSED_KEY, isCollapsed ? "1" : "0");
  }, [isCollapsed]);

  // Sync with WorkspaceProgressProvider for content padding.
  useEffect(() => {
    setExpanded(!isCollapsed);
  }, [isCollapsed, setExpanded]);

  const isMobile = viewportWidth < 1024;

  const handleCollapse = useCallback(() => setIsCollapsed(true), []);
  const handleExpand = useCallback((mode: CompanionMode) => {
    setActiveModeForExpand(mode);
    setIsCollapsed(false);
  }, []);

  if (isMobile) {
    return (
      <>
        {/* Mobile FAB */}
        {!sheetOpen && (
          <button
            type="button"
            aria-label={`Open ${COPILOT_NAME}`}
            onClick={() => setSheetOpen(true)}
            className="fixed bottom-[72px] right-4 z-30 w-14 h-14 rounded-2xl ai-gradient-bg text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          >
            <Sparkles aria-hidden className="w-5 h-5" />
          </button>
        )}
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} ariaLabel={`${COPILOT_NAME}: ${COPILOT_SUBTITLE}`} initialSnap={0.75}>
          <ScoutPanel {...props} />
        </BottomSheet>
      </>
    );
  }

  // Desktop rail.
  return (
    <aside
      aria-label={`${COPILOT_NAME}: ${COPILOT_SUBTITLE}`}
      className={`fixed right-0 top-0 h-screen bg-[var(--background)] border-l border-[var(--border)] z-40 flex flex-col transition-[width] duration-200 shadow-[-2px_0_8px_rgba(0,0,0,0.04)] ${
        isCollapsed ? "w-[48px]" : "w-[300px]"
      }`}
    >
      {isCollapsed ? (
        <IconStrip onExpand={handleExpand} />
      ) : (
        <ScoutPanel
          {...props}
          defaultMode={activeModeForExpand}
          onCollapse={handleCollapse}
          showCollapseButton
        />
      )}
    </aside>
  );
}
