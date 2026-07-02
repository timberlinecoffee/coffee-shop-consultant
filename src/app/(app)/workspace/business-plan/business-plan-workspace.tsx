"use client";

// TIM-1037: Business Plan Generator workspace — main client component.
// TIM-1225: adds Cover & Branding panel above section list.
// TIM-1315: adds worked example reference panel per section.

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { FileText, Download, ChevronDown, ChevronUp, Loader2, Plus, Trash2, Pencil, Sparkles, Eye, EyeOff, RotateCcw, MoreVertical, Archive, ArchiveRestore } from "lucide-react";
import { SectionHelp } from "@/components/ui/section-help";
import { CollapseButton } from "@/components/ui/CollapseButton";
import { MobileExpandableTextarea } from "@/components/ui/mobile-expandable-textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type {
  BusinessPlanSectionData,
  BusinessPlanSectionKey,
  CustomSectionData,
} from "@/lib/business-plan";
import {
  BUSINESS_PLAN_GROUPS,
  BUSINESS_PLAN_SECTIONS,
  DEFAULT_BUSINESS_PLAN_SECTION_ORDER,
} from "@/lib/business-plan";
import { resolveSectionOrder } from "@/lib/business-plan/default-section-order";
// TIM-3490: shared DnD canon — single source for grip/lift/sensor patterns.
import {
  DndContext,
  type DragStartEvent,
  type DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import {
  SortableHandle,
  useSortableLift,
  useCanonicalSensors,
  verticalListSortingStrategy,
  arrayMove,
} from "@/lib/dnd/sortable-canon";
import { BP_FIELD_EXAMPLES, type BPFieldExample, type BPFieldExampleKey } from "@/lib/business-plan-field-examples";
import type { CoverSettings } from "./cover-branding-panel";
import { CoverConfigModal } from "./cover-config-modal";
import { FinancialDocumentsPanel, type FinancialDocumentState } from "./financial-documents-panel";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import {
  WorkspaceActionMenu,
  WorkspaceActionMenuItem,
} from "@/components/workspace/WorkspaceActionMenu";
import { useAIReviewModal, type ApprovedChange } from "@/hooks/useAIReviewModal";
import { useBusinessPlanProgressOverlay } from "@/hooks/useBusinessPlanProgressOverlay";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import { RegenerateAllButton } from "./regenerate-all-button";
import { ExportGateModal, type ValidationReport } from "./export-gate-modal";
import { PreGenerateChecklist, type PreGenerateChecklistItem } from "./pre-generate-checklist";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import { useUiRevamp } from "@/hooks/useUiRevamp";
import type { AuditReport } from "@/lib/business-plan/audit";
import { stripSourceMarkers } from "@/lib/business-plan/source-markers";

const AUTOSAVE_DEBOUNCE_MS = 800;

type SaveState =
  | { kind: "idle"; lastSavedAt: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

interface Props {
  planId: string;
  shopName: string;
  initialSections: BusinessPlanSectionData[];
  // TIM-3111: custom sections are first-class entities separate from the fixed taxonomy.
  initialCustomSections: CustomSectionData[];
  // TIM-3490: persisted per-plan top-level section order. Empty array == default.
  initialSectionOrder: string[];
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialCoverSettings: CoverSettings;
  logoPublicUrl: string | null;
  // TIM-3576: user's full_name from Business Profile for cover pre-population
  authorFullName: string | null;
  initialFinancialDocuments: FinancialDocumentState[];
  // TIM-2466: Empty source workspaces produced byte-identical BP content
  // across personas (CQ-06). The checklist names the unfinished workspaces
  // and links to each so the founder can fill them before clicking Generate.
  preGenerateChecklist: PreGenerateChecklistItem[];
}

interface SectionState extends BusinessPlanSectionData {
  isExpanded: boolean;
  isEditing: boolean;
  editBuffer: string;
  isSaving: boolean;
  isGenerating?: boolean;
  // TIM-3575: archive state is mirrored from DB; optimistically updated.
  isArchived: boolean;
}

// ── SSE fetch helper ──────────────────────────────────────────────────────────

// TIM-2342: estimated_claims arrives on the "done" event from /generate. Pass
// it back to onDone so the workspace can persist it via PATCH alongside
// user_content. Shape mirrors EstimatedClaim in source-markers.ts; the SSE
// helper keeps it opaque (the consumer types it).
// TIM-2343: consistency_contradictions also arrives on the "done" event when
// the self-consistency proofreader flagged pairs the regen couldn't resolve.
// Surfaced in the AI review modal as an advisory band so the founder can
// edit before applying. Not persisted — these are a generate-time signal.
interface SseDoneExtras {
  estimated_claims?: unknown;
  consistency_contradictions?: unknown;
}

async function fetchSse(
  url: string,
  body: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone: (full: string, extras: SseDoneExtras) => void,
  onError: (msg: string) => void,
  signal: AbortSignal
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.status === 402) {
      onError("AI credits required. Upgrade your plan to use this feature.");
    } else {
      onError((j.error as string) ?? "Request failed");
    }
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { onError("No response stream"); return; }

  const dec = new TextDecoder();
  let buf = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (event === "text") {
          const chunk = (parsed.text as string) ?? "";
          full += chunk;
          onChunk(chunk);
        } else if (event === "done") {
          onDone(((parsed.text as string) ?? "") || full, {
            estimated_claims: parsed.estimated_claims,
            consistency_contradictions: parsed.consistency_contradictions,
          });
        } else if (event === "error") {
          onError((parsed.message as string) ?? "Error");
        }
      } catch {
        // ignore malformed SSE
      }
    }
  }
}

// ── Progressive disclosure helpers ───────────────────────────────────────────

function determineInitialExpanded(
  section: BusinessPlanSectionData,
  allSections: BusinessPlanSectionData[]
): boolean {
  // Any non-empty saved content collapses on initial render.
  if (section.userContent && section.userContent.trim().length > 0) return false;
  const firstUnreviewed = allSections.find(
    (s) => s.autoContent && (!s.userContent || !s.userContent.trim().length)
  );
  if (firstUnreviewed) return section.key === firstUnreviewed.key;
  return section.key === "executive-summary";
}

// ── Main component ────────────────────────────────────────────────────────────

// TIM-3111: Custom section runtime state.
interface CustomSectionState extends CustomSectionData {
  isExpanded: boolean;
  isEditing: boolean;
  editBuffer: string;
  isTitleEditing: boolean;
  titleBuffer: string;
  isSaving: boolean;
  isGenerating?: boolean;
  isDeleting?: boolean;
  // TIM-3575: archive state mirrored from DB.
  isArchived: boolean;
}

export function BusinessPlanWorkspace({
  planId,
  shopName,
  initialSections,
  initialCustomSections,
  initialSectionOrder,
  canEdit,
  initialTrialMessagesUsed,
  initialCoverSettings,
  logoPublicUrl,
  authorFullName,
  initialFinancialDocuments,
  preGenerateChecklist,
}: Props) {
  // TIM-3490: Persisted top-level section order (mixed standard keys + custom UUIDs).
  // Empty array == use default order. Mutated on every successful drag-drop.
  const [sectionOrder, setSectionOrder] = useState<string[]>(initialSectionOrder);
  // TIM-3490: Reset-to-default confirmation modal.
  const [showResetOrderModal, setShowResetOrderModal] = useState(false);
  // TIM-3490: dnd-kit sensors with the canonical 250ms touch long-press delay.
  const dndSensors = useCanonicalSensors({ longPressMs: 250 });
  const [sections, setSections] = useState<SectionState[]>(
    initialSections.map((s) => ({
      ...s,
      isExpanded: determineInitialExpanded(s, initialSections),
      isEditing: false,
      editBuffer: s.userContent ?? s.autoContent,
      isSaving: false,
      isArchived: s.isArchived,
    }))
  );

  // TIM-3111: custom section state.
  const [customSections, setCustomSections] = useState<CustomSectionState[]>(
    initialCustomSections.map((cs) => ({
      ...cs,
      isExpanded: true,
      isEditing: false,
      editBuffer: cs.userContent ?? "",
      isTitleEditing: false,
      titleBuffer: cs.title,
      isSaving: false,
      isArchived: cs.isArchived,
    }))
  );

  // TIM-3575: archive panel open/close state.
  const [archivePanelOpen, setArchivePanelOpen] = useState(false);
  // TIM-3575: archive confirm dialog target.
  type ArchiveTarget = { type: "standard"; key: BusinessPlanSectionKey; title: string } | { type: "custom"; id: string; title: string };
  const [archiveConfirmTarget, setArchiveConfirmTarget] = useState<ArchiveTarget | null>(null);
  const [isAddingCustomSection, setIsAddingCustomSection] = useState(false);
  const [customSectionError, setCustomSectionError] = useState<string | null>(null);
  // Dirty buffer for custom section content autosave, keyed by custom section id.
  const customDirtyBuffersRef = useRef<Map<string, string | null>>(new Map());
  const customPendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // TIM-3111: tracks which custom section (if any) is streaming a Write with AI response.
  const [customStreamingId, setCustomStreamingId] = useState<string | null>(null);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrintingPdf, setIsPrintingPdf] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  // TIM-3576: cover config modal — shown before print/export so users configure
  // the cover without it occupying the editing view.
  const [coverModalAction, setCoverModalAction] = useState<"export" | "print" | null>(null);
  // TIM-2336: export-time validation gate. When the validate endpoint returns
  // blocking findings, we hold the export action in `pendingExportAction` and
  // show the gate modal. On Continue we replay the action with ?force=1.
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [pendingExportAction, setPendingExportAction] = useState<"export" | "print" | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  // TIM-3490: Group-collapse removed in favor of flat free reorder (board
  // decision on confirmation 916da664 — option i). Group titles render as
  // inline non-interactive dividers above each group's first occurrence in
  // the persisted order. The collapsible-group affordance from TIM-1498 was
  // removed because once sections can move across group boundaries it no
  // longer maps cleanly to a Set<groupKey>.
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();
  // TIM-2385: Two-phase loading UX. Phase 1 — this overlay covers the workspace
  // while a Generate or Improve run streams. Phase 2 — the modal opens on done.
  const {
    openProgressOverlay,
    updateProgressOverlay,
    closeProgressOverlay,
    ProgressOverlayNode,
  } = useBusinessPlanProgressOverlay();
  // TIM-2416 — Plan Quality Check moved into the AI companion (Check mode).
  // The BP workspace no longer owns the audit tab or its in-place panel; the
  // companion is the single canonical entry. The pre-flight gate on regen
  // still calls /api/business-plan/audit (`runPreflightAudit` below).

  const { promoteOnEdit } = useWorkspaceStatus();
  const uiRevamp = useUiRevamp();
  // Auto-promote not_started → in_progress once any section has user content.
  const hasContent = sections.some((s) => s.userContent || s.autoContent);
  useEffect(() => {
    if (hasContent) promoteOnEdit("business_plan");
  }, [hasContent, promoteOnEdit]);

  const abortRef = useRef<AbortController | null>(null);

  // ── Autosave state ─────────────────────────────────────────────────────────

  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle", lastSavedAt: null });
  // Tracks which section (if any) is currently streaming an Improve/Regenerate
  // response so per-section CTAs can show progress and the RegenerateAll
  // button can disable itself while a single-section run is in flight.
  const [streamingKey, setStreamingKey] = useState<BusinessPlanSectionKey | null>(null);
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates edits waiting to be persisted; keyed by section key.
  const dirtyBuffersRef = useRef<Map<BusinessPlanSectionKey, string | null>>(new Map());
  // Mirror of sections used inside async callbacks without stale-closure risk.
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);

  // ── Section helpers ────────────────────────────────────────────────────────

  const updateSection = useCallback((key: BusinessPlanSectionKey, patch: Partial<SectionState>) => {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const saveSection = useCallback(async (key: BusinessPlanSectionKey, userContent: string | null) => {
    // Remove this section from the pending autosave queue; manual save takes over.
    dirtyBuffersRef.current.delete(key);
    updateSection(key, { isSaving: true });
    setSaveState({ kind: "saving" });
    try {
      await fetch(`/api/business-plan/sections/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_content: userContent }),
      });
      setSections((prev) =>
        prev.map((s) => {
          if (s.key !== key) return s;
          return {
            ...s,
            userContent,
            editBuffer: userContent ?? s.autoContent,
            isEditing: false,
            isSaving: false,
          };
        })
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch {
      updateSection(key, { isSaving: false });
      setSaveState({ kind: "error", message: "Could not save. Try again." });
    }
  }, [updateSection]);

  const toggleVisibility = useCallback(async (key: BusinessPlanSectionKey, current: boolean) => {
    const next = !current;
    updateSection(key, { isVisible: next });
    await fetch(`/api/business-plan/sections/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_visible: next }),
    });
  }, [updateSection]);

  // ── TIM-3575: Archive / restore helpers ──────────────────────────────────

  const archiveSection = useCallback(async (key: BusinessPlanSectionKey) => {
    updateSection(key, { isArchived: true, isExpanded: false });
    setArchiveConfirmTarget(null);
    await fetch(`/api/business-plan/sections/${key}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
  }, [updateSection]);

  const restoreSection = useCallback(async (key: BusinessPlanSectionKey) => {
    updateSection(key, { isArchived: false, isExpanded: true });
    await fetch(`/api/business-plan/sections/${key}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
  }, [updateSection]);

  const archiveCustomSection = useCallback(async (id: string) => {
    setCustomSections((prev) => prev.map((cs) => cs.id !== id ? cs : { ...cs, isArchived: true, isExpanded: false }));
    setArchiveConfirmTarget(null);
    await fetch(`/api/business-plan/custom-sections/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
  }, []);

  const restoreCustomSection = useCallback(async (id: string) => {
    setCustomSections((prev) => prev.map((cs) => cs.id !== id ? cs : { ...cs, isArchived: false, isExpanded: true }));
    await fetch(`/api/business-plan/custom-sections/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
  }, []);

  const addOptionalSection = useCallback(async (sectionKey: BusinessPlanSectionKey) => {
    // Optimistically mark the section as not-archived and add to order.
    updateSection(sectionKey, { isArchived: false, isExpanded: true });
    setSectionOrder((prev) => [...prev, sectionKey]);
    await fetch(`/api/business-plan/sections/${sectionKey}/add-optional`, {
      method: "POST",
    });
  }, [updateSection]);

  // ── TIM-3490: Drag-to-reorder helpers ───────────────────────────────────

  // Effective merged order: standard keys + custom UUIDs in the persisted
  // order, with any missing entries appended at the tail in default order.
  // This is what the AI assemblers and the workspace UI iterate.
  const customIds = useMemo(
    () => customSections.map((cs) => cs.id),
    [customSections],
  );
  // TIM-3575: archived section IDs (standard keys + custom UUIDs) are filtered
  // out of the active order so the workspace only renders non-archived sections.
  const archivedIds = useMemo(
    () => [
      ...sections.filter((s) => s.isArchived).map((s) => s.key as string),
      ...customSections.filter((cs) => cs.isArchived).map((cs) => cs.id),
    ],
    [sections, customSections],
  );
  const effectiveOrder = useMemo(
    () =>
      resolveSectionOrder(
        sectionOrder,
        DEFAULT_BUSINESS_PLAN_SECTION_ORDER,
        customIds,
        archivedIds,
      ),
    [sectionOrder, customIds, archivedIds],
  );

  // TIM-3490: ordered projection of standard sections for AI prompt
  // assemblers (RegenerateAll + ExportGate). Custom sections are excluded
  // because the regen / export flows operate on the fixed taxonomy only.
  const orderedSectionsForAi = useMemo(() => {
    const byKey = new Map(sections.map((s) => [s.key, s]));
    const standardKeys = new Set<string>(DEFAULT_BUSINESS_PLAN_SECTION_ORDER);
    const ordered: Array<{ key: BusinessPlanSectionKey; title: string; currentContent: string }> = [];
    for (const id of effectiveOrder) {
      if (!standardKeys.has(id)) continue;
      const s = byKey.get(id as BusinessPlanSectionKey);
      if (!s) continue;
      ordered.push({
        key: s.key,
        title: s.title,
        currentContent: s.userContent ?? s.autoContent,
      });
    }
    return ordered;
  }, [sections, effectiveOrder]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    // DoD: expanded section auto-collapses on drag start. Re-expand is
    // user-initiated post-drop.
    const standardSection = sectionsRef.current.find((s) => s.key === id);
    if (standardSection?.isExpanded) {
      updateSection(id as BusinessPlanSectionKey, { isExpanded: false });
    }
    setCustomSections((prev) =>
      prev.map((cs) => (cs.id === id && cs.isExpanded ? { ...cs, isExpanded: false } : cs)),
    );
  }, [updateSection]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId || activeId === overId) return;

      const fromIdx = effectiveOrder.indexOf(activeId);
      const toIdx = effectiveOrder.indexOf(overId);
      if (fromIdx < 0 || toIdx < 0) return;

      // Optimistic local update. Roll back on PATCH failure.
      const next = arrayMove(effectiveOrder, fromIdx, toIdx);
      const previous = sectionOrder;
      setSectionOrder(next);
      setSaveState({ kind: "saving" });
      try {
        const res = await fetch("/api/business-plan/section-order", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: next }),
        });
        if (!res.ok) throw new Error(`section-order PATCH ${res.status}`);
        setSaveState({ kind: "saved", at: new Date().toISOString() });
      } catch {
        // Revert optimistic update on failure.
        setSectionOrder(previous);
        setSaveState({ kind: "error", message: "Could not save section order. Try again." });
      }
    },
    [effectiveOrder, sectionOrder],
  );

  const handleResetSectionOrder = useCallback(async () => {
    const previous = sectionOrder;
    setSectionOrder([]);
    setShowResetOrderModal(false);
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch("/api/business-plan/section-order", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`section-order DELETE ${res.status}`);
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch {
      setSectionOrder(previous);
      setSaveState({ kind: "error", message: "Could not reset section order. Try again." });
    }
  }, [sectionOrder]);

  // ── Autosave helpers ───────────────────────────────────────────────────────

  const persistDirty = useCallback(async () => {
    if (!canEdit) return;
    const snapshot = new Map(dirtyBuffersRef.current);
    dirtyBuffersRef.current.clear();
    if (snapshot.size === 0) return;
    // Skip sections currently being regenerated to avoid clobbering AI content.
    const currentSections = sectionsRef.current;
    const entries = Array.from(snapshot.entries()).filter(([key]) => {
      const sec = currentSections.find((s) => s.key === key);
      return !sec?.isGenerating;
    });
    if (entries.length === 0) return;
    setSaveState({ kind: "saving" });
    try {
      await Promise.all(
        entries.map(async ([key, userContent]) => {
          const res = await fetch(`/api/business-plan/sections/${key}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_content: userContent }),
          });
          if (!res.ok) throw new Error(`save failed (${res.status})`);
          setSections((prev) =>
            prev.map((s) => (s.key !== key ? s : { ...s, userContent, isSaving: false }))
          );
        })
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch {
      setSaveState({ kind: "error", message: "Could not save. Try again." });
    }
  }, [canEdit]);

  const scheduleSave = useCallback(
    (key: BusinessPlanSectionKey, val: string | null) => {
      dirtyBuffersRef.current.set(key, val);
      setSaveState({ kind: "dirty" });
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = setTimeout(() => {
        pendingSaveTimer.current = null;
        void persistDirty();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persistDirty]
  );

  // ── AI streaming ───────────────────────────────────────────────────────────

  const runStream = useCallback(async (
    url: string,
    body: Record<string, unknown>,
    sectionKey: BusinessPlanSectionKey
  ) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // TIM-2385: Phase 1 — keep the section card untouched. The overlay covers
    // the workspace while the section streams; the modal opens on done.
    let cancelledByUser = false;
    const cancelOverlay = () => {
      cancelledByUser = true;
      controller.abort();
      closeProgressOverlay();
      setStreamingKey(null);
      updateSection(sectionKey, { isGenerating: false });
    };
    openProgressOverlay({ total: 1, onCancel: cancelOverlay });
    updateSection(sectionKey, { isGenerating: true });
    setStreamingKey(sectionKey);

    try {
      await fetchSse(
        url,
        body,
        () => {
          // Phase 1: deliberately do not surface the streaming buffer inline.
          // The overlay is the only progress UX during generation.
        },
        (full, extras) => {
          updateProgressOverlay({ completed: 1 });
          closeProgressOverlay();
          setStreamingKey(null);
          updateSection(sectionKey, { isGenerating: false, isEditing: false });
          if (cancelledByUser) return;
          // TIM-1561: route AI result through unified review modal before applying.
          const sectionMeta = BUSINESS_PLAN_SECTIONS.find((s) => s.key === sectionKey);
          const currentSection = sections.find((s) => s.key === sectionKey);
          const originalValue = currentSection?.userContent ?? currentSection?.autoContent ?? "";
          // TIM-2342: capture estimated_claims off the SSE done payload so
          // we PATCH them alongside user_content. The validator + export-gate
          // modal pull them back out of the column to populate the "Estimated
          // claims to verify" section.
          const estimatedClaims = Array.isArray(extras.estimated_claims)
            ? (extras.estimated_claims as unknown[])
            : [];
          // TIM-2343: surface unresolved self-consistency contradictions as
          // an advisory inside the AI review modal card. Sanitize the shape
          // defensively — anything malformed gets dropped rather than
          // crashing the modal.
          const consistencyRaw = Array.isArray(extras.consistency_contradictions)
            ? extras.consistency_contradictions
            : [];
          const consistencyContradictions = consistencyRaw
            .map((c) => {
              if (!c || typeof c !== "object") return null;
              const obj = c as Record<string, unknown>;
              const kind = obj.kind;
              const claimA = typeof obj.claim_a === "string" ? obj.claim_a : "";
              const claimB = typeof obj.claim_b === "string" ? obj.claim_b : "";
              const explanation = typeof obj.explanation === "string" ? obj.explanation : "";
              if (!claimA || !claimB) return null;
              const normalizedKind = (kind === "numerical" || kind === "categorical" || kind === "temporal" || kind === "other") ? kind : "other";
              return { kind: normalizedKind as "numerical" | "categorical" | "temporal" | "other", claim_a: claimA, claim_b: claimB, explanation };
            })
            .filter((c): c is NonNullable<typeof c> => c !== null);
          openAIReviewModal({
            suggestions: [
              {
                id: `bp-${sectionKey}`,
                fieldId: sectionKey,
                fieldLabel: sectionMeta?.title ?? sectionKey,
                originalValue,
                proposedValue: full,
                isStructured: false,
                consistencyContradictions,
              },
            ],
            context: { workspace: "Business Plan", section: sectionMeta?.title },
            onApply: async () => {
              // Inline save (avoids hoisting issue with handleSaveAfterImprove ref)
              const res = await fetch(`/api/business-plan/sections/${sectionKey}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  user_content: full,
                  estimated_claims_json: estimatedClaims,
                }),
              });
              if (!res.ok) throw new Error("Couldn't save this change. Please try again.");
              setSections((prev) =>
                prev.map((s) => {
                  if (s.key !== sectionKey) return s;
                  return { ...s, userContent: full };
                })
              );
              updateSection(sectionKey, { isEditing: false, isGenerating: false });
            },
          });
        },
        (msg) => {
          closeProgressOverlay();
          setStreamingKey(null);
          updateSection(sectionKey, { isGenerating: false });
          if (!cancelledByUser) setGlobalError(msg);
        },
        controller.signal
      );
    } catch (err: unknown) {
      closeProgressOverlay();
      setStreamingKey(null);
      updateSection(sectionKey, { isGenerating: false });
      if (err instanceof Error && err.name !== "AbortError" && !cancelledByUser) {
        setGlobalError(err.message);
      }
    }
  }, [
    updateSection,
    sections,
    openAIReviewModal,
    openProgressOverlay,
    updateProgressOverlay,
    closeProgressOverlay,
  ]);

  const handleGenerate = useCallback(async (key: BusinessPlanSectionKey) => {
    await runStream("/api/business-plan/generate", { sectionKey: key }, key);
  }, [runStream]);

  const handleImprove = useCallback(async (key: BusinessPlanSectionKey) => {
    const section = sections.find((s) => s.key === key);
    if (!section) return;
    const content = section.userContent ?? section.autoContent;
    await runStream("/api/business-plan/improve", {
      sectionKey: key,
      sectionTitle: section.title,
      currentContent: content,
      shopName,
    }, key);
  }, [sections, runStream, shopName]);

  // After AI finishes editing, auto-save the result
  const handleSaveAfterImprove = useCallback(async (key: BusinessPlanSectionKey, content: string) => {
    setSaveState({ kind: "saving" });
    try {
      await fetch(`/api/business-plan/sections/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_content: content }),
      });
      setSections((prev) =>
        prev.map((s) => {
          if (s.key !== key) return s;
          return { ...s, userContent: content };
        })
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch {
      setSaveState({ kind: "error", message: "Could not save. Try again." });
    }
  }, []);

  // ── PDF export / print ──────────────────────────────────────────────────────

  // TIM-1551: Both Print and Export drive through the same React-PDF renderer.
  // TIM-2336: Both now run through the validation gate first. The gate runs
  // Pass 1 (programmatic reconciliation) + Pass 2 (LLM critical-reader) before
  // we hit the PDF route, and surfaces a modal when blocking numerical
  // contradictions exist. Once the user resolves each (Apply / Override) we
  // re-fire the export with ?force=1 — the server-side gate stays as a
  // defense in depth, but the user's explicit confirmation suppresses it.
  const performPdfFetch = useCallback(async (mode: "export" | "print", force: boolean): Promise<void> => {
    const url = force ? "/api/pdf/business_plan_full?force=1" : "/api/pdf/business_plan_full";
    const res = await fetch(url);
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (res.status === 402) {
        setGlobalError("PDF export requires a paid subscription.");
      } else if (res.status === 422 && j.error === "validation_blocked") {
        // Server-side gate fired (force=false). Surface the modal with the
        // report — the validate endpoint typically runs first client-side
        // and supersedes this, but keep the fallback intact.
        setValidationReport(j.report as ValidationReport);
        setPendingExportAction(mode);
      } else {
        setGlobalError((j.error as string) ?? "PDF generation failed");
      }
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (mode === "print") {
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } else {
      const a = document.createElement("a");
      a.href = blobUrl;
      const slug = shopName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "business-plan";
      a.download = `${slug}-business-plan.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    }
  }, [shopName]);

  const runValidationThen = useCallback(async (mode: "export" | "print"): Promise<void> => {
    setIsValidating(true);
    try {
      const res = await fetch("/api/business-plan/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include_pass2: true }),
      });
      if (!res.ok) {
        // Validation itself failing should not block export — fall back to
        // the server-side gate in /api/pdf/business_plan_full which will
        // re-run Pass 1 cheaply. Surface the error to the user.
        const j = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (res.status === 402) {
          setGlobalError("Validation requires a paid subscription. Export is paused until you upgrade.");
          return;
        }
        if (res.status === 429) {
          setGlobalError("Validation rate-limited. Please wait a moment and try again.");
          return;
        }
        setGlobalError((j.error as string) ?? "Validation failed. Try again or use Override below.");
        return;
      }
      const report = (await res.json()) as ValidationReport;
      if (report.blocking || report.qualitative_findings.length > 0) {
        // Show the modal even for advisory-only (qualitative) findings so the
        // user sees the critical-reader notes before exporting.
        setValidationReport(report);
        setPendingExportAction(mode);
        return;
      }
      await performPdfFetch(mode, false);
    } finally {
      setIsValidating(false);
    }
  }, [performPdfFetch]);

  // TIM-3576: open cover config modal before running validation + export/print.
  const handlePrintPlan = useCallback(() => {
    setCoverModalAction("print");
  }, []);

  const handleExportPdf = useCallback(() => {
    setCoverModalAction("export");
  }, []);

  // Called when user clicks "Continue" in cover config modal.
  const handleCoverModalConfirm = useCallback(async () => {
    const mode = coverModalAction;
    setCoverModalAction(null);
    if (!mode) return;
    if (mode === "print") {
      setIsPrintingPdf(true);
      try { await runValidationThen("print"); } finally { setIsPrintingPdf(false); }
    } else {
      setIsExportingPdf(true);
      try { await runValidationThen("export"); } finally { setIsExportingPdf(false); }
    }
  }, [coverModalAction, runValidationThen]);

  const handleGateContinue = useCallback(async () => {
    const mode = pendingExportAction;
    setValidationReport(null);
    setPendingExportAction(null);
    if (!mode) return;
    if (mode === "print") setIsPrintingPdf(true); else setIsExportingPdf(true);
    try {
      await performPdfFetch(mode, true);
    } finally {
      if (mode === "print") setIsPrintingPdf(false); else setIsExportingPdf(false);
    }
  }, [pendingExportAction, performPdfFetch]);

  const handleGateCancel = useCallback(() => {
    setValidationReport(null);
    setPendingExportAction(null);
  }, []);

  function handleManualSave() {
    if (!canEdit) return;
    if (pendingSaveTimer.current) {
      clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = null;
    }
    // Include any section currently open in edit mode.
    sectionsRef.current.forEach((s) => {
      if (s.isEditing && !dirtyBuffersRef.current.has(s.key)) {
        dirtyBuffersRef.current.set(s.key, s.editBuffer || null);
      }
    });
    void persistDirty();
    // Flush custom section dirty buffers too.
    if (customPendingSaveTimer.current) {
      clearTimeout(customPendingSaveTimer.current);
      customPendingSaveTimer.current = null;
    }
    customSections.forEach((cs) => {
      if (cs.isEditing && !customDirtyBuffersRef.current.has(cs.id)) {
        customDirtyBuffersRef.current.set(cs.id, cs.editBuffer || null);
      }
    });
    void persistCustomDirty();
  }

  const handleSectionPatchedFromGate = useCallback((sectionKey: string, newContent: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === sectionKey ? { ...s, userContent: newContent, editBuffer: newContent } : s)),
    );
  }, []);

  // TIM-2416 — Plan Quality Check was removed from the BP workspace surface.
  // Apply / Go-to-source / standalone "Check Plan" all live inside the AI
  // companion now (Check mode). What remains here: the pre-flight gate that
  // runs Check on source suites before regen and offers Fix-first / Generate-
  // anyway. Fix-first opens the companion in Check mode (no in-page tab).

  // TIM-2394: pre-flight handler invoked by RegenerateAllButton before any
  // estimate is fetched. Hits the same /api/business-plan/audit endpoint
  // QualityCheckPanel uses, so a recent run is served from cache.
  const runPreflightAudit = useCallback(async (): Promise<AuditReport | null> => {
    try {
      const res = await fetch("/api/business-plan/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { report: AuditReport | null };
      return data.report;
    } catch {
      return null;
    }
  }, []);

  // TIM-2416 — when the user accepts the pre-flight gate's "Fix first"
  // recommendation, open the AI companion in Check mode. The companion's
  // Check engine calls the same /api/business-plan/audit cache, so it returns
  // the same finding set instantly. `report` arg is intentionally unused —
  // the companion drives its own fetch so the cards round-trip through the
  // companion's Apply path (the canonical Apply path going forward).
  const handlePreflightFixFirst = useCallback((report: AuditReport) => {
    void report;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("copilot:open-in-mode", {
          detail: { mode: "check", scope: null },
        }),
      );
    }
  }, []);

  // TIM-2382: apply Scout suggest_workspace_changes proposals for business plan.
  // fieldId = BusinessPlanSectionKey; finalValue = proposed section text.
  const handleApplyBusinessPlanSuggestions = useCallback(async (accepted: ApprovedChange[]) => {
    for (const c of accepted) {
      const sectionKey = c.fieldId as BusinessPlanSectionKey;
      const section = sections.find((s) => s.key === sectionKey);
      if (!section) continue;
      await saveSection(sectionKey, c.finalValue);
    }
  }, [sections, saveSection]);

  // ── TIM-3111: Custom section handlers ───────────────────────────────────────

  const updateCustomSection = useCallback((id: string, patch: Partial<CustomSectionState>) => {
    setCustomSections((prev) => prev.map((cs) => (cs.id === id ? { ...cs, ...patch } : cs)));
  }, []);

  const persistCustomDirty = useCallback(async () => {
    if (!canEdit) return;
    const snapshot = new Map(customDirtyBuffersRef.current);
    customDirtyBuffersRef.current.clear();
    if (snapshot.size === 0) return;
    setSaveState({ kind: "saving" });
    try {
      await Promise.all(
        Array.from(snapshot.entries()).map(async ([id, userContent]) => {
          const res = await fetch(`/api/business-plan/custom-sections/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_content: userContent }),
          });
          if (!res.ok) throw new Error(`custom section save failed (${res.status})`);
          setCustomSections((prev) =>
            prev.map((cs) => (cs.id !== id ? cs : { ...cs, userContent, isSaving: false }))
          );
        })
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch {
      // Re-queue failed entries so the next manual save or debounce can retry them.
      snapshot.forEach((val, id) => {
        if (!customDirtyBuffersRef.current.has(id)) {
          customDirtyBuffersRef.current.set(id, val);
        }
      });
      setSaveState({ kind: "error", message: "Could not save. Try again." });
    }
  }, [canEdit]);

  const scheduleCustomSave = useCallback(
    (id: string, val: string | null) => {
      customDirtyBuffersRef.current.set(id, val);
      setSaveState({ kind: "dirty" });
      if (customPendingSaveTimer.current) clearTimeout(customPendingSaveTimer.current);
      customPendingSaveTimer.current = setTimeout(() => {
        customPendingSaveTimer.current = null;
        void persistCustomDirty();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persistCustomDirty]
  );

  const handleAddCustomSection = useCallback(async () => {
    if (!canEdit || isAddingCustomSection) return;
    setIsAddingCustomSection(true);
    setCustomSectionError(null);
    try {
      const res = await fetch("/api/business-plan/custom-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Custom Section" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>;
        setCustomSectionError((j.error as string) ?? "Could not add custom section.");
        return;
      }
      const data = await res.json() as { customSection: { id: string; title: string; user_content: string | null; is_visible: boolean; sort_order: number } };
      const cs = data.customSection;
      setCustomSections((prev) => [
        ...prev,
        {
          id: cs.id,
          title: cs.title,
          userContent: cs.user_content,
          isVisible: cs.is_visible,
          sortOrder: cs.sort_order,
          isExpanded: true,
          isEditing: false,
          editBuffer: cs.user_content ?? "",
          isTitleEditing: true,
          titleBuffer: cs.title,
          isSaving: false,
          isArchived: false,
        },
      ]);
    } catch {
      setCustomSectionError("Could not add custom section. Try again.");
    } finally {
      setIsAddingCustomSection(false);
    }
  }, [canEdit, isAddingCustomSection]);

  const handleCustomSectionTitleSave = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim() || "Custom Section";
    updateCustomSection(id, { isTitleEditing: false, title: trimmed, titleBuffer: trimmed });
    await fetch(`/api/business-plan/custom-sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  }, [updateCustomSection]);

  const handleDeleteCustomSection = useCallback(async (id: string) => {
    const snapshot = customSections.find((cs) => cs.id === id);
    if (!snapshot || snapshot.isDeleting) return;
    updateCustomSection(id, { isDeleting: true });
    setCustomSectionError(null);
    try {
      const res = await fetch(`/api/business-plan/custom-sections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setCustomSections((prev) => prev.filter((cs) => cs.id !== id));
    } catch {
      updateCustomSection(id, { isDeleting: false });
      setCustomSections((prev) => [...prev, snapshot].sort((a, b) => a.sortOrder - b.sortOrder));
      setCustomSectionError("Could not delete section. Try again.");
    }
  }, [customSections, updateCustomSection]);

  const handleCustomSectionVisibility = useCallback(async (id: string, current: boolean) => {
    const next = !current;
    updateCustomSection(id, { isVisible: next });
    await fetch(`/api/business-plan/custom-sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_visible: next }),
    });
  }, [updateCustomSection]);

  // TIM-3490: handleCustomSectionReorder removed — custom-section sort_order
  // PATCHes are replaced by the unified per-plan section_order on
  // coffee_shop_plans (drag-to-reorder via the shared sortable canon).

  const handleCustomSectionWriteWithAi = useCallback(async (id: string) => {
    // Guard both: a custom section already streaming, and a standard section streaming.
    // Do NOT abort abortRef (standard sections share it) — only block while either is running.
    if (!canEdit || customStreamingId !== null || streamingKey !== null) return;
    const cs = customSections.find((c) => c.id === id);
    if (!cs) return;

    const controller = new AbortController();
    abortRef.current = controller;

    let cancelledByUser = false;
    const cancelOverlay = () => {
      cancelledByUser = true;
      controller.abort();
      closeProgressOverlay();
      setCustomStreamingId(null);
      updateCustomSection(id, { isGenerating: false });
    };
    openProgressOverlay({ total: 1, onCancel: cancelOverlay });
    updateCustomSection(id, { isGenerating: true });
    setCustomStreamingId(id);

    try {
      await fetchSse(
        "/api/business-plan/improve",
        {
          sectionKey: "custom",
          sectionTitle: cs.title,
          currentContent: cs.userContent?.trim() || `Write a first draft for the "${cs.title}" section.`,
          shopName,
        },
        () => {},
        (full) => {
          updateProgressOverlay({ completed: 1 });
          closeProgressOverlay();
          setCustomStreamingId(null);
          updateCustomSection(id, { isGenerating: false });
          if (cancelledByUser) return;
          openAIReviewModal({
            suggestions: [
              {
                id: `custom-${id}`,
                fieldId: id,
                fieldLabel: cs.title,
                originalValue: cs.userContent ?? "",
                proposedValue: full,
                isStructured: false,
                consistencyContradictions: [],
              },
            ],
            context: { workspace: "Business Plan", section: cs.title },
            onApply: async () => {
              const res = await fetch(`/api/business-plan/custom-sections/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_content: full }),
              });
              if (!res.ok) throw new Error("Could not save. Please try again.");
              setCustomSections((prev) =>
                prev.map((s) =>
                  s.id !== id ? s : { ...s, userContent: full, editBuffer: full, isEditing: false }
                )
              );
              setSaveState({ kind: "saved", at: new Date().toISOString() });
            },
          });
        },
        (msg) => {
          closeProgressOverlay();
          setCustomStreamingId(null);
          updateCustomSection(id, { isGenerating: false });
          if (!cancelledByUser) setGlobalError(msg);
        },
        controller.signal
      );
    } catch (err: unknown) {
      closeProgressOverlay();
      setCustomStreamingId(null);
      updateCustomSection(id, { isGenerating: false });
      if (err instanceof Error && err.name !== "AbortError" && !cancelledByUser) {
        setGlobalError(err.message);
      }
    }
  }, [
    canEdit,
    customStreamingId,
    streamingKey,
    customSections,
    shopName,
    closeProgressOverlay,
    openProgressOverlay,
    updateProgressOverlay,
    updateCustomSection,
    openAIReviewModal,
  ]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const visibleCount = sections.filter((s) => s.isVisible).length;
  const allExpanded = sections.every((s) => s.isExpanded);

  return (
    <>
    {AIReviewModalNode}
    {ProgressOverlayNode}
    {/* TIM-3576: cover config modal opens before print/export */}
    {coverModalAction && (
      <CoverConfigModal
        initialSettings={initialCoverSettings}
        logoPublicUrl={logoPublicUrl}
        shopName={shopName}
        authorFullName={authorFullName}
        action={coverModalAction}
        onConfirm={handleCoverModalConfirm}
        onCancel={() => setCoverModalAction(null)}
      />
    )}
    {validationReport && (
      <ExportGateModal
        report={validationReport}
        shopName={shopName}
        // TIM-3490: AI prompt assemblers must respect the persisted order.
        // orderedSectionsForAi iterates effectiveOrder so the validation /
        // export prompts reflect the user's reorder.
        sections={orderedSectionsForAi}
        onSectionPatched={handleSectionPatchedFromGate}
        onCancel={handleGateCancel}
        onContinue={handleGateContinue}
      />
    )}
    <div className="bg-[var(--background)] min-h-screen">
      <div className="w-full px-4 sm:px-6 pt-8 pb-20">
        {/* TIM-1894: canonical WorkspaceHeader — actions live top-right on the
            title band (was a separate toolbar stacked below the header, the
            board-flagged Item-3 offender). Export PDF is the filled-primary to
            match Financials' single primary + outlined secondaries. */}
        <WorkspaceHeader
          Icon={FileText}
          title="Business Plan"
          description="Your complete business plan, assembled from every workspace. Edit each section in place or improve it with AI."
          actions={
            <>
              <button
                onClick={() => setSections((prev) => prev.map((s) => ({ ...s, isExpanded: !allExpanded })))}
                className="text-sm text-[var(--muted-foreground)] hover:text-foreground underline underline-offset-2 cursor-pointer"
              >
                {allExpanded ? "Collapse All" : "Expand All"}
              </button>
              {/* TIM-2382: Scout-as-hub — top-level AskScoutButton on the
                  Business Plan workspace replaces the legacy auto-apply
                  Generate/Improve flow. Suggestions route through chat +
                  AIReviewModal ([[feedback_ai_never_auto_apply]]). */}
              <AskScoutButton
                workspaceKey="business_plan"
                focusLabel="business plan"
                hasContent={hasContent}
              />
              {/* TIM-2416: the standalone "Check Plan" header CTA was removed.
                  Plan Quality Check now lives in the AI companion (Check mode)
                  reachable from every workspace via the floating affordance.
                  The hamburger keeps Export PDF, Print Business Plan, and
                  Regenerate all as before. */}
              {/* TIM-3556: hideAdvisor — the header-level AskScoutButton above
                  already opens the same copilot drawer, so the shared menu's
                  default "Open Advisor" row would duplicate that action. */}
              <WorkspaceActionMenu hideAdvisor>
                {({ closeMenu }) => (
                  <>
                    <WorkspaceActionMenuItem
                      Icon={Download}
                      label={isExportingPdf || isValidating ? "Checking..." : "Export PDF"}
                      disabled={isExportingPdf || isValidating || !canEdit}
                      onClick={() => {
                        closeMenu();
                        handleExportPdf();
                      }}
                    />
                    <WorkspaceActionMenuItem
                      Icon={FileText}
                      label={isPrintingPdf || isValidating ? "Checking..." : "Print Business Plan"}
                      disabled={isPrintingPdf || isValidating || !canEdit}
                      onClick={() => {
                        closeMenu();
                        handlePrintPlan();
                      }}
                    />
                    <RegenerateAllButton
                      renderAs="menuitem"
                      closeMenu={closeMenu}
                      disabled={!canEdit || streamingKey !== null}
                      // TIM-3490: iterate in effective (persisted) order so
                      // the regen prompt context block reflects the user's
                      // reorder. resolveSectionOrder filtered to standard
                      // section keys only; custom sections are not part of
                      // the regenerate-all flow.
                      getCurrentSections={() => orderedSectionsForAi}
                      openAIReviewModal={openAIReviewModal}
                      openProgressOverlay={openProgressOverlay}
                      updateProgressOverlay={updateProgressOverlay}
                      closeProgressOverlay={closeProgressOverlay}
                      onSectionApplied={(key, finalValue) => {
                        setSections((prev) =>
                          prev.map((s) =>
                            s.key === key ? { ...s, userContent: finalValue } : s,
                          ),
                        );
                      }}
                      onError={(msg) => setGlobalError(msg)}
                      runPreflightAudit={runPreflightAudit}
                      onFixFirst={handlePreflightFixFirst}
                    />
                  </>
                )}
              </WorkspaceActionMenu>
              <SaveStatusAndButton
                saving={saveState.kind === "saving"}
                savedAt={saveState.kind === "saved" ? saveState.at : saveState.kind === "idle" ? saveState.lastSavedAt : null}
                unsaved={saveState.kind === "dirty"}
                error={saveState.kind === "error" ? saveState.message : null}
                canEdit={canEdit}
                onSave={handleManualSave}
              />
            </>
          }
        />

        {/* TIM-2785: v2 chrome — progress bar mirrors concept workspace pattern
            (TIM-2784). v1 path keeps the plain text count; v2 adds a teal
            fill bar showing reviewed sections (userContent present) vs total. */}
        {uiRevamp ? (
          (() => {
            const reviewedCount = sections.filter((s) => s.userContent && s.userContent.trim().length > 0).length;
            const pct = sections.length > 0 ? Math.round((reviewedCount / sections.length) * 100) : 0;
            return (
              <div className="mb-6 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {shopName ? <>{shopName} — </> : null}
                    {reviewedCount} of {sections.length} sections reviewed
                  </span>
                  <span className="text-xs font-semibold text-[var(--teal)]">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--teal)] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                    role="progressbar"
                    aria-valuenow={reviewedCount}
                    aria-valuemin={0}
                    aria-valuemax={sections.length}
                    aria-label="Business plan completion"
                  />
                </div>
              </div>
            );
          })()
        ) : (
          <p className="text-xs text-[var(--neutral-cool-600)] mb-6">
            {visibleCount} of {sections.length} sections visible
          </p>
        )}

        {/* TIM-2466: pre-generate checklist. Renders only when at least one
            source workspace (Concept, Menu & Pricing, Marketing, Hiring) is
            empty — the trigger condition for CQ-06 byte-identical content. */}
        <PreGenerateChecklist items={preGenerateChecklist} />

        {globalError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {globalError}
            <button onClick={() => setGlobalError(null)} className="ml-3 underline text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* TIM-3576: Cover & Branding moved to print/export modal — CoverBrandingPanel removed. */}

        {/* Financial documents panel */}
        <FinancialDocumentsPanel initialDocuments={initialFinancialDocuments} />

        {/* TIM-3490: Flat free-reorder list. All standard + custom section
            cards render in the persisted order; group titles appear as
            inline non-interactive dividers at each group transition. */}
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={effectiveOrder} strategy={verticalListSortingStrategy}>
            <BpFlatSectionList
              order={effectiveOrder}
              sections={sections}
              customSections={customSections}
              canEdit={canEdit}
              streamingKey={streamingKey}
              onToggleVisibility={(key, current) => toggleVisibility(key, current)}
              onToggleExpand={(key, current) => updateSection(key, { isExpanded: !current })}
              onEditStart={(key, content) =>
                updateSection(key, { isEditing: true, editBuffer: content })
              }
              onEditChange={(key, val) => {
                updateSection(key, { editBuffer: val });
                scheduleSave(key, val || null);
              }}
              onEditSave={(key, buf) => saveSection(key, buf || null)}
              onEditCancel={(key, fallback) =>
                updateSection(key, { isEditing: false, editBuffer: fallback })
              }
              onResetToAuto={(key) => saveSection(key, null)}
              onGenerateExec={handleGenerate}
              onImprove={handleImprove}
              onCustomToggleExpand={(id, current) =>
                updateCustomSection(id, { isExpanded: !current })
              }
              onCustomToggleVisible={(id, current) =>
                handleCustomSectionVisibility(id, current)
              }
              onCustomTitleEditStart={(id, title) =>
                updateCustomSection(id, { isTitleEditing: true, titleBuffer: title })
              }
              onCustomTitleChange={(id, val) =>
                updateCustomSection(id, { titleBuffer: val })
              }
              onCustomTitleSave={(id, buf) => handleCustomSectionTitleSave(id, buf)}
              onCustomTitleCancel={(id, fallback) =>
                updateCustomSection(id, { isTitleEditing: false, titleBuffer: fallback })
              }
              onCustomEditStart={(id, content) =>
                updateCustomSection(id, { isEditing: true, editBuffer: content })
              }
              onCustomEditChange={(id, val) => {
                updateCustomSection(id, { editBuffer: val });
                scheduleCustomSave(id, val || null);
              }}
              onCustomEditSave={(id, buf) => {
                customDirtyBuffersRef.current.delete(id);
                updateCustomSection(id, { isSaving: true });
                void fetch(`/api/business-plan/custom-sections/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ user_content: buf || null }),
                })
                  .then(() => {
                    setCustomSections((prev) =>
                      prev.map((s) =>
                        s.id !== id
                          ? s
                          : { ...s, userContent: buf || null, isEditing: false, isSaving: false },
                      ),
                    );
                    setSaveState({ kind: "saved", at: new Date().toISOString() });
                  })
                  .catch(() => {
                    updateCustomSection(id, { isSaving: false });
                    setSaveState({ kind: "error", message: "Could not save. Try again." });
                  });
              }}
              onCustomEditCancel={(id, fallback) => {
                customDirtyBuffersRef.current.delete(id);
                updateCustomSection(id, { isEditing: false, editBuffer: fallback });
              }}
              onCustomDelete={(id) => handleDeleteCustomSection(id)}
              onCustomWriteWithAi={(id) => void handleCustomSectionWriteWithAi(id)}
              onArchiveSection={(key, title) => setArchiveConfirmTarget({ type: "standard", key, title })}
              onArchiveCustomSection={(id, title) => setArchiveConfirmTarget({ type: "custom", id, title })}
            />
          </SortableContext>
        </DndContext>

        {/* TIM-3111: Add Custom Section entry point */}
        {canEdit && (
          <div className="mt-6">
            {customSectionError && (
              <div className="mb-3 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {customSectionError}
                <button onClick={() => setCustomSectionError(null)} className="ml-3 underline text-xs">
                  Dismiss
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleAddCustomSection}
              disabled={isAddingCustomSection}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[var(--neutral-cool-400)] text-sm font-medium text-[var(--neutral-cool-600)] hover:border-[var(--teal)] hover:text-[var(--teal)] hover:bg-[var(--teal)]/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAddingCustomSection ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add Custom Section
            </button>
          </div>
        )}

        {/* TIM-3490: Reset-to-default order — subtle, end of list per DoD. */}
        {canEdit && sectionOrder.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowResetOrderModal(true)}
              className="text-xs text-[var(--neutral-cool-600)] hover:text-[var(--teal)] underline underline-offset-2 transition-colors"
            >
              Reset to default order
            </button>
          </div>
        )}

        {showResetOrderModal && (
          <ResetOrderConfirmationModal
            onCancel={() => setShowResetOrderModal(false)}
            onConfirm={handleResetSectionOrder}
          />
        )}

        {/* TIM-3575: Archive panel — inline collapsible per TIM-3579 panel IA decision. */}
        <ArchivePanel
          sections={sections}
          customSections={customSections}
          sectionOrder={sectionOrder}
          isOpen={archivePanelOpen}
          onToggle={() => setArchivePanelOpen((v) => !v)}
          canEdit={canEdit}
          onRestoreSection={(key) => void restoreSection(key)}
          onRestoreCustomSection={(id) => void restoreCustomSection(id)}
          onAddOptional={(key) => void addOptionalSection(key)}
        />

        {/* TIM-3575: Archive confirm dialog. */}
        {archiveConfirmTarget && (
          <ArchiveConfirmDialog
            title={archiveConfirmTarget.title}
            onCancel={() => setArchiveConfirmTarget(null)}
            onConfirm={() => {
              if (archiveConfirmTarget.type === "standard") {
                void archiveSection(archiveConfirmTarget.key);
              } else {
                void archiveCustomSection(archiveConfirmTarget.id);
              }
            }}
          />
        )}
      </div>
    </div>
    {/* TIM-2416 — the AI companion mounts inside the Business Plan workspace
        so Coach/Check/Benchmark are reachable from this view. Defaults to
        Check mode with whole-plan scope per UX spec §5.
        TIM-2382 — workspaceKey="business_plan" so suggest_workspace_changes
        proposals route to the BP section-write path; onApplySuggestions wires
        the AIReviewModal accept handler back to the workspace state. */}
    </>
  );
}

// ── TIM-3490: Flat sortable section list (replaces SectionTree) ─────────────
// Renders standard sections + custom sections inline in `order`, with group
// titles as non-interactive inline dividers above each group's first run.
// Each card is wrapped in SortableCardRow which exposes the canon grip
// handle. The DndContext / SortableContext are owned by the parent so the
// optimistic-update path can stay near the rest of the workspace state.

const CUSTOM_SECTIONS_LABEL = "Custom Sections";

interface BpFlatSectionListProps {
  order: string[];
  sections: SectionState[];
  customSections: CustomSectionState[];
  canEdit: boolean;
  streamingKey: BusinessPlanSectionKey | null;
  onToggleVisibility: (key: BusinessPlanSectionKey, current: boolean) => void;
  onToggleExpand: (key: BusinessPlanSectionKey, current: boolean) => void;
  onEditStart: (key: BusinessPlanSectionKey, content: string) => void;
  onEditChange: (key: BusinessPlanSectionKey, val: string) => void;
  onEditSave: (key: BusinessPlanSectionKey, buf: string) => void;
  onEditCancel: (key: BusinessPlanSectionKey, fallback: string) => void;
  onResetToAuto: (key: BusinessPlanSectionKey) => void;
  onGenerateExec: (key: BusinessPlanSectionKey) => void;
  onImprove: (key: BusinessPlanSectionKey) => void;
  onCustomToggleExpand: (id: string, current: boolean) => void;
  onCustomToggleVisible: (id: string, current: boolean) => void;
  onCustomTitleEditStart: (id: string, title: string) => void;
  onCustomTitleChange: (id: string, val: string) => void;
  onCustomTitleSave: (id: string, buf: string) => void;
  onCustomTitleCancel: (id: string, fallback: string) => void;
  onCustomEditStart: (id: string, content: string) => void;
  onCustomEditChange: (id: string, val: string) => void;
  onCustomEditSave: (id: string, buf: string) => void;
  onCustomEditCancel: (id: string, fallback: string) => void;
  onCustomDelete: (id: string) => void;
  onCustomWriteWithAi: (id: string) => void;
  // TIM-3575: archive callbacks.
  onArchiveSection: (key: BusinessPlanSectionKey, title: string) => void;
  onArchiveCustomSection: (id: string, title: string) => void;
}

function BpFlatSectionList(props: BpFlatSectionListProps) {
  const sectionMetaByKey = useMemo(
    () => new Map(BUSINESS_PLAN_SECTIONS.map((m) => [m.key, m])),
    [],
  );
  const groupTitleByKey = useMemo(
    () => new Map(BUSINESS_PLAN_GROUPS.map((g) => [g.key, g.title])),
    [],
  );
  const sectionsByKey = useMemo(
    () => new Map(props.sections.map((s) => [s.key, s])),
    [props.sections],
  );
  const customSectionsById = useMemo(
    () => new Map(props.customSections.map((cs) => [cs.id, cs])),
    [props.customSections],
  );

  function dividerLabelFor(prev: string | null, current: string): string | null {
    // What divider (if any) should appear ABOVE `current` given the previous
    // visible item's identity?
    const prevMeta = prev != null ? sectionMetaByKey.get(prev as BusinessPlanSectionKey) : undefined;
    const currentIsCustom = customSectionsById.has(current);
    const currentMeta = sectionMetaByKey.get(current as BusinessPlanSectionKey);
    if (currentIsCustom) {
      const prevWasCustom = prev != null && customSectionsById.has(prev);
      return prevWasCustom ? null : CUSTOM_SECTIONS_LABEL;
    }
    if (!currentMeta) return null;
    const currentGroup = currentMeta.groupKey;
    if (currentGroup == null) {
      // Top-level standalone (Executive Summary). No divider above.
      return null;
    }
    const prevGroup = prevMeta?.groupKey ?? null;
    // Show the group label when transitioning INTO a new group from a
    // different group (or from a top-level standalone or custom run).
    if (prev == null) return groupTitleByKey.get(currentGroup) ?? null;
    if (prevGroup !== currentGroup) {
      return groupTitleByKey.get(currentGroup) ?? null;
    }
    return null;
  }

  const items: Array<
    | { kind: "divider"; key: string; label: string }
    | { kind: "section"; key: string; section: SectionState }
    | { kind: "custom"; key: string; section: CustomSectionState }
  > = [];
  let prev: string | null = null;
  for (const id of props.order) {
    const standard = sectionsByKey.get(id as BusinessPlanSectionKey);
    const custom = customSectionsById.get(id);
    if (!standard && !custom) continue;
    const label = dividerLabelFor(prev, id);
    if (label) items.push({ kind: "divider", key: `divider-${id}`, label });
    if (standard) items.push({ kind: "section", key: id, section: standard });
    else if (custom) items.push({ kind: "custom", key: id, section: custom });
    prev = id;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.kind === "divider") {
          return (
            <h2
              key={item.key}
              className="text-base font-semibold text-[var(--foreground)] tracking-tight px-1 pt-3 pb-1 first:pt-0"
            >
              {item.label}
            </h2>
          );
        }
        if (item.kind === "section") {
          const section = item.section;
          const blurb = sectionMetaByKey.get(section.key)?.blurb ?? "";
          const bpExamples = BP_FIELD_EXAMPLES[section.key as BPFieldExampleKey] ?? [];
          const displayContent = section.userContent ?? section.autoContent;
          const hasPlaceholderContent =
            !displayContent ||
            displayContent.includes("workspace to populate") ||
            displayContent.includes("Click Generate") ||
            displayContent.includes("Complete the other") ||
            displayContent.includes("Complete the Marketing") ||
            displayContent.includes("click the text field");
          const hasRealContent = Boolean(displayContent?.trim()) && !hasPlaceholderContent;
          const onWriteWithAi = props.canEdit
            ? () => {
                if (hasRealContent) props.onImprove(section.key);
                else props.onGenerateExec(section.key);
              }
            : undefined;
          const sectionMeta = sectionMetaByKey.get(section.key);
          return (
            <SortableCardRow id={section.key} canEdit={props.canEdit} key={section.key}>
              <SectionCard
                section={section}
                canEdit={props.canEdit}
                bpExamples={bpExamples}
                isStreaming={props.streamingKey === section.key}
                blurb={blurb}
                isLocked={sectionMeta?.isLocked}
                onToggleVisible={() =>
                  props.onToggleVisibility(section.key, section.isVisible)
                }
                onToggleExpand={() =>
                  props.onToggleExpand(section.key, section.isExpanded)
                }
                onEditStart={() =>
                  props.onEditStart(section.key, section.userContent ?? section.autoContent)
                }
                onEditChange={(val) => props.onEditChange(section.key, val)}
                onEditSave={() => props.onEditSave(section.key, section.editBuffer)}
                onEditCancel={() =>
                  props.onEditCancel(section.key, section.userContent ?? section.autoContent)
                }
                onResetToAuto={() => props.onResetToAuto(section.key)}
                onWriteWithAi={onWriteWithAi}
                onArchive={!sectionMeta?.isLocked ? () => props.onArchiveSection(section.key, section.title) : undefined}
              />
            </SortableCardRow>
          );
        }
        // Custom section row.
        const cs = item.section;
        return (
          <SortableCardRow id={cs.id} canEdit={props.canEdit} key={cs.id}>
            <CustomSectionCard
              section={cs}
              canEdit={props.canEdit}
              onToggleExpand={() => props.onCustomToggleExpand(cs.id, cs.isExpanded)}
              onToggleVisible={() => props.onCustomToggleVisible(cs.id, cs.isVisible)}
              onTitleEditStart={() => props.onCustomTitleEditStart(cs.id, cs.title)}
              onTitleChange={(val) => props.onCustomTitleChange(cs.id, val)}
              onTitleSave={() => props.onCustomTitleSave(cs.id, cs.titleBuffer)}
              onTitleCancel={() => props.onCustomTitleCancel(cs.id, cs.title)}
              onEditStart={() => props.onCustomEditStart(cs.id, cs.userContent ?? "")}
              onEditChange={(val) => props.onCustomEditChange(cs.id, val)}
              onEditSave={() => props.onCustomEditSave(cs.id, cs.editBuffer)}
              onEditCancel={() => props.onCustomEditCancel(cs.id, cs.userContent ?? "")}
              onDelete={() => props.onCustomDelete(cs.id)}
              onWriteWithAi={() => props.onCustomWriteWithAi(cs.id)}
              onArchive={() => props.onArchiveCustomSection(cs.id, cs.title)}
            />
          </SortableCardRow>
        );
      })}
    </div>
  );
}

// SortableCardRow — a single row in the flat list. Owns the grip handle +
// useSortable hook. Renders the handle inline at the left of the card so
// the card content keeps its own padding intact (TIM-3492 / TIM-3491 BP
// card header h2 styling unchanged).
function SortableCardRow({
  id,
  canEdit,
  children,
}: {
  id: string;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !canEdit });

  const liftStyle = useSortableLift({ transform, transition, isDragging });

  return (
    <div
      ref={setNodeRef}
      style={liftStyle}
      id={`bp-section-${id}`}
      className="group flex items-stretch gap-1.5 sm:gap-2"
    >
      {canEdit && (
        <SortableHandle
          ref={setActivatorNodeRef}
          className="self-start mt-4 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 sm:transition-opacity"
          {...attributes}
          {...listeners}
        />
      )}
      <div className="flex-1 min-w-0 group">{children}</div>
    </div>
  );
}

// ── TIM-3490: Reset-to-default order confirmation modal ─────────────────────

function ResetOrderConfirmationModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  // TIM-3490: Escape-key dismiss + auto-focus the cancel button. /code-review
  // catch: matches the CategorySettingsPanel modal's keyboard pattern.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bp-reset-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="bp-reset-order-title"
          className="text-lg font-semibold text-[var(--foreground)] mb-2"
        >
          Reset to default order?
        </h3>
        <p className="text-sm text-[var(--neutral-cool-700)] mb-5 leading-relaxed">
          Reset all sections to the default business plan order? Your section
          content is not affected — only the order changes.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="text-sm font-medium text-[var(--neutral-cool-700)] px-4 py-2 rounded-xl border border-[var(--neutral-cool-200)] hover:bg-[var(--neutral-cool-50)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            className="text-sm font-medium text-white bg-[var(--teal)] px-4 py-2 rounded-xl hover:bg-[var(--teal-darker,var(--teal))] transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TIM-3575: ArchiveConfirmDialog ────────────────────────────────────────────

function ArchiveConfirmDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bp-archive-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="bp-archive-title" className="text-base font-semibold text-[var(--foreground)]">Archive this section?</h2>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          This won&rsquo;t appear in your exported plan, but you can bring it back from the archived list anytime.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="text-sm font-medium text-[var(--neutral-cool-700)] px-4 py-2 rounded-xl border border-[var(--neutral-cool-200)] hover:bg-[var(--neutral-cool-50)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="text-sm font-medium text-white bg-[var(--foreground)] px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TIM-3575: ArchivePanel ────────────────────────────────────────────────────
// Inline collapsible panel at the bottom of the section list (TIM-3579 IA decision).
// Shows two groups: Archived (with Restore) and Optional (with Add to Plan).

function ArchivePanel({
  sections,
  customSections,
  sectionOrder,
  isOpen,
  onToggle,
  canEdit,
  onRestoreSection,
  onRestoreCustomSection,
  onAddOptional,
}: {
  sections: SectionState[];
  customSections: CustomSectionState[];
  sectionOrder: string[];
  isOpen: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onRestoreSection: (key: BusinessPlanSectionKey) => void;
  onRestoreCustomSection: (id: string) => void;
  onAddOptional: (key: BusinessPlanSectionKey) => void;
}) {
  const archivedStandard = sections.filter((s) => s.isArchived);
  const archivedCustom = customSections.filter((cs) => cs.isArchived);
  const hasArchived = archivedStandard.length > 0 || archivedCustom.length > 0;

  // Optional sections not yet in the active order.
  const activeOrderSet = new Set([...sectionOrder, ...DEFAULT_BUSINESS_PLAN_SECTION_ORDER]);
  const optionalSections = BUSINESS_PLAN_SECTIONS.filter(
    (meta) => meta.isOptional && !activeOrderSet.has(meta.key),
  );

  const hasContent = hasArchived || optionalSections.length > 0;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-[var(--neutral-cool-600)] hover:text-[var(--teal)] transition-colors"
      >
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
        View archived and optional sections
      </button>

      {isOpen && (
        <div className="mt-4 space-y-6">
          {/* Archived group */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--neutral-cool-600)] uppercase tracking-wider mb-2">
              Archived
            </h3>
            {!hasArchived ? (
              <p className="text-xs text-[var(--muted-foreground)] italic">No archived sections.</p>
            ) : (
              <div className="space-y-2">
                {archivedStandard.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-white"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{s.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        {s.userContent ? "Has content" : "No content"}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onRestoreSection(s.key)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:text-[var(--teal-850,var(--teal))] whitespace-nowrap shrink-0"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Restore
                      </button>
                    )}
                  </div>
                ))}
                {archivedCustom.map((cs) => (
                  <div
                    key={cs.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-white"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{cs.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Custom section</p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onRestoreCustomSection(cs.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:text-[var(--teal-850,var(--teal))] whitespace-nowrap shrink-0"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Restore
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional group */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--neutral-cool-600)] uppercase tracking-wider mb-2">
              Optional
            </h3>
            {!hasContent && optionalSections.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)] italic">All optional sections are active.</p>
            ) : optionalSections.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)] italic">All optional sections are active.</p>
            ) : (
              <div className="space-y-2">
                {optionalSections.map((meta) => (
                  <div
                    key={meta.key}
                    className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-white"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)]">{meta.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">{meta.blurb}</p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onAddOptional(meta.key as BusinessPlanSectionKey)}
                        className="text-xs font-medium text-[var(--teal)] hover:text-[var(--teal-850,var(--teal))] whitespace-nowrap shrink-0 mt-0.5"
                      >
                        Add to Plan
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: SectionState;
  canEdit: boolean;
  bpExamples: BPFieldExample[];
  isStreaming: boolean;
  blurb: string;
  isLocked?: boolean;
  onToggleVisible: () => void;
  onToggleExpand: () => void;
  onEditStart: () => void;
  onEditChange: (val: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onResetToAuto: () => void;
  onWriteWithAi?: () => void;
  // TIM-3575: archive action. Absent when isLocked is true.
  onArchive?: () => void;
}

// ── MarkdownContent ───────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  // TIM-2358: defensive strip of any <num src="…">…</num> marker that might
  // have leaked into stored user_content (pre-TIM-2342 drafts, hand-edits,
  // imports). The save path already strips, but this is the on-screen render
  // boundary the issue's acceptance criteria pin.
  const clean = stripSourceMarkers(content);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        h1: ({ children }) => <h1 className="text-xl font-semibold text-[#1a1a1a] mb-2 mt-4 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-[#1a1a1a] mb-1.5 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-[#1a1a1a] mb-1 mt-2 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-[#1a1a1a] leading-relaxed mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-outside pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-outside pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-[#1a1a1a] leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-[#1a1a1a]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
      }}
    >
      {clean}
    </ReactMarkdown>
  );
}

function SectionCard({
  section,
  canEdit,
  bpExamples,
  isStreaming,
  blurb,
  isLocked,
  onToggleVisible,
  onToggleExpand,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onResetToAuto,
  onWriteWithAi,
  onArchive,
}: SectionCardProps) {
  const [openExample, setOpenExample] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasUserOverride = section.userContent !== null;
  const displayContent = section.isEditing
    ? section.editBuffer
    : (section.userContent ?? section.autoContent);

  // TIM-3112: also treat the legacy summary-field placeholder as a non-content state
  // so Write with AI triggers generate rather than improve on those fields.
  const isPlaceholder =
    !displayContent ||
    displayContent.includes("workspace to populate") ||
    displayContent.includes("Click Generate") ||
    displayContent.includes("Complete the other") ||
    displayContent.includes("Complete the Marketing") ||
    displayContent.includes("click the text field");

  // TIM-3501: dismiss card overflow menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onMouse = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // TIM-3501 code-review fix: reset is destructive (writes userContent=null) —
  // guard against losing unsaved edits / racing with streaming generation.
  const canReset = hasUserOverride && !section.isEditing && !section.isGenerating && !isStreaming;

  return (
    <div
      className={`group relative rounded-xl border bg-white ${
        section.isVisible ? "border-[var(--border)]" : "border-[var(--neutral-cool-200)]"
      }`}
    >
      {/* TIM-3501: card-level overflow menu (kebab) for low-frequency actions
          that TIM-3492 removed from the header row per TIM-3300 canon
          ([Title] [Help(?)] ——— [Write with AI]). Hide-from-PDF + reset-to-auto
          live here so the canon stays clean AND hidden sections always have a
          reveal path (no stranded state).
          Code-review fixes:
          - Kebab + popover render OUTSIDE the opacity-60 wrapper so the
            reveal trigger stays full-opacity when the section is hidden
            (otherwise the only un-hide path dims with the card).
          - Tap target ≥44px per TIM-3428 (p-2.5 + size 18 + min-w-11 min-h-11).
          - Popover z-30 matches SectionHelp / suppliers-workspace convention.
          - Plain &lt;button&gt; children (no role="menu"/menuitem) — we don't
            implement the WAI-ARIA arrow-key contract; aria-haspopup="true"
            on the trigger conveys the popover correctly without overpromising. */}
      {canEdit && (
        <div ref={menuRef} className="absolute top-1.5 right-1.5 z-20">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label={`Section options for ${section.title}`}
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] p-2.5 rounded-lg text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors"
          >
            <MoreVertical size={18} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-30 bg-white border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[220px]">
              <button
                type="button"
                onClick={() => {
                  onToggleVisible();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--neutral-cool-50)] flex items-center gap-2"
              >
                {section.isVisible ? (
                  <>
                    <EyeOff size={14} aria-hidden="true" className="text-[var(--neutral-cool-600)]" />
                    Hide from PDF
                  </>
                ) : (
                  <>
                    <Eye size={14} aria-hidden="true" className="text-[var(--neutral-cool-600)]" />
                    Show in PDF
                  </>
                )}
              </button>
              {!isLocked && onArchive && (
                <button
                  type="button"
                  onClick={() => {
                    onArchive();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--neutral-cool-50)] flex items-center gap-2"
                >
                  <Archive size={14} aria-hidden="true" className="text-[var(--neutral-cool-600)]" />
                  Archive section
                </button>
              )}
              {hasUserOverride && (
                <button
                  type="button"
                  disabled={!canReset}
                  title={
                    section.isEditing
                      ? "Save or cancel your edit before resetting"
                      : section.isGenerating || isStreaming
                        ? "Wait for the current generation to finish"
                        : undefined
                  }
                  onClick={() => {
                    onResetToAuto();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--neutral-cool-50)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <RotateCcw size={14} aria-hidden="true" className="text-[var(--neutral-cool-600)]" />
                  Reset to AI-generated
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TIM-3501: opacity-60 dim is on this inner wrapper, NOT the outer card.
          Keeps the kebab + popover at full opacity when the section is hidden
          so the "Show in PDF" reveal path is always visible. */}
      <div className={`transition-opacity ${section.isVisible ? "opacity-100" : "opacity-60"}`}>
      {/* Header — TIM-3492: identical title styling in collapsed & expanded
          (text-xl font-semibold per TIM-3491 directive — intentionally diverges
          from the canonical SectionHeader's text-sm because BP cards are
          top-level expandable sections, not sub-section headers).
          TIM-3501: right side stays strictly [Write with AI] per TIM-3300.
          (StatusChip was removed entirely by TIM-3506 board redirect.)
          Collapsed-row tap target preserved per TIM-3428 (full row is the
          expand button); expanded uses a chevron-only collapse button so
          clicks in the title area during edit don't accidentally collapse.
          pr-12 on the inner header flex reserves room for the kebab. */}
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-center gap-2 sm:gap-3 pr-12">
          {section.isExpanded ? (
            <>
              <button
                type="button"
                onClick={onToggleExpand}
                aria-expanded={true}
                aria-label={`Collapse ${section.title}`}
                className="flex-shrink-0 p-0.5 rounded hover:bg-[var(--neutral-cool-100)] transition-colors"
              >
                <ChevronUp className="w-4 h-4 text-[var(--neutral-cool-600)]" />
              </button>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <h2
                  className="text-xl font-semibold text-[var(--foreground)] truncate min-w-0"
                  title={section.title}
                >
                  {section.title}
                </h2>
                {blurb && (
                  <SectionHelp title={section.title}>{blurb}</SectionHelp>
                )}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={false}
              aria-label={`Expand ${section.title}`}
              className="flex-1 flex items-center gap-2 sm:gap-3 text-left min-w-0"
            >
              <ChevronDown className="w-4 h-4 text-[var(--neutral-cool-600)] flex-shrink-0" />
              <h2
                className="text-xl font-semibold text-[var(--foreground)] truncate min-w-0 flex-1"
                title={section.title}
              >
                {section.title}
              </h2>
            </button>
          )}
          {section.isExpanded && canEdit && !section.isEditing && !isStreaming && onWriteWithAi && (
            <button
              type="button"
              onClick={onWriteWithAi}
              aria-label={`Write ${section.title} with AI`}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-3 py-1 hover:bg-[var(--teal)]/5 transition-colors whitespace-nowrap"
            >
              <Sparkles size={12} aria-hidden="true" />
              Write with AI
            </button>
          )}
        </div>

        {/* Sub-header: source label + Edited badge (expanded), or blurb (collapsed).
            TIM-3501: pl tracks chevron-button width + flex gap to align under
            the title — expanded chevron has p-0.5 (≈20px), collapsed is plain
            (16px); inner gap is gap-2 sm:gap-3. */}
        {section.isExpanded ? (
          <div className="flex items-center gap-2 mt-1 pl-7 sm:pl-8">
            <p className="text-xs text-[var(--dark-grey)]">{section.sourceLabel}</p>
            {hasUserOverride && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--success-bg-3)] text-[var(--success-dark)] border border-[var(--success-bg)]">
                Edited
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5 pl-6 sm:pl-7">{blurb}</p>
        )}

        {section.isExpanded && bpExamples.length > 0 && (
          <div className="pl-7 sm:pl-8 mt-1">
            <button
              type="button"
              onClick={() => {
                setOpenExample((v) => !v);
                if (!openExample) setExampleIdx(0);
              }}
              className="text-xs text-[var(--teal)] font-medium hover:underline focus-visible:outline-none focus:underline"
            >
              {openExample ? "Hide example" : "See an example"}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {section.isExpanded && (
        <div className="px-5 pb-5">
          {/* TIM-3112: multi-shop example panel — matches Concept workspace styling exactly */}
          {openExample && bpExamples.length > 0 && (() => {
            const ex = bpExamples[exampleIdx % Math.max(bpExamples.length, 1)];
            if (!ex) return null;
            return (
              <div
                className="mb-4 bg-[var(--warm-250)] border border-[var(--warm-800)] rounded-xl p-4"
                role="region"
                aria-label="Sample answer from a fictional coffee shop"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] font-semibold text-[var(--teal)] uppercase tracking-[0.1em] leading-none">
                      {ex.shopName}
                    </p>
                    <p className="text-[10px] text-[var(--muted-foreground)] italic mt-0.5">
                      {ex.shopType}
                    </p>
                  </div>
                  <CollapseButton
                    onClick={() => setOpenExample(false)}
                    size={13}
                    aria-label="Close example"
                    className="text-[var(--dark-grey)] hover:text-[var(--foreground)] focus-visible:outline-none ml-2 shrink-0"
                  />
                </div>
                <p className="text-sm text-[var(--gray-1200)] leading-relaxed italic border-l-2 border-[var(--warm-950)] pl-3">
                  {ex.answer}
                </p>
                <div className="flex items-center justify-between mt-3">
                  {bpExamples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setExampleIdx((i) => (i + 1) % bpExamples.length)}
                      className="text-xs text-[var(--teal)] hover:underline focus-visible:outline-none focus:text-[var(--teal-dark)]"
                    >
                      See another shop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenExample(false)}
                    className="text-xs font-medium text-[var(--foreground)] hover:text-[var(--teal)] transition-colors focus-visible:outline-none ml-auto"
                  >
                    Got it
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="border-t border-[var(--neutral-cool-150)] pt-4">
            {isStreaming && !section.editBuffer && (
              <div className="flex items-center gap-2 mb-3" role="status">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-[var(--muted-foreground)]">Writing...</span>
              </div>
            )}

            {section.isEditing ? (
              <div>
                <MobileExpandableTextarea
                  value={section.editBuffer}
                  onChange={onEditChange}
                  label={section.title ?? "Section content"}
                  placeholder="Add content for this section..."
                  minRows={6}
                  className="min-h-[160px]"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={onEditSave}
                    disabled={section.isSaving}
                    className="px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-xs font-medium hover:bg-[var(--teal-850)] transition-colors disabled:opacity-50"
                  >
                    {section.isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={onEditCancel}
                    className="px-3 py-1.5 rounded-lg border border-[var(--gray-750)] text-[var(--gray-1150)] text-xs font-medium hover:bg-[var(--neutral-cool-100)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={canEdit && !isStreaming ? onEditStart : undefined}
                className={`${
                  canEdit && !isStreaming
                    ? "cursor-text rounded-lg hover:bg-[var(--neutral-cool-50)] -mx-1 px-1 py-0.5 transition-colors"
                    : ""
                }`}
                title={canEdit && !isPlaceholder ? "Click to edit" : undefined}
              >
                {displayContent && !isPlaceholder ? (
                  <MarkdownContent content={displayContent} />
                ) : (
                  <span className="text-[var(--dark-grey)] italic text-sm">No content yet. Use Write with AI to generate this section.</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ── TIM-3111: CustomSectionCard ───────────────────────────────────────────────

interface CustomSectionCardProps {
  section: CustomSectionState;
  canEdit: boolean;
  // TIM-3490: visual marker for streaming state. Optional — auto-derived
  // from `section.isGenerating` when not provided.
  isStreaming?: boolean;
  onToggleExpand: () => void;
  onToggleVisible: () => void;
  onTitleEditStart: () => void;
  onTitleChange: (val: string) => void;
  onTitleSave: () => void;
  onTitleCancel: () => void;
  onEditStart: () => void;
  onEditChange: (val: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
  onWriteWithAi?: () => void;
  // TIM-3575: archive action.
  onArchive?: () => void;
}

function CustomSectionCard({
  section,
  canEdit,
  onToggleExpand,
  onToggleVisible,
  onTitleEditStart,
  onTitleChange,
  onTitleSave,
  onTitleCancel,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onWriteWithAi,
  onArchive,
}: CustomSectionCardProps) {
  const displayContent = section.isEditing ? section.editBuffer : (section.userContent ?? "");
  const hasContent = Boolean(displayContent.trim());

  return (
    <div
      className={`group rounded-xl border bg-white ${
        section.isVisible ? "border-[var(--border)]" : "border-[var(--neutral-cool-200)]"
      }`}
    >
      {/* TIM-3501: opacity-60 wraps only the content area so the visibility
          toggle (Eye in the action row below) stays full-opacity when the
          section is hidden — preserves the reveal path for stranded sections. */}
      <div className={`transition-opacity ${section.isVisible ? "opacity-100" : "opacity-60"}`}>
      {/* Header */}
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Toggle expand + title */}
          <button
            onClick={onToggleExpand}
            className="flex-1 flex items-center gap-2 text-left min-w-0"
            aria-expanded={section.isExpanded}
          >
            {section.isExpanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--neutral-cool-600)] flex-shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--neutral-cool-600)] flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {section.isTitleEditing ? (
                <input
                  type="text"
                  value={section.titleBuffer}
                  onChange={(e) => onTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); onTitleSave(); }
                    if (e.key === "Escape") onTitleCancel();
                  }}
                  onBlur={onTitleSave}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  maxLength={200}
                  placeholder="Section name"
                  className="w-full text-base font-semibold text-[var(--foreground)] border-b border-[var(--teal)] bg-transparent outline-none pb-0.5"
                />
              ) : (
                <h2 className="text-base font-semibold text-[var(--foreground)] truncate">
                  {section.title}
                </h2>
              )}
              {!section.isExpanded && !section.isTitleEditing && (
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {hasContent ? "Has content" : "No content yet"}
                </p>
              )}
            </div>
          </button>

          {/* TIM-3490: Up/down arrows removed — drag-to-reorder via the
              shared sortable canon replaces this control. */}
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && section.isExpanded && !section.isTitleEditing && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onTitleEditStart(); }}
                title="Rename section"
                className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canEdit && section.isExpanded && !section.isTitleEditing && onWriteWithAi && !section.isGenerating && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onWriteWithAi(); }}
                className="hidden sm:inline-flex text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-3 py-1 hover:bg-[var(--teal)]/5 transition-all whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                Write with AI
              </button>
            )}
            {section.isGenerating && (
              <Loader2 className="w-3.5 h-3.5 text-[var(--teal)] animate-spin" />
            )}
            {/* TIM-3501: visibility toggle restored to the existing action row
                (custom-section pattern — reorder/rename/Write/visibility/delete
                were always icon-clustered here, unlike standard SectionCard
                which routes visibility through the kebab to keep TIM-3300
                header canon). When the section is hidden the button stays
                ALWAYS visible (not hover-revealed) so touch users — who have
                no hover — always have a reveal path. Combined with the
                opacity-60 wrapper, the icon renders at ~60% alpha but is
                discoverable, fixing the stranded-hidden-state on mobile. */}
            {canEdit && (
              <button
                type="button"
                onClick={onToggleVisible}
                title={section.isVisible ? "Hide from PDF" : "Show in PDF"}
                aria-label={section.isVisible ? `Hide ${section.title} from PDF` : `Show ${section.title} in PDF`}
                className={`p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors ${
                  section.isVisible
                    ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    : "opacity-100"
                }`}
              >
                {section.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            )}
            {canEdit && onArchive && (
              <button
                type="button"
                onClick={onArchive}
                title="Archive section"
                className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={onDelete}
                title="Delete section"
                className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {section.isExpanded && (
        <div className="px-5 pb-5">
          <div className="border-t border-[var(--neutral-cool-150)] pt-4">
            {section.isEditing ? (
              <div>
                <textarea
                  value={section.editBuffer}
                  onChange={(e) => onEditChange(e.target.value)}
                  className="w-full min-h-[160px] text-sm text-[var(--foreground)] border border-[var(--gray-750)] rounded-xl px-3 py-2.5 resize-y focus-visible:outline-none focus:ring-1 focus:ring-[var(--teal)] leading-relaxed"
                  placeholder="Write your custom section content here..."
                  disabled={section.isSaving}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={onEditSave}
                    disabled={section.isSaving}
                    className="px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-xs font-medium hover:bg-[var(--teal-850)] transition-colors disabled:opacity-50"
                  >
                    {section.isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={onEditCancel}
                    className="px-3 py-1.5 rounded-lg border border-[var(--gray-750)] text-[var(--gray-1150)] text-xs font-medium hover:bg-[var(--neutral-cool-100)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={canEdit ? onEditStart : undefined}
                className={canEdit ? "cursor-text rounded-lg hover:bg-[var(--neutral-cool-50)] -mx-1 px-1 py-0.5 transition-colors" : ""}
                title={canEdit ? "Click to edit" : undefined}
              >
                {hasContent ? (
                  <MarkdownContent content={displayContent} />
                ) : (
                  <span className="text-[var(--dark-grey)] italic text-sm">
                    Click to add content for this section.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
