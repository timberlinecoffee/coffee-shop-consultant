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

const BP_SEED_EXCERPT_MAX_CHARS = 500;

function bpSeedExcerpt(raw: string): string {
  const stripped = stripSourceMarkers(raw).trim();
  if (stripped.length <= BP_SEED_EXCERPT_MAX_CHARS) return stripped;
  const window = stripped.slice(0, BP_SEED_EXCERPT_MAX_CHARS);
  const lastSpace = window.lastIndexOf(" ");
  const cutAt = lastSpace > BP_SEED_EXCERPT_MAX_CHARS * 0.6 ? lastSpace : BP_SEED_EXCERPT_MAX_CHARS;
  return `${window.slice(0, cutAt).trim()}...`;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

type AutoWritePhase =
  | { phase: "generating"; streamingBuf: string }
  | { phase: "preview"; proposedText: string; estimatedClaims: unknown[]; contradictions: ConsistencyContradiction[] }
  | { phase: "committing"; proposedText: string; estimatedClaims: unknown[]; contradictions: ConsistencyContradiction[] };

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
  initialCustomSections: CustomSectionData[];
  initialSectionOrder: string[];
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialCoverSettings: CoverSettings;
  logoPublicUrl: string | null;
  authorFullName: string | null;
  initialFinancialDocuments: FinancialDocumentState[];
  preGenerateChecklist: PreGenerateChecklistItem[];
}

interface SectionState extends BusinessPlanSectionData {
  isExpanded: boolean;
  isEditing: boolean;
  editBuffer: string;
  isSaving: boolean;
  isGenerating?: boolean;
  isArchived: boolean;
  autoWrite?: AutoWritePhase | null;
}

function determineInitialExpanded(
  section: BusinessPlanSectionData,
  allSections: BusinessPlanSectionData[]
): boolean {
  if (section.userContent && section.userContent.trim().length > 0) return false;
  const firstUnreviewed = allSections.find(
    (s) => s.autoContent && (!s.userContent || !s.userContent.trim().length)
  );
  if (firstUnreviewed) return section.key === firstUnreviewed.key;
  return section.key === "executive-summary";
}

interface CustomSectionState extends CustomSectionData {
  isExpanded: boolean;
  isEditing: boolean;
  editBuffer: string;
  isTitleEditing: boolean;
  titleBuffer: string;
  isSaving: boolean;
  isGenerating?: boolean;
  isDeleting?: boolean;
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
  const [sectionOrder, setSectionOrder] = useState<string[]>(initialSectionOrder);
  const [showResetOrderModal, setShowResetOrderModal] = useState(false);
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

  const [archivePanelOpen, setArchivePanelOpen] = useState(false);
  type ArchiveTarget = { type: "standard"; key: BusinessPlanSectionKey; title: string } | { type: "custom"; id: string; title: string };
  const [archiveConfirmTarget, setArchiveConfirmTarget] = useState<ArchiveTarget | null>(null);
  const [isAddingCustomSection, setIsAddingCustomSection] = useState(false);
  const [customSectionError, setCustomSectionError] = useState<string | null>(null);
  const customDirtyBuffersRef = useRef<Map<string, string | null>>(new Map());
  const customPendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrintingPdf, setIsPrintingPdf] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [coverModalAction, setCoverModalAction] = useState<"export" | "print" | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [pendingExportAction, setPendingExportAction] = useState<"export" | "print" | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();
  const [bpWriteAiTarget, setBpWriteAiTarget] = useState<
    | { kind: "standard"; sectionKey: BusinessPlanSectionKey; sectionTitle: string; initialContent: string }
    | { kind: "custom"; sectionId: string; sectionTitle: string; initialContent: string }
    | null
  >(null);
  const [bpFpAnalyseResult, setBpFpAnalyseResult] = useState<AnalyseResponse | null>(null);
  const [bpFpAnalyseLoading, setBpFpAnalyseLoading] = useState(false);
  const [bpFpAnalyseError, setBpFpAnalyseError] = useState("");
  const [bpFpAnalyseActiveKey, setBpFpAnalyseActiveKey] = useState<BusinessPlanSectionKey | null>(null);
  const {
    openProgressOverlay,
    updateProgressOverlay,
    closeProgressOverlay,
    ProgressOverlayNode,
  } = useBusinessPlanProgressOverlay();

  const { promoteOnEdit } = useWorkspaceStatus();
  const hasContent = sections.some((s) => s.userContent || s.autoContent);

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

  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle", lastSavedAt: null });
  const streamingKey: BusinessPlanSectionKey | null = null;
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyBuffersRef = useRef<Map<BusinessPlanSectionKey, string | null>>(new Map());
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  const autoWriteAbortRefs = useRef<Map<BusinessPlanSectionKey, AbortController>>(new Map());

  const [regenerateWarningKey, setRegenerateWarningKey] = useState<BusinessPlanSectionKey | null>(null);
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

  useEffect(() => {
    const refs = autoWriteAbortRefs.current;
    return () => {
      refs.forEach((ctrl) => ctrl.abort());
      refs.clear();
    };
  }, []);

  const updateSection = useCallback((key: BusinessPlanSectionKey, patch: Partial<SectionState>) => {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const saveSection = useCallback(async (key: BusinessPlanSectionKey, userContent: string | null) => {
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
    updateSection(sectionKey, { isArchived: false, isExpanded: true });
    setSectionOrder((prev) => [...prev, sectionKey]);
    await fetch(`/api/business-plan/sections/${sectionKey}/add-optional`, {
      method: "POST",
    });
  }, [updateSection]);

  const customIds = useMemo(
    () => customSections.map((cs) => cs.id),
    [customSections],
  );
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

  const persistDirty = useCallback(async () => {
    if (!canEdit) return;
    const snapshot = new Map(dirtyBuffersRef.current);
    dirtyBuffersRef.current.clear();
    if (snapshot.size === 0) return;
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

  const handleOpenWriteAiModal = useCallback((key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    const section = sections.find((s) => s.key === key);
    if (!section) return;
    if (!section.isExpanded) updateSection(key, { isExpanded: true });
    const raw = section.isEditing
      ? section.editBuffer
      : (section.userContent ?? section.autoContent ?? "");
    const initial = isBpPlaceholderContent(raw) ? "" : raw;
    setBpWriteAiTarget({
      kind: "standard",
      sectionKey: key,
      sectionTitle: section.title,
      initialContent: initial,
    });
  }, [canEdit, sections, updateSection]);

  const handleAutoWriteSection = useCallback(async (key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    autoWriteAbortRefs.current.get(key)?.abort();
    const abort = new AbortController();
    autoWriteAbortRefs.current.set(key, abort);

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
