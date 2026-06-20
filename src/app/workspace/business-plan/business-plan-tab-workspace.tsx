"use client";

// TIM-2759: Business Plan V2 — tabbed workspace client component.
// Renders one tab's worth of BP sections inside the V2 chrome:
//   - Full-screen width (matches Financials, spec §7)
//   - BusinessPlanSubNav pill tabs (spec §4)
//   - Generate (primary) + Export PDF + Print visible in WorkspaceHeader (spec §3)
//   - CoverBrandingPanel on executive-summary tab only (spec §6)
//   - FinancialDocumentsPanel on financial-plan tab only (spec §6)
//   - SaveIndicator (indicator only — BP sections auto-save) at far right (spec §3)
//
// All section-rendering logic re-uses SectionCard/SectionTree from
// business-plan-workspace.tsx via shared imports; state management mirrors V1.

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { FileText, Eye, EyeOff, Wand2, RotateCcw, Download, ChevronDown, ChevronUp, BookOpen, X, Sparkles, Printer } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type {
  BusinessPlanSectionData,
  BusinessPlanSectionKey,
} from "@/lib/business-plan";
import { BUSINESS_PLAN_SECTIONS } from "@/lib/business-plan";
import { SUMMIT_STREET_EXAMPLES } from "@/lib/business-plan-examples";
import { CoverBrandingPanel, type CoverSettings } from "./cover-branding-panel";
import { FinancialDocumentsPanel, type FinancialDocumentState } from "./financial-documents-panel";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { SaveIndicator } from "@/components/ui/save-indicator";
import { useAIReviewModal } from "@/hooks/useAIReviewModal";
import { BusinessPlanSubNav } from "@/components/business-plan/BusinessPlanSubNav";

type BpTab =
  | "executive-summary"
  | "opportunity"
  | "execution"
  | "company"
  | "financial-plan"
  | "appendix";

// Sections included on each tab — maps to the actual BusinessPlanSectionKey
// values that exist in the library. Spec §5 lists additional keys planned for
// future TIMs (opportunity-risks, financial-plan-unit-economics, etc.); those
// will be added here when the lib/business-plan.ts type is extended.
const TAB_SECTION_KEYS: Record<BpTab, ReadonlyArray<BusinessPlanSectionKey>> = {
  "executive-summary": ["executive-summary"],
  "opportunity": [
    "opportunity-problem-solution",
    "opportunity-target-market",
    "opportunity-competition",
  ],
  "execution": [
    "execution-marketing-sales",
    "execution-operations",
    "execution-milestones-metrics",
  ],
  "company": ["company-overview", "company-team"],
  "financial-plan": [
    "financial-plan-forecast",
    "financial-plan-financing",
    "financial-plan-statements",
  ],
  "appendix": ["appendix-monthly-statements"],
};

// Sections that can be AI-generated (have "Click Generate" placeholder content).
const AI_GENERATABLE_KEYS = new Set<BusinessPlanSectionKey>([
  "executive-summary",
  "opportunity-problem-solution",
  "opportunity-competition",
  "financial-plan-financing",
]);

interface Props {
  tabKey: BpTab;
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

async function fetchSse(
  url: string,
  body: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone: (full: string) => void,
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
          onDone(full || ((parsed.text as string) ?? ""));
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

export function BusinessPlanTabWorkspace({
  tabKey,
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
  const [isGeneratingTab, setIsGeneratingTab] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [streamingKey, setStreamingKey] = useState<BusinessPlanSectionKey | null>(null);
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();

  const { promoteOnEdit } = useWorkspaceStatus();
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
          updateSection(sectionKey, { editBuffer: streamBufRef.current });
        },
        (full) => {
          setStreamingKey(null);
          const sectionMeta = BUSINESS_PLAN_SECTIONS.find((s) => s.key === sectionKey);
          const currentSection = sections.find((s) => s.key === sectionKey);
          const originalValue = currentSection?.userContent ?? currentSection?.autoContent ?? "";
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
              await fetch(`/api/business-plan/sections/${sectionKey}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_content: full }),
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
  }, [updateSection, sections, openAIReviewModal]);

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

  // ── Tab-scoped Generate ────────────────────────────────────────────────────
  // Generates all AI-generatable sections on the current tab in sequence.

  const tabSectionKeys = TAB_SECTION_KEYS[tabKey];
  const generatableKeys = tabSectionKeys.filter((k) => AI_GENERATABLE_KEYS.has(k));

  const handleTabGenerate = useCallback(async () => {
    if (isGeneratingTab || !canEdit || generatableKeys.length === 0) return;
    setIsGeneratingTab(true);
    setGlobalError(null);
    for (const key of generatableKeys) {
      if (abortRef.current?.signal.aborted) break;
      await handleGenerate(key);
    }
    setIsGeneratingTab(false);
  }, [isGeneratingTab, canEdit, generatableKeys, handleGenerate]);

  // ── PDF export / print ──────────────────────────────────────────────────────

  const handlePrintPlan = useCallback(async () => {
    setIsPrintingPdf(true);
    try {
      const res = await fetch("/api/pdf/business_plan_full");
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (res.status === 402) {
          setGlobalError("PDF export requires a paid subscription.");
        } else {
          setGlobalError((j.error as string) ?? "PDF generation failed");
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setIsPrintingPdf(false);
    }
  }, []);

  const handleExportPdf = useCallback(async () => {
    setIsExportingPdf(true);
    try {
      const res = await fetch("/api/pdf/business_plan_full");
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (res.status === 402) {
          setGlobalError("PDF export requires a paid subscription.");
        } else {
          setGlobalError((j.error as string) ?? "PDF export failed");
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = shopName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "business-plan";
      a.download = `${slug}-business-plan.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingPdf(false);
    }
  }, [shopName]);

  // ── Render ──────────────────────────────────────────────────────────────────

  // Filter all sections down to those on the active tab.
  const tabSections = useMemo(() => {
    const keys = new Set(tabSectionKeys);
    return sections.filter((s) => keys.has(s.key));
  }, [sections, tabSectionKeys]);

  const isBusy = streamingKey !== null || isGeneratingTab;

  return (
    <>
      {AIReviewModalNode}
      <div className="bg-[var(--background)] min-h-screen">
        {/* V2: full-width per spec §7 — matches financials-workspace chrome. */}
        <div className="w-full px-6 pt-8 pb-16">
          <WorkspaceHeader
            Icon={FileText}
            title="Business Plan"
            description="Your complete business plan, assembled from every workspace. Edit each section in place or improve it with AI."
            actions={
              <>
                {/* Generate: primary, tab-scoped — spec §3. */}
                <WorkspaceActionButton
                  variant="primary"
                  onClick={handleTabGenerate}
                  disabled={isBusy || !canEdit || generatableKeys.length === 0}
                  aria-label="Generate sections on this tab"
                  title={generatableKeys.length === 0 ? "No AI-generatable sections on this tab" : "Generate AI sections on this tab"}
                >
                  <Sparkles size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                  <span>{isGeneratingTab ? "Generating..." : "Generate"}</span>
                </WorkspaceActionButton>
                {/* Export PDF: outlined — spec §3. */}
                <WorkspaceActionButton
                  onClick={handleExportPdf}
                  disabled={isExportingPdf || !canEdit}
                  aria-label="Export PDF"
                  title="Export PDF"
                >
                  <Download size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                  <span>{isExportingPdf ? "Exporting..." : "Export PDF"}</span>
                </WorkspaceActionButton>
                {/* Print: outlined — spec §3. */}
                <WorkspaceActionButton
                  onClick={handlePrintPlan}
                  disabled={isPrintingPdf || !canEdit}
                  aria-label="Print"
                  title="Print"
                >
                  <Printer size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                  <span>{isPrintingPdf ? "Preparing..." : "Print"}</span>
                </WorkspaceActionButton>
                {/* SaveIndicator only — BP auto-saves per section, no global Save button. */}
                <div className="flex items-center pl-3 border-l border-[var(--border)] shrink-0">
                  <SaveIndicator
                    saving={sections.some((s) => s.isSaving)}
                    savedAt={null}
                    canEdit={canEdit}
                    onRetry={() => {}}
                  />
                </div>
              </>
            }
          />

          {/* Sub-nav — spec §4. */}
          <BusinessPlanSubNav active={tabKey} />

          {globalError && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {globalError}
              <button onClick={() => setGlobalError(null)} className="ml-3 underline text-xs">
                Dismiss
              </button>
            </div>
          )}

          {/* Cover & Branding panel — Executive Summary tab only (spec §6). */}
          {tabKey === "executive-summary" && (
            <CoverBrandingPanel
              initialSettings={initialCoverSettings}
              logoPublicUrl={logoPublicUrl}
              shopName={shopName}
            />
          )}

          {/* Financial Documents panel — Financial Plan tab only (spec §6). */}
          {tabKey === "financial-plan" && (
            <FinancialDocumentsPanel initialDocuments={initialFinancialDocuments} />
          )}

          <div className="space-y-4">
            {tabSections.map((section) => (
              <div key={section.key} id={`bp-section-${section.key}`}>
                <SectionCard
                  section={section}
                  canEdit={canEdit}
                  exampleContent={SUMMIT_STREET_EXAMPLES[section.key] ?? null}
                  isStreaming={streamingKey === section.key}
                  onToggleVisible={() => toggleVisibility(section.key, section.isVisible)}
                  onToggleExpand={() => updateSection(section.key, { isExpanded: !section.isExpanded })}
                  onEditStart={() => updateSection(section.key, { isEditing: true, editBuffer: section.userContent ?? section.autoContent })}
                  onEditChange={(val) => updateSection(section.key, { editBuffer: val })}
                  onEditSave={() => {
                    if (section.isGenerating) {
                      void handleSaveAfterImprove(section.key, section.editBuffer);
                      updateSection(section.key, { isEditing: false, isGenerating: false });
                    } else {
                      void saveSection(section.key, section.editBuffer || null);
                    }
                  }}
                  onEditCancel={() => {
                    if (abortRef.current) abortRef.current.abort();
                    setStreamingKey(null);
                    updateSection(section.key, {
                      isEditing: false,
                      isGenerating: false,
                      editBuffer: section.userContent ?? section.autoContent,
                    });
                  }}
                  onResetToAuto={() => saveSection(section.key, null)}
                  onGenerateExec={() => handleGenerate(section.key)}
                  onImprove={() => handleImprove(section.key)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
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
    displayContent.includes("complete the");

  return (
    <div
      className={`rounded-xl border bg-white transition-opacity ${
        section.isVisible ? "border-[var(--border)] opacity-100" : "border-[var(--neutral-cool-200)] opacity-60"
      }`}
    >
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleExpand}
            type="button"
            className="p-0.5 rounded text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
            aria-label={section.isExpanded ? "Collapse section" : "Expand section"}
          >
            {section.isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          <h3 className="text-sm font-semibold text-[var(--foreground)] flex-1 min-w-0 truncate">
            {section.title}
          </h3>

          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
            {section.isExpanded && canEdit && (
              <>
                {onGenerateExec && (
                  <button
                    type="button"
                    onClick={onGenerateExec}
                    disabled={isStreaming || section.isGenerating}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--teal)]/10 text-[var(--teal)] hover:bg-[var(--teal)]/20 transition-colors disabled:opacity-50"
                  >
                    <Wand2 size={10} aria-hidden="true" />
                    {section.isGenerating ? "Generating..." : "Generate"}
                  </button>
                )}
                {onImprove && hasUserOverride && (
                  <button
                    type="button"
                    onClick={onImprove}
                    disabled={isStreaming || section.isGenerating}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--neutral-cool-100)] text-[var(--neutral-cool-700)] hover:bg-[var(--neutral-cool-200)] transition-colors disabled:opacity-50"
                  >
                    <Sparkles size={10} aria-hidden="true" />
                    Improve
                  </button>
                )}
                {hasUserOverride && (
                  <button
                    type="button"
                    onClick={onResetToAuto}
                    title="Reset to auto-generated content"
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--neutral-cool-100)] text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <RotateCcw size={10} aria-hidden="true" />
                    Reset
                  </button>
                )}
                {exampleContent && (
                  <button
                    type="button"
                    onClick={() => setShowExample((v) => !v)}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--neutral-cool-100)] text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] transition-colors"
                    aria-label={showExample ? "Hide example" : "Show example"}
                  >
                    <BookOpen size={10} aria-hidden="true" />
                    {showExample ? "Hide example" : "Example"}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onToggleVisible}
              className="p-1 rounded text-[var(--neutral-cool-500)] hover:text-[var(--foreground)] transition-colors"
              aria-label={section.isVisible ? "Hide in PDF" : "Show in PDF"}
              title={section.isVisible ? "Hide in PDF" : "Show in PDF"}
            >
              {section.isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
        </div>

        <p className="mt-0.5 ml-6 text-[10px] text-[var(--neutral-cool-500)]">
          {section.sourceLabel}
          {hasUserOverride && (
            <span className="ml-1.5 text-[var(--teal)] font-medium">· Edited</span>
          )}
        </p>
      </div>

      {section.isExpanded && (
        <div className="px-4 sm:px-5 pb-5">
          {showExample && exampleContent && (
            <div className="mb-4 p-3 rounded-lg bg-[var(--neutral-cool-50)] border border-[var(--neutral-cool-200)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-[var(--neutral-cool-600)] uppercase tracking-wide">
                  Example
                </span>
                <button
                  type="button"
                  onClick={() => setShowExample(false)}
                  className="text-[var(--neutral-cool-500)] hover:text-[var(--foreground)]"
                  aria-label="Close example"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="text-xs text-[var(--neutral-cool-700)] leading-relaxed whitespace-pre-wrap">
                {exampleContent}
              </div>
            </div>
          )}

          {section.isEditing ? (
            <div className="space-y-2">
              <textarea
                className="w-full min-h-[160px] text-sm text-[var(--foreground)] bg-[var(--neutral-cool-50)] border border-[var(--border)] rounded-lg px-3 py-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/40"
                value={section.editBuffer}
                onChange={(e) => onEditChange(e.target.value)}
                disabled={isStreaming && section.isGenerating}
                placeholder="Start typing your content..."
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onEditSave}
                  disabled={section.isSaving}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white hover:bg-[var(--teal-deep)] transition-colors disabled:opacity-50"
                >
                  {section.isSaving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={onEditCancel}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`group relative ${canEdit ? "cursor-text" : ""}`}
              onClick={canEdit ? onEditStart : undefined}
            >
              {isPlaceholder ? (
                <p className="text-sm text-[var(--neutral-cool-500)] italic leading-relaxed">
                  {displayContent || "No content yet."}
                </p>
              ) : (
                <div className="prose prose-sm max-w-none">
                  <MarkdownContent content={displayContent} />
                </div>
              )}
              {canEdit && !isPlaceholder && (
                <div className="absolute inset-0 rounded-lg ring-2 ring-[var(--teal)]/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
