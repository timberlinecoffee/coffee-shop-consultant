"use client";

// TIM-728: PDF export button for the W5 Build-out & Equipment workspace.
// Calls GET /api/pdf/buildout_plan and triggers a browser download.

import { useState, useCallback } from "react";

export function BuildoutPlanPdfButton() {
  const [exporting, setExporting] = useState(false);

  const exportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/pdf/buildout_plan", {
        credentials: "same-origin",
      });

      if (res.status === 402) {
        alert(
          "PDF export requires an active subscription. Upgrade at groundwork.app/pricing."
        );
        return;
      }

      if (!res.ok) {
        alert("Export failed — please try again in a moment.");
        return;
      }

      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disp);
      const fallback = `groundwork-buildout-plan-${new Date()
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
      aria-label="Export build-out plan as PDF"
    >
      {exporting ? (
        <>
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Exporting…
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
            <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
          </svg>
          Export PDF
        </>
      )}
    </button>
  );
}
