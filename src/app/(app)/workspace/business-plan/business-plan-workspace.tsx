"use client";

// TIM-1037: Business Plan Generator workspace — main client component.
// TIM-1225: adds Cover & Branding panel above section list.
// TIM-1315: adds worked example reference panel per section.

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { FileText, Download, ChevronDown, ChevronUp, Loader2, Plus, Trash2, Pencil, Eye, EyeOff, RotateCcw, MoreVertical, Archive, ArchiveRestore, Undo2, X } from "lucide-react";
import { SectionHeader, type AiAction } from "@/components/section-header";
// TIM-3950: Two-button split flag. Default-ON. When TRUE, each BP section
// exposes [Write with AI] (opens modal) + [Regenerate with AI] (warn + undo)
// in the SectionHeader slot. When FALSE, we fall back to the TIM-3927 single-
// button "Auto-Write This Section" + inline preview flow.
import { BP_AI_SPLIT } from "@/lib/bp-ai-split";
import { InlineAnalysisCard } from "@/components/ai-analyse/InlineAnalysisCard";
import type { AnalyseResponse } from "@/app/api/ai/analyse/[sectionKind]/route";
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
  ALL_BUSINESS_PLAN_SECTION_KEYS,
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
  WorkspaceNextStepButton,
  scrollToStep,
} from "@/components/workspace/WorkspaceNextStepButton";
import { nextStep } from "@/components/workspace/next-step";
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
import type { AuditReport } from "@/lib/business-plan/audit";
import { stripSourceMarkers } from "@/lib/business-plan/source-markers";
import {
  BPWriteWithAIModal,
  type BpOtherSectionExcerpt,
  type ConsistencyContradiction,
  isBpPlaceholderContent,
  type WriteAiApproveExtras,
} from "@/components/business-plan/BPWriteWithAIModal";

// TIM-3672 follow-up: cap per-section seed excerpts so the assembled block
// stays well under the /improve prompt budget even when a founder has
// populated every section. ~500 chars is roughly a paragraph — enough for
// context, short enough that 20 sections still fits comfortably.
const BP_SEED_EXCERPT_MAX_CHARS = 500;

// TIM-3672 follow-up: trim a section body down to a compact excerpt for
// cross-section seed context. Strip source markers (they carry line-anchor
// metadata the LLM should not see), truncate at a word boundary near the
// cap, and append an ellipsis when we cut.
function bpSeedExcerpt(raw: string): string {
  const stripped = stripSourceMarkers(raw).trim();
  if (stripped.length <= BP_SEED_EXCERPT_MAX_CHARS) return stripped;
  const window = stripped.slice(0, BP_SEED_EXCERPT_MAX_CHARS);
  const lastSpace = window.lastIndexOf(" ");
  const cutAt = lastSpace > BP_SEED_EXCERPT_MAX_CHARS * 0.6 ? lastSpace : BP_SEED_EXCERPT_MAX_CHARS;
  return `${window.slice(0, cutAt).trim()}...`;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

// TIM-3927: Inline auto-write state per section. Three phases:
//   generating  — SSE stream in flight, streamingBuf accumulates tokens
//   preview     — done event received; user reviews before accepting
//   committing  — Accept clicked, PATCH in flight
type AutoWritePhase =
  | { phase: "generating"; streamingBuf: string }
  | { phase: "preview"; proposedText: string; estimatedClaims: unknown[]; contradictions: ConsistencyContradiction[] }
  | { phase: "committing"; proposedText: string; estimatedClaims: unknown[]; contradictions: ConsistencyContradiction[] };

// Private copy of sanitizeContradictions from BPWriteWithAIModal (not exported there).
function sanitizeAutoWriteContradictions(raw: unknown): ConsistencyContradiction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const obj = c as Record<string, unknown>;
      const claimA = typeof obj.claim_a === "string" ? obj.claim_a : "";
      const claimB = typeof obj.claim_b === "string" ? obj.claim_b : "";
      const explanation = typeof obj.explanation === "string" ? obj.explanation : "";
      if (!claimA || !claimB) return null;
      const kind = obj.kind;
      const normalizedKind: ConsistencyContradiction["kind"] =
        kind === "numerical" || kind === "categorical" || kind === "temporal" || kind === "other"
          ? kind
          : "other";
      return { kind: normalizedKind, claim_a: claimA, claim_b: claimB, explanation };
    })
    .filter((c): c is ConsistencyContradiction => c !== null);
}

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
  // TIM-3927: inline auto-write flow state. null/undefined when idle.
  autoWrite?: AutoWritePhase | null;
}

// ── Progressive disclosure helpers ───────────────────────────────────────────

// TIM-3675: the previous per-section fetchSse helper moved into the
// BPWriteWithAIModal component when TIM-3675 replaced the workspace's
// inline stream + AIReviewModal path with a dedicated per-section modal
// that owns its own generate flow.

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
  // TIM-3111: tracked which custom section was streaming inline. TIM-3675
  // routes per-section Write-with-AI through a modal that owns its own
  // stream state, so the workspace no longer holds a custom streaming id.

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
  // TIM-3675: Per-section Write-with-AI modal state. The modal owns the
  // pre-populated content + optional instructions + generate + approval flow;
  // approve calls the same PATCH the pre-TIM-3675 AIReviewModal onApply used.
  // Standard sections and custom sections share the modal component but keep
  // separate PATCH targets.
  const [bpWriteAiTarget, setBpWriteAiTarget] = useState<
    | { kind: "standard"; sectionKey: BusinessPlanSectionKey; sectionTitle: string; initialContent: string }
    | { kind: "custom"; sectionId: string; sectionTitle: string; initialContent: string }
    | null
  >(null);
  // TIM-3893: Analyse-with-AI state for Financial Plan sections.
  const [bpFpAnalyseResult, setBpFpAnalyseResult] = useState<AnalyseResponse | null>(null);
  const [bpFpAnalyseLoading, setBpFpAnalyseLoading] = useState(false);
  const [bpFpAnalyseError, setBpFpAnalyseError] = useState("");
  const [bpFpAnalyseActiveKey, setBpFpAnalyseActiveKey] = useState<BusinessPlanSectionKey | null>(null);
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
  // Auto-promote not_started → in_progress once any section has user content.
  const hasContent = sections.some((s) => s.userContent || s.autoContent);

  // TIM-4108 (UX Phase 3): "reviewed" means the owner has put their own words
  // to a section. Every section arrives pre-filled from the other workspaces,
  // so reading it and making it theirs IS the work on this screen — and the
  // count and the emphasised button are derived from the same test, so they
  // cannot point at different sections.
  const reviewedSteps = sections.map((s) => ({
    id: s.key,
    label: s.title,
    done: Boolean(s.userContent && s.userContent.trim().length > 0),
  }));
  const reviewedCount = reviewedSteps.filter((s) => s.done).length;
  const nextUnreviewed = nextStep(reviewedSteps);
  useEffect(() => {
    if (hasContent) promoteOnEdit("business_plan");
  }, [hasContent, promoteOnEdit]);

  // ── Autosave state ──────────────────────────────────────────────────────────

  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle", lastSavedAt: null });
  // TIM-3675: per-section Write-with-AI now runs inside its own modal, which
  // owns the SSE stream. The workspace no longer tracks a per-section
  // streaming key; the value is retained (always null) purely so consumers
  // that gated on it before — the RegenerateAll disable + the flat list's
  // per-card streaming decoration — keep the same shape without needing a
  // prop-drilling refactor. A future consolidation can drop this entirely.
  const streamingKey: BusinessPlanSectionKey | null = null;
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates edits waiting to be persisted; keyed by section key.
  const dirtyBuffersRef = useRef<Map<BusinessPlanSectionKey, string | null>>(new Map());
  // Mirror of sections used inside async callbacks without stale-closure risk.
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  // TIM-3927: per-section AbortControllers for inline auto-write SSE streams.
  const autoWriteAbortRefs = useRef<Map<BusinessPlanSectionKey, AbortController>>(new Map());

  // TIM-3950: Regenerate-with-warning target. When set, RegenerateWarningDialog
  // opens. Null when no warning is pending. The warning is skipped when the
  // section is currently empty — see handleRegenerateClick.
  const [regenerateWarningKey, setRegenerateWarningKey] = useState<BusinessPlanSectionKey | null>(null);
  // TIM-3950 review-fix: Per-section undo toasts, keyed by section key so a
  // second Regenerate on a DIFFERENT section never overwrites the first
  // section's undo affordance. Each entry captures both the pre-regenerate
  // saved userContent AND the in-flight editBuffer (with `wasEditing`) so
  // Undo can restore an unsaved edit that would otherwise be silently lost.
  interface UndoToastEntry {
    previousUserContent: string | null;
    previousEditBuffer: string;
    wasEditing: boolean;
    sectionTitle: string;
  }
  const [undoToasts, setUndoToasts] = useState<Map<BusinessPlanSectionKey, UndoToastEntry>>(
    () => new Map(),
  );
  const undoToastTimersRef = useRef<Map<BusinessPlanSectionKey, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  useEffect(() => {
    const timers = undoToastTimersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, []);

  // TIM-3954: Abort all in-flight regenerate streams on unmount to prevent
  // setSections/setUndoToasts firing on an unmounted component.
  useEffect(() => {
    const refs = autoWriteAbortRefs.current;
    return () => {
      refs.forEach((ctrl) => ctrl.abort());
      refs.clear();
    };
  }, []);

  // ── Section helpers ────────────────────────────────────────────────────────────

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

  // ── TIM-3490: Drag-to-reorder helpers ─────────────────────────────────

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
        ALL_BUSINESS_PLAN_SECTION_KEYS,
      ),
    [sectionOrder, customIds, archivedIds],
  );

  // TIM-3490: ordered projection of standard sections for AI prompt
  // assemblers (RegenerateAll + ExportGate). Custom sections are excluded
  // because the regen / export flows operate on the fixed taxonomy only.
  // TIM-3575: include optional keys in the allowlist so Add-to-Plan
  // sections are handed to assemblers instead of silently dropped.
  const orderedSectionsForAi = useMemo(() => {
    const byKey = new Map(sections.map((s) => [s.key, s]));
    const standardKeys = new Set<string>(ALL_BUSINESS_PLAN_SECTION_KEYS);
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

  // ── Autosave helpers ──────────────────────────────────────────────────────────

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

  // ── Per-section Write-with-AI (TIM-3675) ──────────────────────────────
  //
  // TIM-3675 replaces the pre-existing inline stream + AIReviewModal path
  // with a dedicated per-section modal. The modal itself owns the SSE call
  // (see BPWriteWithAIModal.tsx) — parent-side we only need to open it and
  // handle approve. Handlers below.

  const handleOpenWriteAiModal = useCallback((key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    const section = sections.find((s) => s.key === key);
    if (!section) return;
    // Auto-expand on open so the eventual saved content anchors visually to
    // the section the user acted on (parity with the pre-TIM-3675 behavior).
    if (!section.isExpanded) updateSection(key, { isExpanded: true });
    // Prefer the in-progress edit buffer when the user has been typing, so
    // the modal's pre-populated content matches what's on screen. Fall back
    // to saved user content, then to the auto-assembled draft.
    const raw = section.isEditing
      ? section.editBuffer
      : (section.userContent ?? section.autoContent ?? "");
    // TIM-3675 review-fix: don't pre-populate the modal with the assembled
    // "Complete the Marketing workspace to populate this section" style
    // placeholders; feeding them to /improve would produce a rewrite of the
    // placeholder itself. Empty initial content routes the modal to
    // /generate → workspace-snapshot synthesis, which is the correct path.
    const initial = isBpPlaceholderContent(raw) ? "" : raw;
    setBpWriteAiTarget({
      kind: "standard",
      sectionKey: key,
      sectionTitle: section.title,
      initialContent: initial,
    });
  }, [canEdit, sections, updateSection]);

  // ── TIM-3927: One-click Auto-Write handlers ────────────────────────────────
  //
  // Collapses the TIM-3854 seed-then-generate two-step modal into a single
  // click. The generate/improve routes already fetch workspace data from the
  // DB server-side, so we go straight to SSE — no seed-context prefetch.

  const handleAutoWriteSection = useCallback(async (key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    // Abort any existing stream for this key before starting fresh.
    autoWriteAbortRefs.current.get(key)?.abort();
    const abort = new AbortController();
    autoWriteAbortRefs.current.set(key, abort);

    // Expand so the inline state card is visible, then enter generating phase.
    setSections((prev) =>
      prev.map((s) =>
        s.key === key
          ? { ...s, isExpanded: true, autoWrite: { phase: "generating", streamingBuf: "" } }
          : s,
      ),
    );

    try {
      const section = sectionsRef.current.find((s) => s.key === key);
      if (!section) return;
      const raw = section.isEditing
        ? section.editBuffer
        : (section.userContent ?? section.autoContent ?? "");
      const useImprove = !isBpPlaceholderContent(raw) && raw.trim().length > 0;
      const url = useImprove ? "/api/business-plan/improve" : "/api/business-plan/generate";
      const body: Record<string, unknown> = useImprove
        ? { sectionKey: key, sectionTitle: section.title, currentContent: raw, shopName }
        : { sectionKey: key };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(
          res.status === 402
            ? "Auto-Write requires a Pro subscription."
            : res.status === 429
              ? "Too many requests — wait a moment and try again."
              : (j.error as string | undefined) ?? "Generation failed. Please try again.",
        );
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let streamingBuf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (abort.signal.aborted) return;
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const chunks = sseBuffer.split("\n\n");
        sseBuffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let eventType = "";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataLine = line.slice(6).trim();
          }
          if (!dataLine) continue;
          if (eventType === "text") {
            const parsed = JSON.parse(dataLine) as { text: string };
            streamingBuf += parsed.text;
            const snap = streamingBuf;
            setSections((prev) =>
              prev.map((s) =>
                s.key === key ? { ...s, autoWrite: { phase: "generating", streamingBuf: snap } } : s,
              ),
            );
          } else if (eventType === "done") {
            const parsed = JSON.parse(dataLine) as {
              text: string;
              estimated_claims?: unknown[];
              consistency_contradictions?: unknown[];
            };
            const finalText = parsed.text || streamingBuf;
            setSections((prev) =>
              prev.map((s) =>
                s.key === key
                  ? {
                      ...s,
                      autoWrite: {
                        phase: "preview",
                        proposedText: finalText,
                        estimatedClaims: Array.isArray(parsed.estimated_claims)
                          ? parsed.estimated_claims
                          : [],
                        contradictions: sanitizeAutoWriteContradictions(
                          parsed.consistency_contradictions,
                        ),
                      },
                    }
                  : s,
              ),
            );
            reader.releaseLock();
            return;
          } else if (eventType === "error") {
            const parsed = JSON.parse(dataLine) as { message?: string };
            throw new Error(parsed.message ?? "Generation failed. Please try again.");
          }
        }
      }
    } catch (err: unknown) {
      if (abort.signal.aborted) return;
      console.error("[auto-write]", err);
      updateSection(key, { autoWrite: null });
      setGlobalError(
        err instanceof Error ? err.message : "Could not generate this section. Try again.",
      );
    }
  }, [canEdit, updateSection, shopName]);

  const handleAutoWriteAccept = useCallback(async (key: BusinessPlanSectionKey) => {
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section?.autoWrite || section.autoWrite.phase === "generating") return;
    const { proposedText, estimatedClaims, contradictions } = section.autoWrite;
    updateSection(key, {
      autoWrite: { phase: "committing", proposedText, estimatedClaims, contradictions },
    });
    try {
      const res = await fetch(`/api/business-plan/sections/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_content: proposedText,
          estimated_claims_json: estimatedClaims,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(
          res.status === 402
            ? "Saving requires a Pro subscription."
            : res.status === 429
              ? "Too many requests — wait a moment and try again."
              : (j.error as string | undefined) ?? "Couldn't save this section. Please try again.",
        );
      }
      setSections((prev) =>
        prev.map((s) =>
          s.key !== key
            ? s
            : { ...s, userContent: proposedText, editBuffer: proposedText, isEditing: false, autoWrite: null },
        ),
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch (err: unknown) {
      // Revert to preview on failure.
      updateSection(key, {
        autoWrite: { phase: "preview", proposedText, estimatedClaims, contradictions },
      });
      setGlobalError(
        err instanceof Error ? err.message : "Could not save. Try again.",
      );
    }
  }, [updateSection]);

  const handleAutoWriteRegenerate = useCallback((key: BusinessPlanSectionKey) => {
    void handleAutoWriteSection(key);
  }, [handleAutoWriteSection]);

  const handleAutoWriteEdit = useCallback((key: BusinessPlanSectionKey) => {
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section?.autoWrite || section.autoWrite.phase === "generating") return;
    const { proposedText } = section.autoWrite;
    updateSection(key, { autoWrite: null, isEditing: true, editBuffer: proposedText });
  }, [updateSection]);

  const handleAutoWriteCancel = useCallback((key: BusinessPlanSectionKey) => {
    autoWriteAbortRefs.current.get(key)?.abort();
    updateSection(key, { autoWrite: null });
  }, [updateSection]);

  // ── TIM-3950: Regenerate-with-AI (warning + undo) ───────────────────────────
  //
  // Two-button split flow — the destructive "Regenerate with AI" path. On
  // click:
  //   1. If the section has real content, open a confirmation dialog first.
  //   2. On confirm (or immediately if the section is empty), stream a fresh
  //      generation from workspace data (same route as TIM-3927 Auto-Write).
  //   3. On done, snapshot the pre-regenerate content, PATCH the new content,
  //      and surface an Undo toast for 15s.
  //   4. Undo restores the snapshot in a single PATCH.
  //
  // The intermediate "Accept preview" step from TIM-3927 is intentionally
  // omitted here — the board directive (TIM-3949) makes Regenerate a fast,
  // one-click flow protected by warn-before + undo-after. The gated iterative
  // path lives in Write-with-AI (BPWriteWithAIModal).

  const clearUndoToastFor = useCallback((key: BusinessPlanSectionKey) => {
    const t = undoToastTimersRef.current.get(key);
    if (t) {
      clearTimeout(t);
      undoToastTimersRef.current.delete(key);
    }
    setUndoToasts((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const scheduleUndoToastClearFor = useCallback((key: BusinessPlanSectionKey) => {
    const existing = undoToastTimersRef.current.get(key);
    if (existing) clearTimeout(existing);
    const id = setTimeout(() => {
      undoToastTimersRef.current.delete(key);
      setUndoToasts((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }, 15_000);
    undoToastTimersRef.current.set(key, id);
  }, []);

  // TIM-3950 review-fix: `estimatedClaims === undefined` means "leave the DB
  // column unchanged"; passing an array (including `[]`) overwrites it. Undo
  // passes `[]` to explicitly clear the claims that the discarded regenerate
  // wrote, otherwise the reverted content would be paired with stale claims
  // (TIM-2342 export-gate would then surface phantom items).
  const patchSectionContent = useCallback(async (
    key: BusinessPlanSectionKey,
    userContent: string | null,
    estimatedClaims: unknown[] | undefined,
  ) => {
    const body: Record<string, unknown> = { user_content: userContent };
    if (estimatedClaims !== undefined) body.estimated_claims_json = estimatedClaims;
    const res = await fetch(`/api/business-plan/sections/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        res.status === 402
          ? "Saving requires a Pro subscription."
          : res.status === 429
            ? "Too many requests. Wait a moment and try again."
            : (j.error as string | undefined) ?? "Couldn't save this section. Please try again.",
      );
    }
  }, []);

  const runRegenerateSectionStream = useCallback(async (key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    autoWriteAbortRefs.current.get(key)?.abort();
    const abort = new AbortController();
    autoWriteAbortRefs.current.set(key, abort);

    // Snapshot BEFORE overwriting so Undo can restore even if the section
    // state advances during the SSE stream. TIM-3950 review-fix: capture the
    // in-flight editBuffer and isEditing too, otherwise a mid-edit user's
    // unsaved edits (which handleRegenerateClick's warning check DID read)
    // become unrecoverable — Undo would restore the last SAVED value only.
    const preSection = sectionsRef.current.find((s) => s.key === key);
    if (!preSection) return;
    const previousUserContent = preSection.userContent;
    const previousEditBuffer = preSection.editBuffer;
    const wasEditing = preSection.isEditing;
    const previousTitle = preSection.title;

    setSections((prev) =>
      prev.map((s) =>
        s.key === key
          ? { ...s, isExpanded: true, autoWrite: { phase: "generating", streamingBuf: "" } }
          : s,
      ),
    );

    try {
      const res = await fetch("/api/business-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionKey: key }),
        signal: abort.signal,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(
          res.status === 402
            ? "Regenerate requires a Pro subscription."
            : res.status === 429
              ? "Too many requests. Wait a moment and try again."
              : (j.error as string | undefined) ?? "Regeneration failed. Please try again.",
        );
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let streamingBuf = "";
      let finalText = "";
      let finalClaims: unknown[] = [];
      let doneReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (abort.signal.aborted) return;
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const chunks = sseBuffer.split("\n\n");
        sseBuffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let eventType = "";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataLine = line.slice(6).trim();
          }
          if (!dataLine) continue;
          if (eventType === "text") {
            const parsed = JSON.parse(dataLine) as { text: string };
            streamingBuf += parsed.text;
            const snap = streamingBuf;
            setSections((prev) =>
              prev.map((s) =>
                s.key === key ? { ...s, autoWrite: { phase: "generating", streamingBuf: snap } } : s,
              ),
            );
          } else if (eventType === "done") {
            const parsed = JSON.parse(dataLine) as {
              text: string;
              estimated_claims?: unknown[];
            };
            finalText = parsed.text || streamingBuf;
            finalClaims = Array.isArray(parsed.estimated_claims) ? parsed.estimated_claims : [];
            reader.releaseLock();
            doneReceived = true;
            break;
          } else if (eventType === "error") {
            const parsed = JSON.parse(dataLine) as { message?: string };
            throw new Error(parsed.message ?? "Regeneration failed. Please try again.");
          }
        }
        if (doneReceived) break;
      }

      if (!finalText) throw new Error("Regeneration ended without a draft. Please try again.");

      // Commit + swap the section content in a single beat, then surface the
      // undo toast. If the PATCH fails, restore the draft to preview so the
      // user can retry without burning another AI credit.
      try {
        await patchSectionContent(key, finalText, finalClaims);
      } catch (patchErr: unknown) {
        if (abort.signal.aborted) return;
        console.error("[regenerate/patch]", patchErr);
        setSections((prev) =>
          prev.map((s) =>
            s.key !== key
              ? s
              : {
                  ...s,
                  autoWrite: {
                    phase: "preview",
                    proposedText: finalText,
                    estimatedClaims: finalClaims,
                    contradictions: [],
                  },
                },
          ),
        );
        setGlobalError(
          patchErr instanceof Error ? patchErr.message : "Could not save. Accept the preview to retry.",
        );
        return;
      }
      setSections((prev) =>
        prev.map((s) =>
          s.key !== key
            ? s
            : { ...s, userContent: finalText, editBuffer: finalText, isEditing: false, autoWrite: null },
        ),
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
      // Replace any prior undo entry for THIS section only. A pending undo on
      // a different section is unaffected (per-key timer and map entry).
      setUndoToasts((prev) => {
        const next = new Map(prev);
        next.set(key, {
          previousUserContent,
          previousEditBuffer,
          wasEditing,
          sectionTitle: previousTitle,
        });
        return next;
      });
      scheduleUndoToastClearFor(key);
    } catch (err: unknown) {
      if (abort.signal.aborted) return;
      console.error("[regenerate]", err);
      updateSection(key, { autoWrite: null });
      setGlobalError(
        err instanceof Error ? err.message : "Could not regenerate this section. Try again.",
      );
    }
  }, [canEdit, patchSectionContent, scheduleUndoToastClearFor, updateSection]);

  const handleRegenerateClick = useCallback((key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section) return;
    const raw = section.isEditing
      ? section.editBuffer
      : (section.userContent ?? "");
    // Skip the warning when there's nothing to lose. Guard on userContent only
    // (not autoContent): a section the founder has never typed into has no
    // user work to protect, so falling back to autoContent would trigger a
    // false warning on workspace-generated narratives.
    const looksEmpty = raw.trim().length === 0 || isBpPlaceholderContent(raw);
    if (looksEmpty) {
      void runRegenerateSectionStream(key);
      return;
    }
    setRegenerateWarningKey(key);
  }, [canEdit, runRegenerateSectionStream]);

  const handleRegenerateConfirm = useCallback((key: BusinessPlanSectionKey) => {
    setRegenerateWarningKey(null);
    void runRegenerateSectionStream(key);
  }, [runRegenerateSectionStream]);

  const handleUndoRegenerate = useCallback(async (key: BusinessPlanSectionKey) => {
    const entry = undoToasts.get(key);
    if (!entry) return;
    // Clear this section's toast + timer optimistically so a rapid Undo
    // re-click can't double-fire the PATCH. Other sections' entries stay.
    clearUndoToastFor(key);
    try {
      // TIM-3950 review-fix: pass `[]` to clear estimated_claims_json — the
      // discarded regenerate's claims are stale against the reverted content.
      await patchSectionContent(key, entry.previousUserContent, []);
      setSections((prev) =>
        prev.map((s) =>
          s.key !== key
            ? s
            : {
                ...s,
                userContent: entry.previousUserContent,
                // Restore the exact editBuffer + isEditing state the user
                // was in at Regenerate-click time (protects unsaved edits).
                editBuffer: entry.wasEditing
                  ? entry.previousEditBuffer
                  : (entry.previousUserContent ?? s.autoContent ?? ""),
                isEditing: entry.wasEditing,
              },
        ),
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch (err: unknown) {
      // Restore the toast so the user can try again — the snapshot is still
      // recoverable client-side.
      setUndoToasts((prev) => {
        const next = new Map(prev);
        next.set(key, entry);
        return next;
      });
      scheduleUndoToastClearFor(key);
      setGlobalError(
        err instanceof Error ? err.message : "Undo failed. Try again.",
      );
    }
  }, [clearUndoToastFor, patchSectionContent, scheduleUndoToastClearFor, undoToasts]);

  const handleDismissUndoToast = useCallback((key: BusinessPlanSectionKey) => {
    clearUndoToastFor(key);
  }, [clearUndoToastFor]);

  // ── PDF export / print ──────────────────────────────────────────────

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

  // ── TIM-3111: Custom section handlers ─────────────────────────────────

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

  // TIM-3675: open the Write-with-AI modal for a custom section. Same shape
  // as handleOpenWriteAiModal for standard sections, but the modal wires
  // approve to the custom-sections PATCH endpoint.
  const handleOpenCustomWriteAiModal = useCallback((id: string) => {
    if (!canEdit) return;
    const cs = customSections.find((c) => c.id === id);
    if (!cs) return;
    if (!cs.isExpanded) updateCustomSection(id, { isExpanded: true });
    const initial = cs.isEditing ? cs.editBuffer : (cs.userContent ?? "");
    setBpWriteAiTarget({
      kind: "custom",
      sectionId: id,
      sectionTitle: cs.title,
      initialContent: initial,
    });
  }, [canEdit, customSections, updateCustomSection]);

  // TIM-3893: Analyse-with-AI handler for Financial Plan sections.
  const runBpFinancialPlanAnalyse = useCallback(async (sectionKey: BusinessPlanSectionKey) => {
    if (bpFpAnalyseLoading) return;
    // Clear stale result only when switching to a different section; preserve it
    // when regenerating the same section so InlineAnalysisCard can show a spinner.
    if (bpFpAnalyseActiveKey !== sectionKey) setBpFpAnalyseResult(null);
    setBpFpAnalyseActiveKey(sectionKey);
    setBpFpAnalyseLoading(true);
    setBpFpAnalyseError("");
    try {
      const res = await fetch(`/api/ai/analyse/business-plan-financial-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 402) {
          setGlobalError("Analyse with AI requires a Pro subscription.");
        } else {
          setBpFpAnalyseError((json.error as string | undefined) ?? "Analysis failed. Please try again.");
        }
        return;
      }
      const json = await res.json();
      setBpFpAnalyseResult(json as AnalyseResponse);
    } catch {
      setBpFpAnalyseError("Network error — please try again.");
    } finally {
      setBpFpAnalyseLoading(false);
    }
  }, [bpFpAnalyseLoading, bpFpAnalyseActiveKey, planId]);

  // ── Render ────────────────────────────────────────────────────
