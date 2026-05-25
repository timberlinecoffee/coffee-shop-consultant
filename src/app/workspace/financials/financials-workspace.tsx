"use client";

// TIM-1019: Financial Suite Phase 2 — full monthly projection engine + 6 statement tabs.

import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart2 } from "lucide-react";
import {
  type FinancialInputs,
  FINANCIAL_INPUTS_DEFAULTS,
  normalizeFinancialInputs,
  computeMonthlyProjections,
} from "@/lib/financial-projection";
import { InputsTab } from "./tabs/inputs-tab";
import { PLTab } from "./tabs/pl-tab";
import { BalanceSheetTab } from "./tabs/balance-sheet-tab";
import { CashFlowTab } from "./tabs/cash-flow-tab";
import { BreakEvenTab } from "./tabs/break-even-tab";
import { RatiosTab } from "./tabs/ratios-tab";
import { StartupTab } from "./tabs/startup-tab";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";

const AUTOSAVE_DEBOUNCE_MS = 800;

type Tab = "inputs" | "startup" | "pl" | "balance-sheet" | "cash-flow" | "break-even" | "ratios";

const TABS: { key: Tab; label: string }[] = [
  { key: "inputs", label: "Inputs" },
  { key: "startup", label: "Startup Costs" },
  { key: "pl", label: "P&L" },
  { key: "balance-sheet", label: "Balance Sheet" },
  { key: "cash-flow", label: "Cash Flow" },
  { key: "break-even", label: "Break-Even" },
  { key: "ratios", label: "Ratios" },
];

type SaveState =
  | { kind: "idle"; lastSavedAt: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Not saved yet";
  try {
    const d = new Date(iso);
    return `Saved ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return "Saved";
  }
}

interface Props {
  planId: string;
  initialContent: unknown;
  initialUpdatedAt: string | null;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
}

export function FinancialsWorkspace({
  planId,
  initialContent,
  initialUpdatedAt,
  canEdit,
  initialTrialMessagesUsed,
}: Props) {
  const [inputs, setInputs] = useState<FinancialInputs>(() => {
    const raw = initialContent && typeof initialContent === "object"
      ? (initialContent as Record<string, unknown>).inputs
      : initialContent;
    return normalizeFinancialInputs(raw);
  });

  const [tab, setTab] = useState<Tab>("inputs");
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: initialUpdatedAt,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveInputs = useCallback(async (toSave: FinancialInputs) => {
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch(`/api/workspaces/financials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { inputs: toSave } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 402) {
          setSaveState({ kind: "error", message: "Upgrade to save changes" });
          return;
        }
        setSaveState({ kind: "error", message: body.error ?? "Save failed" });
        return;
      }
      const data = await res.json();
      setSaveState({ kind: "saved", at: data.updated_at });
    } catch {
      setSaveState({ kind: "error", message: "Network error" });
    }
  }, []);

  const handleInputsChange = useCallback((next: FinancialInputs) => {
    setInputs(next);
    setSaveState({ kind: "dirty" });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (canEdit) saveInputs(next);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [canEdit, saveInputs]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const slices = computeMonthlyProjections(inputs);

  const saveLabel = (() => {
    switch (saveState.kind) {
      case "idle": return formatTimestamp(saveState.lastSavedAt);
      case "dirty": return "Unsaved changes";
      case "saving": return "Saving…";
      case "saved": return formatTimestamp(saveState.at);
      case "error": return saveState.message;
    }
  })();

  return (
    <div className="bg-[#faf9f7] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-5 h-5 text-[#155e63] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>
              Financials
            </h1>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[#6b6b6b] leading-relaxed max-w-xl">
              Five-year projection — P&L, cash flow, balance sheet, break-even, and key ratios.
            </p>
            <span className={`text-xs whitespace-nowrap ${saveState.kind === "error" ? "text-red-600" : "text-[#afafaf]"}`}>
              {saveLabel}
            </span>
          </div>
        </header>

        {/* Tab nav */}
        <div className="flex gap-1 overflow-x-auto pb-1 mb-6 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "bg-[#155e63] text-white"
                  : "bg-white border border-[#e5e5e5] text-[#4a4a4a] hover:bg-[#f5f5f5]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "inputs" && (
          <InputsTab inputs={inputs} onChange={handleInputsChange} disabled={!canEdit} />
        )}
        {tab === "startup" && <StartupTab inputs={inputs} />}
        {tab === "pl" && <PLTab slices={slices} />}
        {tab === "balance-sheet" && <BalanceSheetTab slices={slices} />}
        {tab === "cash-flow" && <CashFlowTab slices={slices} />}
        {tab === "break-even" && <BreakEvenTab slices={slices} inputs={inputs} />}
        {tab === "ratios" && <RatiosTab slices={slices} />}

        {!canEdit && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You are viewing a read-only snapshot. Upgrade to edit your projections and save changes.
          </div>
        )}
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey="financials"
        currentFocus={{ label: `Financial Suite — ${TABS.find((t) => t.key === tab)?.label ?? tab} tab` }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />
    </div>
  );
}
