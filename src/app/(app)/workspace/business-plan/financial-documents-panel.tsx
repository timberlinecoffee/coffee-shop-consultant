"use client";

// TIM-1483: Financial documents panel — per-document include/exclude picker.
// TIM-1496: Grouped by sub-block (Forecast / Financing / Statements / Appendix).

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FinancialDocumentKey, FinancialDocumentState } from "@/lib/business-plan-financials";
import { FINANCIAL_DOCUMENTS, FINANCIAL_SUB_BLOCKS } from "@/lib/business-plan-financials";

export type { FinancialDocumentState };

interface Props {
  initialDocuments: FinancialDocumentState[];
}

export function FinancialDocumentsPanel({ initialDocuments }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [documents, setDocuments] = useState<FinancialDocumentState[]>(initialDocuments);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const toggle = useCallback(async (key: FinancialDocumentKey, current: boolean) => {
    const next = !current;
    setDocuments((prev) =>
      prev.map((d) => (d.key === key ? { ...d, is_visible: next } : d))
    );

    try {
      const res = await fetch(`/api/business-plan/financial-documents/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_visible: next }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setDocuments((prev) =>
        prev.map((d) => (d.key === key ? { ...d, is_visible: current } : d))
      );
      setSaveStatus("error");
    }
  }, []);

  return (
    <div className="rounded-xl border border-[#efefef] bg-white mb-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 h-12 hover:bg-[#fafafa] transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--gray-slate-2)]">Financial Documents</span>
          {saveStatus === "saved" && (
            <span className="text-[11px] text-[var(--success)]">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="text-[11px] text-red-500">Changes could not be saved</span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--gray-medium)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--gray-medium)]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--gray-slate-5)] px-5 py-4">
          <p className="text-xs text-[var(--gray-medium)] mb-4">
            Choose which financial documents appear in your plan and PDF export.
          </p>

          <div className="space-y-5">
            {FINANCIAL_SUB_BLOCKS.map((subBlock) => {
              const blockDocs = documents.filter((d) => d.subBlock === subBlock.key);
              if (blockDocs.length === 0) return null;
              return (
                <div key={subBlock.key}>
                  <p className="text-[11px] font-semibold text-[var(--gray-slate-2)] uppercase tracking-wide mb-2">
                    {subBlock.title}
                  </p>
                  <div className="space-y-2 pl-1">
                    {blockDocs.map((doc) => (
                      <label
                        key={doc.key}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={doc.is_visible}
                          onChange={() => toggle(doc.key, doc.is_visible)}
                          className="w-4 h-4 rounded border-gray-300 text-[var(--teal)] focus:ring-[var(--teal)] cursor-pointer"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[var(--foreground)] group-hover:text-[var(--teal)] transition-colors">
                            {doc.title}
                          </p>
                          <p className="text-[11px] text-[var(--gray-medium)]">{doc.source}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

