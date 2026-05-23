"use client";

// TIM-972: Financial Suite — DB-backed architecture.
// Equipment → buildout_equipment_items (REST). Forecast → financial_models (REST).
// Projections computed client-side from DB-backed state.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart2, ChevronDown, ChevronUp, Plus, Trash2, X, AlertTriangle } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceProgress } from "@/components/workspace/WorkspaceProgressProvider";
import {
  type MonthlyProjections,
  type FinancialProjections,
  computeProjections,
  formatCurrency,
  normalizeMonthlyProjections,
} from "@/lib/financial-projection";
import type { CritiqueResult } from "@/lib/financials";

const AUTOSAVE_DEBOUNCE_MS = 800;

// ── DB row shape from buildout_equipment_items ────────────────────────────────

export type EquipmentCategory =
  | "espresso" | "grinder" | "refrigeration" | "plumbing" | "electrical"
  | "furniture" | "smallwares" | "pos" | "signage" | "other";

export type FinancingMethod = "cash" | "loan" | "lease" | "credit";
export type PriorityTier = "must_have" | "nice_to_have";
export type EquipmentSource = "ai_suggested" | "user_added";

export interface EquipmentItem {
  id: string;
  plan_id: string;
  position: number;
  name: string;
  category: EquipmentCategory;
  vendor: string | null;
  model: string | null;
  quantity: number;
  unit_cost_cents: number;
  priority_tier: PriorityTier;
  financing_method: FinancingMethod;
  source: EquipmentSource;
  notes: string | null;
  archived: boolean;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveState =
  | { kind: "idle"; lastSavedAt: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

type Tab = "equipment" | "forecast" | "projections";

interface Props {
  planId: string;
  initialEquipment: EquipmentItem[];
  initialProjections: MonthlyProjections;
  initialModelUpdatedAt: string | null;
  initialCritique: CritiqueResult | null;
  initialNeedsReviewAt: string | null;
  initialModelUpdatedAtForReview: string | null;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
}

const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  espresso: "Espresso",
  grinder: "Grinder",
  refrigeration: "Refrigeration",
  plumbing: "Plumbing",
  electrical: "Electrical",
  furniture: "Furniture",
  smallwares: "Smallwares",
  pos: "POS",
  signage: "Signage",
  other: "Other",
};

const FINANCING_LABELS: Record<FinancingMethod, string> = {
  cash: "Cash",
  loan: "Loan",
  lease: "Lease",
  credit: "Credit",
};

const PRIORITY_LABELS: Record<PriorityTier, string> = {
  must_have: "Must-have",
  nice_to_have: "Nice-to-have",
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Not saved yet";
  try {
    const d = new Date(iso);
    return `Saved ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return "Saved";
  }
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

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

function newItem(planId: string, position: number): EquipmentItem {
  return {
    id: "",
    plan_id: planId,
    position,
    name: "",
    category: "other",
    vendor: null,
    model: null,
    quantity: 1,
    unit_cost_cents: 0,
    priority_tier: "must_have",
    financing_method: "cash",
    source: "user_added",
    notes: null,
    archived: false,
  };
}

function EquipmentRow({
  item,
  canEdit,
  onUpdate,
  onRemove,
  saving,
}: {
  item: EquipmentItem;
  canEdit: boolean;
  onUpdate: (patch: Partial<EquipmentItem>) => void;
  onRemove: () => void;
  saving?: boolean;
}) {
  const [expanded, setExpanded] = useState(!item.id);

  const inputCls =
    "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
  const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";

  const totalCents = item.unit_cost_cents * item.quantity;

  return (
    <div className={`border border-[#efefef] rounded-xl bg-white overflow-hidden ${saving ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
            item.priority_tier === "must_have"
              ? "bg-[#155e63]/10 text-[#155e63]"
              : "bg-[#f0f0f0] text-[#6b6b6b]"
          }`}
        >
          {PRIORITY_LABELS[item.priority_tier]}
        </span>
        {item.source === "ai_suggested" && (
          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 shrink-0">
            AI
          </span>
        )}
        <span className="text-sm font-medium text-[#1a1a1a] flex-1 truncate min-w-0">
          {item.name || <span className="text-[#afafaf] font-normal">Unnamed item</span>}
        </span>
        <span className="text-sm font-semibold text-[#1a1a1a] shrink-0">
          {totalCents ? formatCurrency(totalCents / 100) : "—"}
        </span>
        <span className="text-xs text-[#afafaf] shrink-0 hidden sm:block">
          {FINANCING_LABELS[item.financing_method]}
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

      {expanded && (
        <div className="border-t border-[#efefef] px-4 py-4 bg-[#faf9f7]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Item name</label>
              <input
                className={inputCls}
                value={item.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="e.g. Espresso machine"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select
                className={inputCls}
                value={item.category}
                onChange={(e) => onUpdate({ category: e.target.value as EquipmentCategory })}
                disabled={!canEdit}
              >
                {(Object.keys(CATEGORY_LABELS) as EquipmentCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Vendor / Brand</label>
              <input
                className={inputCls}
                value={item.vendor ?? ""}
                onChange={(e) => onUpdate({ vendor: e.target.value || null })}
                placeholder="e.g. La Marzocco"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input
                className={inputCls}
                value={item.model ?? ""}
                onChange={(e) => onUpdate({ model: e.target.value || null })}
                placeholder="e.g. Linea Micra 2-Group"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Quantity</label>
              <input
                className={inputCls}
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => onUpdate({ quantity: parseInt(e.target.value, 10) || 1 })}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Unit cost (USD)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                step={50}
                value={item.unit_cost_cents ? item.unit_cost_cents / 100 : ""}
                onChange={(e) =>
                  onUpdate({ unit_cost_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
                placeholder="0"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select
                className={inputCls}
                value={item.priority_tier}
                onChange={(e) => onUpdate({ priority_tier: e.target.value as PriorityTier })}
                disabled={!canEdit}
              >
                <option value="must_have">Must-have</option>
                <option value="nice_to_have">Nice-to-have</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Financing method</label>
              <select
                className={inputCls}
                value={item.financing_method}
                onChange={(e) => onUpdate({ financing_method: e.target.value as FinancingMethod })}
                disabled={!canEdit}
              >
                {(Object.keys(FINANCING_LABELS) as FinancingMethod[]).map((k) => (
                  <option key={k} value={k}>
                    {FINANCING_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <input
                className={inputCls}
                value={item.notes ?? ""}
                onChange={(e) => onUpdate({ notes: e.target.value || null })}
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
  planId,
  canEdit,
  items,
  onItemsChange,
}: {
  planId: string;
  canEdit: boolean;
  items: EquipmentItem[];
  onItemsChange: (items: EquipmentItem[]) => void;
}) {
  const [seedStatus, setSeedStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [seedDismissed, setSeedDismissed] = useState(
    items.some((i) => i.source === "ai_suggested")
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  const aiSeeded = items.some((i) => i.source === "ai_suggested");
  const totalCents = items.reduce((s, e) => s + e.unit_cost_cents * e.quantity, 0);
  const mustHaveCount = items.filter((e) => e.priority_tier === "must_have").length;
  const niceToHaveCount = items.filter((e) => e.priority_tier === "nice_to_have").length;

  async function addItem() {
    if (!canEdit) return;
    const placeholder = newItem(planId, items.length);
    // Optimistic: add with temp id
    const tempId = `__new_${Date.now()}`;
    const optimistic = { ...placeholder, id: tempId };
    onItemsChange([...items, optimistic]);

    try {
      const res = await fetch("/api/workspaces/financials/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: placeholder.name || "New item",
          category: placeholder.category,
          quantity: placeholder.quantity,
          unit_cost_cents: placeholder.unit_cost_cents,
          priority_tier: placeholder.priority_tier,
          financing_method: placeholder.financing_method,
          source: "user_added",
          position: items.length,
        }),
      });
      if (!res.ok) throw new Error(`create failed (${res.status})`);
      const created = (await res.json()) as EquipmentItem;
      onItemsChange(
        [...items, optimistic].map((i) => (i.id === tempId ? created : i))
      );
    } catch {
      // Revert
      onItemsChange(items);
    }
  }

  async function updateItem(id: string, patch: Partial<EquipmentItem>) {
    if (!canEdit) return;
    // Optimistic update
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    onItemsChange(next);

    if (!id || id.startsWith("__new_")) return;

    setSavingId(id);
    try {
      const res = await fetch(`/api/workspaces/financials/equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`update failed (${res.status})`);
      const updated = (await res.json()) as EquipmentItem;
      onItemsChange(items.map((i) => (i.id === id ? updated : i)));
    } catch {
      // Revert
      onItemsChange(items);
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(id: string) {
    if (!canEdit) return;
    // Optimistic
    const next = items.filter((i) => i.id !== id);
    onItemsChange(next);

    if (!id || id.startsWith("__new_")) return;

    try {
      const res = await fetch(`/api/workspaces/financials/equipment/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`delete failed (${res.status})`);
    } catch {
      // Revert
      onItemsChange(items);
    }
  }

  async function handleSeed() {
    setSeedStatus("loading");
    try {
      const res = await fetch("/api/workspaces/financials/seed", { method: "POST" });
      if (!res.ok) throw new Error(`seed failed (${res.status})`);
      // Reload equipment from DB
      const listRes = await fetch("/api/workspaces/financials/equipment");
      if (!listRes.ok) throw new Error(`reload failed (${listRes.status})`);
      const newItems = (await listRes.json()) as EquipmentItem[];
      onItemsChange(newItems);
      setSeedStatus("done");
      setSeedDismissed(true);
    } catch {
      setSeedStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      {/* AI Seed callout */}
      {!seedDismissed && !aiSeeded && canEdit && (
        <div className="rounded-xl border border-[#cfe0e1] bg-[#f4f9f8] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#155e63] mb-1">
                Generate a starter equipment list
              </p>
              <p className="text-xs text-[#6b6b6b] leading-relaxed">
                Based on your concept and menu profile, we&apos;ll suggest typical equipment
                for a coffee shop like yours. Edit or remove anything after.
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
              <span className="text-xs text-[#a13d3d]">Could not generate. Try again.</span>
            )}
          </div>
        </div>
      )}

      {/* Summary bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-[#6b6b6b] px-1">
          <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
          <span className="text-[#efefef]">|</span>
          <span>{mustHaveCount} must-have, {niceToHaveCount} nice-to-have</span>
          <span className="text-[#efefef]">|</span>
          <span className="font-semibold text-[#1a1a1a]">
            Total: {formatCurrency(totalCents / 100)}
          </span>
        </div>
      )}

      {/* Equipment list */}
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <EquipmentRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              onUpdate={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
              saving={savingId === item.id}
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

type DayKey = keyof MonthlyProjections["daily_flow"];

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

function ForecastTab({
  mp,
  canEdit,
  onUpdateMp,
}: {
  mp: MonthlyProjections;
  canEdit: boolean;
  onUpdateMp: (next: MonthlyProjections) => void;
}) {
  function update(partial: Partial<MonthlyProjections>) {
    onUpdateMp({ ...mp, ...partial });
  }

  function updateFlow(day: DayKey, val: number) {
    update({ daily_flow: { ...mp.daily_flow, [day]: val } });
  }

  const totalWeeklyCustomers = (Object.keys(DAY_LABELS) as DayKey[]).reduce(
    (sum, d) => sum + (mp.daily_flow[d] || 0),
    0
  );

  const inputCls =
    "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
  const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";
  const sectionLabelCls = "text-[10px] font-semibold uppercase tracking-wider text-[#155e63] mb-3";

  return (
    <div className="space-y-6">
      <div>
        <p className={sectionLabelCls}>Customer flow by day</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Estimated customers per day. Used to calculate annual revenue.
          </p>
          <div className="grid grid-cols-7 gap-2">
            {(Object.keys(DAY_LABELS) as DayKey[]).map((day) => {
              const val = mp.daily_flow[day] || 0;
              const maxVal = Math.max(...Object.values(mp.daily_flow).map(Number), 1);
              const barPct = (val / maxVal) * 100;
              return (
                <div key={day} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-[#6b6b6b]">{DAY_LABELS[day]}</span>
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
                    onChange={(e) => updateFlow(day, parseInt(e.target.value, 10) || 0)}
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
                value={mp.avg_ticket_cents ? mp.avg_ticket_cents / 100 : ""}
                onChange={(e) =>
                  update({ avg_ticket_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
                placeholder="7.50"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">Typical espresso bar: $6–$10</p>
            </div>
            <div>
              <label className={labelCls}>Open days per week</label>
              <select
                className={inputCls}
                value={mp.open_days_per_week}
                onChange={(e) => update({ open_days_per_week: parseInt(e.target.value, 10) })}
                disabled={!canEdit}
              >
                {[5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n} days/week</option>
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
                value={mp.hours_per_day || ""}
                onChange={(e) => update({ hours_per_day: parseInt(e.target.value, 10) || 0 })}
                placeholder="10"
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      </div>

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
                value={mp.cogs_pct || ""}
                onChange={(e) => update({ cogs_pct: parseFloat(e.target.value) || 0 })}
                placeholder="30"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">Typical coffee shop: 28–35%</p>
            </div>
            <div>
              <label className={labelCls}>Labor % of revenue</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                max={100}
                value={mp.labor_pct || ""}
                onChange={(e) => update({ labor_pct: parseFloat(e.target.value) || 0 })}
                placeholder="35"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">Healthy range: 30–38%</p>
            </div>
            <div>
              <label className={labelCls}>Monthly rent (USD)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                step={100}
                value={mp.monthly_rent_cents ? mp.monthly_rent_cents / 100 : ""}
                onChange={(e) =>
                  update({ monthly_rent_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
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
                step={50}
                value={mp.utilities_monthly_cents ? mp.utilities_monthly_cents / 100 : ""}
                onChange={(e) =>
                  update({ utilities_monthly_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
                placeholder="600"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelCls}>Other operating expenses (USD/mo)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                step={50}
                value={mp.other_opex_monthly_cents ? mp.other_opex_monthly_cents / 100 : ""}
                onChange={(e) =>
                  update({ other_opex_monthly_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
                placeholder="800"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">Marketing, supplies, insurance, etc.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Projections tab ───────────────────────────────────────────────────────────

function MetricRow({
  label, y1, y3, y5, bold, negative, highlight,
}: {
  label: string; y1: number; y3: number; y5: number;
  bold?: boolean; negative?: boolean; highlight?: boolean;
}) {
  const cls = `py-2.5 px-3 text-right text-sm tabular-nums ${bold ? "font-semibold" : ""} ${
    highlight ? "text-[#155e63]" : negative ? "text-[#a13d3d]" : "text-[#1a1a1a]"
  }`;
  return (
    <tr>
      <td className={`py-2.5 pl-4 pr-2 text-sm ${bold ? "font-semibold text-[#1a1a1a]" : "text-[#6b6b6b]"}`}>
        {label}
      </td>
      <td className={cls}>{formatCurrency(y1)}</td>
      <td className={cls}>{formatCurrency(y3)}</td>
      <td className={cls}>{formatCurrency(y5)}</td>
      <td className="py-2.5 pr-4 pl-2 text-right">
        <Sparkline values={[y1, y3, y5]} />
      </td>
    </tr>
  );
}

function ProjectionsTab({
  projections,
  canEdit,
  critique,
  onCritiqueUpdate,
}: {
  projections: FinancialProjections;
  canEdit: boolean;
  critique: CritiqueResult | null;
  onCritiqueUpdate: (c: CritiqueResult | null) => void;
}) {
  const { year1: y1, year3: y3, year5: y5 } = projections;
  const [critiqueStatus, setCritiqueStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [localCritique, setLocalCritique] = useState<CritiqueResult | null>(critique);

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
      setLocalCritique(data);
      setCritiqueStatus("done");
      onCritiqueUpdate(data);
    } catch {
      setCritiqueStatus("error");
    }
  }

  const bulletIcon = { strength: "✓", weakness: "!", suggestion: "→" } as const;
  const bulletColor = { strength: "text-[#155e63]", weakness: "text-[#a13d3d]", suggestion: "text-[#6b6b6b]" } as const;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-4 pt-4 pb-2 border-b border-[#efefef]">
          <p className="text-xs font-semibold text-[#1a1a1a]">Year 1 / 3 / 5 Projections</p>
          <p className="text-[10px] text-[#afafaf] mt-0.5">
            Based on forecast inputs. Assumes ~30% growth to Year 3, ~55% to Year 5.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-[#efefef]">
                <th className="py-2.5 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">Metric</th>
                <th className="py-2.5 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">Year 1</th>
                <th className="py-2.5 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">Year 3</th>
                <th className="py-2.5 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">Year 5</th>
                <th className="py-2.5 pr-4 pl-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">Trend</th>
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
            <span>Equipment total: <span className="font-semibold text-[#1a1a1a]">{formatCurrency(projections.startup_equipment_total)}</span></span>
            {projections.financed_total > 0 && (
              <span>Financed (7yr depreciation): <span className="font-semibold text-[#1a1a1a]">{formatCurrency(projections.financed_total)}</span></span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Year 1 GM", value: `${y1.gross_margin_pct.toFixed(0)}%`, sub: "Gross margin", ok: y1.gross_margin_pct >= 60 },
          { label: "Year 1 EBITDA", value: formatCurrency(y1.ebitda), sub: y1.revenue > 0 ? `${((y1.ebitda / y1.revenue) * 100).toFixed(0)}% margin` : "—", ok: y1.ebitda >= 0 },
          { label: "Year 5 Net", value: formatCurrency(y5.net_income), sub: "Net income", ok: y5.net_income >= 0 },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border p-4 text-center ${kpi.ok ? "border-[#cfe0e1] bg-[#f4f9f8]" : "border-[#f0d4d4] bg-[#fdf5f5]"}`}>
            <p className="text-[10px] font-medium text-[#6b6b6b] mb-1">{kpi.label}</p>
            <p className={`text-lg font-bold ${kpi.ok ? "text-[#155e63]" : "text-[#a13d3d]"}`}>{kpi.value}</p>
            <p className="text-[10px] text-[#afafaf] mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef] flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">AI Critique</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">Benchmarked against comparable independent coffee shops.</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={generateCritique}
              disabled={critiqueStatus === "loading"}
              className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors disabled:opacity-60 shrink-0"
            >
              {critiqueStatus === "loading" ? "Analyzing..." : localCritique ? "Refresh" : "Generate critique"}
            </button>
          )}
        </div>
        {critiqueStatus === "error" && (
          <p className="px-5 py-4 text-sm text-[#a13d3d]">Could not generate. Try again.</p>
        )}
        {localCritique ? (
          <ul className="divide-y divide-[#f5f5f5]">
            {localCritique.bullets.map((b, i) => (
              <li key={i} className="px-5 py-3 flex items-start gap-3">
                <span className={`text-sm font-bold shrink-0 mt-0.5 ${bulletColor[b.type]}`}>
                  {bulletIcon[b.type]}
                </span>
                <p className="text-sm text-[#1a1a1a] leading-relaxed">{b.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          !canEdit ? null : (
            <p className="px-5 py-4 text-sm text-[#afafaf]">
              Run a critique to get benchmarked feedback on your projections.
            </p>
          )
        )}
        {localCritique?.generated_at && (
          <p className="px-5 py-3 border-t border-[#f5f5f5] text-[10px] text-[#afafaf]">
            Generated {new Date(localCritique.generated_at).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            })}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinancialsWorkspace({
  planId,
  initialEquipment,
  initialProjections,
  initialModelUpdatedAt,
  initialCritique,
  initialNeedsReviewAt,
  initialModelUpdatedAtForReview,
  canEdit,
  initialTrialMessagesUsed,
}: Props) {
  const [equipment, setEquipment] = useState<EquipmentItem[]>(initialEquipment);
  const [mp, setMp] = useState<MonthlyProjections>(initialProjections);
  const [critique, setCritique] = useState<CritiqueResult | null>(initialCritique);
  const [activeTab, setActiveTab] = useState<Tab>("equipment");
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: initialModelUpdatedAt,
  });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);

  const inFlightController = useRef<AbortController | null>(null);
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMpRef = useRef<MonthlyProjections>(initialProjections);
  const latestCritiqueRef = useRef<CritiqueResult | null>(initialCritique);

  const { setModuleProgress } = useWorkspaceProgress();

  // Show review banner if needs_review_at is set and after the model was last saved
  const showReviewBanner =
    !reviewDismissed &&
    !!initialNeedsReviewAt &&
    !!initialModelUpdatedAtForReview &&
    new Date(initialNeedsReviewAt) > new Date(initialModelUpdatedAtForReview);

  // Progress
  const progress = useMemo(() => {
    const hasEquipment = equipment.length > 0 ? 1 : 0;
    const hasFlow = Object.values(mp.daily_flow).some((v) => v > 0) ? 1 : 0;
    const hasCosts = mp.monthly_rent_cents > 0 && mp.avg_ticket_cents > 0 ? 1 : 0;
    return { filled: hasEquipment + hasFlow + hasCosts, total: 3 };
  }, [equipment, mp]);

  useEffect(() => {
    setModuleProgress(2, progress.filled, progress.total);
  }, [progress.filled, progress.total, setModuleProgress]);

  // Projections computed from equipment + forecast
  const equipmentSummary = useMemo(() => {
    const total_cost_cents = equipment.reduce((s, e) => s + e.unit_cost_cents * e.quantity, 0);
    const financed_cost_cents = equipment
      .filter((e) => e.financing_method === "loan" || e.financing_method === "lease")
      .reduce((s, e) => s + e.unit_cost_cents * e.quantity, 0);
    return { total_cost_cents, financed_cost_cents };
  }, [equipment]);

  const projections = useMemo(
    () => computeProjections(mp, equipmentSummary),
    [mp, equipmentSummary]
  );

  const lastSavedAt =
    saveState.kind === "saved" ? saveState.at : saveState.kind === "idle" ? saveState.lastSavedAt : null;

  // Persist forecast + critique to financial_models
  const persist = useCallback(
    async (nextMp: MonthlyProjections, nextCritique: CritiqueResult | null) => {
      if (!canEdit) return;
      if (inFlightController.current) inFlightController.current.abort();
      const controller = new AbortController();
      inFlightController.current = controller;
      setSaveState({ kind: "saving" });
      try {
        const res = await fetch("/api/workspaces/financials/model", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            monthly_projections: nextMp,
            ...(nextCritique !== undefined ? { critique: nextCritique } : {}),
          }),
          signal: controller.signal,
        });
        if (res.status === 402) {
          setSaveState({ kind: "error", message: "Subscription paused — reactivate to keep editing." });
          setPaywallOpen(true);
          return;
        }
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        const data = (await res.json()) as { updated_at?: string };
        setSaveState({ kind: "saved", at: data?.updated_at ?? new Date().toISOString() });
      } catch (err) {
        if (controller.signal.aborted) return;
        setSaveState({ kind: "error", message: err instanceof Error ? err.message : "Could not save. Will retry." });
      }
    },
    [canEdit]
  );

  const scheduleSave = useCallback(
    (nextMp: MonthlyProjections) => {
      latestMpRef.current = nextMp;
      setSaveState({ kind: "dirty" });
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = setTimeout(() => {
        pendingSaveTimer.current = null;
        void persist(latestMpRef.current, latestCritiqueRef.current);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persist]
  );

  function handleMpUpdate(next: MonthlyProjections) {
    setMp(next);
    scheduleSave(next);
  }

  function handleCritiqueUpdate(c: CritiqueResult | null) {
    setCritique(c);
    latestCritiqueRef.current = c;
    void persist(latestMpRef.current, c);
  }

  const saveLabel =
    saveState.kind === "saving" ? "Saving..."
    : saveState.kind === "dirty" ? "Unsaved changes"
    : saveState.kind === "error" ? saveState.message
    : formatTimestamp(lastSavedAt);

  const tabs: { id: Tab; label: string }[] = [
    { id: "equipment", label: "Equipment" },
    { id: "forecast", label: "Forecast Inputs" },
    { id: "projections", label: "Projections" },
  ];

  return (
    <div className="bg-[#faf9f7] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-16">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-5 h-5 text-[#155e63] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>Financials</h1>
          </div>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Plan your startup costs, forecast revenue, and project Year 1–5 performance.
          </p>
        </header>

        {/* Reactive review banner */}
        {showReviewBanner && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">Your concept or menu has changed</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Review your equipment list and forecast inputs to make sure they still reflect your plan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReviewDismissed(true)}
              className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="mb-5 flex items-center justify-between">
          <nav className="flex items-center gap-1 bg-white border border-[#efefef] rounded-xl p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors ${
                  activeTab === t.id ? "bg-[#155e63] text-white" : "text-[#6b6b6b] hover:text-[#1a1a1a]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <span className={`text-xs ${saveState.kind === "error" ? "text-[#a13d3d]" : "text-[#afafaf]"}`}>
            {saveLabel}
          </span>
        </div>

        {activeTab === "equipment" && (
          <EquipmentTab
            planId={planId}
            canEdit={canEdit}
            items={equipment}
            onItemsChange={setEquipment}
          />
        )}
        {activeTab === "forecast" && (
          <ForecastTab mp={mp} canEdit={canEdit} onUpdateMp={handleMpUpdate} />
        )}
        {activeTab === "projections" && (
          <ProjectionsTab
            projections={projections}
            canEdit={canEdit}
            critique={critique}
            onCritiqueUpdate={handleCritiqueUpdate}
          />
        )}
      </div>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} variant="copilot_trial" />
      <CoPilotDrawer
        planId={planId}
        workspaceKey="financials"
        currentFocus={{ label: "Financials" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />
    </div>
  );
}
