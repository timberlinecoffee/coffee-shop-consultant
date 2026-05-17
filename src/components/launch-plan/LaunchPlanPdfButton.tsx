"use client";

// TIM-737: PDF export button for the W6 Launch Plan workspace.
// Calls GET /api/pdf/launch_plan_full_report and triggers a browser download.

import { useState, useCallback } from "react";

export function LaunchPlanPdfButton() {
  const [exporting, setExporting] = useState(false);

  const exportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/pdf/launch_plan_full_report", {
        credentials: "same-origin",
      });

      if (res.status === 402) {
        alert("PDF export requires an active subscription. Upgrade at groundwork.app/pricing.");
        return;
      }

      if (!res.ok) {
        alert("Export failed — please try again in a moment.");
        return;
      }

      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disp);
      const fallback = `groundwork-launch-plan-${new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "")}.pdf`;
      const filename = m?.[1] ?? fallback;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed — please try again in a moment.");
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  return (
    <button
      type="button"
      onClick={() => void exportPdf()}
      disabled={exporting}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-[#155e63] border border-[#155e63] hover:bg-[#155e63] hover:text-white disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
      aria-label="Export launch plan as PDF"
    >
      {exporting ? (
        <>
          <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
          Exporting…
        </>
      ) : (
        <>
          <span aria-hidden>↓</span>
          Export PDF
        </>
      )}
    </button>
  );
}
