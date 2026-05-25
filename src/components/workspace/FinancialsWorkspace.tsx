"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePaywallGuard } from "@/lib/use-paywall-guard";
import { PaywallModal } from "@/components/paywall-modal";
import { parseFinancialsContent } from "@/lib/financials/schema";
import { EMPTY_FINANCIALS } from "@/lib/financials/defaults";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import type {
  FinancialsContent,
  StartupCostLine,
  RevenueLine,
  LaborLine,
  FixedCostLine,
  FundingLine,
  StartupCostCategory,
  RevenueStream,
  LaborRole,
  FixedCostCategory,
  FundingSource,
} from "@/types/financials";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function parseCents(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, "") || "0");
  return Math.max(0, Math.round(n * 100));
}

function newId(): string {
  return crypto.randomUUID();
}

// ─── sub-components ──────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-[#efefef] p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#1a1a1a]">{title}</h2>
        {description && (
          <p className="text-sm text-[#6b6b6b] mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  message,
  action,
}: {
  message: string;
  action: React.ReactNode;
}) {
  return (
    <div className="text-center py-8 px-4">
      <div
        className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#faf9f7] border border-[#efefef] flex items-center justify-center"
        aria-hidden="true"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#afafaf"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <p className="text-sm text-[#888] mb-4">{message}</p>
      {action}
    </div>
  );
}

function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-[#155e63] hover:text-[#0e4448] transition-colors"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {label}
    </button>
  );
}

function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 p-1.5 rounded-lg text-[#afafaf] hover:text-red-500 hover:bg-red-50 transition-colors"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4h6v2" />
      </svg>
    </button>
  );
}

function TotalRow({
  label,
  cents,
  highlight,
}: {
  label: string;
  cents: number;
  highlight?: "green" | "red" | "neutral";
}) {
  const color =
    highlight === "green"
      ? "text-green-700"
      : highlight === "red"
      ? "text-red-600"
      : "text-[#1a1a1a]";
  return (
    <div className="flex justify-between items-center pt-3 border-t border-[#efefef] mt-3">
      <span className="text-sm font-medium text-[#6b6b6b]">{label}</span>
      <span className={`text-base font-semibold ${color}`}>
        ${fmtMoney(cents)}
      </span>
    </div>
  );
}

function inputCls(extraCls?: string) {
  return `block w-full rounded-lg border border-[#efefef] bg-[#faf9f7] px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:border-[#155e63] focus:outline-none focus:ring-1 focus:ring-[#155e63] ${extraCls ?? ""}`;
}

function selectCls() {
  return "block w-full rounded-lg border border-[#efefef] bg-[#faf9f7] px-3 py-2 text-sm text-[#1a1a1a] focus:border-[#155e63] focus:outline-none focus:ring-1 focus:ring-[#155e63] appearance-none";
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({
  type,
  message,
  onDismiss,
}: {
  type: "success" | "error";
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all ${
        type === "success"
          ? "bg-[#155e63] text-white"
          : "bg-red-600 text-white"
      }`}
    >
      {type === "success" ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      )}
      {message}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-1 opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

// ─── P&L summary helpers ─────────────────────────────────────────────────────

function computePnl(pnl: FinancialsContent["monthly_pnl"]) {
  const totalRevenue = pnl.revenue.reduce((s, r) => s + r.monthly_cents, 0);
  const cogs = Math.round(totalRevenue * (pnl.cogs_percent / 100));
  const grossProfit = totalRevenue - cogs;
  const totalLabor = pnl.labor.reduce((s, l) => s + l.monthly_cents, 0);
  const totalFixed = pnl.fixed_costs.reduce((s, f) => s + f.monthly_cents, 0);
  const netProfit = grossProfit - totalLabor - totalFixed;
  return { totalRevenue, cogs, grossProfit, totalLabor, totalFixed, netProfit };
}

function computeBreakEven(pnl: FinancialsContent["monthly_pnl"]) {
  const { totalLabor, totalFixed, totalRevenue } = computePnl(pnl);
  const grossMargin = 1 - pnl.cogs_percent / 100;
  const monthlyFixed = totalLabor + totalFixed;
  const breakEvenRevenue =
    grossMargin > 0 ? Math.ceil(monthlyFixed / grossMargin) : 0;
  const grossMarginPct = Math.round(grossMargin * 100);
  const revenueGap = breakEvenRevenue - totalRevenue;
  return { breakEvenRevenue, grossMarginPct, monthlyFixed, revenueGap };
}

// ─── Main component ──────────────────────────────────────────────────────────

interface FinancialsWorkspaceProps {
  planId: string;
}

export function FinancialsWorkspace({ planId }: FinancialsWorkspaceProps) {
  const [financials, setFinancials] =
    useState<FinancialsContent>(EMPTY_FINANCIALS);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  const { paywalled, dismissPaywall, guardedFetch } = usePaywallGuard();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/workspaces/financials")
      .then((r) => r.json())
      .then(({ content }) => setFinancials(parseFinancialsContent(content)))
      .catch(() => {
        // keep EMPTY_FINANCIALS defaults on network error
      })
      .finally(() => setLoading(false));
  }, []);

  // ── toast ───────────────────────────────────────────────────────────────────
  const showToast = useCallback(
    (type: "success" | "error", msg: string) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ type, msg });
      toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    },
    []
  );

  // ── save ────────────────────────────────────────────────────────────────────
  const save = useCallback(
    async (data: FinancialsContent) => {
      const res = await guardedFetch("/api/workspaces/financials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: data }),
      });
      if (!res) return; // 402 handled by guardedFetch / PaywallModal
      if (!res.ok) {
        showToast("error", "Save failed — check your connection and try again.");
      } else {
        showToast("success", "Saved");
      }
    },
    [guardedFetch, showToast]
  );

  const scheduleAutosave = useCallback(
    (data: FinancialsContent) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => save(data), 1200);
    },
    [save]
  );

  function update(changes: Partial<FinancialsContent>) {
    const next = { ...financials, ...changes };
    setFinancials(next);
    scheduleAutosave(next);
  }

  // ── PDF export ──────────────────────────────────────────────────────────────
  const exportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await guardedFetch("/api/pdf/financials_full_report");
      if (!res) return; // 402 handled by paywall guard
      if (!res.ok) {
        showToast("error", "Export failed — try again in a moment.");
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disp);
      const fallback = `groundwork-financials-${new Date()
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
      showToast("success", "Downloaded");
    } catch {
      showToast("error", "Export failed — try again in a moment.");
    } finally {
      setExporting(false);
    }
  }, [exporting, guardedFetch, showToast]);

  // ── startup costs ────────────────────────────────────────────────────────────

  function addStartupCost() {
    const line: StartupCostLine = {
      id: newId(),
      category: "equipment",
      label: "",
      amount_cents: 0,
    };
    update({ startup_costs: [...financials.startup_costs, line] });
  }

  function updateStartupCost(
    id: string,
    patch: Partial<StartupCostLine>
  ) {
    const next = financials.startup_costs.map((l) =>
      l.id === id ? { ...l, ...patch } : l
    );
    update({ startup_costs: next });
  }

  function removeStartupCost(id: string) {
    update({
      startup_costs: financials.startup_costs.filter((l) => l.id !== id),
    });
  }

  // ── monthly P&L ─────────────────────────────────────────────────────────────

  function addRevenue() {
    const line: RevenueLine = {
      id: newId(),
      stream: "coffee",
      label: "",
      monthly_cents: 0,
    };
    update({
      monthly_pnl: {
        ...financials.monthly_pnl,
        revenue: [...financials.monthly_pnl.revenue, line],
      },
    });
  }

  function updateRevenue(id: string, patch: Partial<RevenueLine>) {
    const next = financials.monthly_pnl.revenue.map((l) =>
      l.id === id ? { ...l, ...patch } : l
    );
    update({ monthly_pnl: { ...financials.monthly_pnl, revenue: next } });
  }

  function removeRevenue(id: string) {
    update({
      monthly_pnl: {
        ...financials.monthly_pnl,
        revenue: financials.monthly_pnl.revenue.filter((l) => l.id !== id),
      },
    });
  }

  function addLabor() {
    const line: LaborLine = {
      id: newId(),
      role: "barista",
      headcount: 1,
      monthly_cents: 0,
    };
    update({
      monthly_pnl: {
        ...financials.monthly_pnl,
        labor: [...financials.monthly_pnl.labor, line],
      },
    });
  }

  function updateLabor(id: string, patch: Partial<LaborLine>) {
    const next = financials.monthly_pnl.labor.map((l) =>
      l.id === id ? { ...l, ...patch } : l
    );
    update({ monthly_pnl: { ...financials.monthly_pnl, labor: next } });
  }

  function removeLabor(id: string) {
    update({
      monthly_pnl: {
        ...financials.monthly_pnl,
        labor: financials.monthly_pnl.labor.filter((l) => l.id !== id),
      },
    });
  }

  function addFixedCost() {
    const line: FixedCostLine = {
      id: newId(),
      category: "rent",
      label: "",
      monthly_cents: 0,
    };
    update({
      monthly_pnl: {
        ...financials.monthly_pnl,
        fixed_costs: [...financials.monthly_pnl.fixed_costs, line],
      },
    });
  }

  function updateFixedCost(id: string, patch: Partial<FixedCostLine>) {
    const next = financials.monthly_pnl.fixed_costs.map((l) =>
      l.id === id ? { ...l, ...patch } : l
    );
    update({
      monthly_pnl: { ...financials.monthly_pnl, fixed_costs: next },
    });
  }

  function removeFixedCost(id: string) {
    update({
      monthly_pnl: {
        ...financials.monthly_pnl,
        fixed_costs: financials.monthly_pnl.fixed_costs.filter(
          (l) => l.id !== id
        ),
      },
    });
  }

  // ── funding ──────────────────────────────────────────────────────────────────

  function addFunding() {
    const line: FundingLine = {
      id: newId(),
      source: "self",
      label: "",
      amount_cents: 0,
    };
    update({ funding: [...financials.funding, line] });
  }

  function updateFunding(id: string, patch: Partial<FundingLine>) {
    const next = financials.funding.map((l) =>
      l.id === id ? { ...l, ...patch } : l
    );
    update({ funding: next });
  }

  function removeFunding(id: string) {
    update({ funding: financials.funding.filter((l) => l.id !== id) });
  }

  // ── derived values ───────────────────────────────────────────────────────────

  const pnlSummary = computePnl(financials.monthly_pnl);
  const breakEven = computeBreakEven(financials.monthly_pnl);
  const totalStartupCosts = financials.startup_costs.reduce(
    (s, l) => s + l.amount_cents,
    0
  );
  const totalFunding = financials.funding.reduce(
    (s, l) => s + l.amount_cents,
    0
  );
  const fundingGap = totalFunding - totalStartupCosts;

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#faf9f7] pb-24 lg:pb-12">
      {/* Nav */}
      <nav className="bg-white border-b border-[#efefef] px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="text-sm text-[#155e63] font-medium hover:underline"
          >
            ← Back to dashboard
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={exportPdf}
              disabled={exporting || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#155e63] bg-white px-3 py-1.5 text-xs font-medium text-[#155e63] hover:bg-[#155e63] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Export financials as PDF"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
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
            <span className="hidden sm:inline text-xs text-[#6b6b6b]">
              Workspace · Financials
            </span>
          </div>
        </div>
      </nav>

      {/* Toast */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.msg}
          onDismiss={() => setToast(null)}
        />
      )}

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Page heading */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl" aria-hidden="true">
              📊
            </span>
            <h1 className="text-2xl font-semibold text-[#1a1a1a]">
              Financials
            </h1>
          </div>
          <p className="text-sm text-[#6b6b6b]">
            Build your startup budget, monthly P&amp;L, break-even analysis, and
            funding plan. Changes save automatically.
          </p>
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* ── Section 1: Startup Costs ───────────────────────────────── */}
            <SectionCard
              title="Startup Costs"
              description="One-time costs to open your shop."
            >
              {financials.startup_costs.length === 0 ? (
                <EmptyState
                  message="No startup costs yet — add your first line item."
                  action={
                    <AddButton
                      label="Add cost"
                      onClick={addStartupCost}
                    />
                  }
                />
              ) : (
                <>
                  <div className="space-y-3" role="list">
                    {financials.startup_costs.map((line, i) => (
                      <StartupCostRow
                        key={line.id}
                        line={line}
                        index={i}
                        onChange={(patch) =>
                          updateStartupCost(line.id, patch)
                        }
                        onRemove={() => removeStartupCost(line.id)}
                      />
                    ))}
                  </div>
                  <div className="mt-4">
                    <AddButton
                      label="Add cost"
                      onClick={addStartupCost}
                    />
                  </div>
                  <TotalRow label="Total startup costs" cents={totalStartupCosts} />
                </>
              )}
            </SectionCard>

            {/* ── Section 2: Monthly P&L ─────────────────────────────────── */}
            <SectionCard
              title="Monthly P&L"
              description="Projected monthly revenue and costs."
            >
              {/* Revenue */}
              <SubHeading>Revenue streams</SubHeading>
              {financials.monthly_pnl.revenue.length === 0 ? (
                <EmptyState
                  message="No revenue streams yet."
                  action={
                    <AddButton
                      label="Add revenue stream"
                      onClick={addRevenue}
                    />
                  }
                />
              ) : (
                <>
                  <div className="space-y-3" role="list">
                    {financials.monthly_pnl.revenue.map((line, i) => (
                      <RevenueRow
                        key={line.id}
                        line={line}
                        index={i}
                        onChange={(patch) => updateRevenue(line.id, patch)}
                        onRemove={() => removeRevenue(line.id)}
                      />
                    ))}
                  </div>
                  <div className="mt-4">
                    <AddButton
                      label="Add revenue stream"
                      onClick={addRevenue}
                    />
                  </div>
                </>
              )}

              {/* COGS % */}
              <div className="mt-6 pt-5 border-t border-[#efefef]">
                <SubHeading>Cost of goods sold (COGS)</SubHeading>
                <div className="flex items-center gap-3 mt-3">
                  <label
                    htmlFor="cogs-percent"
                    className="text-sm text-[#6b6b6b] whitespace-nowrap"
                  >
                    COGS %
                  </label>
                  <input
                    id="cogs-percent"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={financials.monthly_pnl.cogs_percent}
                    onChange={(e) => {
                      const val = Math.min(
                        100,
                        Math.max(0, parseInt(e.target.value) || 0)
                      );
                      update({
                        monthly_pnl: {
                          ...financials.monthly_pnl,
                          cogs_percent: val,
                        },
                      });
                    }}
                    className={inputCls("w-20 text-center")}
                    aria-label="Cost of goods sold percentage"
                  />
                  <span className="text-sm text-[#6b6b6b]">
                    % of revenue (typically 25–35% for specialty coffee)
                  </span>
                </div>
              </div>

              {/* Labor */}
              <div className="mt-6 pt-5 border-t border-[#efefef]">
                <SubHeading>Labor</SubHeading>
                {financials.monthly_pnl.labor.length === 0 ? (
                  <EmptyState
                    message="No labor costs yet."
                    action={
                      <AddButton
                        label="Add labor"
                        onClick={addLabor}
                      />
                    }
                  />
                ) : (
                  <>
                    <div className="space-y-3 mt-3" role="list">
                      {financials.monthly_pnl.labor.map((line, i) => (
                        <LaborRow
                          key={line.id}
                          line={line}
                          index={i}
                          onChange={(patch) =>
                            updateLabor(line.id, patch)
                          }
                          onRemove={() => removeLabor(line.id)}
                        />
                      ))}
                    </div>
                    <div className="mt-4">
                      <AddButton
                        label="Add labor"
                        onClick={addLabor}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Fixed costs */}
              <div className="mt-6 pt-5 border-t border-[#efefef]">
                <SubHeading>Fixed costs</SubHeading>
                {financials.monthly_pnl.fixed_costs.length === 0 ? (
                  <EmptyState
                    message="No fixed costs yet."
                    action={
                      <AddButton
                        label="Add fixed cost"
                        onClick={addFixedCost}
                      />
                    }
                  />
                ) : (
                  <>
                    <div className="space-y-3 mt-3" role="list">
                      {financials.monthly_pnl.fixed_costs.map((line, i) => (
                        <FixedCostRow
                          key={line.id}
                          line={line}
                          index={i}
                          onChange={(patch) =>
                            updateFixedCost(line.id, patch)
                          }
                          onRemove={() => removeFixedCost(line.id)}
                        />
                      ))}
                    </div>
                    <div className="mt-4">
                      <AddButton
                        label="Add fixed cost"
                        onClick={addFixedCost}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* P&L Summary */}
              <PnlSummary summary={pnlSummary} cogsPct={financials.monthly_pnl.cogs_percent} />
            </SectionCard>

            {/* ── Section 3: Break-even ──────────────────────────────────── */}
            <SectionCard
              title="Break-even"
              description="Derived from your P&L. Edit revenue or costs above to update."
            >
              <BreakEvenSummary
                breakEven={breakEven}
                monthsToBreakEven={
                  totalStartupCosts > 0 && pnlSummary.netProfit > 0
                    ? Math.ceil(totalStartupCosts / pnlSummary.netProfit)
                    : null
                }
              />
              <div className="mt-6 pt-5 border-t border-[#efefef]">
                <label
                  htmlFor="break-even-notes"
                  className="block text-sm font-medium text-[#1a1a1a] mb-2"
                >
                  Assumptions &amp; notes
                </label>
                <textarea
                  id="break-even-notes"
                  rows={3}
                  placeholder="e.g. Assumes 70% capacity utilisation in year 1, seasonal revenue dip in January…"
                  value={financials.break_even.assumptions_note ?? ""}
                  onChange={(e) =>
                    update({
                      break_even: { assumptions_note: e.target.value },
                    })
                  }
                  className={inputCls("resize-none")}
                  aria-label="Break-even assumptions and notes"
                />
              </div>
            </SectionCard>

            {/* ── Section 4: Funding Sources ─────────────────────────────── */}
            <SectionCard
              title="Funding Sources"
              description="How you plan to fund the startup costs."
            >
              {financials.funding.length === 0 ? (
                <EmptyState
                  message="No funding sources yet — add how you plan to fund the business."
                  action={
                    <AddButton
                      label="Add funding source"
                      onClick={addFunding}
                    />
                  }
                />
              ) : (
                <>
                  <div className="space-y-3" role="list">
                    {financials.funding.map((line, i) => (
                      <FundingRow
                        key={line.id}
                        line={line}
                        index={i}
                        onChange={(patch) =>
                          updateFunding(line.id, patch)
                        }
                        onRemove={() => removeFunding(line.id)}
                      />
                    ))}
                  </div>
                  <div className="mt-4">
                    <AddButton
                      label="Add funding source"
                      onClick={addFunding}
                    />
                  </div>
                  <TotalRow label="Total funding" cents={totalFunding} />
                  <div className="flex justify-between items-center pt-3">
                    <span className="text-sm text-[#6b6b6b]">
                      vs. startup costs
                    </span>
                    <span
                      className={`text-base font-semibold ${
                        fundingGap >= 0
                          ? "text-green-700"
                          : "text-red-600"
                      }`}
                    >
                      {fundingGap >= 0 ? "+" : ""}${fmtMoney(
                        Math.abs(fundingGap)
                      )}{" "}
                      <span className="text-xs font-normal">
                        {fundingGap >= 0 ? "surplus" : "gap"}
                      </span>
                    </span>
                  </div>
                </>
              )}
            </SectionCard>
          </>
        )}
      </main>

      <PaywallModal open={paywalled} onClose={dismissPaywall} />
      <CoPilotDrawer
        planId={planId}
        workspaceKey="financials"
        currentFocus={{ label: "Financials workspace" }}
      />
      <BottomTabBar />
    </div>
  );
}

// ─── row components ──────────────────────────────────────────────────────────

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">{children}</h3>
  );
}

function StartupCostRow({
  line,
  index,
  onChange,
  onRemove,
}: {
  line: StartupCostLine;
  index: number;
  onChange: (patch: Partial<StartupCostLine>) => void;
  onRemove: () => void;
}) {
  const [dollarVal, setDollarVal] = useState(
    line.amount_cents > 0 ? String(line.amount_cents / 100) : ""
  );

  function commitAmount() {
    onChange({ amount_cents: parseCents(dollarVal) });
  }

  return (
    <div role="listitem" className="flex flex-wrap gap-2 items-start">
      <select
        value={line.category}
        onChange={(e) =>
          onChange({ category: e.target.value as StartupCostCategory })
        }
        aria-label={`Category for startup cost ${index + 1}`}
        className={selectCls() + " w-full sm:w-36 shrink-0"}
      >
        <option value="build_out">Build-out</option>
        <option value="equipment">Equipment</option>
        <option value="licenses">Licenses</option>
        <option value="deposits">Deposits</option>
        <option value="inventory">Inventory</option>
        <option value="other">Other</option>
      </select>
      <input
        type="text"
        placeholder="Description"
        value={line.label}
        onChange={(e) => onChange({ label: e.target.value })}
        aria-label={`Label for startup cost ${index + 1}`}
        className={inputCls("flex-1 min-w-[120px]")}
      />
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">
          $
        </span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={dollarVal}
          onChange={(e) => setDollarVal(e.target.value)}
          onBlur={commitAmount}
          aria-label={`Amount for startup cost ${index + 1}`}
          className={inputCls("pl-6 w-28 text-right")}
        />
      </div>
      <DeleteButton
        onClick={onRemove}
        label={`Remove startup cost ${index + 1}`}
      />
    </div>
  );
}

function RevenueRow({
  line,
  index,
  onChange,
  onRemove,
}: {
  line: RevenueLine;
  index: number;
  onChange: (patch: Partial<RevenueLine>) => void;
  onRemove: () => void;
}) {
  const [dollarVal, setDollarVal] = useState(
    line.monthly_cents > 0 ? String(line.monthly_cents / 100) : ""
  );

  function commitAmount() {
    onChange({ monthly_cents: parseCents(dollarVal) });
  }

  return (
    <div role="listitem" className="flex flex-wrap gap-2 items-start">
      <select
        value={line.stream}
        onChange={(e) =>
          onChange({ stream: e.target.value as RevenueStream })
        }
        aria-label={`Stream for revenue line ${index + 1}`}
        className={selectCls() + " w-full sm:w-32 shrink-0"}
      >
        <option value="coffee">Coffee</option>
        <option value="food">Food</option>
        <option value="wholesale">Wholesale</option>
        <option value="catering">Catering</option>
        <option value="other">Other</option>
      </select>
      <input
        type="text"
        placeholder="Label"
        value={line.label}
        onChange={(e) => onChange({ label: e.target.value })}
        aria-label={`Label for revenue line ${index + 1}`}
        className={inputCls("flex-1 min-w-[120px]")}
      />
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">
          $
        </span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={dollarVal}
          onChange={(e) => setDollarVal(e.target.value)}
          onBlur={commitAmount}
          aria-label={`Monthly revenue for stream ${index + 1}`}
          className={inputCls("pl-6 w-28 text-right")}
        />
      </div>
      <span className="self-center text-xs text-[#afafaf] whitespace-nowrap">
        /mo
      </span>
      <DeleteButton
        onClick={onRemove}
        label={`Remove revenue stream ${index + 1}`}
      />
    </div>
  );
}

function LaborRow({
  line,
  index,
  onChange,
  onRemove,
}: {
  line: LaborLine;
  index: number;
  onChange: (patch: Partial<LaborLine>) => void;
  onRemove: () => void;
}) {
  const [dollarVal, setDollarVal] = useState(
    line.monthly_cents > 0 ? String(line.monthly_cents / 100) : ""
  );

  function commitAmount() {
    onChange({ monthly_cents: parseCents(dollarVal) });
  }

  return (
    <div role="listitem" className="flex flex-wrap gap-2 items-start">
      <select
        value={line.role}
        onChange={(e) => onChange({ role: e.target.value as LaborRole })}
        aria-label={`Role for labor line ${index + 1}`}
        className={selectCls() + " w-full sm:w-32 shrink-0"}
      >
        <option value="owner">Owner</option>
        <option value="barista">Barista</option>
        <option value="manager">Manager</option>
        <option value="other">Other</option>
      </select>
      <input
        type="number"
        min="1"
        step="1"
        value={line.headcount}
        onChange={(e) =>
          onChange({
            headcount: Math.max(1, parseInt(e.target.value) || 1),
          })
        }
        aria-label={`Headcount for labor line ${index + 1}`}
        className={inputCls("w-16 text-center")}
        title="Headcount"
      />
      <span className="self-center text-xs text-[#afafaf]">×</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">
          $
        </span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={dollarVal}
          onChange={(e) => setDollarVal(e.target.value)}
          onBlur={commitAmount}
          aria-label={`Monthly cost per person for labor line ${index + 1}`}
          className={inputCls("pl-6 w-28 text-right")}
        />
      </div>
      <span className="self-center text-xs text-[#afafaf] whitespace-nowrap">
        /mo each
      </span>
      <DeleteButton
        onClick={onRemove}
        label={`Remove labor line ${index + 1}`}
      />
    </div>
  );
}

function FixedCostRow({
  line,
  index,
  onChange,
  onRemove,
}: {
  line: FixedCostLine;
  index: number;
  onChange: (patch: Partial<FixedCostLine>) => void;
  onRemove: () => void;
}) {
  const [dollarVal, setDollarVal] = useState(
    line.monthly_cents > 0 ? String(line.monthly_cents / 100) : ""
  );

  function commitAmount() {
    onChange({ monthly_cents: parseCents(dollarVal) });
  }

  return (
    <div role="listitem" className="flex flex-wrap gap-2 items-start">
      <select
        value={line.category}
        onChange={(e) =>
          onChange({ category: e.target.value as FixedCostCategory })
        }
        aria-label={`Category for fixed cost ${index + 1}`}
        className={selectCls() + " w-full sm:w-32 shrink-0"}
      >
        <option value="rent">Rent</option>
        <option value="utilities">Utilities</option>
        <option value="insurance">Insurance</option>
        <option value="software">Software</option>
        <option value="marketing">Marketing</option>
        <option value="other">Other</option>
      </select>
      <input
        type="text"
        placeholder="Description"
        value={line.label}
        onChange={(e) => onChange({ label: e.target.value })}
        aria-label={`Label for fixed cost ${index + 1}`}
        className={inputCls("flex-1 min-w-[120px]")}
      />
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">
          $
        </span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={dollarVal}
          onChange={(e) => setDollarVal(e.target.value)}
          onBlur={commitAmount}
          aria-label={`Monthly cost for fixed cost ${index + 1}`}
          className={inputCls("pl-6 w-28 text-right")}
        />
      </div>
      <span className="self-center text-xs text-[#afafaf] whitespace-nowrap">
        /mo
      </span>
      <DeleteButton
        onClick={onRemove}
        label={`Remove fixed cost ${index + 1}`}
      />
    </div>
  );
}

function FundingRow({
  line,
  index,
  onChange,
  onRemove,
}: {
  line: FundingLine;
  index: number;
  onChange: (patch: Partial<FundingLine>) => void;
  onRemove: () => void;
}) {
  const [dollarVal, setDollarVal] = useState(
    line.amount_cents > 0 ? String(line.amount_cents / 100) : ""
  );

  function commitAmount() {
    onChange({ amount_cents: parseCents(dollarVal) });
  }

  return (
    <div role="listitem" className="space-y-2">
      <div className="flex flex-wrap gap-2 items-start">
        <select
          value={line.source}
          onChange={(e) =>
            onChange({ source: e.target.value as FundingSource })
          }
          aria-label={`Source for funding line ${index + 1}`}
          className={selectCls() + " w-full sm:w-32 shrink-0"}
        >
          <option value="self">Self-funded</option>
          <option value="sba">SBA loan</option>
          <option value="family">Family / friends</option>
          <option value="investor">Investor</option>
          <option value="grant">Grant</option>
          <option value="other">Other</option>
        </select>
        <input
          type="text"
          placeholder="Label"
          value={line.label}
          onChange={(e) => onChange({ label: e.target.value })}
          aria-label={`Label for funding line ${index + 1}`}
          className={inputCls("flex-1 min-w-[120px]")}
        />
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">
            $
          </span>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={dollarVal}
            onChange={(e) => setDollarVal(e.target.value)}
            onBlur={commitAmount}
            aria-label={`Amount for funding line ${index + 1}`}
            className={inputCls("pl-6 w-28 text-right")}
          />
        </div>
        <DeleteButton
          onClick={onRemove}
          label={`Remove funding source ${index + 1}`}
        />
      </div>
      <input
        type="text"
        placeholder="Terms / notes (optional)"
        value={line.terms_note ?? ""}
        onChange={(e) =>
          onChange({ terms_note: e.target.value || undefined })
        }
        aria-label={`Terms for funding line ${index + 1}`}
        className={inputCls("w-full text-xs")}
      />
    </div>
  );
}

// ─── P&L summary ─────────────────────────────────────────────────────────────

function PnlSummary({
  summary,
  cogsPct,
}: {
  summary: ReturnType<typeof computePnl>;
  cogsPct: number;
}) {
  const { totalRevenue, cogs, grossProfit, totalLabor, totalFixed, netProfit } =
    summary;
  const isPositive = netProfit >= 0;

  return (
    <div className="mt-6 pt-5 border-t border-[#efefef]">
      <h3 className="text-sm font-semibold text-[#1a1a1a] mb-4">
        Monthly P&L summary
      </h3>
      <div className="bg-[#faf9f7] rounded-xl p-4 space-y-2 text-sm">
        <PnlLine label="Total revenue" cents={totalRevenue} />
        <PnlLine
          label={`COGS (${cogsPct}%)`}
          cents={-cogs}
          muted
        />
        <PnlLine
          label="Gross profit"
          cents={grossProfit}
          separator
          bold
        />
        <PnlLine label="Labor" cents={-totalLabor} muted />
        <PnlLine label="Fixed costs" cents={-totalFixed} muted />
        <div className="flex justify-between items-center pt-2 border-t border-[#efefef] mt-2">
          <span className="font-semibold text-[#1a1a1a]">Net profit / month</span>
          <span
            className={`font-bold text-base ${
              isPositive ? "text-green-700" : "text-red-600"
            }`}
          >
            {isPositive ? "+" : "-"}${fmtMoney(Math.abs(netProfit))}
          </span>
        </div>
      </div>
    </div>
  );
}

function PnlLine({
  label,
  cents,
  muted,
  bold,
  separator,
}: {
  label: string;
  cents: number;
  muted?: boolean;
  bold?: boolean;
  separator?: boolean;
}) {
  const sign = cents >= 0 ? "" : "-";
  const abs = Math.abs(cents);
  return (
    <div
      className={`flex justify-between items-center ${
        separator ? "pt-2 border-t border-[#efefef] mt-1" : ""
      }`}
    >
      <span
        className={`${
          muted ? "text-[#6b6b6b]" : "text-[#1a1a1a]"
        } ${bold ? "font-semibold" : ""}`}
      >
        {label}
      </span>
      <span
        className={`${bold ? "font-semibold" : ""} ${
          cents < 0 ? "text-[#6b6b6b]" : "text-[#1a1a1a]"
        }`}
      >
        {sign}${fmtMoney(abs)}
      </span>
    </div>
  );
}

// ─── Break-even summary ───────────────────────────────────────────────────────

function BreakEvenSummary({
  breakEven,
  monthsToBreakEven,
}: {
  breakEven: ReturnType<typeof computeBreakEven>;
  monthsToBreakEven: number | null;
}) {
  const { breakEvenRevenue, grossMarginPct, monthlyFixed, revenueGap } =
    breakEven;

  return (
    <div className="bg-[#faf9f7] rounded-xl p-4 space-y-3 text-sm">
      <MetricRow
        label="Gross margin"
        value={`${grossMarginPct}%`}
        hint="Revenue minus COGS"
      />
      <MetricRow
        label="Monthly fixed overhead"
        value={`$${fmtMoney(monthlyFixed)}`}
        hint="Labor + fixed costs"
      />
      <MetricRow
        label="Break-even revenue"
        value={breakEvenRevenue > 0 ? `$${fmtMoney(breakEvenRevenue)}/mo` : "—"}
        hint="Revenue needed to cover all costs"
      />
      {revenueGap !== 0 && breakEvenRevenue > 0 && (
        <div className="flex justify-between items-center pt-2 border-t border-[#efefef]">
          <span className="text-[#6b6b6b]">
            {revenueGap > 0 ? "Revenue gap to break-even" : "Revenue surplus"}
          </span>
          <span
            className={`font-semibold ${
              revenueGap > 0 ? "text-red-600" : "text-green-700"
            }`}
          >
            {revenueGap > 0 ? "-" : "+"}${fmtMoney(Math.abs(revenueGap))}/mo
          </span>
        </div>
      )}
      {monthsToBreakEven !== null && (
        <MetricRow
          label="Startup cost payback"
          value={`~${monthsToBreakEven} month${monthsToBreakEven === 1 ? "" : "s"}`}
          hint="At current net profit"
        />
      )}
    </div>
  );
}

function MetricRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex justify-between items-start gap-4">
      <div>
        <div className="text-[#1a1a1a]">{label}</div>
        {hint && <div className="text-xs text-[#afafaf] mt-0.5">{hint}</div>}
      </div>
      <span className="font-semibold text-[#1a1a1a] shrink-0">{value}</span>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading financials" aria-busy="true">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-[#efefef] p-6 sm:p-8"
        >
          <div className="h-5 w-32 bg-[#efefef] rounded animate-pulse mb-2" />
          <div className="h-3 w-48 bg-[#efefef] rounded animate-pulse mb-6" />
          <div className="space-y-3">
            <div className="h-10 bg-[#faf9f7] rounded-lg animate-pulse" />
            <div className="h-10 bg-[#faf9f7] rounded-lg animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
