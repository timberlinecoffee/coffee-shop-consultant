"use client";

// TIM-972: Financial Suite — DB-backed architecture.
// TIM-1004: Per-day schedule + itemized operating expenses.
// TIM-1005: Equipment spreadsheet UI.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart2, X, AlertTriangle } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceProgress } from "@/components/workspace/WorkspaceProgressProvider";
import { EquipmentGrid } from "@/components/equipment/EquipmentGrid";
import {
  type MonthlyProjections,
  type FinancialProjections,
  type DayKey,
  type DaySchedule,
  type OpexLine,
  computeProjections,
  computeDayHours,
  computeWeeklyHours,
  formatCurrency,
  normalizeMonthlyProjections,
} from "@/lib/financial-projection";
import type { CritiqueResult } from "@/lib/financials";

const AUTOSAVE_DEBOUNCE_MS = 800;

// ── DB row shape from buildout_equipment_items ────────────────────────────────

export type EquipmentCategory =
  // 14 current categories
  | "espresso_platform" | "brew_platform" | "milk_beverage_prep" | "refrigeration"
  | "plumbing_water" | "electrical" | "pos_tech" | "furniture_fixtures"
  | "signage_decor" | "smallwares" | "ceramics" | "glassware" | "to_go_ware" | "miscellaneous"
  // legacy values kept for backward compat
  | "espresso" | "grinder" | "plumbing" | "furniture" | "pos" | "signage" | "other";

export type FinancingMethod =
  | "cash" | "in_house_financing" | "loan" | "lease" | "credit_card" | "other"
  | "credit"; // legacy

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
  supplier: string | null;
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

  const aiSeeded = items.some((i) => i.source === "ai_suggested");

  async function handleSeed() {
    setSeedStatus("loading");
    try {
      const res = await fetch("/api/workspaces/financials/seed", { method: "POST" });
      if (!res.ok) throw new Error(`seed failed (${res.status})`);
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

      <EquipmentGrid
        planId={planId}
        canEdit={canEdit}
        items={items}
        onItemsChange={onItemsChange}
      />
    </div>
  );
}

// ── Forecast tab ──────────────────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const DAY_FULL_LABELS: Record<DayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

// OpexLine input: % of revenue or flat $/month toggle
function OpexLineInput({
  label,
  hint,
  value,
  canEdit,
  onChange,
}: {
  label: string;
  hint: string;
  value: OpexLine;
  canEdit: boolean;
  onChange: (v: OpexLine) => void;
}) {
  const inputCls =
    "text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#f5f5f5] last:border-0">
      <div className="w-32 shrink-0">
        <p className="text-sm text-[#1a1a1a]">{label}</p>
        <p className="text-[10px] text-[#afafaf] mt-0.5 leading-snug">{hint}</p>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {canEdit ? (
          <div className="flex rounded-lg border border-[#e0e0e0] overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => onChange({ ...value, mode: "pct" })}
              className={`text-xs px-2.5 py-1.5 font-medium transition-colors ${
                value.mode === "pct"
                  ? "bg-[#155e63] text-white"
                  : "bg-white text-[#6b6b6b] hover:text-[#1a1a1a]"
              }`}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...value, mode: "flat" })}
              className={`text-xs px-2.5 py-1.5 font-medium transition-colors ${
                value.mode === "flat"
                  ? "bg-[#155e63] text-white"
                  : "bg-white text-[#6b6b6b] hover:text-[#1a1a1a]"
              }`}
            >
              $
            </button>
          </div>
        ) : (
          <span className="text-[10px] font-medium text-[#6b6b6b] shrink-0 bg-[#f0f0f0] px-2 py-1 rounded">
            {value.mode === "pct" ? "%" : "$"}
          </span>
        )}
        {value.mode === "pct" ? (
          <div className="relative flex-1 min-w-0 max-w-[120px]">
            <input
              className={`${inputCls} w-full pr-8`}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={value.pct || ""}
              onChange={(e) => onChange({ ...value, pct: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              disabled={!canEdit}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#afafaf] pointer-events-none">
              %
            </span>
          </div>
        ) : (
          <div className="relative flex-1 min-w-0 max-w-[120px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#afafaf] pointer-events-none">
              $
            </span>
            <input
              className={`${inputCls} w-full pl-6`}
              type="number"
              min={0}
              step={50}
              value={value.flat_cents ? value.flat_cents / 100 : ""}
              onChange={(e) =>
                onChange({ ...value, flat_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
              }
              placeholder="0"
              disabled={!canEdit}
            />
          </div>
        )}
        <span className="text-[10px] text-[#afafaf] shrink-0">
          {value.mode === "pct" ? "% of revenue" : "/ mo"}
        </span>
      </div>
    </div>
  );
}

function FlatLineInput({
  label,
  hint,
  valueCents,
  canEdit,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  valueCents: number;
  canEdit: boolean;
  step?: number;
  onChange: (cents: number) => void;
}) {
  const inputCls =
    "text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#f5f5f5] last:border-0">
      <div className="w-32 shrink-0">
        <p className="text-sm text-[#1a1a1a]">{label}</p>
        <p className="text-[10px] text-[#afafaf] mt-0.5 leading-snug">{hint}</p>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-[10px] font-medium text-[#6b6b6b] shrink-0 bg-[#f0f0f0] px-2.5 py-1.5 rounded-lg border border-[#e0e0e0]">
          $
        </span>
        <div className="relative flex-1 min-w-0 max-w-[120px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#afafaf] pointer-events-none">
            $
          </span>
          <input
            className={`${inputCls} w-full pl-6`}
            type="number"
            min={0}
            step={step ?? 50}
            value={valueCents ? valueCents / 100 : ""}
            onChange={(e) =>
              onChange(Math.round((parseFloat(e.target.value) || 0) * 100))
            }
            placeholder="0"
            disabled={!canEdit}
          />
        </div>
        <span className="text-[10px] text-[#afafaf] shrink-0">/ mo</span>
      </div>
    </div>
  );
}

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

  function updateScheduleDay(day: DayKey, patch: Partial<DaySchedule>) {
    update({
      weekly_schedule: {
        ...mp.weekly_schedule,
        [day]: { ...mp.weekly_schedule[day], ...patch },
      },
    });
  }

  function updateOpexLine(field: "labor" | "marketing", val: OpexLine) {
    update({ [field]: val });
  }

  const openDays = DAY_KEYS.filter((d) => mp.weekly_schedule[d].open);
  const totalWeeklyCustomers = openDays.reduce((sum, d) => sum + (mp.daily_flow[d] || 0), 0);
  const weeklyHours = computeWeeklyHours(mp.weekly_schedule);

  const inputCls =
    "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
  const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";
  const sectionLabelCls = "text-[10px] font-semibold uppercase tracking-wider text-[#155e63] mb-3";

  return (
    <div className="space-y-6">
      {/* Customer Flow */}
      <div>
        <p className={sectionLabelCls}>Customer Flow by Day</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Estimated customers per open day. Closed days are excluded from revenue calculations.
          </p>
          <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${openDays.length || 7}, minmax(0, 1fr))` }}>
            {DAY_KEYS.map((day) => {
              const isOpen = mp.weekly_schedule[day].open;
              if (!isOpen) return null;
              const val = mp.daily_flow[day] || 0;
              const maxVal = Math.max(
                ...openDays.map((d) => mp.daily_flow[d] || 0),
                1
              );
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
                    aria-label={`Customers on ${DAY_FULL_LABELS[day]}`}
                  />
                </div>
              );
            })}
          </div>
          {openDays.length === 0 && (
            <p className="text-xs text-[#afafaf] text-center py-4">No open days selected.</p>
          )}
          <p className="text-xs text-[#afafaf] mt-3">
            Weekly total: {totalWeeklyCustomers.toLocaleString()} customers across {openDays.length} open day{openDays.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Operating Schedule */}
      <div>
        <p className={sectionLabelCls}>Operating Schedule</p>
        <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px]">
              <thead>
                <tr className="border-b border-[#efefef] bg-[#faf9f7]">
                  <th className="py-2.5 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] w-16">Day</th>
                  <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] w-16">Open</th>
                  <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">Opens</th>
                  <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">Closes</th>
                  <th className="py-2.5 pl-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] w-16">Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f5]">
                {DAY_KEYS.map((day) => {
                  const sched = mp.weekly_schedule[day];
                  const hours = computeDayHours(sched);
                  return (
                    <tr key={day} className={!sched.open ? "bg-[#faf9f7]" : ""}>
                      <td className="py-2.5 pl-4 pr-2 text-sm font-medium text-[#1a1a1a]">
                        {DAY_LABELS[day]}
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="checkbox"
                          checked={sched.open}
                          onChange={(e) => updateScheduleDay(day, { open: e.target.checked })}
                          disabled={!canEdit}
                          className="w-4 h-4 accent-[#155e63] cursor-pointer disabled:cursor-default"
                          aria-label={`${DAY_FULL_LABELS[day]} open`}
                        />
                      </td>
                      <td className="py-2 px-2">
                        {sched.open ? (
                          <input
                            type="time"
                            value={sched.open_time}
                            onChange={(e) => updateScheduleDay(day, { open_time: e.target.value })}
                            disabled={!canEdit}
                            className="text-sm border border-[#e0e0e0] rounded-lg px-2 py-1.5 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors w-28"
                          />
                        ) : (
                          <span className="text-sm text-[#c0c0c0]">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {sched.open ? (
                          <input
                            type="time"
                            value={sched.close_time}
                            onChange={(e) => updateScheduleDay(day, { close_time: e.target.value })}
                            disabled={!canEdit}
                            className="text-sm border border-[#e0e0e0] rounded-lg px-2 py-1.5 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors w-28"
                          />
                        ) : (
                          <span className="text-sm text-[#c0c0c0]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 text-right text-sm text-[#6b6b6b]">
                        {sched.open ? `${hours % 1 === 0 ? hours : hours.toFixed(1)}h` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#e0e0e0] bg-[#faf9f7]">
                  <td colSpan={4} className="py-2.5 pl-4 pr-2 text-xs font-semibold text-[#6b6b6b]">
                    Weekly total
                  </td>
                  <td className="py-2.5 pl-2 pr-4 text-right text-sm font-semibold text-[#1a1a1a]">
                    {weeklyHours % 1 === 0 ? weeklyHours : weeklyHours.toFixed(1)}h
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Revenue Drivers */}
      <div>
        <p className={sectionLabelCls}>Revenue Drivers</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
        </div>
      </div>

      {/* Operating Expenses */}
      <div>
        <p className={sectionLabelCls}>Operating Expenses</p>
        <div className="rounded-xl border border-[#efefef] bg-white px-4 py-2">
          <p className="text-xs text-[#6b6b6b] pt-2 pb-3">
            For each line item, choose % of revenue or a flat monthly amount.
          </p>

          <OpexLineInput
            label="Labor"
            hint="Wages, payroll taxes, benefits. Typical: 28–32%"
            value={mp.labor}
            canEdit={canEdit}
            onChange={(v) => updateOpexLine("labor", v)}
          />

          <FlatLineInput
            label="Rent"
            hint="Monthly base rent"
            valueCents={mp.monthly_rent_cents}
            canEdit={canEdit}
            step={100}
            onChange={(c) => update({ monthly_rent_cents: c })}
          />

          <OpexLineInput
            label="Marketing"
            hint="Ads, promotions, social. Typical: 1–3%"
            value={mp.marketing}
            canEdit={canEdit}
            onChange={(v) => updateOpexLine("marketing", v)}
          />

          <FlatLineInput
            label="Utilities"
            hint="Gas, electric, water, internet"
            valueCents={mp.utilities_monthly_cents}
            canEdit={canEdit}
            onChange={(c) => update({ utilities_monthly_cents: c })}
          />

          <FlatLineInput
            label="Insurance"
            hint="General liability, workers comp, property"
            valueCents={mp.insurance_monthly_cents}
            canEdit={canEdit}
            onChange={(c) => update({ insurance_monthly_cents: c })}
          />

          <FlatLineInput
            label="Tech & Software"
            hint="POS, payment processing, scheduling, SaaS"
            valueCents={mp.tech_monthly_cents}
            canEdit={canEdit}
            onChange={(c) => update({ tech_monthly_cents: c })}
          />

          <FlatLineInput
            label="Maintenance"
            hint="Equipment repairs, upkeep"
            valueCents={mp.maintenance_monthly_cents}
            canEdit={canEdit}
            onChange={(c) => update({ maintenance_monthly_cents: c })}
          />

          <FlatLineInput
            label="Supplies"
            hint="Cleaning, paper, smallwares replenishment"
            valueCents={mp.supplies_monthly_cents}
            canEdit={canEdit}
            onChange={(c) => update({ supplies_monthly_cents: c })}
          />

          <FlatLineInput
            label="Other"
            hint="Miscellaneous operating expenses"
            valueCents={mp.other_monthly_cents}
            canEdit={canEdit}
            onChange={(c) => update({ other_monthly_cents: c })}
          />
        </div>
      </div>

      {/* Below the line */}
      <div>
        <p className={sectionLabelCls}>Below the Line</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Monthly interest (USD)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                step={50}
                value={mp.interest_monthly_cents ? mp.interest_monthly_cents / 100 : ""}
                onChange={(e) =>
                  update({ interest_monthly_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
                placeholder="0"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">Loan interest payments</p>
            </div>
            <div>
              <label className={labelCls}>Tax rate %</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                max={100}
                step={1}
                value={mp.taxes_pct || ""}
                onChange={(e) => update({ taxes_pct: parseFloat(e.target.value) || 0 })}
                placeholder="25"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">Applied to income before taxes when positive</p>
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
  negative,
  highlight,
  indent,
  separator,
}: {
  label: string;
  y1: number;
  y3: number;
  y5: number;
  bold?: boolean;
  negative?: boolean;
  highlight?: boolean;
  indent?: boolean;
  separator?: boolean;
}) {
  const cls = `py-2 px-3 text-right text-sm tabular-nums ${bold ? "font-semibold" : ""} ${
    highlight ? "text-[#155e63]" : negative ? "text-[#a13d3d]" : "text-[#1a1a1a]"
  }`;
  return (
    <>
      {separator && (
        <tr>
          <td colSpan={5} className="py-0">
            <div className="border-t border-[#e0e0e0] mx-4" />
          </td>
        </tr>
      )}
      <tr>
        <td
          className={`py-2 pr-2 text-sm ${indent ? "pl-8" : "pl-4"} ${
            bold ? "font-semibold text-[#1a1a1a]" : "text-[#6b6b6b]"
          }`}
        >
          {label}
        </td>
        <td className={cls}>{formatCurrency(y1)}</td>
        <td className={cls}>{formatCurrency(y3)}</td>
        <td className={cls}>{formatCurrency(y5)}</td>
        <td className="py-2 pr-4 pl-2 text-right">
          <Sparkline values={[y1, y3, y5]} />
        </td>
      </tr>
    </>
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
  const bulletColor = {
    strength: "text-[#155e63]",
    weakness: "text-[#a13d3d]",
    suggestion: "text-[#6b6b6b]",
  } as const;

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
              <MetricRow label="COGS" y1={-y1.cogs} y3={-y3.cogs} y5={-y5.cogs} negative indent />
              <MetricRow
                label="Gross Profit"
                y1={y1.gross_profit}
                y3={y3.gross_profit}
                y5={y5.gross_profit}
                bold
                highlight
                separator
              />

              {/* Operating Expenses */}
              <MetricRow label="Labor" y1={-y1.labor} y3={-y3.labor} y5={-y5.labor} negative indent separator />
              <MetricRow label="Rent" y1={-y1.rent} y3={-y3.rent} y5={-y5.rent} negative indent />
              <MetricRow label="Marketing" y1={-y1.marketing} y3={-y3.marketing} y5={-y5.marketing} negative indent />
              <MetricRow label="Utilities" y1={-y1.utilities} y3={-y3.utilities} y5={-y5.utilities} negative indent />
              <MetricRow label="Insurance" y1={-y1.insurance} y3={-y3.insurance} y5={-y5.insurance} negative indent />
              <MetricRow label="Tech & Software" y1={-y1.tech} y3={-y3.tech} y5={-y5.tech} negative indent />
              <MetricRow label="Maintenance" y1={-y1.maintenance} y3={-y3.maintenance} y5={-y5.maintenance} negative indent />
              <MetricRow label="Supplies" y1={-y1.supplies} y3={-y3.supplies} y5={-y5.supplies} negative indent />
              <MetricRow label="Other" y1={-y1.other_misc} y3={-y3.other_misc} y5={-y5.other_misc} negative indent />
              <MetricRow
                label="Total Operating Expenses"
                y1={-y1.total_opex}
                y3={-y3.total_opex}
                y5={-y5.total_opex}
                bold
                negative
              />
              <MetricRow
                label="Operating Income"
                y1={y1.operating_income}
                y3={y3.operating_income}
                y5={y5.operating_income}
                bold
                highlight
                separator
              />

              {/* Below the line */}
              {projections.financed_total > 0 && (
                <MetricRow
                  label="Depreciation"
                  y1={-y1.depreciation}
                  y3={-y3.depreciation}
                  y5={-y5.depreciation}
                  negative
                  indent
                  separator
                />
              )}
              {(y1.interest > 0 || y3.interest > 0) && (
                <MetricRow
                  label="Interest"
                  y1={-y1.interest}
                  y3={-y3.interest}
                  y5={-y5.interest}
                  negative
                  indent
                  separator={projections.financed_total === 0}
                />
              )}
              <MetricRow
                label="Income Before Taxes"
                y1={y1.income_before_taxes}
                y3={y3.income_before_taxes}
                y5={y5.income_before_taxes}
                bold
                separator
              />
              <MetricRow label="Taxes" y1={-y1.taxes} y3={-y3.taxes} y5={-y5.taxes} negative indent />
              <MetricRow
                label="Net Income"
                y1={y1.net_income}
                y3={y3.net_income}
                y5={y5.net_income}
                bold
                highlight
                separator
              />
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
                Financed (7yr depreciation):{" "}
                <span className="font-semibold text-[#1a1a1a]">
                  {formatCurrency(projections.financed_total)}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Year 1 GM",
            value: `${y1.gross_margin_pct.toFixed(0)}%`,
            sub: "Gross margin",
            ok: y1.gross_margin_pct >= 60,
          },
          {
            label: "Year 1 Op. Income",
            value: formatCurrency(y1.operating_income),
            sub: y1.revenue > 0 ? `${((y1.operating_income / y1.revenue) * 100).toFixed(0)}% margin` : "—",
            ok: y1.operating_income >= 0,
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
            <p className="text-[10px] font-medium text-[#6b6b6b] mb-1">{kpi.label}</p>
            <p className={`text-lg font-bold ${kpi.ok ? "text-[#155e63]" : "text-[#a13d3d]"}`}>
              {kpi.value}
            </p>
            <p className="text-[10px] text-[#afafaf] mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

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
                : localCritique
                ? "Refresh"
                : "Generate critique"}
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
        ) : !canEdit ? null : (
          <p className="px-5 py-4 text-sm text-[#afafaf]">
            Run a critique to get benchmarked feedback on your projections.
          </p>
        )}
        {localCritique?.generated_at && (
          <p className="px-5 py-3 border-t border-[#f5f5f5] text-[10px] text-[#afafaf]">
            Generated{" "}
            {new Date(localCritique.generated_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
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

  const showReviewBanner =
    !reviewDismissed &&
    !!initialNeedsReviewAt &&
    !!initialModelUpdatedAtForReview &&
    new Date(initialNeedsReviewAt) > new Date(initialModelUpdatedAtForReview);

  const progress = useMemo(() => {
    const hasEquipment = equipment.length > 0 ? 1 : 0;
    const hasFlow = Object.values(mp.daily_flow).some((v) => v > 0) ? 1 : 0;
    const hasCosts = mp.monthly_rent_cents > 0 && mp.avg_ticket_cents > 0 ? 1 : 0;
    return { filled: hasEquipment + hasFlow + hasCosts, total: 3 };
  }, [equipment, mp]);

  useEffect(() => {
    setModuleProgress(2, progress.filled, progress.total);
  }, [progress.filled, progress.total, setModuleProgress]);

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
          setSaveState({
            kind: "error",
            message: "Subscription paused — reactivate to keep editing.",
          });
          setPaywallOpen(true);
          return;
        }
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        const data = (await res.json()) as { updated_at?: string };
        setSaveState({ kind: "saved", at: data?.updated_at ?? new Date().toISOString() });
      } catch (err) {
        if (controller.signal.aborted) return;
        setSaveState({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not save. Will retry.",
        });
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
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-5 h-5 text-[#155e63] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>
              Financials
            </h1>
          </div>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Plan your startup costs, forecast revenue, and project Year 1–5 performance.
          </p>
        </header>

        {showReviewBanner && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">
                Your concept or menu has changed
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Review your equipment list and forecast inputs to make sure they still reflect your
                plan.
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
            className={`text-xs ${saveState.kind === "error" ? "text-[#a13d3d]" : "text-[#afafaf]"}`}
          >
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
