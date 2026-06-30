"use client";

// TIM-1037: Business Plan Generator workspace — main client component.
// TIM-1225: adds Cover & Branding panel above section list.
// TIM-1315: adds worked example reference panel per section.

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { FileText, Download, ChevronDown, ChevronUp, Loader2, Plus, Trash2, ArrowUp, ArrowDown, Pencil, Sparkles } from "lucide-react";
import { SectionHelp } from "@/components/ui/section-help";
import { CollapseButton } from "@/components/ui/CollapseButton";
import { MobileExpandableTextarea } from "@/components/ui/mobile-expandable-textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type {
  BusinessPlanSectionData,
  BusinessPlanSectionKey,
  BusinessPlanGroupKey,
  CustomSectionData,
} from "@/lib/business-plan";
import { BUSINESS_PLAN_GROUPS, BUSINESS_PLAN_SECTIONS } from "@/lib/business-plan";
import { BP_FIELD_EXAMPLES, type BPFieldExample, type BPFieldExampleKey } from "@/lib/business-plan-field-examples";
import { CoverBrandingPanel, type CoverSettings } from "./cover-branding-panel";
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
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialCoverSettings: CoverSettings;
  logoPublicUrl: string | null;
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
}

export function BusinessPlanWorkspace({
  planId,
  shopName,
  initialSections,
  initialCustomSections,
  canEdit,
  initialTrialMessagesUsed,
  initialCoverSettings,
  logoPublicUrl,
  initialFinancialDocuments,
  preGenerateChecklist,
}: Props) {
  const [sections, setSections] = useState<SectionState[]>(
    initialSections.map((s) => ({
      ...s,
      isExpanded: determineInitialExpanded(s, initialSections),
      isEditing: false,
      editBuffer: s.userContent ?? s.autoContent,
      isSaving: false,
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
    }))
  );
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
  // TIM-2336: export-time validation gate. When the validate endpoint returns
  // blocking findings, we hold the export action in `pendingExportAction` and
  // show the gate modal. On Continue we replay the action with ?force=1.
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [pendingExportAction, setPendingExportAction] = useState<"export" | "print" | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  // TIM-1498: Default state -- all groups expanded; user can collapse per group.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<BusinessPlanGroupKey>>(new Set());
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

  const handlePrintPlan = useCallback(async () => {
    setIsPrintingPdf(true);
    try {
      await runValidationThen("print");
    } finally {
      setIsPrintingPdf(false);
    }
  }, [runValidationThen]);

  const handleExportPdf = useCallback(async () => {
    setIsExportingPdf(true);
    try {
      await runValidationThen("export");
    } finally {
      setIsExportingPdf(false);
    }
  }, [runValidationThen]);

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

  const handleCustomSectionReorder = useCallback((id: string, direction: "up" | "down") => {
    const idx = customSections.findIndex((cs) => cs.id === id);
    if (idx < 0) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= customSections.length) return;
    const next = [...customSections];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    // Keep sortOrder in sync so delete-rollback re-sorts to the current visual order.
    next[idx] = { ...next[idx], sortOrder: idx };
    next[swapWith] = { ...next[swapWith], sortOrder: swapWith };
    setCustomSections(next);
    // Fetches fire exactly once per user action — outside any state updater.
    void fetch(`/api/business-plan/custom-sections/${next[idx].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order: idx }),
    });
    void fetch(`/api/business-plan/custom-sections/${next[swapWith].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order: swapWith }),
    });
  }, [customSections]);

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
    {validationReport && (
      <ExportGateModal
        report={validationReport}
        shopName={shopName}
        sections={sections.map((s) => ({
          key: s.key,
          title: s.title,
          currentContent: s.userContent ?? s.autoContent,
        }))}
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
                {allExpanded ? "Collapse all" : "Expand all"}
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
              <WorkspaceActionMenu>
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
                      getCurrentSections={() =>
                        sections.map((s) => ({
                          key: s.key,
                          title: s.title,
                          currentContent: s.userContent ?? s.autoContent,
                        }))
                      }
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

        {/* Cover & Branding panel */}
        <CoverBrandingPanel
          initialSettings={initialCoverSettings}
          logoPublicUrl={logoPublicUrl}
          shopName={shopName}
        />

        {/* Financial documents panel */}
        <FinancialDocumentsPanel initialDocuments={initialFinancialDocuments} />

        {/* TIM-1498: Two-level taxonomy. Top-level rows (Executive Summary)
            render as standalone cards; grouped subsections render under a
            collapsible group header. Cards remain inline -- no right-side
            drawers/sheets per platform rule. */}
        <SectionTree
          sections={sections}
          canEdit={canEdit}
          collapsedGroups={collapsedGroups}
          onToggleGroup={(g) =>
            setCollapsedGroups((prev) => {
              const next = new Set(prev);
              if (next.has(g)) next.delete(g);
              else next.add(g);
              return next;
            })
          }
          onToggleVisibility={(key, current) => toggleVisibility(key, current)}
          onToggleExpand={(key, current) => updateSection(key, { isExpanded: !current })}
          onEditStart={(key, content) =>
            updateSection(key, { isEditing: true, editBuffer: content })
          }
          onEditChange={(key, val) => {
            updateSection(key, { editBuffer: val });
            scheduleSave(key, val || null);
          }}
          onEditSave={(key, buf) => {
            saveSection(key, buf || null);
          }}
          onEditCancel={(key, fallback) => {
            updateSection(key, {
              isEditing: false,
              editBuffer: fallback,
            });
          }}
          onResetToAuto={(key) => saveSection(key, null)}
          onGenerateExec={handleGenerate}
          onImprove={handleImprove}
        />

        {/* TIM-3111: Custom sections — rendered below standard section tree */}
        {customSections.length > 0 && (
          <div className="mt-6 space-y-3">
            <h2 className="text-base font-semibold text-[var(--foreground)] tracking-tight px-1">
              Custom Sections
            </h2>
            {customSections.map((cs, idx) => (
              <CustomSectionCard
                key={cs.id}
                section={cs}
                canEdit={canEdit}
                isFirst={idx === 0}
                isLast={idx === customSections.length - 1}
                onToggleExpand={() => updateCustomSection(cs.id, { isExpanded: !cs.isExpanded })}
                onToggleVisible={() => handleCustomSectionVisibility(cs.id, cs.isVisible)}
                onTitleEditStart={() => updateCustomSection(cs.id, { isTitleEditing: true, titleBuffer: cs.title })}
                onTitleChange={(val) => updateCustomSection(cs.id, { titleBuffer: val })}
                onTitleSave={() => handleCustomSectionTitleSave(cs.id, cs.titleBuffer)}
                onTitleCancel={() => updateCustomSection(cs.id, { isTitleEditing: false, titleBuffer: cs.title })}
                onEditStart={() => updateCustomSection(cs.id, { isEditing: true, editBuffer: cs.userContent ?? "" })}
                onEditChange={(val) => {
                  updateCustomSection(cs.id, { editBuffer: val });
                  scheduleCustomSave(cs.id, val || null);
                }}
                onEditSave={() => {
                  customDirtyBuffersRef.current.delete(cs.id);
                  updateCustomSection(cs.id, { isSaving: true });
                  void fetch(`/api/business-plan/custom-sections/${cs.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_content: cs.editBuffer || null }),
                  }).then(() => {
                    setCustomSections((prev) =>
                      prev.map((s) =>
                        s.id !== cs.id
                          ? s
                          : { ...s, userContent: cs.editBuffer || null, isEditing: false, isSaving: false }
                      )
                    );
                    setSaveState({ kind: "saved", at: new Date().toISOString() });
                  }).catch(() => {
                    updateCustomSection(cs.id, { isSaving: false });
                    setSaveState({ kind: "error", message: "Could not save. Try again." });
                  });
                }}
                onEditCancel={() => {
                  customDirtyBuffersRef.current.delete(cs.id);
                  updateCustomSection(cs.id, { isEditing: false, editBuffer: cs.userContent ?? "" });
                }}
                onDelete={() => handleDeleteCustomSection(cs.id)}
                onMoveUp={() => handleCustomSectionReorder(cs.id, "up")}
                onMoveDown={() => handleCustomSectionReorder(cs.id, "down")}
                onWriteWithAi={() => void handleCustomSectionWriteWithAi(cs.id)}
              />
            ))}
          </div>
        )}

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

// ── SectionTree (two-level group + subsection renderer) ──────────────────────

interface SectionTreeProps {
  sections: SectionState[];
  canEdit: boolean;
  streamingKey?: BusinessPlanSectionKey | null;
  collapsedGroups: Set<BusinessPlanGroupKey>;
  onToggleGroup: (group: BusinessPlanGroupKey) => void;
  onToggleVisibility: (key: BusinessPlanSectionKey, current: boolean) => void;
  onToggleExpand: (key: BusinessPlanSectionKey, current: boolean) => void;
  onEditStart: (key: BusinessPlanSectionKey, content: string) => void;
  onEditChange: (key: BusinessPlanSectionKey, val: string) => void;
  onEditSave: (key: BusinessPlanSectionKey, buf: string) => void;
  onEditCancel: (key: BusinessPlanSectionKey, fallback: string) => void;
  onResetToAuto: (key: BusinessPlanSectionKey) => void;
  onGenerateExec?: (key: BusinessPlanSectionKey) => void;
  onImprove?: (key: BusinessPlanSectionKey) => void;
}

function SectionTree(props: SectionTreeProps) {
  const sectionMetaByKey = useMemo(
    () => new Map(BUSINESS_PLAN_SECTIONS.map((m) => [m.key, m])),
    [],
  );
  const sectionsByKey = useMemo(
    () => new Map(props.sections.map((s) => [s.key, s])),
    [props.sections],
  );

  function renderCard(section: SectionState) {
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
    const onWriteWithAi =
      props.canEdit && (props.onGenerateExec || props.onImprove)
        ? () => {
            if (hasRealContent && props.onImprove) props.onImprove!(section.key);
            else if (props.onGenerateExec) props.onGenerateExec!(section.key);
          }
        : undefined;
    return (
      <SectionCard
        key={section.key}
        section={section}
        canEdit={props.canEdit}
        bpExamples={bpExamples}
        isStreaming={props.streamingKey === section.key}
        blurb={blurb}
        onToggleVisible={() => props.onToggleVisibility(section.key, section.isVisible)}
        onToggleExpand={() => props.onToggleExpand(section.key, section.isExpanded)}
        onEditStart={() => props.onEditStart(section.key, section.userContent ?? section.autoContent)}
        onEditChange={(val) => props.onEditChange(section.key, val)}
        onEditSave={() => props.onEditSave(section.key, section.editBuffer)}
        onEditCancel={() => props.onEditCancel(section.key, section.userContent ?? section.autoContent)}
        onResetToAuto={() => props.onResetToAuto(section.key)}
        onWriteWithAi={onWriteWithAi}
      />
    );
  }

  const topLevel = props.sections.filter(
    (s) => sectionMetaByKey.get(s.key)?.groupKey == null,
  );

  return (
    <div className="space-y-4">
      {topLevel.map((s) => renderCard(s))}

      {BUSINESS_PLAN_GROUPS.map((group) => {
        const groupSections = BUSINESS_PLAN_SECTIONS
          .filter((m) => m.groupKey === group.key)
          .map((m) => sectionsByKey.get(m.key))
          .filter((s): s is SectionState => Boolean(s));

        if (groupSections.length === 0) return null;
        const collapsed = props.collapsedGroups.has(group.key);
        const visibleCount = groupSections.filter((s) => s.isVisible).length;
        const firstKey = groupSections[0]?.key;
        const groupAnchor = `bp-group-${group.key}`;

        return (
          <section key={group.key} aria-labelledby={`${groupAnchor}-label`}>
            <button
              type="button"
              id={`${groupAnchor}-label`}
              onClick={() => {
                props.onToggleGroup(group.key);
                if (collapsed && firstKey) {
                  const el = document.getElementById(`bp-section-${firstKey}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              aria-expanded={!collapsed}
              aria-controls={`${groupAnchor}-list`}
              className="w-full mt-6 mb-2 flex items-center gap-2 px-1 py-2 text-left rounded-lg hover:bg-[var(--neutral-cool-50)] transition-colors"
            >
              {collapsed ? (
                <ChevronDown className="w-4 h-4 text-[var(--neutral-cool-600)] flex-shrink-0" />
              ) : (
                <ChevronUp className="w-4 h-4 text-[var(--neutral-cool-600)] flex-shrink-0" />
              )}
              <h2 className="text-base font-semibold text-[var(--foreground)] tracking-tight">
                {group.title}
              </h2>
              <span className="text-[11px] text-[var(--neutral-cool-600)]">
                {visibleCount} of {groupSections.length} visible
              </span>
            </button>

            {!collapsed && (
              <div id={`${groupAnchor}-list`} className="space-y-3">
                {groupSections.map((s) => (
                  <div key={s.key} id={`bp-section-${s.key}`}>
                    {renderCard(s)}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
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
  onToggleVisible: () => void;
  onToggleExpand: () => void;
  onEditStart: () => void;
  onEditChange: (val: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onResetToAuto: () => void;
  onWriteWithAi?: () => void;
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
  onToggleVisible,
  onToggleExpand,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onResetToAuto,
  onWriteWithAi,
}: SectionCardProps) {
  const [openExample, setOpenExample] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
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

  return (
    <div
      className={`group rounded-xl border bg-white transition-opacity ${
        section.isVisible ? "border-[var(--border)] opacity-100" : "border-[var(--neutral-cool-200)] opacity-60"
      }`}
    >
      {/* Header — TIM-3492: identical title styling in collapsed & expanded
          (text-xl font-semibold per TIM-3491 directive — intentionally diverges
          from the canonical SectionHeader's text-sm because BP cards are
          top-level expandable sections, not sub-section headers).
          Only chevron direction + content-area visibility + help/Write-with-AI
          appearance change on toggle. Visibility (Eye) and reset-to-auto
          (RotateCcw) moved out per TIM-3300 canon; follow-up TIM-3499 relocates
          them. Collapsed-row tap target preserved per TIM-3428 (full row is
          the expand button); expanded uses a chevron-only collapse button so
          clicks in the title area during edit don't accidentally collapse. */}
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-center gap-2 sm:gap-3">
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
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-3 py-1 hover:bg-[var(--teal)]/5 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles size={12} aria-hidden="true" />
              Write with AI
            </button>
          )}
        </div>

        {/* Sub-header: source label + Edited badge (expanded), or blurb (collapsed) */}
        {section.isExpanded ? (
          <div className="flex items-center gap-2 mt-1 pl-6">
            <p className="text-xs text-[var(--dark-grey)]">{section.sourceLabel}</p>
            {hasUserOverride && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--success-bg-3)] text-[var(--success-dark)] border border-[var(--success-bg)]">
                Edited
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5 pl-6">{blurb}</p>
        )}

        {section.isExpanded && bpExamples.length > 0 && (
          <div className="pl-6 mt-1">
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
  );
}

// ── TIM-3111: CustomSectionCard ───────────────────────────────────────────────

interface CustomSectionCardProps {
  section: CustomSectionState;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
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
  onMoveUp: () => void;
  onMoveDown: () => void;
  onWriteWithAi?: () => void;
}

function CustomSectionCard({
  section,
  canEdit,
  isFirst,
  isLast,
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
  onMoveUp,
  onMoveDown,
  onWriteWithAi,
}: CustomSectionCardProps) {
  const displayContent = section.isEditing ? section.editBuffer : (section.userContent ?? "");
  const hasContent = Boolean(displayContent.trim());

  return (
    <div
      className={`group rounded-xl border bg-white transition-opacity ${
        section.isVisible ? "border-[var(--border)] opacity-100" : "border-[var(--neutral-cool-200)] opacity-60"
      }`}
    >
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

          {/* Action row: reorder, rename, Write with AI, visibility, delete */}
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && !isFirst && (
              <button
                type="button"
                onClick={onMoveUp}
                title="Move up"
                className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            )}
            {canEdit && !isLast && (
              <button
                type="button"
                onClick={onMoveDown}
                title="Move down"
                className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            )}
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
            {/* TIM-3492: visibility (Eye) removed from section header per
                TIM-3300 canon ("nothing else on the right"); follow-up child
                relocates the toggle elsewhere. */}
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
  );
}
