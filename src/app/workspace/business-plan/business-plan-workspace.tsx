"use client";

// TIM-1037: Business Plan Generator workspace — main client component.
// TIM-1225: adds Cover & Branding panel above section list.
// TIM-1315: adds worked example reference panel per section.

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { FileText, Eye, EyeOff, Wand2, RotateCcw, Download, ChevronDown, ChevronUp, BookOpen, X } from "lucide-react";
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
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { useAIReviewModal } from "@/hooks/useAIReviewModal";
import { RegenerateAllButton } from "./regenerate-all-button";
import { ExportGateModal, type ValidationReport } from "./export-gate-modal";

interface Props {
  planId: string;
  shopName: string;
  initialSections: BusinessPlanSectionData[];
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialCoverSettings: CoverSettings;
  logoPublicUrl: string | null;
  initialFinancialDocuments: FinancialDocumentState[];
}

interface SectionState extends BusinessPlanSectionData {
  isExpanded: boolean;
  isEditing: boolean;
  editBuffer: string;
  isGenerating: boolean;
  isSaving: boolean;
}

// ── SSE fetch helper ──────────────────────────────────────────────────────────

// TIM-2342: estimated_claims arrives on the "done" event from /generate. Pass
// it back to onDone so the workspace can persist it via PATCH alongside
// user_content. Shape mirrors EstimatedClaim in source-markers.ts; the SSE
// helper keeps it opaque (the consumer types it).
interface SseDoneExtras {
  estimated_claims?: unknown;
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

// ── Main component ────────────────────────────────────────────────────────────

export function BusinessPlanWorkspace({
  shopName,
  initialSections,
  canEdit,
  initialCoverSettings,
  logoPublicUrl,
  initialFinancialDocuments,
}: Props) {
  const [sections, setSections] = useState<SectionState[]>(
    initialSections.map((s) => ({
      ...s,
      isExpanded: true,
      isEditing: false,
      editBuffer: s.userContent ?? s.autoContent,
      isGenerating: false,
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
  const [streamingKey, setStreamingKey] = useState<BusinessPlanSectionKey | null>(null);
  // TIM-1498: Default state -- all groups expanded; user can collapse per group.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<BusinessPlanGroupKey>>(new Set());
  const { openAIReviewModal, updateAIReviewModal, AIReviewModalNode } = useAIReviewModal();

  const { promoteOnEdit } = useWorkspaceStatus();
  // Auto-promote not_started → in_progress once any section has user content.
  const hasContent = sections.some((s) => s.userContent || s.autoContent);
  useEffect(() => {
    if (hasContent) promoteOnEdit("business_plan");
  }, [hasContent, promoteOnEdit]);

  const abortRef = useRef<AbortController | null>(null);
  const streamBufRef = useRef<string>("");

  // ── Section helpers ────────────────────────────────────────────────────────

  const updateSection = useCallback((key: BusinessPlanSectionKey, patch: Partial<SectionState>) => {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const saveSection = useCallback(async (key: BusinessPlanSectionKey, userContent: string | null) => {
    updateSection(key, { isSaving: true });
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
    } catch {
      updateSection(key, { isSaving: false });
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

  // ── AI streaming ───────────────────────────────────────────────────────────

  const runStream = useCallback(async (
    url: string,
    body: Record<string, unknown>,
    sectionKey: BusinessPlanSectionKey
  ) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    streamBufRef.current = "";

    updateSection(sectionKey, { isGenerating: true, isEditing: true, editBuffer: "" });
    setStreamingKey(sectionKey);

    try {
      await fetchSse(
        url,
        body,
        (chunk) => {
          streamBufRef.current += chunk;
          const buf = streamBufRef.current;
          updateSection(sectionKey, { editBuffer: buf });
        },
        (full, extras) => {
          setStreamingKey(null);
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
          openAIReviewModal({
            suggestions: [
              {
                id: `bp-${sectionKey}`,
                fieldId: sectionKey,
                fieldLabel: sectionMeta?.title ?? sectionKey,
                originalValue,
                proposedValue: full,
                isStructured: false,
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
          // Clear the inline edit buffer — the modal owns the review step.
          updateSection(sectionKey, { isGenerating: false, isEditing: false, editBuffer: originalValue });
        },
        (msg) => {
          setStreamingKey(null);
          updateSection(sectionKey, { isGenerating: false });
          setGlobalError(msg);
        },
        controller.signal
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setGlobalError(err.message);
      }
      setStreamingKey(null);
      updateSection(sectionKey, { isGenerating: false });
    }
  }, [updateSection, sections, openAIReviewModal, setSections]);

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

  const handleSectionPatchedFromGate = useCallback((sectionKey: string, newContent: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === sectionKey ? { ...s, userContent: newContent, editBuffer: newContent } : s)),
    );
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  const visibleCount = sections.filter((s) => s.isVisible).length;

  return (
    <>
    {AIReviewModalNode}
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
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-20">
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
              {/* TIM-1937 (board refinement bae7ef73): primary first, then
                  secondaries. Labels collapse to icon-only below 1536px. */}
              <WorkspaceActionButton
                variant="primary"
                onClick={handleExportPdf}
                disabled={isExportingPdf || isValidating || !canEdit}
                aria-label="Export PDF"
                title="Export PDF"
              >
                <Download size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                <span className="hidden min-[1536px]:inline">
                  {isExportingPdf || isValidating ? "Checking..." : "Export PDF"}
                </span>
              </WorkspaceActionButton>
              {/* TIM-1551: Print drives through the same PDF renderer as Export. */}
              <WorkspaceActionButton
                onClick={handlePrintPlan}
                disabled={isPrintingPdf || isValidating || !canEdit}
                aria-label="Print Business Plan"
                title="Print Business Plan"
              >
                <FileText size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                <span className="hidden min-[1536px]:inline">
                  {isPrintingPdf || isValidating ? "Checking..." : "Print Business Plan"}
                </span>
              </WorkspaceActionButton>
              {/* TIM-2331: Regenerate every section from current platform data. */}
              <RegenerateAllButton
                disabled={!canEdit || streamingKey !== null}
                getCurrentSections={() =>
                  sections.map((s) => ({
                    key: s.key,
                    title: s.title,
                    currentContent: s.userContent ?? s.autoContent,
                  }))
                }
                openAIReviewModal={openAIReviewModal}
                updateAIReviewModal={updateAIReviewModal}
                onSectionApplied={(key, finalValue) => {
                  setSections((prev) =>
                    prev.map((s) =>
                      s.key === key ? { ...s, userContent: finalValue } : s,
                    ),
                  );
                }}
                onError={(msg) => setGlobalError(msg)}
              />
            </>
          }
        />

        <p className="text-xs text-[var(--neutral-cool-600)] mb-6">
          {visibleCount} of {sections.length} sections visible
        </p>

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
          streamingKey={streamingKey}
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
          onEditChange={(key, val) => updateSection(key, { editBuffer: val })}
          onEditSave={(key, buf, isGenerating) => {
            if (isGenerating) {
              handleSaveAfterImprove(key, buf);
              updateSection(key, { isEditing: false, isGenerating: false });
            } else {
              saveSection(key, buf || null);
            }
          }}
          onEditCancel={(key, fallback) => {
            if (abortRef.current) abortRef.current.abort();
            setStreamingKey(null);
            updateSection(key, {
              isEditing: false,
              isGenerating: false,
              editBuffer: fallback,
            });
          }}
          onResetToAuto={(key) => saveSection(key, null)}
          onGenerateExec={(key) => handleGenerate(key)}
          onImprove={(key) => handleImprove(key)}
        />
      </div>
    </div>
    </>
  );
}

// ── SectionTree (two-level group + subsection renderer) ──────────────────────

interface SectionTreeProps {
  sections: SectionState[];
  canEdit: boolean;
  streamingKey: BusinessPlanSectionKey | null;
  collapsedGroups: Set<BusinessPlanGroupKey>;
  onToggleGroup: (group: BusinessPlanGroupKey) => void;
  onToggleVisibility: (key: BusinessPlanSectionKey, current: boolean) => void;
  onToggleExpand: (key: BusinessPlanSectionKey, current: boolean) => void;
  onEditStart: (key: BusinessPlanSectionKey, content: string) => void;
  onEditChange: (key: BusinessPlanSectionKey, val: string) => void;
  onEditSave: (key: BusinessPlanSectionKey, buf: string, isGenerating: boolean) => void;
  onEditCancel: (key: BusinessPlanSectionKey, fallback: string) => void;
  onResetToAuto: (key: BusinessPlanSectionKey) => void;
  onGenerateExec: (key: BusinessPlanSectionKey) => void;
  onImprove: (key: BusinessPlanSectionKey) => void;
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
    return (
      <SectionCard
        key={section.key}
        section={section}
        canEdit={props.canEdit}
        exampleContent={SUMMIT_STREET_EXAMPLES[section.key] ?? null}
        isStreaming={props.streamingKey === section.key}
        onToggleVisible={() => props.onToggleVisibility(section.key, section.isVisible)}
        onToggleExpand={() => props.onToggleExpand(section.key, section.isExpanded)}
        onEditStart={() => props.onEditStart(section.key, section.userContent ?? section.autoContent)}
        onEditChange={(val) => props.onEditChange(section.key, val)}
        onEditSave={() => props.onEditSave(section.key, section.editBuffer, section.isGenerating)}
        onEditCancel={() => props.onEditCancel(section.key, section.userContent ?? section.autoContent)}
        onResetToAuto={() => props.onResetToAuto(section.key)}
        onGenerateExec={() => props.onGenerateExec(section.key)}
        onImprove={() => props.onImprove(section.key)}
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
      {content}
    </ReactMarkdown>
  );
}

function SectionCard({
  section,
  canEdit,
  exampleContent,
  isStreaming,
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
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-[var(--foreground)] truncate">{section.title}</h2>
              <p className="text-xs text-[var(--dark-grey)]">{section.sourceLabel}</p>
            </div>
            {hasUserOverride && (
              <span className="ml-2 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[var(--success-bg-3)] text-[var(--success-dark)] border border-[var(--success-bg)]">
                Edited
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {/* AI chips — inline from sm: up only; mobile row rendered below */}
            {canEdit && section.isExpanded && !section.isEditing && !isStreaming && !section.isGenerating && (
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
        {canEdit && section.isExpanded && !section.isEditing && !isStreaming && !section.isGenerating && (onGenerateExec || onImprove) && (
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
            {(isStreaming || section.isGenerating) && !section.editBuffer && (
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
                  disabled={section.isGenerating && !section.editBuffer}
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
                    {section.isGenerating ? "Stop" : "Cancel"}
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
