"use client";

// TIM-1037: Business Plan Generator workspace — main client component.
// TIM-1225: adds Cover & Branding panel above section list.

import { useState, useRef, useCallback } from "react";
import { FileText, Eye, EyeOff, Wand2, RotateCcw, Download, ChevronDown, ChevronUp } from "lucide-react";
import type { BusinessPlanSectionData, BusinessPlanSectionKey } from "@/lib/business-plan";
import { CoverBrandingPanel, type CoverSettings } from "./cover-branding-panel";

interface Props {
  planId: string;
  shopName: string;
  initialSections: BusinessPlanSectionData[];
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialCoverSettings: CoverSettings;
  logoPublicUrl: string | null;
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

  const handleGenerateExecSummary = useCallback(async () => {
    await runStream("/api/business-plan/generate", {}, "executive_summary");
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
    <div className="bg-[#faf9f7] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-20">
        {/* Page header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-[#155e63] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>
              Business Plan
            </h1>
          </div>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Your complete business plan, assembled from every workspace. Edit each section in place or improve it with AI.
          </p>
        </header>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6 gap-3">
          <p className="text-xs text-[#888]">
            {visibleCount} of {sections.length} sections visible
          </p>
          <div className="flex items-center gap-2">
            {/* TIM-1062: HTML print bundles every workspace into one printable doc */}
            <a
              href="/workspace/business-plan/print"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#155e63] text-[#155e63] text-sm font-medium hover:bg-[#155e63] hover:text-white transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Print full plan
            </a>
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || !canEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#155e63] text-[#155e63] text-sm font-medium hover:bg-[#155e63] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section) => (
            <SectionCard
              key={section.key}
              section={section}
              canEdit={canEdit}
              isStreaming={streamingKey === section.key}
              onToggleVisible={() => toggleVisibility(section.key, section.isVisible)}
              onToggleExpand={() => updateSection(section.key, { isExpanded: !section.isExpanded })}
              onEditStart={() =>
                updateSection(section.key, {
                  isEditing: true,
                  editBuffer: section.userContent ?? section.autoContent,
                })
              }
              onEditChange={(val) => updateSection(section.key, { editBuffer: val })}
              onEditSave={() => {
                const buf = section.editBuffer;
                if (section.isGenerating) {
                  // accept AI result
                  handleSaveAfterImprove(section.key, buf);
                  updateSection(section.key, { isEditing: false, isGenerating: false });
                } else {
                  saveSection(section.key, buf || null);
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
              onGenerateExec={section.key === "executive_summary" ? handleGenerateExecSummary : undefined}
              onImprove={section.key !== "executive_summary" ? () => handleImprove(section.key) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: SectionState;
  canEdit: boolean;
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

function SectionCard({
  section,
  canEdit,
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
      className={`rounded-2xl border bg-white transition-opacity ${
        section.isVisible ? "border-[#efefef] opacity-100" : "border-[#e8e8e8] opacity-60"
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
            <ChevronUp className="w-4 h-4 text-[#888] flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#888] flex-shrink-0" />
          )}
          <div>
            <h2 className="text-sm font-semibold text-[#1a1a1a]">{section.title}</h2>
            <p className="text-xs text-[#afafaf]">{section.sourceLabel}</p>
          </div>
          {hasUserOverride && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]">
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
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#155e63] border border-[#155e63] hover:bg-[#155e63] hover:text-white transition-colors"
                >
                  <Wand2 className="w-3 h-3" />
                  Generate
                </button>
              )}
              {onImprove && !isPlaceholder && (
                <button
                  onClick={onImprove}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#155e63] border border-[#155e63] hover:bg-[#155e63] hover:text-white transition-colors"
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
              className="p-1.5 rounded-lg text-[#888] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onToggleVisible}
            title={section.isVisible ? "Hide from PDF" : "Include in PDF"}
            className="p-1.5 rounded-lg text-[#888] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
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
          <div className="border-t border-[#f0f0f0] pt-4">
            {(isStreaming || section.isGenerating) && !section.editBuffer && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#155e63] animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-[#6b6b6b]">Writing...</span>
              </div>
            )}

            {section.isEditing ? (
              <div>
                <textarea
                  value={section.editBuffer}
                  onChange={(e) => onEditChange(e.target.value)}
                  className="w-full min-h-[160px] text-sm text-[#1a1a1a] border border-[#d8d8d8] rounded-xl px-3 py-2.5 resize-y focus:outline-none focus:ring-1 focus:ring-[#155e63] font-mono leading-relaxed"
                  placeholder="Add content for this section..."
                  disabled={section.isGenerating && !section.editBuffer}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={onEditSave}
                    disabled={section.isSaving}
                    className="px-3 py-1.5 rounded-lg bg-[#155e63] text-white text-xs font-medium hover:bg-[#0e4a4e] transition-colors disabled:opacity-50"
                  >
                    {section.isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={onEditCancel}
                    className="px-3 py-1.5 rounded-lg border border-[#d8d8d8] text-[#555] text-xs font-medium hover:bg-[#f5f5f5] transition-colors"
                  >
                    {section.isGenerating ? "Stop" : "Cancel"}
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={canEdit && !isStreaming ? onEditStart : undefined}
                className={`text-sm text-[#1a1a1a] leading-relaxed whitespace-pre-wrap ${
                  canEdit && !isStreaming
                    ? "cursor-text rounded-lg hover:bg-[#fafafa] -mx-1 px-1 py-0.5 transition-colors"
                    : ""
                } ${isPlaceholder ? "text-[#afafaf] italic" : ""}`}
                title={canEdit && !isPlaceholder ? "Click to edit" : undefined}
              >
                {displayContent || (
                  <span className="text-[#afafaf] italic">No content yet.</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
