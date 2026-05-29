"use client";

import { useState, useCallback } from "react";
import { usePaywallGuard } from "@/lib/use-paywall-guard";

export function MenuPricingExportButton() {
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const { guardedFetch } = usePaywallGuard();

  const exportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await guardedFetch("/api/pdf/menu_card_with_cost_analysis");
      if (!res) return; // 402 handled by paywall guard
      if (!res.ok) {
        setToast({ type: "error", msg: "Export failed — try again in a moment." });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disp);
      const fallback = `groundwork-menu-card-${new Date()
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
      setToast({ type: "success", msg: "Downloaded" });
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast({ type: "error", msg: "Export failed — try again in a moment." });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setExporting(false);
    }
  }, [exporting, guardedFetch]);

  return (
    <>
      <button
        onClick={exportPdf}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--teal)] text-[var(--teal)] text-xs font-medium hover:bg-[var(--teal)] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Export menu as PDF"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {exporting ? "Exporting…" : "Export PDF"}
      </button>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg text-white ${
            toast.type === "success" ? "bg-[var(--teal)]" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
