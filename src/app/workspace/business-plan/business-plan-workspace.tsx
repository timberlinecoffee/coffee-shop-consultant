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
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [streamingKey, setStreamingKey] = useState<BusinessPlanSectionKey | null>(null);
  // TIM-1498: Default state -- all groups expanded; user can collapse per group.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<BusinessPlanGroupKey>>(new Set());

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
        (full) => {
          setStreamingKey(null);
          updateSection(sectionKey, { isGenerating: false, editBuffer: full });
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
  }, [updateSection]);

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

  // ── PDF export ─────────────────────────────────────────────────────────────

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

  const visibleCount = sections.filter((s) => s.isVisible).length;

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-20">
        {/* Page header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
            <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">
              Business Plan
            </h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Your complete business plan, assembled from every workspace. Edit each section in place or improve it with AI.
          </p>
        </header>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6 gap-3">
          <p className="text-xs text-[var(--neutral-cool-600)]">
            {visibleCount} of {sections.length} sections visible
          </p>
          <div className="flex items-center gap-2">
            {/* TIM-1062: HTML print bundles every workspace into one printable doc */}
            <a
              href="/workspace/business-plan/print"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--teal)] text-[var(--teal)] text-sm font-medium hover:bg-[var(--teal)] hover:text-white transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Print full plan
            </a>
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || !canEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--teal)] text-[var(--teal)] text-sm font-medium hover:bg-[var(--teal)] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              {isExportingPdf ? "Exporting..." : "Export PDF"}
            </button>
          </div>
        </div>

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
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-2 text-left"
          aria-expanded={section.isExpanded}
        >
          {section.isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--neutral-cool-600)] flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--neutral-cool-600)] flex-shrink-0" />
          )}
          <div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">{section.title}</h2>
            <p className="text-xs text-[var(--dark-grey)]">{section.sourceLabel}</p>
          </div>
          {hasUserOverride && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[var(--success-bg-3)] text-[var(--success-dark)] border border-[var(--success-bg)]">
              Edited
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          {canEdit && section.isExpanded && !section.isEditing && !isStreaming && !section.isGenerating && (
            <>
              {onGenerateExec && (
                <button
                  onClick={onGenerateExec}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--teal)] border border-[var(--teal)] hover:bg-[var(--teal)] hover:text-white transition-colors"
                >
                  <Wand2 className="w-3 h-3" />
                  Generate
                </button>
              )}
              {onImprove && (
                <button
                  onClick={onImprove}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--teal)] border border-[var(--teal)] hover:bg-[var(--teal)] hover:text-white transition-colors"
                >
                  <Wand2 className="w-3 h-3" />
                  Improve
                </button>
              )}
            </>
          )}


          {canEdit && hasUserOverride && !section.isEditing && section.isExpanded && (
            <button
              onClick={onResetToAuto}
              title="Reset to auto-generated content"
              className="p-1.5 rounded-lg text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {exampleContent && section.isExpanded && (
            <button
              onClick={() => setShowExample((v) => !v)}
              title={showExample ? "Hide example" : "See a worked example"}
              className={`p-1.5 rounded-lg transition-colors ${
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
            className="p-1.5 rounded-lg text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors"
          >
            {section.isVisible ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
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
