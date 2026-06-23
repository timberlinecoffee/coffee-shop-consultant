"use client";

// TIM-1037: Business Plan Generator workspace — main client component.
// TIM-1225: adds Cover & Branding panel above section list.
// TIM-1315: adds worked example reference panel per section.

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { FileText, Eye, EyeOff, Wand2, RotateCcw, Download, ChevronDown, ChevronUp, BookOpen, X, Circle, CheckCircle, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type {
  BusinessPlanSectionData,
  BusinessPlanSectionKey,
  BusinessPlanGroupKey,
} from "@/lib/business-plan";
import { BUSINESS_PLAN_GROUPS, BUSINESS_PLAN_SECTIONS } from "@/lib/business-plan";
import { SUMMIT_STREET_EXAMPLES } from "@/lib/business-plan-examples";
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
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
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
  // Align with StatusChip: any non-empty saved content = done
  if (section.userContent && section.userContent.trim().length > 0) return false;
  const firstUnreviewed = allSections.find(
    (s) => s.autoContent && (!s.userContent || !s.userContent.trim().length)
  );
  if (firstUnreviewed) return section.key === firstUnreviewed.key;
  return section.key === "executive-summary";
}

// ── Main component ────────────────────────────────────────────────────────────

export function BusinessPlanWorkspace({
  planId,
  shopName,
  initialSections,
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
              await fetch(`/api/business-plan/sections/${sectionKey}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  user_content: full,
                  estimated_claims_json: estimatedClaims,
                }),
              });
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
              <SaveStatusAndButton
                saving={saveState.kind === "saving"}
                savedAt={saveState.kind === "saved" ? saveState.at : saveState.kind === "idle" ? saveState.lastSavedAt : null}
                unsaved={saveState.kind === "dirty"}
                error={saveState.kind === "error" ? saveState.message : null}
                canEdit={canEdit}
                onSave={handleManualSave}
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
        />
      </div>
    </div>
    {/* TIM-2416 — the AI companion mounts inside the Business Plan workspace
        so Coach/Check/Benchmark are reachable from this view. Defaults to
        Check mode with whole-plan scope per UX spec §5.
        TIM-2382 — workspaceKey="business_plan" so suggest_workspace_changes
        proposals route to the BP section-write path; onApplySuggestions wires
        the AIReviewModal accept handler back to the workspace state. */}
    <CoPilotDrawer
      planId={planId}
      workspaceKey="business_plan"
      defaultMode="check"
      defaultScopeOverride={null}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      onApplySuggestions={handleApplyBusinessPlanSuggestions}
    />
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
    return (
      <SectionCard
        key={section.key}
        section={section}
        canEdit={props.canEdit}
        exampleContent={SUMMIT_STREET_EXAMPLES[section.key] ?? null}
        isStreaming={props.streamingKey === section.key}
        blurb={blurb}
        onToggleVisible={() => props.onToggleVisibility(section.key, section.isVisible)}
        onToggleExpand={() => props.onToggleExpand(section.key, section.isExpanded)}
        onEditStart={() => props.onEditStart(section.key, section.userContent ?? section.autoContent)}
        onEditChange={(val) => props.onEditChange(section.key, val)}
        onEditSave={() => props.onEditSave(section.key, section.editBuffer)}
        onEditCancel={() => props.onEditCancel(section.key, section.userContent ?? section.autoContent)}
        onResetToAuto={() => props.onResetToAuto(section.key)}
        onGenerateExec={props.onGenerateExec ? () => props.onGenerateExec!(section.key) : undefined}
        onImprove={props.onImprove ? () => props.onImprove!(section.key) : undefined}
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
  exampleContent: string | null;
  isStreaming: boolean;
  blurb: string;
  onToggleVisible: () => void;
  onToggleExpand: () => void;
  onEditStart: () => void;
  onEditChange: (val: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onResetToAuto: () => void;
  onGenerateExec?: () => void;
  onImprove?: () => void;
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

function StatusChip({ section }: { section: SectionState }) {
  const isDone = Boolean(section.userContent && section.userContent.trim().length > 0);
  const isGenerating = section.isGenerating;
  if (isGenerating) {
    return (
      <span className="flex items-center gap-1 text-[var(--teal)] shrink-0">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </span>
    );
  }
  if (isDone) {
    return (
      <span className="flex items-center gap-1 text-[var(--sage)] shrink-0">
        <CheckCircle className="w-3.5 h-3.5" />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[var(--neutral-cool-500)] shrink-0">
      <Circle className="w-3.5 h-3.5" />
    </span>
  );
}

function SectionCard({
  section,
  canEdit,
  exampleContent,
  isStreaming,
  blurb,
  onToggleVisible,
  onToggleExpand,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onResetToAuto,
  onGenerateExec,
  onImprove,
}: SectionCardProps) {
  const [showExample, setShowExample] = useState(false);
  const hasUserOverride = section.userContent !== null;
  const displayContent = section.isEditing
    ? section.editBuffer
    : (section.userContent ?? section.autoContent);

  const isPlaceholder =
    !displayContent ||
    displayContent.includes("workspace to populate") ||
    displayContent.includes("Click Generate") ||
    displayContent.includes("Complete the other") ||
    displayContent.includes("Complete the Marketing") ||
    displayContent.includes("complete the");

  return (
    <div
      className={`rounded-xl border bg-white transition-opacity ${
        section.isVisible ? "border-[var(--border)] opacity-100" : "border-[var(--neutral-cool-200)] opacity-60"
      }`}
    >
      {/* Header — TIM-1679: outer wrapper so AI chips reflow to a second row at <640px */}
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-center gap-2 sm:gap-3">
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
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold text-[var(--foreground)] truncate">{section.title}</h2>
                {!section.isExpanded && <StatusChip section={section} />}
              </div>
              {section.isExpanded ? (
                <p className="text-xs text-[var(--dark-grey)]">{section.sourceLabel}</p>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{blurb}</p>
              )}
            </div>
            {hasUserOverride && section.isExpanded && (
              <span className="ml-2 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[var(--success-bg-3)] text-[var(--success-dark)] border border-[var(--success-bg)]">
                Edited
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {/* AI chips — inline from sm: up only; mobile row rendered below */}
            {canEdit && section.isExpanded && !section.isEditing && !isStreaming && (
              <div className="hidden sm:flex items-center gap-2">
                {onGenerateExec && (
                  <button
                    onClick={onGenerateExec}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium text-[var(--teal)] border border-[var(--teal)] hover:bg-[var(--teal)] hover:text-white transition-colors"
                  >
                    <Wand2 className="w-3 h-3" />
                    Generate
                  </button>
                )}
                {onImprove && (
                  <button
                    onClick={onImprove}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium text-[var(--teal)] border border-[var(--teal)] hover:bg-[var(--teal)] hover:text-white transition-colors"
                  >
                    <Wand2 className="w-3 h-3" />
                    Improve
                  </button>
                )}
              </div>
            )}

            {canEdit && hasUserOverride && !section.isEditing && section.isExpanded && (
              <button
                onClick={onResetToAuto}
                title="Reset to auto-generated content"
                className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {exampleContent && section.isExpanded && (
              <button
                onClick={() => setShowExample((v) => !v)}
                title={showExample ? "Hide example" : "See a worked example"}
                className={`p-1.5 rounded-xl transition-colors ${
                  showExample
                    ? "text-[var(--teal)] bg-[var(--teal-50,#f0fdfa)]"
                    : "text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)]"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={onToggleVisible}
              title={section.isVisible ? "Hide from PDF" : "Include in PDF"}
              className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors"
            >
              {section.isVisible ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* TIM-1679: AI chips second row — mobile (<640px) only, mirrors Menu Suite CategoryHeader pattern */}
        {canEdit && section.isExpanded && !section.isEditing && !isStreaming && (onGenerateExec || onImprove) && (
          <div className="sm:hidden flex flex-wrap items-center gap-2 mt-2 pl-6">
            {onGenerateExec && (
              <button
                onClick={onGenerateExec}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium text-[var(--teal)] border border-[var(--teal)] hover:bg-[var(--teal)] hover:text-white transition-colors"
              >
                <Wand2 className="w-3 h-3" />
                Generate
              </button>
            )}
            {onImprove && (
              <button
                onClick={onImprove}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium text-[var(--teal)] border border-[var(--teal)] hover:bg-[var(--teal)] hover:text-white transition-colors"
              >
                <Wand2 className="w-3 h-3" />
                Improve
              </button>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {section.isExpanded && (
        <div className="px-5 pb-5">
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
                <textarea
                  value={section.editBuffer}
                  onChange={(e) => onEditChange(e.target.value)}
                  className="w-full min-h-[160px] text-sm text-[var(--foreground)] border border-[var(--gray-750)] rounded-xl px-3 py-2.5 resize-y focus-visible:outline-none focus:ring-1 focus:ring-[var(--teal)] leading-relaxed"
                  placeholder="Add content for this section..."
                  disabled={false}
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
                {displayContent ? (
                  isPlaceholder ? (
                    <p className="text-sm text-[var(--dark-grey)] italic leading-relaxed">{displayContent}</p>
                  ) : (
                    <MarkdownContent content={displayContent} />
                  )
                ) : (
                  <span className="text-[var(--dark-grey)] italic text-sm">No content yet.</span>
                )}
              </div>
            )}
          </div>

          {/* Worked example panel */}
          {showExample && exampleContent && (
            <div className="mt-4 rounded-xl border border-[var(--neutral-cool-200)] bg-[var(--neutral-cool-50,#f9fafb)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--neutral-cool-200)] bg-[var(--neutral-cool-100,#f3f4f6)]">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[var(--neutral-cool-600)]" aria-hidden="true" />
                  <span className="text-xs font-semibold text-[var(--neutral-cool-700,#374151)]">
                    Summit Street Coffee
                  </span>
                  <span className="text-[10px] text-[var(--neutral-cool-500,#6b7280)] font-normal">
                    (sample plan)
                  </span>
                </div>
                <button
                  onClick={() => setShowExample(false)}
                  className="p-0.5 rounded text-[var(--neutral-cool-500)] hover:text-[var(--foreground)] transition-colors"
                  aria-label="Close example"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-4 py-3">
                <MarkdownContent content={exampleContent} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
