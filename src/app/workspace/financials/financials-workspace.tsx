"use client";

// TIM-964: Financial Suite — Equipment, Forecast, Projections + AI Critique.
// Three-tab workspace backed by workspace_documents.content (workspace_key='financials').
// Autosaves on change (debounced). Follows Concept workspace design patterns.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart2, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceProgress } from "@/components/workspace/WorkspaceProgressProvider";
import {
  type EquipmentItem,
  type EquipmentCategory,
  type FinancingMethod,
  type FinancialsDocument,
  type ForecastInputs,
  type DailyFlow,
  type FinancialProjections,
  type CritiqueResult,
  computeProjections,
  formatCurrency,
  FINANCING_LABELS,
  DAY_LABELS,
} from "@/lib/financials";

const AUTOSAVE_DEBOUNCE_MS = 800;

type SaveState =
  | { kind: "idle"; lastSavedAt: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

type Tab = "equipment" | "forecast" | "projections";

interface Props {
  planId: string;
  initialDoc: FinancialsDocument;
  initialUpdatedAt: string | null;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  conceptSummary?: string;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Not saved yet";
  try {
    const d = new Date(iso);
    return `Saved ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return "Saved";
  }
}

// ── Sparkline component ───────────────────────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  const w = 80;
  const h = 28;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const allPositive = values.every((v) => v >= 0);
  return (
    <svg width={w} height={h} aria-hidden="true" className="shrink-0">
      <polyline
        fill="none"
        stroke={allPositive ? "#155e63" : "#a13d3d"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(" ")}
      />
    </svg>
  );
}

// ── Equipment tab ─────────────────────────────────────────────────────────────

const EMPTY_ITEM = (): EquipmentItem => ({
  id: makeId(),
  name: "",
  brand: "",
  model: "",
  supplier: "",
  cost_usd: 0,
  financing: "cash",
  category: "minor",
  notes: "",
});

function EquipmentRow({
  item,
  canEdit,
  onUpdate,
  onRemove,
}: {
  item: EquipmentItem;
  canEdit: boolean;
  onUpdate: (updated: EquipmentItem) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  function field(key: keyof EquipmentItem, value: string | number) {
    onUpdate({ ...item, [key]: value });
  }

  const inputCls =
    "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
  const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";

  return (
    <div className="border border-[#efefef] rounded-xl bg-white overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
            item.category === "major"
              ? "bg-[#155e63]/10 text-[#155e63]"
              : "bg-[#f0f0f0] text-[#6b6b6b]"
          }`}
        >
          {item.category === "major" ? "Major" : "Minor"}
        </span>
        <span className="text-sm font-medium text-[#1a1a1a] flex-1 truncate min-w-0">
          {item.name || <span className="text-[#afafaf] font-normal">Unnamed item</span>}
        </span>
        <span className="text-sm font-semibold text-[#1a1a1a] shrink-0">
          {item.cost_usd ? formatCurrency(item.cost_usd) : "—"}
        </span>
        <span className="text-xs text-[#afafaf] shrink-0 hidden sm:block">
          {FINANCING_LABELS[item.financing]}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[#afafaf] hover:text-[#1a1a1a] transition-colors shrink-0 p-1"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[#afafaf] hover:text-[#a13d3d] transition-colors shrink-0 p-1"
            aria-label="Remove item"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div className="border-t border-[#efefef] px-4 py-4 bg-[#faf9f7]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Item name</label>
              <input
                className={inputCls}
                value={item.name}
                onChange={(e) => field("name", e.target.value)}
                placeholder="e.g. Espresso machine"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Brand</label>
              <input
                className={inputCls}
                value={item.brand}
                onChange={(e) => field("brand", e.target.value)}
                placeholder="e.g. La Marzocco"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input
                className={inputCls}
                value={item.model}
                onChange={(e) => field("model", e.target.value)}
                placeholder="e.g. Linea Micra 2-Group"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Supplier</label>
              <input
                className={inputCls}
                value={item.supplier}
                onChange={(e) => field("supplier", e.target.value)}
                placeholder="e.g. Espresso Parts"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Cost (USD)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                value={item.cost_usd || ""}
                onChange={(e) =>
                  field("cost_usd", parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Financing method</label>
              <select
                className={inputCls}
                value={item.financing}
                onChange={(e) => field("financing", e.target.value as FinancingMethod)}
                disabled={!canEdit}
              >
                {(Object.keys(FINANCING_LABELS) as FinancingMethod[]).map((k) => (
                  <option key={k} value={k}>
                    {FINANCING_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select
                className={inputCls}
                value={item.category}
                onChange={(e) => field("category", e.target.value as EquipmentCategory)}
                disabled={!canEdit}
              >
                <option value="major">Major equipment (&gt;$500)</option>
                <option value="minor">Minor / supplies</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <input
                className={inputCls}
                value={item.notes}
                onChange={(e) => field("notes", e.target.value)}
                placeholder="Brief note (spec, why this item, etc.)"
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentTab({
  doc,
  canEdit,
  onUpdateDoc,
}: {
  doc: FinancialsDocument;
  canEdit: boolean;
  onUpdateDoc: (next: FinancialsDocument) => void;
}) {
  const [seedStatus, setSeedStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [seedDismissed, setSeedDismissed] = useState(doc.equipment_ai_seeded);

  const totalCost = doc.equipment.reduce((s, e) => s + (e.cost_usd || 0), 0);
  const majorItems = doc.equipment.filter((e) => e.category === "major");
  const minorItems = doc.equipment.filter((e) => e.category === "minor");

  function addItem() {
    onUpdateDoc({
      ...doc,
      equipment: [...doc.equipment, EMPTY_ITEM()],
    });
  }

  function updateItem(id: string, updated: EquipmentItem) {
    onUpdateDoc({
      ...doc,
      equipment: doc.equipment.map((e) => (e.id === id ? updated : e)),
    });
  }

  function removeItem(id: string) {
    onUpdateDoc({
      ...doc,
      equipment: doc.equipment.filter((e) => e.id !== id),
    });
  }

  async function handleSeed() {
    setSeedStatus("loading");
    try {
      const res = await fetch("/api/workspaces/financials/seed", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`seed failed (${res.status})`);
      const data = (await res.json()) as { items: EquipmentItem[] };
      onUpdateDoc({
        ...doc,
        equipment: data.items,
        equipment_ai_seeded: true,
      });
      setSeedStatus("done");
      setSeedDismissed(true);
    } catch {
      setSeedStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      {/* AI Seed callout */}
      {!seedDismissed && canEdit && (
        <div className="rounded-xl border border-[#cfe0e1] bg-[#f4f9f8] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#155e63] mb-1">
                Generate a starter equipment list
              </p>
              <p className="text-xs text-[#6b6b6b] leading-relaxed">
                Based on your concept, the AI will suggest typical equipment and
                supplies for a coffee shop like yours. You can edit or remove
                anything after.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSeedDismissed(true)}
              className="text-[#afafaf] hover:text-[#1a1a1a] transition-colors shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSeed}
              disabled={seedStatus === "loading"}
              className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors disabled:opacity-60"
            >
              {seedStatus === "loading" ? "Generating..." : "Generate list"}
            </button>
            {seedStatus === "error" && (
              <span className="text-xs text-[#a13d3d]">
                Could not generate. Try again.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Summary bar */}
      {doc.equipment.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-[#6b6b6b] px-1">
          <span>
            {doc.equipment.length} item{doc.equipment.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[#efefef]">|</span>
          <span>
            {majorItems.length} major, {minorItems.length} minor
          </span>
          <span className="text-[#efefef]">|</span>
          <span className="font-semibold text-[#1a1a1a]">
            Total: {formatCurrency(totalCost)}
          </span>
        </div>
      )}

      {/* Equipment list */}
      {doc.equipment.length > 0 ? (
        <div className="space-y-2">
          {doc.equipment.map((item) => (
            <EquipmentRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              onUpdate={(updated) => updateItem(item.id, updated)}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#e0e0e0] py-10 text-center">
          <p className="text-sm text-[#afafaf]">No equipment added yet.</p>
          <p className="text-xs text-[#c0c0c0] mt-1">
            Generate a starter list above or add items manually.
          </p>
        </div>
      )}

      {/* Add item button */}
      {canEdit && (
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-2 text-sm font-medium text-[#155e63] border border-[#cfe0e1] rounded-xl px-4 py-2.5 hover:bg-[#155e63]/5 transition-colors w-full justify-center"
        >
          <Plus size={14} aria-hidden="true" />
          Add item
        </button>
      )}
    </div>
  );
}

// ── Forecast tab ──────────────────────────────────────────────────────────────

function ForecastTab({
  doc,
  canEdit,
  onUpdateDoc,
}: {
  doc: FinancialsDocument;
  canEdit: boolean;
  onUpdateDoc: (next: FinancialsDocument) => void;
}) {
  const f = doc.forecast;

  function updateForecast(partial: Partial<ForecastInputs>) {
    onUpdateDoc({ ...doc, forecast: { ...f, ...partial } });
  }

  function updateFlow(day: keyof DailyFlow, val: number) {
    updateForecast({ daily_flow: { ...f.daily_flow, [day]: val } });
  }

  const totalWeeklyCustomers = (Object.keys(DAY_LABELS) as (keyof DailyFlow)[]).reduce(
    (sum, d) => sum + (f.daily_flow[d] || 0),
    0
  );

  const inputCls =
    "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
  const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";
  const sectionLabelCls =
    "text-[10px] font-semibold uppercase tracking-wider text-[#155e63] mb-3";

  return (
    <div className="space-y-6">
      {/* Customer flow */}
      <div>
        <p className={sectionLabelCls}>Customer flow by day</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Estimated customers per day. Used to calculate annual revenue.
          </p>
          <div className="grid grid-cols-7 gap-2">
            {(Object.keys(DAY_LABELS) as (keyof DailyFlow)[]).map((day) => {
              const val = f.daily_flow[day] || 0;
              const maxVal = Math.max(
                ...Object.values(f.daily_flow).map(Number),
                1
              );
              const barPct = (val / maxVal) * 100;
              return (
                <div key={day} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-[#6b6b6b]">
                    {DAY_LABELS[day]}
                  </span>
                  <div className="relative w-full h-16 bg-[#f0f0f0] rounded-md overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-[#155e63]/20 transition-all duration-200"
                      style={{ height: `${barPct}%` }}
                    />
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    className="w-full text-center text-xs border border-[#e0e0e0] rounded-md py-1 px-0 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf]"
                    value={val || ""}
                    onChange={(e) =>
                      updateFlow(day, parseInt(e.target.value, 10) || 0)
                    }
                    placeholder="0"
                    disabled={!canEdit}
                    aria-label={`Customers on ${DAY_LABELS[day]}`}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[#afafaf] mt-3">
            Weekly total: {totalWeeklyCustomers.toLocaleString()} customers
          </p>
        </div>
      </div>

      {/* Ticket + Hours */}
      <div>
        <p className={sectionLabelCls}>Revenue drivers</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Average ticket (USD)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                step={0.5}
                value={f.avg_ticket_usd || ""}
                onChange={(e) =>
                  updateForecast({ avg_ticket_usd: parseFloat(e.target.value) || 0 })
                }
                placeholder="7.50"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">
                Typical espresso bar: $6–$10
              </p>
            </div>
            <div>
              <label className={labelCls}>Open days per week</label>
              <select
                className={inputCls}
                value={f.open_days_per_week}
                onChange={(e) =>
                  updateForecast({ open_days_per_week: parseInt(e.target.value, 10) })
                }
                disabled={!canEdit}
              >
                {[5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} days/week
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Hours open per day</label>
              <input
                className={inputCls}
                type="number"
                min={1}
                max={24}
                value={f.hours_per_day || ""}
                onChange={(e) =>
                  updateForecast({ hours_per_day: parseInt(e.target.value, 10) || 0 })
                }
                placeholder="10"
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      </div>

      {/* COGS + Operating expenses */}
      <div>
        <p className={sectionLabelCls}>Costs</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>COGS % of revenue</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                max={100}
                value={f.cogs_pct || ""}
                onChange={(e) =>
                  updateForecast({ cogs_pct: parseFloat(e.target.value) || 0 })
                }
                placeholder="30"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">
                Typical coffee shop: 28–35%
              </p>
            </div>
            <div>
              <label className={labelCls}>Labor % of revenue</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                max={100}
                value={f.labor_pct || ""}
                onChange={(e) =>
                  updateForecast({ labor_pct: parseFloat(e.target.value) || 0 })
                }
                placeholder="35"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">
                Typical: 30–38%
              </p>
            </div>
            <div>
              <label className={labelCls}>Monthly rent (USD)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                value={f.monthly_rent_usd || ""}
                onChange={(e) =>
                  updateForecast({ monthly_rent_usd: parseFloat(e.target.value) || 0 })
                }
                placeholder="4500"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Monthly utilities (USD)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                value={f.utilities_monthly_usd || ""}
                onChange={(e) =>
                  updateForecast({
                    utilities_monthly_usd: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="600"
                disabled={!canEdit}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Other monthly expenses (USD)
              </label>
              <input
                className={inputCls}
                type="number"
                min={0}
                value={f.other_opex_monthly_usd || ""}
                onChange={(e) =>
                  updateForecast({
                    other_opex_monthly_usd: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="800"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">
                Insurance, supplies, marketing, POS fees, etc.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Projections tab ───────────────────────────────────────────────────────────

function MetricRow({
  label,
  y1,
  y3,
  y5,
  bold,
  highlight,
  negative,
}: {
  label: string;
  y1: number;
  y3: number;
  y5: number;
  bold?: boolean;
  highlight?: boolean;
  negative?: boolean;
}) {
  const textCls = bold ? "font-semibold" : "font-normal";
  const rowCls = highlight ? "bg-[#f4f9f8]" : "";
  const colorCls = (v: number) =>
    negative
      ? "text-[#a13d3d]"
      : v < 0
      ? "text-[#a13d3d]"
      : "text-[#1a1a1a]";

  return (
    <tr className={rowCls}>
      <td className={`py-2.5 pl-4 pr-2 text-sm ${textCls} text-[#1a1a1a]`}>
        {label}
      </td>
      {[y1, y3, y5].map((v, i) => (
        <td
          key={i}
          className={`py-2.5 px-3 text-sm text-right tabular-nums ${textCls} ${colorCls(v)}`}
        >
          {formatCurrency(v)}
        </td>
      ))}
      <td className="py-2.5 pr-4 pl-2">
        <Sparkline values={[y1, y3, y5]} />
      </td>
    </tr>
  );
}

function ProjectionsTab({
  doc,
  canEdit,
}: {
  doc: FinancialsDocument;
  canEdit: boolean;
}) {
  const projections = useMemo(() => computeProjections(doc), [doc]);
  const { year1: y1, year3: y3, year5: y5 } = projections;

  const [critiqueStatus, setCritiqueStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [critique, setCritique] = useState<CritiqueResult | null>(
    doc.critique
  );

  async function generateCritique() {
    setCritiqueStatus("loading");
    try {
      const res = await fetch("/api/workspaces/financials/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projections }),
      });
      if (!res.ok) throw new Error(`critique failed (${res.status})`);
      const data = (await res.json()) as CritiqueResult;
      setCritique(data);
      setCritiqueStatus("done");
    } catch {
      setCritiqueStatus("error");
    }
  }

  const bulletIcon = {
    strength: "✓",
    weakness: "!",
    suggestion: "→",
  } as const;

  const bulletColor = {
    strength: "text-[#155e63]",
    weakness: "text-[#a13d3d]",
    suggestion: "text-[#6b6b6b]",
  } as const;

  return (
    <div className="space-y-6">
      {/* Projections summary */}
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-4 pt-4 pb-2 border-b border-[#efefef]">
          <p className="text-xs font-semibold text-[#1a1a1a]">
            Year 1 / 3 / 5 Projections
          </p>
          <p className="text-[10px] text-[#afafaf] mt-0.5">
            Based on forecast inputs. Growth: +30% by Year 3, +55% by Year 5.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-[#efefef]">
                <th className="py-2.5 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Metric
                </th>
                <th className="py-2.5 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Year 1
                </th>
                <th className="py-2.5 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Year 3
                </th>
                <th className="py-2.5 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Year 5
                </th>
                <th className="py-2.5 pr-4 pl-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f5f5]">
              <MetricRow
                label="Revenue"
                y1={y1.revenue}
                y3={y3.revenue}
                y5={y5.revenue}
                bold
              />
              <MetricRow
                label="COGS"
                y1={y1.cogs}
                y3={y3.cogs}
                y5={y5.cogs}
                negative
              />
              <MetricRow
                label="Gross Margin"
                y1={y1.gross_margin}
                y3={y3.gross_margin}
                y5={y5.gross_margin}
                bold
                highlight
              />
              <MetricRow
                label="Labor"
                y1={y1.labor}
                y3={y3.labor}
                y5={y5.labor}
                negative
              />
              <MetricRow
                label="Rent"
                y1={y1.rent}
                y3={y3.rent}
                y5={y5.rent}
                negative
              />
              <MetricRow
                label="Utilities"
                y1={y1.utilities}
                y3={y3.utilities}
                y5={y5.utilities}
                negative
              />
              <MetricRow
                label="Other OpEx"
                y1={y1.other_opex}
                y3={y3.other_opex}
                y5={y5.other_opex}
                negative
              />
              <MetricRow
                label="Total OpEx"
                y1={y1.total_opex}
                y3={y3.total_opex}
                y5={y5.total_opex}
                bold
                negative
              />
              <MetricRow
                label="EBITDA"
                y1={y1.ebitda}
                y3={y3.ebitda}
                y5={y5.ebitda}
                bold
                highlight
              />
              {projections.financed_total > 0 && (
                <MetricRow
                  label="Depreciation"
                  y1={y1.depreciation}
                  y3={y3.depreciation}
                  y5={y5.depreciation}
                  negative
                />
              )}
              <MetricRow
                label="Net Income"
                y1={y1.net_income}
                y3={y3.net_income}
                y5={y5.net_income}
                bold
                highlight
              />
            </tbody>
          </table>
        </div>
        {projections.startup_equipment_total > 0 && (
          <div className="px-4 py-3 border-t border-[#efefef] flex items-center gap-4 text-xs text-[#6b6b6b]">
            <span>
              Startup equipment:{" "}
              <span className="font-semibold text-[#1a1a1a]">
                {formatCurrency(projections.startup_equipment_total)}
              </span>
            </span>
            {projections.financed_total > 0 && (
              <span>
                Financed (loan/in-house):{" "}
                <span className="font-semibold text-[#1a1a1a]">
                  {formatCurrency(projections.financed_total)}
                </span>{" "}
                — depreciated over 7 yrs
              </span>
            )}
          </div>
        )}
      </div>

      {/* Gross margin callout */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Year 1 GM",
            value: `${y1.gross_margin_pct.toFixed(0)}%`,
            sub: "Gross margin",
            ok: y1.gross_margin_pct >= 60,
          },
          {
            label: "Year 1 EBITDA",
            value: formatCurrency(y1.ebitda),
            sub: y1.revenue > 0 ? `${((y1.ebitda / y1.revenue) * 100).toFixed(0)}% margin` : "—",
            ok: y1.ebitda >= 0,
          },
          {
            label: "Year 5 Net",
            value: formatCurrency(y5.net_income),
            sub: "Net income",
            ok: y5.net_income >= 0,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-xl border p-4 text-center ${
              kpi.ok ? "border-[#cfe0e1] bg-[#f4f9f8]" : "border-[#f0d4d4] bg-[#fdf5f5]"
            }`}
          >
            <p className="text-[10px] font-medium text-[#6b6b6b] mb-1">
              {kpi.label}
            </p>
            <p
              className={`text-lg font-bold ${
                kpi.ok ? "text-[#155e63]" : "text-[#a13d3d]"
              }`}
            >
              {kpi.value}
            </p>
            <p className="text-[10px] text-[#afafaf] mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* AI Critique */}
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef] flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">AI Critique</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Benchmarked against comparable independent coffee shops.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={generateCritique}
              disabled={critiqueStatus === "loading"}
              className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors disabled:opacity-60 shrink-0"
            >
              {critiqueStatus === "loading"
                ? "Analyzing..."
                : critique
                ? "Refresh"
                : "Generate critique"}
            </button>
          )}
        </div>
        <div className="px-5 py-4">
          {critiqueStatus === "error" && (
            <p className="text-sm text-[#a13d3d]">
              Could not generate critique. Try again.
            </p>
          )}
          {critiqueStatus === "idle" && !critique && (
            <p className="text-sm text-[#afafaf] italic">
              Run a critique to get benchmarked feedback on your projections.
            </p>
          )}
          {(critique?.bullets ?? []).length > 0 && (
            <ul className="space-y-3">
              {critique!.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className={`text-xs font-bold shrink-0 mt-0.5 w-4 ${bulletColor[b.type]}`}
                  >
                    {bulletIcon[b.type]}
                  </span>
                  <span className="text-sm text-[#1a1a1a] leading-relaxed">
                    {b.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {critique?.generated_at && (
            <p className="text-[10px] text-[#afafaf] mt-4">
              Generated{" "}
              {new Date(critique.generated_at).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinancialsWorkspace({
  planId,
  initialDoc,
  initialUpdatedAt,
  canEdit,
  initialTrialMessagesUsed,
}: Props) {
  const [doc, setDoc] = useState<FinancialsDocument>(initialDoc);
  const [activeTab, setActiveTab] = useState<Tab>("equipment");
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: initialUpdatedAt,
  });
  const [paywallOpen, setPaywallOpen] = useState(false);

  const inFlightController = useRef<AbortController | null>(null);
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDocRef = useRef<FinancialsDocument>(initialDoc);

  const { setModuleProgress } = useWorkspaceProgress();

  // Progress: equipment filled + forecast non-default fields
  const progress = useMemo(() => {
    const hasEquipment = doc.equipment.length > 0 ? 1 : 0;
    const hasFlow = Object.values(doc.forecast.daily_flow).some((v) => v > 0) ? 1 : 0;
    const hasCosts =
      doc.forecast.monthly_rent_usd > 0 && doc.forecast.avg_ticket_usd > 0
        ? 1
        : 0;
    return { filled: hasEquipment + hasFlow + hasCosts, total: 3 };
  }, [doc]);

  useEffect(() => {
    setModuleProgress(2, progress.filled, progress.total);
  }, [progress.filled, progress.total, setModuleProgress]);

  const lastSavedAt =
    saveState.kind === "saved"
      ? saveState.at
      : saveState.kind === "idle"
      ? saveState.lastSavedAt
      : null;

  const persist = useCallback(
    async (next: FinancialsDocument) => {
      if (!canEdit) return;
      if (inFlightController.current) inFlightController.current.abort();
      const controller = new AbortController();
      inFlightController.current = controller;
      setSaveState({ kind: "saving" });
      try {
        const res = await fetch("/api/workspaces/financials", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: next }),
          signal: controller.signal,
        });
        if (res.status === 402) {
          setSaveState({
            kind: "error",
            message: "Subscription paused — reactivate to keep editing.",
          });
          setPaywallOpen(true);
          return;
        }
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        const data = (await res.json()) as { updated_at?: string };
        setSaveState({
          kind: "saved",
          at: data?.updated_at ?? new Date().toISOString(),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setSaveState({
          kind: "error",
          message:
            err instanceof Error ? err.message : "Could not save. Will retry.",
        });
      }
    },
    [canEdit]
  );

  const scheduleSave = useCallback(
    (next: FinancialsDocument) => {
      latestDocRef.current = next;
      setSaveState({ kind: "dirty" });
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = setTimeout(() => {
        pendingSaveTimer.current = null;
        void persist(latestDocRef.current);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persist]
  );

  function updateDoc(next: FinancialsDocument) {
    // Also persist critique when updated
    setDoc(next);
    scheduleSave(next);
  }

  // Sync critique back to doc when it changes in ProjectionsTab
  function updateDocWithCritique(next: FinancialsDocument & { critique?: CritiqueResult | null }) {
    setDoc(next);
    scheduleSave(next);
  }

  // ProjectionsTab critique needs to persist — wrap updateDoc to handle critique
  const projectionsDoc = { ...doc };
  function handleProjectionsCritiqueUpdate(critique: CritiqueResult | null) {
    const next = { ...doc, critique };
    setDoc(next);
    scheduleSave(next);
  }

  const saveLabel =
    saveState.kind === "saving"
      ? "Saving..."
      : saveState.kind === "dirty"
      ? "Unsaved changes"
      : saveState.kind === "error"
      ? saveState.message
      : formatTimestamp(lastSavedAt);

  const tabs: { id: Tab; label: string }[] = [
    { id: "equipment", label: "Equipment" },
    { id: "forecast", label: "Forecast Inputs" },
    { id: "projections", label: "Projections" },
  ];

  return (
    <div className="bg-[#faf9f7] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-16">
        {/* Page header */}
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2
              className="w-5 h-5 text-[#155e63] flex-shrink-0"
              aria-hidden="true"
            />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>
              Financials
            </h1>
          </div>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Plan your startup costs, forecast revenue, and project Year 1–5
            performance.
          </p>
        </header>

        {/* Save state */}
        <div className="mb-5 flex items-center justify-between">
          <nav className="flex items-center gap-1 bg-white border border-[#efefef] rounded-xl p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors ${
                  activeTab === t.id
                    ? "bg-[#155e63] text-white"
                    : "text-[#6b6b6b] hover:text-[#1a1a1a]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <span
            className={`text-xs ${
              saveState.kind === "error" ? "text-[#a13d3d]" : "text-[#afafaf]"
            }`}
          >
            {saveLabel}
          </span>
        </div>

        {/* Tab content */}
        {activeTab === "equipment" && (
          <EquipmentTab doc={doc} canEdit={canEdit} onUpdateDoc={updateDoc} />
        )}
        {activeTab === "forecast" && (
          <ForecastTab doc={doc} canEdit={canEdit} onUpdateDoc={updateDoc} />
        )}
        {activeTab === "projections" && (
          <ProjectionsTabWithCritiqueSync
            doc={projectionsDoc}
            canEdit={canEdit}
            onCritiqueUpdate={handleProjectionsCritiqueUpdate}
          />
        )}
      </div>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        variant="copilot_trial"
      />

      <CoPilotDrawer
        planId={planId}
        workspaceKey="financials"
        currentFocus={{ label: "Financials" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />
    </div>
  );
}

// Wrapper to bridge critique updates back to parent doc
function ProjectionsTabWithCritiqueSync({
  doc,
  canEdit,
  onCritiqueUpdate,
}: {
  doc: FinancialsDocument;
  canEdit: boolean;
  onCritiqueUpdate: (c: CritiqueResult | null) => void;
}) {
  const projections = useMemo(() => computeProjections(doc), [doc]);
  const { year1: y1, year3: y3, year5: y5 } = projections;

  const [critiqueStatus, setCritiqueStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [critique, setCritique] = useState<CritiqueResult | null>(doc.critique);

  async function generateCritique() {
    setCritiqueStatus("loading");
    try {
      const res = await fetch("/api/workspaces/financials/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projections }),
      });
      if (!res.ok) throw new Error(`critique failed (${res.status})`);
      const data = (await res.json()) as CritiqueResult;
      setCritique(data);
      setCritiqueStatus("done");
      onCritiqueUpdate(data);
    } catch {
      setCritiqueStatus("error");
    }
  }

  const bulletIcon = {
    strength: "✓",
    weakness: "!",
    suggestion: "→",
  } as const;

  const bulletColor = {
    strength: "text-[#155e63]",
    weakness: "text-[#a13d3d]",
    suggestion: "text-[#6b6b6b]",
  } as const;

  return (
    <div className="space-y-6">
      {/* Projections table */}
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-4 pt-4 pb-2 border-b border-[#efefef]">
          <p className="text-xs font-semibold text-[#1a1a1a]">
            Year 1 / 3 / 5 Projections
          </p>
          <p className="text-[10px] text-[#afafaf] mt-0.5">
            Based on forecast inputs. Assumes ~30% growth to Year 3, ~55% to Year 5.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-[#efefef]">
                <th className="py-2.5 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Metric
                </th>
                <th className="py-2.5 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Year 1
                </th>
                <th className="py-2.5 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Year 3
                </th>
                <th className="py-2.5 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Year 5
                </th>
                <th className="py-2.5 pr-4 pl-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f5f5]">
              <MetricRow label="Revenue" y1={y1.revenue} y3={y3.revenue} y5={y5.revenue} bold />
              <MetricRow label="COGS" y1={y1.cogs} y3={y3.cogs} y5={y5.cogs} negative />
              <MetricRow label="Gross Margin" y1={y1.gross_margin} y3={y3.gross_margin} y5={y5.gross_margin} bold highlight />
              <MetricRow label="Labor" y1={y1.labor} y3={y3.labor} y5={y5.labor} negative />
              <MetricRow label="Rent" y1={y1.rent} y3={y3.rent} y5={y5.rent} negative />
              <MetricRow label="Utilities" y1={y1.utilities} y3={y3.utilities} y5={y5.utilities} negative />
              <MetricRow label="Other OpEx" y1={y1.other_opex} y3={y3.other_opex} y5={y5.other_opex} negative />
              <MetricRow label="Total OpEx" y1={y1.total_opex} y3={y3.total_opex} y5={y5.total_opex} bold negative />
              <MetricRow label="EBITDA" y1={y1.ebitda} y3={y3.ebitda} y5={y5.ebitda} bold highlight />
              {projections.financed_total > 0 && (
                <MetricRow label="Depreciation" y1={y1.depreciation} y3={y3.depreciation} y5={y5.depreciation} negative />
              )}
              <MetricRow label="Net Income" y1={y1.net_income} y3={y3.net_income} y5={y5.net_income} bold highlight />
            </tbody>
          </table>
        </div>
        {projections.startup_equipment_total > 0 && (
          <div className="px-4 py-3 border-t border-[#efefef] flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6b6b6b]">
            <span>
              Equipment total:{" "}
              <span className="font-semibold text-[#1a1a1a]">
                {formatCurrency(projections.startup_equipment_total)}
              </span>
            </span>
            {projections.financed_total > 0 && (
              <span>
                Financed (depreciated 7 yrs):{" "}
                <span className="font-semibold text-[#1a1a1a]">
                  {formatCurrency(projections.financed_total)}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Year 1 GM",
            value: `${y1.gross_margin_pct.toFixed(0)}%`,
            sub: "Gross margin",
            ok: y1.gross_margin_pct >= 60,
          },
          {
            label: "Year 1 EBITDA",
            value: formatCurrency(y1.ebitda),
            sub: y1.revenue > 0 ? `${((y1.ebitda / y1.revenue) * 100).toFixed(0)}% margin` : "—",
            ok: y1.ebitda >= 0,
          },
          {
            label: "Year 5 Net",
            value: formatCurrency(y5.net_income),
            sub: "Net income",
            ok: y5.net_income >= 0,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-xl border p-4 text-center ${
              kpi.ok ? "border-[#cfe0e1] bg-[#f4f9f8]" : "border-[#f0d4d4] bg-[#fdf5f5]"
            }`}
          >
            <p className="text-[10px] font-medium text-[#6b6b6b] mb-1">
              {kpi.label}
            </p>
            <p className={`text-lg font-bold ${kpi.ok ? "text-[#155e63]" : "text-[#a13d3d]"}`}>
              {kpi.value}
            </p>
            <p className="text-[10px] text-[#afafaf] mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* AI Critique */}
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef] flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">AI Critique</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Benchmarked against comparable independent coffee shops.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={generateCritique}
              disabled={critiqueStatus === "loading"}
              className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors disabled:opacity-60 shrink-0"
            >
              {critiqueStatus === "loading"
                ? "Analyzing..."
                : critique
                ? "Refresh"
                : "Generate critique"}
            </button>
          )}
        </div>
        <div className="px-5 py-4">
          {critiqueStatus === "error" && (
            <p className="text-sm text-[#a13d3d]">
              Could not generate critique. Try again.
            </p>
          )}
          {critiqueStatus === "idle" && !critique && (
            <p className="text-sm text-[#afafaf] italic">
              Generate a critique to get benchmarked feedback on your projections.
            </p>
          )}
          {(critique?.bullets ?? []).length > 0 && (
            <ul className="space-y-3">
              {critique!.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className={`text-xs font-bold shrink-0 mt-0.5 w-4 ${bulletColor[b.type]}`}
                  >
                    {bulletIcon[b.type]}
                  </span>
                  <span className="text-sm text-[#1a1a1a] leading-relaxed">
                    {b.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {critique?.generated_at && (
            <p className="text-[10px] text-[#afafaf] mt-4">
              Generated{" "}
              {new Date(critique.generated_at).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
