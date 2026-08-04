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

  // ── Autosave state ─────────────────────────────────────────────────────────

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
