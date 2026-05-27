"use client";

// TIM-972: Financial Suite — DB-backed architecture.
// TIM-1004: Per-day schedule + itemized operating expenses.
// TIM-1029: Equipment tab removed; now lives in Build Out & Equipment workspace.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart2, X, AlertTriangle, Save, FileDown, Sheet } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceProgress } from "@/components/workspace/WorkspaceProgressProvider";
import {
  type MonthlyProjections,
  type FinancialProjections,
  type MonthlySlice,
  type FinancialInputs,
  type DayKey,
  type DaySchedule,
  type ForecastLine,
  computeProjections,
  computeMonthlySlices,
  computeDayHours,
  computeWeeklyHours,
  fiscalYearMonthLabels,
  formatCurrency,
} from "@/lib/financial-projection";
import { CURRENCIES } from "@/lib/currency";
import { PLTab } from "./tabs/pl-tab";
import { BalanceSheetTab } from "./tabs/balance-sheet-tab";
import { CashFlowTab } from "./tabs/cash-flow-tab";
import { BreakEvenTab } from "./tabs/break-even-tab";
import { RatiosTab } from "./tabs/ratios-tab";
import { StartupTab } from "./tabs/startup-tab";
import { ForecastLinesEditor } from "./forecast-lines-editor";
import type { CritiqueResult } from "@/lib/financials";

const AUTOSAVE_DEBOUNCE_MS = 800;

// ── DB row shape from buildout_equipment_items ────────────────────────────────

export type EquipmentCategory =
  // 14 current categories
  | "espresso_station" | "brew_platform" | "milk_beverage_prep" | "refrigeration"
  | "plumbing_water" | "electrical" | "pos_tech" | "furniture_fixtures"
  | "signage_decor" | "smallwares" | "ceramics" | "glassware" | "to_go_ware" | "miscellaneous"
  // legacy values kept for backward compat
  | "espresso_platform" | "espresso" | "grinder" | "plumbing" | "furniture" | "pos" | "signage" | "other";

export type FinancingMethod =
  | "cash" | "in_house_financing" | "loan" | "lease" | "credit_card" | "other"
  | "credit"; // legacy

export type PriorityTier = "must_have" | "nice_to_have";
export type EquipmentSource = "ai_suggested" | "user_added";

export interface EquipmentItem {
  id: string;
  plan_id: string;
  position: number;
  section_id: string | null;
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

type Tab = "forecast" | "projections" | "balance-sheet" | "cash-flow" | "break-even" | "ratios" | "startup";

function findLineByKey(lines: ForecastLine[], key: string) {
  return lines.find((l) => l.legacy_key === key);
}

function deriveFinancialInputs(mp: MonthlyProjections): FinancialInputs {
  const openDays = Object.values(mp.weekly_schedule).filter((d) => d.open).length;
  const openDayKeys = (Object.keys(mp.weekly_schedule) as DayKey[]).filter(
    (k) => mp.weekly_schedule[k].open
  );
  const totalDailyCustomers = openDayKeys.reduce((sum, k) => sum + (mp.daily_flow[k] ?? 0), 0);
  const avgCustomersPerDay = openDays > 0 ? Math.round(totalDailyCustomers / openDays) : 0;

  const labor = findLineByKey(mp.forecast_lines, "labor");
  const rent = findLineByKey(mp.forecast_lines, "rent");
  const marketing = findLineByKey(mp.forecast_lines, "marketing");
  const utilities = findLineByKey(mp.forecast_lines, "utilities");
  const insurance = findLineByKey(mp.forecast_lines, "insurance");
  const tech = findLineByKey(mp.forecast_lines, "tech");
  const maintenance = findLineByKey(mp.forecast_lines, "maintenance");
  const supplies = findLineByKey(mp.forecast_lines, "supplies");

  return {
    days_per_week: openDays,
    hours_per_day: 10,
    avg_ticket_cents: mp.avg_ticket_cents,
    customers_per_day: avgCustomersPerDay,
    beverage_revenue_pct: 70,
    food_revenue_pct: 20,
    retail_revenue_pct: 10,
    beverage_cogs_pct: 30,
    food_cogs_pct: 35,
    retail_cogs_pct: 45,
    rent_cents: rent?.mode === "flat" ? rent.value : 0,
    labor_pct: labor?.mode === "pct" ? labor.value : 30,
    marketing_pct: marketing?.mode === "pct" ? marketing.value : 2,
    utilities_cents: utilities?.mode === "flat" ? utilities.value : 0,
    insurance_cents: insurance?.mode === "flat" ? insurance.value : 0,
    tech_cents: tech?.mode === "flat" ? tech.value : 0,
    maintenance_cents: maintenance?.mode === "flat" ? maintenance.value : 0,
    supplies_cents: supplies?.mode === "flat" ? supplies.value : 0,
    payment_processing_pct: 2.5,
    spoilage_pct: 2,
    loyalty_discount_pct: 1,
    other_opex_cents: 0,
    buildout_cost_cents: 15000000,
    equipment_cost_cents: 5000000,
    rent_deposits_cents: 900000,
    license_permits_cents: 500000,
    pre_opening_marketing_cents: 300000,
    initial_inventory_cents: 200000,
    working_capital_reserve_cents: 1500000,
    opening_cash_buffer_cents: 1000000,
    owner_capital_cents: 15000000,
    loan_amount_cents: 10000000,
    loan_term_months: 60,
    loan_annual_rate_pct: 6.5,
    depreciation_years: 10,
    tax_rate_pct: mp.taxes_pct,
    days_inventory: 7,
    days_payable: 30,
    days_receivable: 1,
  };
}

interface Props {
  planId: string;
  initialProjections: MonthlyProjections;
  initialModelUpdatedAt: string | null;
  initialCritique: CritiqueResult | null;
  initialNeedsReviewAt: string | null;
  initialModelUpdatedAtForReview: string | null;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  // TIM-1117: blended COGS pct from the Menu module (or null when no priced
  // items exist). When a COGS forecast line opts to "link to menu", this rate
  // is applied instead of the user-entered % value.
  menuBlendedCogsPct?: number | null;
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

// ── Forecast tab ──────────────────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const DAY_FULL_LABELS: Record<DayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

function ForecastTab({
  mp,
  canEdit,
  onUpdateMp,
  menuBlendedCogsPct,
}: {
  mp: MonthlyProjections;
  canEdit: boolean;
  onUpdateMp: (next: MonthlyProjections) => void;
  menuBlendedCogsPct: number | null;
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

  function updateForecastLines(next: ForecastLine[]) {
    update({ forecast_lines: next });
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
              <label className={labelCls}>Average ticket ({mp.currency_code ?? "USD"})</label>
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

      {/* Forecast Lines — categorized (Revenue / COGS / Overhead / Capex) */}
      <div>
        <p className={sectionLabelCls}>Forecast Line Items</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Add, rename, or remove any line. For revenue and COGS lines, toggle{" "}
            <span className="font-semibold">$</span> (static monthly amount) or{" "}
            <span className="font-semibold">%</span> (percent of revenue). For operating
            expenses, pick the basis from the <span className="font-semibold">% of</span>{" "}
            dropdown: a fixed monthly amount, percent of overall revenue, or percent of a
            specific revenue stream. Click the sliders icon to configure a ramp-up period
            or month-over-month growth on any line.
          </p>
          <ForecastLinesEditor
            lines={mp.forecast_lines}
            canEdit={canEdit}
            onChange={updateForecastLines}
            currencyCode={mp.currency_code ?? "USD"}
            menuBlendedCogsPct={menuBlendedCogsPct}
          />
        </div>
      </div>

      {/* Tax rate */}
      <div>
        <p className={sectionLabelCls}>Taxes</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <div className="max-w-[200px]">
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

      {/* Fiscal Year Start — TIM-1100 / Currency — TIM-1101 */}
      <div>
        <p className={sectionLabelCls}>Fiscal Year & Currency</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Starting month</label>
              <select
                className={inputCls}
                value={mp.fiscal_year_start_month ?? 1}
                onChange={(e) => update({ fiscal_year_start_month: parseInt(e.target.value, 10) || 1 })}
                disabled={!canEdit}
              >
                {[
                  "January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December",
                ].map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
              <p className="text-[10px] text-[#afafaf] mt-1">
                Month-to-month columns, projections, and exports re-index from this month.
              </p>
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <select
                className={inputCls}
                value={mp.currency_code ?? "USD"}
                onChange={(e) => update({ currency_code: e.target.value })}
                disabled={!canEdit}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[#afafaf] mt-1">
                Drives symbol + formatting across the planner, AI assessment, and exports.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Ramp Period */}
      <div>
        <p className={sectionLabelCls}>Ramp Period</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Reduced revenue assumptions while you build awareness in the first months.
          </p>
          <div className="mb-4">
            <label className={labelCls}>Ramp period (months)</label>
            <input
              className={`${inputCls} max-w-[120px]`}
              type="number"
              min={0}
              max={12}
              step={1}
              value={mp.ramp_months ?? 0}
              onChange={(e) => {
                const n = Math.min(12, Math.max(0, parseInt(e.target.value, 10) || 0));
                const current = mp.ramp_multipliers ?? [];
                const defaults = [30, 55, 80];
                const next = Array.from({ length: n }, (_, i) =>
                  current[i] !== undefined ? current[i] : (defaults[i] ?? 100)
                );
                update({ ramp_months: n, ramp_multipliers: next });
              }}
              placeholder="0"
              disabled={!canEdit}
            />
            <p className="text-[10px] text-[#afafaf] mt-1">0 = no ramp; 1–12 months</p>
          </div>
          {(mp.ramp_months ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-[#6b6b6b] mb-2">Revenue multiplier per ramp month (%)</p>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(mp.ramp_months ?? 0, 6)}, minmax(0,1fr))` }}
              >
                {Array.from({ length: mp.ramp_months ?? 0 }).map((_, i) => {
                  const val = (mp.ramp_multipliers ?? [])[i] ?? 100;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-[#afafaf]">M{i + 1}</span>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={5}
                        value={val}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          const next = [...(mp.ramp_multipliers ?? [])];
                          next[i] = v;
                          update({ ramp_multipliers: next });
                        }}
                        className="w-full text-center text-xs border border-[#e0e0e0] rounded-md py-1.5 px-1 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf]"
                      />
                      <span className="text-[10px] text-[#c0c0c0]">%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Monthly Growth Rate */}
      <div>
        <p className={sectionLabelCls}>Monthly Growth Rate</p>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <div className="flex items-center gap-1 mb-4 bg-[#faf9f7] border border-[#e0e0e0] rounded-lg p-1 w-fit">
            {(["simple", "custom"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={!canEdit}
                onClick={() => update({ growth_mode: mode })}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors capitalize disabled:opacity-50 ${
                  (mp.growth_mode ?? "simple") === mode
                    ? "bg-[#155e63] text-white"
                    : "text-[#6b6b6b] hover:text-[#1a1a1a]"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {(mp.growth_mode ?? "simple") === "simple" ? (
            <div>
              <label className={labelCls}>Monthly growth %</label>
              <input
                className={`${inputCls} max-w-[140px]`}
                type="number"
                min={-100}
                max={100}
                step={0.1}
                value={mp.growth_monthly_pct ?? 0}
                onChange={(e) => update({ growth_monthly_pct: parseFloat(e.target.value) || 0 })}
                placeholder="2"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">
                Compounded monthly after ramp period ends. 2% / month ≈ 27% annually.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-[#6b6b6b] mb-3">
                Per-month growth % after ramp ends. Month 1 is the first post-ramp month.
              </p>
              <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: 12 }).map((_, i) => {
                  const val = (mp.growth_custom_monthly ?? [])[i] ?? (mp.growth_monthly_pct ?? 0);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-[#afafaf]">M{i + 1}</span>
                      <input
                        type="number"
                        min={-100}
                        max={100}
                        step={0.1}
                        value={val}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          const base = mp.growth_monthly_pct ?? 0;
                          const next = Array.from({ length: 12 }, (_, j) =>
                            j === i ? v : ((mp.growth_custom_monthly ?? [])[j] ?? base)
                          );
                          update({ growth_custom_monthly: next });
                        }}
                        className="w-full text-center text-xs border border-[#e0e0e0] rounded-md py-1.5 px-1 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf]"
                      />
                      <span className="text-[10px] text-[#c0c0c0]">%</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-[#afafaf] mt-3">
                Months 13+ use the last entered rate. Switch to Simple for uniform growth.
              </p>
            </div>
          )}
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
  currencyCode = "USD",
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
  currencyCode?: string;
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
        <td className={cls}>{formatCurrency(y1, currencyCode)}</td>
        <td className={cls}>{formatCurrency(y3, currencyCode)}</td>
        <td className={cls}>{formatCurrency(y5, currencyCode)}</td>
        <td className="py-2 pr-4 pl-2 text-right">
          <Sparkline values={[y1, y3, y5]} />
        </td>
      </tr>
    </>
  );
}

// ── Inline revenue chart ──────────────────────────────────────────────────────

function RevenueChart({
  slices,
  fiscalYearStartMonth,
  currencyCode,
}: {
  slices: MonthlySlice[];
  fiscalYearStartMonth: number;
  currencyCode: string;
}) {
  const y1 = slices.filter((s) => s.year === 1);
  if (y1.length === 0) return null;
  const values = y1.map((s) => s.revenue_cents / 100);
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 48;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1 || 1)) * (w - pad * 2);
    const y = h - pad - ((v / max) * (h - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const labels = fiscalYearMonthLabels(fiscalYearStartMonth);
  return (
    <div className="rounded-xl border border-[#efefef] bg-white p-4 mb-4">
      <p className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-3">
        Year 1 Monthly Revenue
      </p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height: 80 }}
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <polyline
          fill="none"
          stroke="#155e63"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pts.join(" ")}
        />
        {y1.map((_, i) => {
          const x = pad + (i / (y1.length - 1 || 1)) * (w - pad * 2);
          const v = values[i];
          const y = h - pad - ((v / max) * (h - pad * 2));
          return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="1.2" fill="#155e63" />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-[#afafaf] mt-1">
        <span>{labels[0]}</span>
        <span>{formatCurrency(minV, currencyCode)} – {formatCurrency(maxV, currencyCode)}</span>
        <span>{labels[11]}</span>
      </div>
    </div>
  );
}

function ProjectionsTab({
  projections,
  slices,
  canEdit,
  critique,
  onCritiqueUpdate,
  fiscalYearStartMonth,
  currencyCode,
}: {
  projections: FinancialProjections;
  slices: MonthlySlice[];
  canEdit: boolean;
  critique: CritiqueResult | null;
  onCritiqueUpdate: (c: CritiqueResult | null) => void;
  fiscalYearStartMonth: number;
  currencyCode: string;
}) {
  const { year1: y1, year3: y3, year5: y5 } = projections;
  const [assessmentStatus, setAssessmentStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [localAssessment, setLocalAssessment] = useState<CritiqueResult | null>(critique);

  async function generateAssessment() {
    setAssessmentStatus("loading");
    try {
      const res = await fetch("/api/workspaces/financials/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projections, currencyCode }),
      });
      if (!res.ok) throw new Error(`assessment failed (${res.status})`);
      const data = (await res.json()) as CritiqueResult;
      setLocalAssessment(data);
      setAssessmentStatus("done");
      onCritiqueUpdate(data);
    } catch {
      setAssessmentStatus("error");
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
      {/* Inline revenue trajectory chart */}
      <RevenueChart slices={slices} fiscalYearStartMonth={fiscalYearStartMonth} currencyCode={currencyCode} />

      {/* Monthly / Quarterly / Annual P&L table — defaults to monthly Y1 */}
      <PLTab slices={slices} fiscalYearStartMonth={fiscalYearStartMonth} currencyCode={currencyCode} />

      {/* KPI summary tiles */}
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
            value: formatCurrency(y1.operating_income, currencyCode),
            sub: y1.revenue > 0 ? `${((y1.operating_income / y1.revenue) * 100).toFixed(0)}% margin` : "—",
            ok: y1.operating_income >= 0,
          },
          {
            label: "Year 5 Net",
            value: formatCurrency(y5.net_income, currencyCode),
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

      {/* AI Assessment */}
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef] flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">AI Assessment</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Benchmarked against comparable independent coffee shops.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={generateAssessment}
              disabled={assessmentStatus === "loading"}
              className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors disabled:opacity-60 shrink-0"
            >
              {assessmentStatus === "loading"
                ? "Analyzing..."
                : localAssessment
                ? "Refresh"
                : "Generate assessment"}
            </button>
          )}
        </div>
        {assessmentStatus === "error" && (
          <p className="px-5 py-4 text-sm text-[#a13d3d]">Could not generate. Try again.</p>
        )}
        {localAssessment ? (
          <ul className="divide-y divide-[#f5f5f5]">
            {localAssessment.bullets.map((b, i) => (
              <li key={i} className="px-5 py-3 flex items-start gap-3">
                <span className={`text-sm font-bold shrink-0 mt-0.5 ${bulletColor[b.type]}`}>
                  {bulletIcon[b.type]}
                </span>
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-[#1a1a1a] leading-relaxed">{b.text}</p>
                  {b.type !== "strength" && b.recommendation && (
                    <p className="text-sm text-[#1a1a1a] leading-relaxed">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#888] mr-2">
                        Recommendation
                      </span>
                      {b.recommendation}
                    </p>
                  )}
                  {b.type !== "strength" && b.next_step && (
                    <p className="text-sm text-[#155e63] leading-relaxed">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#888] mr-2">
                        Next Step
                      </span>
                      {b.next_step}
                    </p>
                  )}
                  {b.type !== "strength" && b.why && (
                    <p className="text-xs text-[#6b6b6b] leading-relaxed italic">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#888] mr-2 not-italic">
                        Why
                      </span>
                      {b.why}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : !canEdit ? null : (
          <p className="px-5 py-4 text-sm text-[#afafaf]">
            Run an assessment to get benchmarked feedback on your projections.
          </p>
        )}
        {localAssessment?.generated_at && (
          <p className="px-5 py-3 border-t border-[#f5f5f5] text-[10px] text-[#afafaf]">
            Generated{" "}
            {new Date(localAssessment.generated_at).toLocaleDateString("en-US", {
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
  initialProjections,
  initialModelUpdatedAt,
  initialCritique,
  initialNeedsReviewAt,
  initialModelUpdatedAtForReview,
  canEdit,
  initialTrialMessagesUsed,
  menuBlendedCogsPct = null,
}: Props) {
  const [mp, setMp] = useState<MonthlyProjections>(initialProjections);
  const [critique, setCritique] = useState<CritiqueResult | null>(initialCritique);
  const [financialInputs, setFinancialInputs] = useState<FinancialInputs>(() =>
    deriveFinancialInputs(initialProjections)
  );
  const [activeTab, setActiveTab] = useState<Tab>("forecast");
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
    const hasFlow = Object.values(mp.daily_flow).some((v) => v > 0) ? 1 : 0;
    const hasCosts =
      mp.forecast_lines.some((l) => l.category === "overhead" && l.value > 0) &&
      mp.avg_ticket_cents > 0
        ? 1
        : 0;
    return { filled: hasFlow + hasCosts, total: 2 };
  }, [mp]);

  useEffect(() => {
    setModuleProgress(2, progress.filled, progress.total);
  }, [progress.filled, progress.total, setModuleProgress]);

  const equipment = useMemo(() => ({ total_cost_cents: 0, financed_cost_cents: 0 }), []);

  // TIM-1117: feed the blended menu COGS pct into the projection so menu-linked
  // COGS lines compute against menu costing rather than the user-entered %.
  const projectionCtx = useMemo(
    () => ({ menu_blended_cogs_pct: menuBlendedCogsPct }),
    [menuBlendedCogsPct]
  );

  const projections = useMemo(
    () => computeProjections(mp, equipment, projectionCtx),
    [mp, equipment, projectionCtx]
  );

  const slices = useMemo(
    () => computeMonthlySlices(mp, equipment, {}, projectionCtx),
    [mp, equipment, projectionCtx]
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
            forecast_inputs: nextMp,
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
    const labor = findLineByKey(next.forecast_lines, "labor");
    const rent = findLineByKey(next.forecast_lines, "rent");
    const marketing = findLineByKey(next.forecast_lines, "marketing");
    const utilities = findLineByKey(next.forecast_lines, "utilities");
    const insurance = findLineByKey(next.forecast_lines, "insurance");
    const tech = findLineByKey(next.forecast_lines, "tech");
    const maintenance = findLineByKey(next.forecast_lines, "maintenance");
    const supplies = findLineByKey(next.forecast_lines, "supplies");
    setFinancialInputs((prev) => ({
      ...prev,
      avg_ticket_cents: next.avg_ticket_cents,
      rent_cents: rent?.mode === "flat" ? rent.value : prev.rent_cents,
      labor_pct: labor?.mode === "pct" ? labor.value : prev.labor_pct,
      marketing_pct: marketing?.mode === "pct" ? marketing.value : prev.marketing_pct,
      utilities_cents: utilities?.mode === "flat" ? utilities.value : prev.utilities_cents,
      insurance_cents: insurance?.mode === "flat" ? insurance.value : prev.insurance_cents,
      tech_cents: tech?.mode === "flat" ? tech.value : prev.tech_cents,
      maintenance_cents: maintenance?.mode === "flat" ? maintenance.value : prev.maintenance_cents,
      supplies_cents: supplies?.mode === "flat" ? supplies.value : prev.supplies_cents,
      other_opex_cents: prev.other_opex_cents,
      tax_rate_pct: next.taxes_pct,
    }));
    scheduleSave(next);
  }

  function handleCritiqueUpdate(c: CritiqueResult | null) {
    setCritique(c);
    latestCritiqueRef.current = c;
    void persist(latestMpRef.current, c);
  }

  function handleManualSave() {
    if (!canEdit) return;
    if (pendingSaveTimer.current) {
      clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = null;
    }
    void persist(latestMpRef.current, latestCritiqueRef.current);
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
    { id: "forecast", label: "Forecast Inputs" },
    { id: "projections", label: "P&L" },
    { id: "balance-sheet", label: "Balance Sheet" },
    { id: "cash-flow", label: "Cash Flow" },
    { id: "break-even", label: "Break-Even" },
    { id: "ratios", label: "Ratios" },
    { id: "startup", label: "Startup Costs" },
  ];

  const fiscalYearStartMonth = mp.fiscal_year_start_month ?? 1;
  const currencyCode = mp.currency_code ?? "USD";

  return (
    <div className="bg-[#faf9f7] min-h-screen">
      <div className="w-full px-6 pt-8 pb-16">
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
                Review your forecast inputs to make sure they still reflect your plan.
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

        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <nav className="flex items-center gap-1 bg-white border border-[#efefef] rounded-xl p-1 overflow-x-auto max-w-full">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === t.id
                    ? "bg-[#155e63] text-white"
                    : "text-[#6b6b6b] hover:text-[#1a1a1a]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs ${saveState.kind === "error" ? "text-[#a13d3d]" : "text-[#afafaf]"}`}
            >
              {saveLabel}
            </span>
            <button
              type="button"
              onClick={() =>
                window.location.assign("/api/workspaces/financials/export/pdf")
              }
              className="flex items-center gap-1.5 text-xs font-semibold text-[#155e63] border border-[#155e63]/30 rounded-lg px-3 py-1.5 hover:bg-[#155e63]/5 transition-colors"
              title="Download financials as PDF (landscape monthly views)"
            >
              <FileDown size={12} aria-hidden="true" />
              Export PDF
            </button>
            <button
              type="button"
              onClick={() =>
                window.location.assign("/api/workspaces/financials/export/xlsx")
              }
              className="flex items-center gap-1.5 text-xs font-semibold text-[#155e63] border border-[#155e63]/30 rounded-lg px-3 py-1.5 hover:bg-[#155e63]/5 transition-colors"
              title="Download financials as Excel (.xlsx) with P&L, Cash Flow, Balance Sheet, Assumptions"
            >
              <Sheet size={12} aria-hidden="true" />
              Export Excel
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={handleManualSave}
                disabled={saveState.kind === "saving"}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#155e63] border border-[#155e63]/30 rounded-lg px-3 py-1.5 hover:bg-[#155e63]/5 transition-colors disabled:opacity-50"
              >
                <Save size={12} aria-hidden="true" />
                Save
              </button>
            )}
          </div>
        </div>

        {activeTab === "forecast" && (
          <ForecastTab
            mp={mp}
            canEdit={canEdit}
            onUpdateMp={handleMpUpdate}
            menuBlendedCogsPct={menuBlendedCogsPct}
          />
        )}
        {activeTab === "projections" && (
          <ProjectionsTab
            projections={projections}
            slices={slices}
            canEdit={canEdit}
            critique={critique}
            onCritiqueUpdate={handleCritiqueUpdate}
            fiscalYearStartMonth={fiscalYearStartMonth}
            currencyCode={currencyCode}
          />
        )}
        {activeTab === "balance-sheet" && (
          <BalanceSheetTab slices={slices} fiscalYearStartMonth={fiscalYearStartMonth} currencyCode={currencyCode} />
        )}
        {activeTab === "cash-flow" && (
          <CashFlowTab slices={slices} fiscalYearStartMonth={fiscalYearStartMonth} currencyCode={currencyCode} />
        )}
        {activeTab === "break-even" && <BreakEvenTab slices={slices} inputs={financialInputs} currencyCode={currencyCode} />}
        {activeTab === "ratios" && <RatiosTab slices={slices} />}
        {activeTab === "startup" && <StartupTab inputs={financialInputs} currencyCode={currencyCode} />}
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
