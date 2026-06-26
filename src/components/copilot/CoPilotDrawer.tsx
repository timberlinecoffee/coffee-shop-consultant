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
import { ChevronUp, Clock, Maximize2, Minimize2, Sparkles } from "lucide-react";
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
  CheckPanel,
  ModeStrip,
  type CompanionMode,
} from "./CompanionPanels";
import { ImportPanel } from "./ImportPanel";
import { stripFindingTags } from "@/lib/business-plan/sanitize-finding-text";
import type { AuditFinding, AuditReport } from "@/lib/business-plan/audit";
import { useCrossSuiteConflictResolver } from "@/components/cross-suite/useCrossSuiteConflictResolver";
import { crossSuiteConflictIdForAuditFinding } from "@/lib/cross-suite/audit-mapping";

// TIM-1648: valid units matching the menu_ingredients / menu_item_ingredients schema.
const MENU_VALID_UNITS = new Set(["g", "ml", "oz", "each", "piece"]);

// TIM-2381: write accepted suggest_workspace_changes proposals for the business
// plan workspace. Each accepted change's fieldId is the section key; finalValue
// is the new user_content. Throws on failure so the review modal stays open.
async function applyBusinessPlanChanges(accepted: ApprovedChange[]): Promise<void> {
  const failed: string[] = [];
  for (const change of accepted) {
    try {
      const res = await fetch(`/api/business-plan/sections/${encodeURIComponent(change.fieldId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ user_content: change.finalValue }),
      });
      if (!res.ok) failed.push(change.fieldId);
    } catch {
      failed.push(change.fieldId);
    }
  }
  if (failed.length > 0) {
    throw new Error(
      failed.length === accepted.length
        ? "Couldn't save these changes. Please try again."
        : `Couldn't save ${failed.length} of ${accepted.length} changes. Please try again.`,
    );
  }
}

// TIM-1648: write an accepted propose_item suggestion to the menu_pricing APIs.
// Only called for accepted cards; per-card errors are non-fatal.
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

    // 1. Resolve category (fetch list, match by name, fallback to first).
    const catRes = await fetch("/api/workspaces/menu-pricing/categories", {
      credentials: "same-origin",
    });
    if (!catRes.ok) continue;
    const categories = (await catRes.json()) as Array<{ id: string; name: string }>;
    const wantedName = (payload.category_name ?? "").toLowerCase();
    const matchedCat =
      categories.find((c) => c.name.toLowerCase() === wantedName) ??
      categories[0];
    if (!matchedCat) continue;

    // 2. Create ingredient records (package_cost_cents = 0; owner fills in costs later).
    const recipeLines = payload.recipe_ingredients ?? [];
    const ingredientIds: (string | null)[] = [];
    for (const line of recipeLines) {
      const unit = MENU_VALID_UNITS.has(line.unit) ? line.unit : "oz";
      const res = await fetch("/api/workspaces/menu-pricing/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: line.name,
          package_size: line.amount > 0 ? line.amount : 1,
          package_unit: unit,
          package_cost_cents: 0,
        }),
      });
      if (res.ok) {
        ingredientIds.push(((await res.json()) as { id: string }).id);
      } else {
        ingredientIds.push(null);
      }
    }

    // 3. Create the menu item.
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

    // 4. Link recipe lines.
    for (let i = 0; i < recipeLines.length; i++) {
      const ingId = ingredientIds[i];
      const line = recipeLines[i];
      if (!ingId || !line) continue;
      const unit = MENU_VALID_UNITS.has(line.unit) ? line.unit : "oz";
      await fetch("/api/workspaces/menu-pricing/item-ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          menu_item_id: newItem.id,
          ingredient_id: ingId,
          amount: line.amount,
          unit,
        }),
      });
    }
  }
}

// TIM-2901: write an accepted add_persona proposal to the Concept workspace.
// Fetches the current concept document, merges the new persona into
// doc.personas (capped at MAX_PERSONAS=5), and PATCHes the workspace document.
// Each accepted change carries a JSON-serialized persona in finalValue;
// per-change parse errors are silent. Throws on a non-OK API response so the
// modal stays open for retry (TIM-1653 pattern).
async function applyConceptPersonaProposal(accepted: ApprovedChange[]): Promise<void> {
  if (accepted.length === 0) return;

  const MAX_PERSONAS = 5;
  const VALID_AGE = new Set(["18-25", "25-35", "35-50", "50+"]);
  const VALID_INCOME = new Set(["under-40k", "40k-80k", "80k-120k", "over-120k"]);
  const VALID_FREQ = new Set(["daily", "several-per-week", "weekly", "occasional"]);
  const VALID_SPEND = new Set(["under-6", "6-10", "10-15", "over-15"]);
  const VALID_VALUES = new Set([
    "price", "speed", "atmosphere", "craft", "community", "convenience", "consistency",
  ]);

  function newPersonaId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `persona-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // 1. Fetch current concept doc.
  const getRes = await fetch("/api/workspaces/concept", { credentials: "same-origin" });
  if (!getRes.ok) throw new Error("Couldn't load your Concept workspace. Please try again.");
  const { content } = (await getRes.json()) as { content: unknown };

  // Start from the existing doc, or an empty v2 shell so we don't clobber other
  // workspaces -- defaults match EMPTY_CONCEPT_V2 in src/lib/concept.ts.
  type ConceptShape = {
    version?: number;
    components?: Record<string, { content: string; included: boolean }>;
    personas?: Array<{ id: string; name: string; isPrimary: boolean; [k: string]: unknown }>;
    [k: string]: unknown;
  };
  const baseDoc: ConceptShape =
    content && typeof content === "object"
      ? (content as ConceptShape)
      : {
          version: 2,
          components: {
            shop_identity:   { content: "", included: true },
            vision:          { content: "", included: true },
            target_customer: { content: "", included: true },
            differentiation: { content: "", included: true },
            brand_voice:     { content: "", included: true },
            location:        { content: "", included: false },
            offering:        { content: "", included: false },
          },
          personas: [],
        };

  const personas = Array.isArray(baseDoc.personas) ? [...baseDoc.personas] : [];
  if (personas.length >= MAX_PERSONAS) {
    throw new Error(
      `You already have ${MAX_PERSONAS} personas. Remove one in Concept before adding a new one.`,
    );
  }

  // 2. Build merged persona list from accepted changes.
  for (const change of accepted) {
    let payload: {
      name?: string;
      ageRange?: string | null;
      occupation?: string | null;
      incomeRange?: string | null;
      dailyContext?: string | null;
      whyTheyVisit?: string;
      painPoints?: string | null;
      typicalOrder?: string | null;
      values?: string[];
      visitFrequency?: string | null;
      spendPerVisit?: string | null;
      isPrimary?: boolean | null;
    };
    try {
      payload = JSON.parse(change.finalValue) as typeof payload;
    } catch {
      continue;
    }
    const name = (payload.name ?? "").trim();
    const whyTheyVisit = (payload.whyTheyVisit ?? "").trim();
    if (!name || !whyTheyVisit) continue;
    if (personas.length >= MAX_PERSONAS) break;

    const now = new Date().toISOString();
    const isFirst = personas.length === 0;
    const persona: Record<string, unknown> = {
      id: newPersonaId(),
      name,
      isPrimary: isFirst ? true : Boolean(payload.isPrimary),
      createdAt: now,
      updatedAt: now,
      whyTheyVisit,
    };
    if (payload.ageRange && VALID_AGE.has(payload.ageRange)) persona.ageRange = payload.ageRange;
    if (payload.occupation && payload.occupation.trim()) persona.occupation = payload.occupation.trim();
    if (payload.incomeRange && VALID_INCOME.has(payload.incomeRange)) persona.incomeRange = payload.incomeRange;
    if (payload.dailyContext && payload.dailyContext.trim()) persona.dailyContext = payload.dailyContext.trim();
    if (payload.painPoints && payload.painPoints.trim()) persona.painPoints = payload.painPoints.trim();
    if (payload.typicalOrder && payload.typicalOrder.trim()) persona.typicalOrder = payload.typicalOrder.trim();
    if (Array.isArray(payload.values)) {
      const valid = payload.values.filter((v) => typeof v === "string" && VALID_VALUES.has(v));
      if (valid.length > 0) persona.values = valid;
    }
    if (payload.visitFrequency && VALID_FREQ.has(payload.visitFrequency)) persona.visitFrequency = payload.visitFrequency;
    if (payload.spendPerVisit && VALID_SPEND.has(payload.spendPerVisit)) persona.spendPerVisit = payload.spendPerVisit;
    personas.push(persona as ConceptShape["personas"] extends Array<infer T> ? T : never);
  }

  // If nothing parseable came through, no-op (don't blow away the user's doc).
  if (personas.length === (Array.isArray(baseDoc.personas) ? baseDoc.personas.length : 0)) {
    return;
  }

  // 3. PATCH back. Preserve all other fields on the concept doc.
  const merged: ConceptShape = { ...baseDoc, personas };
  const patchRes = await fetch("/api/workspaces/concept", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ content: merged }),
  });
  if (!patchRes.ok) throw new Error("Couldn't add the persona to your Concept workspace. Please try again.");
}

// TIM-1798: write accepted cross-workspace equipment-cost changes. The equipment
// item's unit cost is the single source of truth — writing it makes the Financials
// equipment line + startup-cost total recompute on next load (TIM-1253 auto-sync),
// so the coordinated change applies coherently from one reviewed action. The
// linked Financials cards are read-only previews and never reach this function
// (they carry fieldId "derived" and are not acceptable). Throws on failure so the
// review modal stays open for retry (TIM-1653 pattern).
async function applyEquipmentCostChanges(accepted: ApprovedChange[]): Promise<void> {
  for (const change of accepted) {
    const meta = parseEquipmentCostFieldId(change.fieldId);
    if (!meta) continue;
    const priceCents = parseFactValue("currency_cents", change.finalValue);
    if (priceCents === null || typeof priceCents !== "number") {
      throw new Error(`"${change.finalValue}" is not a valid cost.`);
    }
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
        body: JSON.stringify({
          name: meta.name,
          // Buildout categories are lowercase enum keys; Scout proposes a Title
          // Case label, so normalize. Omit to let the API default when unset.
          category: meta.category ? meta.category.toLowerCase() : undefined,
          quantity: meta.quantity,
          unit_cost_cents: priceCents,
          source: "ai_suggested",
        }),
      });
      if (!res.ok) throw new Error(`Couldn't add ${meta.name}. Please try again.`);
    }
  }
}

// TIM-1149 / TIM-1151: Resizable / expandable panel constants.
// Expanded mode is a true full-width overlay (TIM-1151 founder feedback) —
// it ignores PANEL_MAX_WIDTH so the chat takes the whole workspace area.
const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 1100;
const PANEL_DEFAULT_WIDTH = 448;
const PANEL_WIDTH_STORAGE_KEY = "copilot_panel_width_v1";
const PANEL_EXPANDED_STORAGE_KEY = "copilot_panel_expanded_v1";

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
  | { mode: "credits"; remaining: number; monthlyGrant?: number }
  | null;

export interface CoPilotDrawerProps {
  workspaceKey: WorkspaceKey | null;
  planId: string;
  currentFocus?: CopilotFocus;
  initialTrialMessagesUsed?: number;
  // TIM-2381: CoPilotBeacon retired; this FAB is now the sole entry point on
  // both mobile and desktop. showDesktopLauncher defaults to true. The prop is
  // kept for backward compatibility with existing call sites.
  showDesktopLauncher?: boolean;
  // TIM-1637: workspace-specific callback invoked when the user accepts AI suggestions.
  onApplySuggestions?: (accepted: ApprovedChange[]) => Promise<void>;
  // TIM-2416 — AI Companion v3. Per UX spec §5: Dashboard + Business Plan
  // entries default to Check mode; source-workspace entries default to Coach.
  // When omitted, the drawer defaults to Coach.
  defaultMode?: CompanionMode;
  // TIM-2416 — initial scope override. Dashboard + Business Plan pass null
  // (whole plan); source workspaces inherit `workspaceKey` from the prop.
  defaultScopeOverride?: ConversationScope;
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

function errorCopy(err: CopilotErrorState): { title: string; cta: string | null; href: string | null; showBuyCredits?: boolean } {
  switch (err.code) {
    case "trial_exhausted":
      return {
        title: `You've used all 5 trial messages. Upgrade to keep planning with ${COPILOT_NAME}.`,
        cta: "See plans",
        href: UPGRADE_PATH,
      };
    case "out_of_credits":
      // TIM-1687: spec requires offering BOTH paths when out of credits.
      return {
        title: err.message,
        cta: "Upgrade plan",
        href: UPGRADE_PATH,
        showBuyCredits: true,
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
        title: "AI service hiccup. Your message wasn't sent.",
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
          title: `Your plan is paused. Reactivate to keep using ${COPILOT_NAME}.`,
          cta: "Reactivate",
          href: "/account/billing",
        };
      }
      return {
        title: `A paid plan is required to use ${COPILOT_NAME}.`,
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
  showDesktopLauncher = true,
  onApplySuggestions,
  defaultMode = "coach",
  defaultScopeOverride,
}: CoPilotDrawerProps) {
  const [open, setOpen] = useState(false);
  // TIM-2416 — companion mode state. Coach mode keeps the existing chat UX;
  // Check renders finding-card panels.
  const [activeMode, setActiveMode] = useState<CompanionMode>(defaultMode);
  const [checkReport, setCheckReport] = useState<AuditReport | null>(null);
  const [checkScanning, setCheckScanning] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [trialMessagesUsed, setTrialMessagesUsed] = useState(initialTrialMessagesUsed);
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false); // TIM-1687
  // TIM-2311: success-return toast after Stripe credit-pack checkout.
  // Stripe redirects back to {returnPath}?credits_added=1; this surfaces a
  // confirmation + refetches the meter so the user sees the new balance without
  // a manual reload. Lazy initializer reads the URL on the first client render so
  // we don't have to call setState synchronously inside an effect.
  const [creditsAddedToast, setCreditsAddedToast] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("credits_added") === "1";
  });
  // Track the prop separately so a parent-driven workspace switch resets the active
  // workspace without us calling setState inside an effect body.
  const [workspaceKeyVersion, setWorkspaceKeyVersion] = useState<{ key: WorkspaceKey | null }>(() => ({
    key: workspaceKey,
  }));
  // TIM-2416 — Dashboard + Business Plan callers pass defaultScopeOverride=null
  // (whole plan); source workspaces use the inherited workspaceKey.
  const initialScope: ConversationScope =
    defaultScopeOverride !== undefined ? defaultScopeOverride : workspaceKey;
  const [activeScope, setActiveScope] = useState<ConversationScope>(initialScope);
  if (workspaceKeyVersion.key !== workspaceKey) {
    setWorkspaceKeyVersion({ key: workspaceKey });
    setActiveScope(initialScope);
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
  // TIM-2436 — Past chats moves out of the chat panel into a separate
  // left-anchored drawer. Closed by default on page load (no persistence).
  const [pastChatsOpen, setPastChatsOpen] = useState<boolean>(false);
  const [activeThreadTitle, setActiveThreadTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);
  const [browserRefreshKey, setBrowserRefreshKey] = useState(0);
  const [loadingThread, setLoadingThread] = useState(false);
  const [credits, setCredits] = useState<CreditsState>(null);
  // TIM-1728: cross-workspace consistency conflicts surfaced through AIReviewModal.
  const [consistencyConflicts, setConsistencyConflicts] = useState<SuggestionPayload[] | null>(null);
  const [, setConsistencyChecking] = useState(false);
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
    // TIM-2900: turn-id-keyed render guard. The streaming bubble must only
    // render while `streamingTurnId !== null`; we call `commitTurn(turnId)`
    // the same tick we append the assistant message to `messages`, so React
    // batches both updates and the bubble swaps cleanly with no overlap.
    streamingTurnId,
    commitTurn,
    send,
    abort,
    reset,
  } = useCopilotStream();

  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();

  // TIM-2453 — Check-mode cross-suite conflict resolver. The hook fetches the
  // resolver's GET response once and exposes openResolverById; Check-mode
  // cards that map to a known conflict id dispatch through this hook so the
  // modal opens on the same conflict the Hiring/Financials badges point at.
  // We render the resolver's own AIReviewModalNode (separate hook instance
  // from the chat's; mounting both is safe — only one is ever open at a time).
  const {
    conflicts: crossSuiteConflicts,
    openResolverById: openCrossSuiteResolverById,
    ResolverNode: CrossSuiteResolverNode,
    AIReviewModalNode: CrossSuiteAIReviewModalNode,
  } = useCrossSuiteConflictResolver();

  // Resolve an audit finding to a cross-suite conflict id ONLY when the
  // resolver actually surfaced that conflict in today's response. Otherwise
  // return null — the card keeps its standard Apply/Go-to-source behavior and
  // never falls back to "open conflict 0". See audit-mapping.test.mjs.
  const resolverConflictIdFor = useCallback(
    (finding: AuditFinding): string | null => {
      const id = crossSuiteConflictIdForAuditFinding(finding);
      if (!id) return null;
      return crossSuiteConflicts.some((c) => c.id === id) ? id : null;
    },
    [crossSuiteConflicts],
  );

  const handleOpenCrossSuiteResolver = useCallback(
    (conflictId: string) => {
      openCrossSuiteResolverById(conflictId);
    },
    [openCrossSuiteResolverById],
  );

  // Keep local trial count in sync with the server after each message.
  useEffect(() => {
    if (trialRemaining === null) return;
    setCredits((prev) => {
      if (prev?.mode !== "trial") return prev;
      const used = FREE_TRIAL_COPILOT_LIMIT - trialRemaining;
      return { ...prev, trialUsed: used, trialRemaining };
    });
  }, [trialRemaining]);

  // TIM-2311: paired with the lazy initializer above — when the URL flag is
  // present on mount, refetch the meter, strip the param, and auto-dismiss the
  // toast. setState calls here are either async (inside .then) or scheduled
  // (setTimeout), so the effect never sets state synchronously in its body.
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
    const next =
      window.location.pathname + (search ? `?${search}` : "") + window.location.hash;
    window.history.replaceState(null, "", next);
    const t = setTimeout(() => setCreditsAddedToast(false), 6000);
    return () => clearTimeout(t);
  }, [creditsAddedToast]);

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

  // TIM-2416 — the manual "Check plan consistency" handler was retired with
  // the inline Coach trigger (UX spec §3a). Run the consistency check via the
  // companion Check mode; the auto on-open conflict fetch below still feeds
  // the "Review N plan conflicts" CTA when conflicts already exist.

  // TIM-1728: apply a consistency resolution — POST the canonical value for each accepted conflict.
  // TIM-1731: per-call error handling. A failed write must NOT clear the conflict list; throwing
  // here keeps the AIReviewModal's accepted cards visible and surfaces the failure in its footer
  // (same contract as the other onApply paths). Conflicts clear only when every write succeeds.
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
      throw new Error(
        failed.length === accepted.length
          ? "Couldn't save these changes. Please try again."
          : `Couldn't save ${failed.length} of ${accepted.length} changes. Please try again.`,
      );
    }
    setConsistencyConflicts(null);
  }, []);

  // ── TIM-2416: Check scan handler. ──────────────────────────────────────────

  const runCheckScan = useCallback(async () => {
    setCheckError(null);
    setCheckScanning(true);
    try {
      const res = await fetch("/api/business-plan/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({}),
      });
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

  // TIM-2416 — Apply suggestion for a finding (Check mode). Routes
  // through the unified AI review modal; never auto-applies (platform rule).
  const handleApplyFinding = useCallback(
    (finding: AuditFinding) => {
      if (!finding.suggested_replacement) return;
      const fieldId = finding.target.field ?? finding.source.field ?? finding.id;
      const fieldLabel =
        finding.target.field_label ?? finding.source.field_label ?? "Source value";
      const replacement = stripFindingTags(finding.suggested_replacement);
      const original = stripFindingTags(finding.quoted_text ?? "");
      openAIReviewModal({
        suggestions: [
          {
            id: `companion-${finding.id}`,
            fieldId,
            fieldLabel,
            originalValue: original,
            proposedValue: replacement,
            isStructured: false,
          },
        ],
        context: {
          workspace: finding.target.workspace ?? "plan",
          section: finding.target.field_label ?? undefined,
        },
        onApply: async () => {
          // For companion findings the reviewed value is committed by the
          // owning workspace; the modal still surfaces the reviewed change so
          // the user can copy it into the source. No direct PATCH from here.
        },
      });
    },
    [openAIReviewModal],
  );

  // TIM-2416 — Go to source. Mirrors the BP workspace handleGoToAuditSource
  // navigation map. Closes the drawer first so the destination workspace
  // doesn't render behind a backdrop.
  const handleGoToFindingSource = useCallback((finding: AuditFinding) => {
    const target = finding.target.workspace;
    const workspaceHref: Record<string, string> = {
      financials: "/workspace/financials",
      labor: "/workspace/hiring",
      hiring: "/workspace/hiring",
      "buildout-equipment": "/workspace/buildout-equipment",
      buildout_equipment: "/workspace/buildout-equipment",
      "menu-pricing": "/workspace/menu-pricing",
      menu_pricing: "/workspace/menu-pricing",
      "launch-plan": "/workspace/launch-plan",
      opening_month_plan: "/workspace/opening-month-plan",
      "location-lease": "/workspace/location-lease",
      location_lease: "/workspace/location-lease",
      lease: "/workspace/location-lease",
      "real-estate": "/workspace/location-lease",
      "business-plan": "/workspace/business-plan",
      business_plan: "/workspace/business-plan",
    };
    const href = workspaceHref[target];
    if (href) {
      setOpen(false);
      window.location.href = href;
    }
  }, []);

  // TIM-2416 — open-in-mode external trigger. External surfaces dispatch this
  // event to open the companion in a specific mode + scope as a one-call path.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        mode?: CompanionMode;
        scope?: ConversationScope;
      }>).detail;
      if (!detail) return;
      openDrawer();
      const VALID_MODES: CompanionMode[] = ["coach", "check", "import"];
      if (detail.mode && VALID_MODES.includes(detail.mode)) setActiveMode(detail.mode);
      if (detail.scope !== undefined) setActiveScope(detail.scope);
    };
    window.addEventListener("copilot:open-in-mode", handler);
    return () => window.removeEventListener("copilot:open-in-mode", handler);
  }, [openDrawer]);

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
      // TIM-2900: clear the streaming bubble in the SAME tick we commit the
      // assistant message. React 18 batches these into one render — the
      // streaming bubble disappears exactly when the committed bubble appears,
      // so the same response can never render twice.
      commitTurn(result.turnId);
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

      // TIM-1671: live credit meter — reflect the post-turn balance from the
      // stream's `done` event without a refetch.
      if (result.creditsRemaining !== null) {
        setCredits((prev) =>
          prev?.mode === "credits" ? { ...prev, remaining: result.creditsRemaining! } : prev,
        );
      }
    },
    [
      activeThreadId,
      activeScope,
      commitTurn,
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

  // External "Write with AI" hook (TIM-619, renamed TIM-2899): per-field buttons in workspace editors
  // dispatch `copilot:open-with-prompt` to open the drawer with a seeded prompt
  // so the user can refine a Concept field without retyping context.
  // TIM-2381: extended to accept workspaceKey so AskScoutButton can scope the
  // chat to "This Page" before the first message — no flash of unscoped chat.
  // TIM-2902: extended to accept autoSubmit. Per-field buttons set it so the
  // seeded prompt is sent as a real user turn (appearing in the transcript as a
  // normal user message) instead of sitting silently in the composer.
  const [externalFocusLabel, setExternalFocusLabel] = useState<string | null>(null);
  // Hold the latest performSend in a ref so the listener doesn't re-subscribe
  // on every messages/state change.
  const performSendRef = useRef<((prompt: string) => Promise<void>) | null>(null);
  useEffect(() => {
    performSendRef.current = performSend;
  }, [performSend]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        prompt?: string;
        focusLabel?: string;
        workspaceKey?: WorkspaceKey;
        action?: string;
        autoSubmit?: boolean;
      }>).detail;
      if (!detail) return;
      openDrawer();
      if (typeof detail.focusLabel === "string") {
        setExternalFocusLabel(detail.focusLabel);
      }
      // TIM-2381: set scope to the dispatching workspace so "This Page" context
      // is correct before the first message. Only override when explicitly set.
      if (detail.workspaceKey) {
        setActiveScope(detail.workspaceKey);
      }
      if (typeof detail.prompt === "string" && detail.prompt.trim().length > 0) {
        if (detail.autoSubmit && performSendRef.current) {
          // TIM-2902: force Coach mode so the user message bubble actually
          // renders — Check/Import modes don't show the transcript.
          setActiveMode("coach");
          void performSendRef.current(detail.prompt);
        } else {
          setInput(detail.prompt);
        }
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

  // TIM-1728: detect cross-workspace conflicts whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setConsistencyChecking(true);
    fetch("/api/copilot/consistency", { credentials: "same-origin" })
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { suggestions: SuggestionPayload[] };
        if (!cancelled) {
          setConsistencyConflicts(data.suggestions.length > 0 ? data.suggestions : null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setConsistencyChecking(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]); // Only re-run when drawer opens/closes, not on every state change.

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

  // TIM-2416 — per UX spec §5, scope header wording is mode-aware. Coach uses
  // "Asking about", Check uses "Checking".
  const scopeNoun =
    activeScope === null
      ? "your whole plan"
      : `your ${WORKSPACE_LABELS[activeScope]}`;
  const scopeHeaderLabel = (() => {
    if (activeMode === "check") return `Checking ${scopeNoun}`;
    return `Asking about ${scopeNoun}`;
  })();

  return (
    <>
      {/* TIM-1561: AI review modal for suggestions from chat. */}
      {AIReviewModalNode}
      {/* TIM-2453: cross-suite resolver modal (+ its own AIReviewModal for
          path-accept Apply round-trip). Mounted unconditionally so the modal
          can open from any Check-mode card click without waiting on hydration. */}
      {CrossSuiteResolverNode}
      {CrossSuiteAIReviewModalNode}
      <PaywallModal
        open={trialModalOpen}
        onClose={() => setTrialModalOpen(false)}
        variant="copilot_trial"
      />
      {/* TIM-1687: one-off credit top-up. */}
      <CreditPacksModal open={buyCreditsOpen} onClose={() => setBuyCreditsOpen(false)} />
      {/* TIM-2311: success toast after returning from Stripe credit-pack checkout. */}
      {creditsAddedToast && (
        <div
          role="status"
          data-testid="credits-added-toast"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[var(--teal)] text-white px-4 py-3 rounded-xl shadow-lg max-w-sm"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <p className="text-sm font-medium flex-1">
            Credits added. Your balance is up to date.
          </p>
          <button
            type="button"
            onClick={() => setCreditsAddedToast(false)}
            className="text-white/80 hover:text-white"
            aria-label="Dismiss"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
      {!open && (
        <button
          type="button"
          aria-label={`Open ${COPILOT_NAME} (${COPILOT_SUBTITLE})`}
          onClick={openDrawer}
          // TIM-1574: hide on desktop (lg+) unless this consumer has no Beacon.
          // TIM-1678: style-guide FAB — bottom-[72px] right-4 z-30 w-14 h-14 rounded-2xl.
          className={`fixed bottom-[72px] right-4 lg:bottom-6 lg:right-6 z-30 w-14 h-14 rounded-2xl ai-gradient-bg text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform ${showDesktopLauncher ? "" : "lg:hidden"}`}
        >
          <Sparkles aria-hidden className="w-5 h-5" />
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

            {/* TIM-2436 — simplified header (UX spec §3a). Brand left
                (Sparkles + Scout name), context line below. Right cluster
                holds Past chats / Expand / Close, capped at 4 interactive
                elements. Credits + upgrade nudges moved to the input row. */}
            <header className="px-4 pt-4 pb-3 border-b border-[var(--border)] flex items-start gap-2">
              <div className={cn("shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5", isStreaming ? "ai-streaming-avatar" : "bg-[var(--teal)]/10 text-[var(--teal)]")}>
                <Sparkles aria-hidden className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-[var(--foreground)] truncate">
                  {COPILOT_NAME}
                </h2>
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
              <button
                type="button"
                aria-label="Past chats"
                aria-pressed={pastChatsOpen}
                title="Past chats"
                data-testid="past-chats-trigger"
                onClick={() => setPastChatsOpen((v) => !v)}
                className="mt-0.5 h-8 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center gap-1.5 text-[var(--neutral-cool-600)] shrink-0 px-2"
              >
                <Clock aria-hidden className="w-4 h-4" />
                <span className="hidden md:inline text-xs font-medium">
                  Past chats
                </span>
              </button>
              {!isMobile && (
                <button
                  type="button"
                  aria-label={isExpanded ? "Restore panel size" : "Expand panel"}
                  aria-pressed={isExpanded}
                  onClick={() => setIsExpanded((v) => !v)}
                  className="mt-0.5 w-8 h-8 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center text-[var(--neutral-cool-600)] shrink-0"
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
                className="mt-0.5 w-8 h-8 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center text-[var(--neutral-cool-600)] shrink-0"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </header>

            {/* TIM-2416 — mode strip (UX spec §2). Sits below the header,
                above the scroll/input column. Always visible, even mid-scan. */}
            <ModeStrip activeMode={activeMode} onSelect={setActiveMode} />

            {/* TIM-2436 — the inline conversations rail was retired. Past
                chats now live in the separate left-anchored drawer (see
                PastChatsDrawer rendered at the root of this component). */}
            <div className="flex flex-1 overflow-hidden min-h-0">
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {/* TIM-2416 — Check mode panel. Scoped per UX spec §3b. */}
              {activeMode === "check" && (
                <CheckPanel
                  report={checkReport}
                  isScanning={checkScanning}
                  error={checkError}
                  onRun={() => void runCheckScan()}
                  onApply={handleApplyFinding}
                  onGoToSource={handleGoToFindingSource}
                  resolverConflictIdFor={resolverConflictIdFor}
                  onOpenCrossSuite={handleOpenCrossSuiteResolver}
                />
              )}
              {/* TIM-2434: Document Import mode. Reuses the unified
                  AIReviewModal so accepted changes flow through the same
                  review surface as every other AI proposal. */}
              {activeMode === "import" && (
                <ImportPanel
                  planId={planId}
                  source="companion"
                  creditBalance={
                    credits?.mode === "credits" ? credits.remaining : null
                  }
                  openReview={({ suggestions, onApply }) =>
                    openAIReviewModal({
                      suggestions: suggestions as SuggestionPayload[],
                      context: { workspace: "document_import" },
                      onApply,
                    })
                  }
                />
              )}
              {/* Coach mode keeps every prior surface: empty state, history,
                  streaming buffer, review/conflict CTAs, error banner. */}
              {activeMode === "coach" && loadingThread && (
                <p className="text-xs text-[var(--neutral-cool-600)]">Loading conversation…</p>
              )}

              {activeMode === "coach" && showEmpty && (
                <div className="text-sm text-[var(--gray-1100)] bg-[var(--background)] border border-[var(--border)] rounded-xl p-4">
                  {/* TIM-2416 — Coach scope eyebrow (UX spec §3a). */}
                  <p className="text-xs font-semibold text-[var(--teal)] mb-2 uppercase tracking-wide">
                    {activeScope === null
                      ? "Asking about your whole plan"
                      : `Asking about your ${WORKSPACE_LABELS[activeScope]}`}
                  </p>
                  {activeScope === null
                    ? `Ask anything. ${COPILOT_NAME} can see all your workspaces.`
                    : `Ask anything about your ${WORKSPACE_LABELS[activeScope].toLowerCase()}. ${COPILOT_NAME} can see your numbers across every workspace.`}
                  {/* TIM-2416 — the standalone "Check plan consistency" trigger
                      was removed from the Coach empty state (UX spec §3a). That
                      function now lives in Check mode. */}
                </div>
              )}

              {activeMode === "coach" && messages.map((msg, idx) => (
                <MessageBubble key={idx} role={msg.role} content={msg.content} />
              ))}

              {/* TIM-2900: turn-id-keyed render guard. The streaming bubble
                  must only render while a turn is in-flight or in-error
                  (streamingTurnId still set). The instant we commit the
                  assistant message to `messages`, commitTurn() clears
                  streamingTurnId AND the buffer in the same React batch, so
                  the streaming bubble swaps cleanly to the committed bubble
                  with no overlap. Without this guard, a stale buffer plus a
                  freshly-committed assistant message render two identical
                  bubbles (the original TIM-2900 regression). */}
              {activeMode === "coach" && streamingTurnId !== null && (assistantBuffer || isThinking) && (
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

              {/* TIM-2436 — Review N suggestions / conflicts CTAs moved out
                  of the message scroll into the pinned action row directly
                  above the textarea (UX spec §3e). See further down. */}

              {activeMode === "coach" && errorBanner && (
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
                      {errorBanner.showBuyCredits && (
                        <button
                          type="button"
                          onClick={() => setBuyCreditsOpen(true)}
                          className="text-xs font-semibold text-red-800 underline"
                        >
                          Buy more credits
                        </button>
                      )}
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

            {/* TIM-2416 — the chat input is Coach-only. Check/Import
                modes are driven by their own buttons, not a text prompt. */}
            {activeMode === "coach" && (
            <motion.div
              className="border-t border-[var(--border)] safe-area-pb"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: 0.1 }}
            >
              {/* TIM-2436 — pinned action row above the textarea (UX spec
                  §3e). Shows the suggestion / conflict review pills only
                  when there is something to review, and they no longer
                  steal vertical space inside the message scroll. */}
              {(pendingSuggestions || consistencyConflicts) && !isStreaming && (
                <div className="px-3 pt-3 pb-1 flex flex-wrap gap-2">
                  {pendingSuggestions && (
                    <button
                      type="button"
                      data-testid="copilot-review-suggestions"
                      onClick={() => {
                        if (!pendingSuggestions) return;
                        const { suggestions, context } = pendingSuggestions;
                        openAIReviewModal({
                          suggestions,
                          context,
                          onApply: async (accepted: ApprovedChange[]) => {
                            const actionable = accepted.filter(
                              (c) => c.fieldId !== "timeline_mismatch" && c.fieldId !== "derived"
                            );
                            const equipmentCost = actionable.filter((c) =>
                              parseEquipmentCostFieldId(c.fieldId)
                            );
                            const rest = actionable.filter(
                              (c) => !parseEquipmentCostFieldId(c.fieldId)
                            );
                            if (equipmentCost.length > 0) {
                              await applyEquipmentCostChanges(equipmentCost);
                            }
                            // TIM-2901: add_persona proposals always target the
                            // Concept workspace (the proposal carries fieldId
                            // "new_persona" regardless of which workspace
                            // Scout was invoked from). Split them out before
                            // dispatching the remaining changes by workspace.
                            const personaProposals = rest.filter((c) => c.fieldId === "new_persona");
                            const nonPersona = rest.filter((c) => c.fieldId !== "new_persona");
                            if (personaProposals.length > 0) {
                              await applyConceptPersonaProposal(personaProposals);
                            }
                            // TIM-2381: business_plan proposals write to sections API.
                            if (context.workspace === "business_plan") {
                              await applyBusinessPlanChanges(nonPersona);
                            } else if (context.workspace === "menu_pricing") {
                              await applyMenuPricingProposal(nonPersona);
                            } else if (onApplySuggestions && nonPersona.length > 0) {
                              await onApplySuggestions(nonPersona);
                            }
                            clearSuggestions();
                          },
                        });
                      }}
                      className="inline-flex items-center gap-2 bg-[var(--teal)] text-white rounded-full px-4 py-2 text-sm font-semibold hover:bg-[var(--teal-dark)] transition-colors"
                    >
                      <Sparkles size={14} aria-hidden />
                      {pendingSuggestions.context.sourceToolName === "suggest_workspace_changes"
                        ? "Review changes →"
                        : `Review ${pendingSuggestions.suggestions.length} suggestion${pendingSuggestions.suggestions.length === 1 ? "" : "s"}`}
                    </button>
                  )}
                  {consistencyConflicts && (
                    <button
                      type="button"
                      data-testid="copilot-review-conflicts"
                      onClick={() => {
                        if (!consistencyConflicts) return;
                        openAIReviewModal({
                          suggestions: consistencyConflicts,
                          context: { workspace: "consistency", section: "Plan consistency" },
                          onApply: handleConsistencyApply,
                        });
                      }}
                      className="inline-flex items-center gap-2 bg-[var(--teal)] text-white rounded-full px-4 py-2 text-sm font-semibold hover:bg-[var(--teal-dark)] transition-colors"
                    >
                      <Sparkles size={14} aria-hidden />
                      {`Review ${consistencyConflicts.length} plan ${consistencyConflicts.length === 1 ? "conflict" : "conflicts"}`}
                    </button>
                  )}
                </div>
              )}
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
              {/* TIM-2436 — low-water credits / trial indicator (UX spec
                  §3c). Visible only when the user is near their cap so the
                  header stays clean; pairs the count with upgrade nudges
                  exactly where the user is about to send a message. */}
              {credits?.mode === "trial" && credits.trialRemaining <= 2 && (
                <div
                  data-testid="copilot-credits-row"
                  className="px-3 pt-1 pb-0.5 text-[11px] leading-tight text-center text-amber-700 flex items-center justify-center gap-2 flex-wrap"
                >
                  <span>
                    {credits.trialRemaining} of {credits.trialLimit} free messages left
                  </span>
                  <span aria-hidden className="text-[var(--neutral-cool-400)]">·</span>
                  <Link
                    href={UPGRADE_PATH}
                    className="font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)] underline"
                  >
                    Upgrade
                  </Link>
                </div>
              )}
              {credits?.mode === "credits" &&
                (credits.monthlyGrant
                  ? credits.remaining <= Math.max(1, Math.floor(credits.monthlyGrant * 0.2))
                  : credits.remaining <= 5) && (
                  <div
                    data-testid="copilot-credits-row"
                    className="px-3 pt-1 pb-0.5 text-[11px] leading-tight text-center text-amber-700 flex items-center justify-center gap-2 flex-wrap"
                  >
                    <span>
                      {credits.monthlyGrant
                        ? `${credits.remaining} of ${credits.monthlyGrant} credits left`
                        : `${credits.remaining} credits left`}
                    </span>
                    <span aria-hidden className="text-[var(--neutral-cool-400)]">·</span>
                    <button
                      type="button"
                      onClick={() => setBuyCreditsOpen(true)}
                      className="font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)] underline"
                    >
                      Buy more credits
                    </button>
                    <span aria-hidden className="text-[var(--neutral-cool-400)]">·</span>
                    <Link
                      href={UPGRADE_PATH}
                      className="font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)] underline"
                    >
                      Upgrade plan
                    </Link>
                  </div>
                )}
              {/* TIM-1149: persistent AI-mistake disclaimer. Low-emphasis, doesn't
                  steal chat space. Visible on every conversation view. */}
              <p
                role="note"
                className="px-3 pb-2 pt-0.5 text-[10.5px] leading-tight text-[var(--neutral-cool-650)] text-center"
              >
                {COPILOT_AI_DISCLAIMER}
              </p>
            </motion.div>
            )}
            </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
      </AnimatePresence>

      {/* TIM-2436 — Past Chats Drawer. Independent, left-anchored, closed
          by default. Reuses the existing ThreadBrowser in `variant="fill"`
          so search/filter/grouping/rename/delete continue to work. Selecting
          a thread auto-opens the chat panel if it isn't already open. */}
      <PastChatsDrawer
        open={pastChatsOpen}
        onClose={() => setPastChatsOpen(false)}
        viewportWidth={viewportWidth}
        chatPanelOpen={open}
        chatPanelWidth={computedPanelWidth}
        planId={planId}
        activeScope={activeScope}
        activeThreadId={activeThreadId}
        currentWorkspaceKey={workspaceKey}
        onSelectThread={(item) => {
          setPastChatsOpen(false);
          if (!open) openDrawer();
          void handleSelectThread(item);
        }}
        onNewThread={(scope) => {
          setPastChatsOpen(false);
          if (!open) openDrawer();
          handleNewThread(scope);
        }}
        onRenameThread={handleRenameThread}
        onDeleteThread={handleDeleteThread}
        refreshKey={browserRefreshKey}
      />
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
  // TIM-2900: stable testids so the duplicate-bubble regression guard can
  // count assistant bubbles (committed vs streaming) without coupling to
  // class names that drift with the style guide.
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid="copilot-bubble"
      data-role={role}
      data-streaming={streaming ? "true" : "false"}
    >
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
