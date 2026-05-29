"use client";

// TIM-972: Financial Suite — DB-backed architecture.
// TIM-1004: Per-day schedule + itemized operating expenses.
// TIM-1029: Equipment tab removed; now lives in Build Out & Equipment workspace.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart2, X, AlertTriangle, Save, FileDown, Sheet, Compass, ChevronDown } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { NumericInput } from "@/components/ui/numeric-input";
import {
  type MonthlyProjections,
  type FinancialProjections,
  type MonthlySlice,
  type DayKey,
  type DaySchedule,
  type ForecastLine,
  type AssetCategory,
  type FundingSourceLine,
  type PersonnelLine,
  type StartupCosts,
  defaultStartupCosts,
  deriveFinancialInputs,
  computeProjections,
  computeMonthlySlices,
  computeDayHours,
  computeWeeklyHours,
  fiscalYearMonthLabels,
  formatCurrency,
  BASE_REVENUE_LINE_ID,
  applyForwardMonthIndices,
  manualOverrideCountsByLine,
  type ApplyForwardRange,
} from "@/lib/financial-projection";
import { CURRENCIES } from "@/lib/currency";
import { ChartCard, FinancialBarChart, CHART_COLORS } from "./tabs/financial-charts";
import { PLTab } from "./tabs/pl-tab";
import { BalanceSheetTab } from "./tabs/balance-sheet-tab";
import { CashFlowTab } from "./tabs/cash-flow-tab";
import { BreakEvenTab } from "./tabs/break-even-tab";
import { RatiosTab } from "./tabs/ratios-tab";
import { StartupTab } from "./tabs/startup-tab";
import { FundingTab } from "./tabs/funding-tab";
import { ForecastLinesEditor } from "./forecast-lines-editor";
import { PersonnelEditor } from "./personnel-editor";
import { OrgSyncPanel } from "./org-sync-panel";
import { GuidedTour, type TourStep } from "./guided-tour";
import type { CritiqueResult } from "@/lib/financials";

const AUTOSAVE_DEBOUNCE_MS = 800;

// TIM-1244: per-user guided-setup state, persisted via /api/ui-prefs.
const WIZARD_PREF_KEY = "financials_wizard";
type WizardPref = {
  status: "completed" | "skipped" | "in_progress";
};

// TIM-1244 (v2): the on-page guided tour. Each step spotlights a real field
// (on the named tab, inside the named collapsible section) and gives a plain
// question plus a typical-coffee-shop range. The owner fills the actual field.
const TOUR_STEPS: TourStep[] = [
  {
    id: "customers",
    tab: "forecast",
    targetId: "tour-customer-flow",
    sectionId: "section-customer-flow",
    title: "How busy is a typical day?",
    body: "Enter the customers you expect on each open day. This is the biggest driver of your revenue.",
    hint: "a new neighborhood cafe often sees 80–150 customers a day.",
    why: "We only count sales on days you're open.",
  },
  {
    id: "ticket",
    tab: "forecast",
    targetId: "tour-revenue",
    sectionId: "section-revenue",
    title: "What does a customer spend?",
    body: "Set your average sale per visit: one drink, or a drink plus a pastry. Customers x average sale is your daily revenue.",
    hint: "most espresso bars land between $6 and $10 per visit.",
  },
  {
    id: "cogs",
    tab: "forecast",
    targetId: "tour-cogs",
    sectionId: "section-revenue",
    title: "How much of each sale is ingredients?",
    body: "Your cost of goods (coffee, milk, cups, syrups) as a percentage of the sale price.",
    hint: "a well-run coffee shop keeps this around 28–35%.",
  },
  {
    id: "costs",
    tab: "forecast",
    targetId: "tour-costs",
    sectionId: "section-costs",
    title: "Set your monthly running costs",
    body: "Rent, utilities, insurance, marketing and more live here. Edit any line; toggle a flat dollar amount or a percent of sales.",
    hint: "rent for a small cafe is often 8–12% of sales.",
  },
  {
    id: "startup",
    tab: "startup",
    targetId: "tour-startup-capital-assets",
    title: "Add up your opening costs",
    body: "Your one-time costs to open live here. Capital assets (espresso machine, grinders, build-out) flow in automatically from the Build-Out & Equipment workspace; add supplies, deposits and other one-time costs directly. The total builds up as you go.",
    hint: "opening a small espresso bar often runs $80k–$250k all in.",
  },
  {
    id: "taxes",
    tab: "forecast",
    targetId: "tour-taxes",
    sectionId: "section-taxes",
    title: "Set your income tax rate",
    body: "This is income tax: the share of profit you'll set aside. You only pay it when the shop is profitable, and only on the profit.",
    hint: "~25% of profit is a safe starting point.",
  },
  {
    id: "sales-tax",
    tab: "forecast",
    targetId: "tour-sales-tax",
    sectionId: "section-taxes",
    title: "Now your sales tax rate",
    body: "Sales tax is separate: you collect it from customers and pass it through to the state. It does not change your revenue or profit. Set your local rate, or leave it 0% if none.",
    hint: "U.S. sales tax is typically 0% to 10%, depending on your state and city.",
  },
  {
    id: "staffing",
    tab: "personnel",
    targetId: "tour-personnel",
    title: "Add your team",
    body: "Add your baristas and any manager here, with their pay. We add a payroll cushion for taxes and benefits automatically.",
    hint: "baristas often earn $15–$20/hr; a manager $40k–$55k a year.",
    why: "Staff is usually the largest cost in a coffee shop.",
  },
  {
    id: "funding",
    tab: "funding",
    targetId: "tour-funding",
    title: "How are you paying for it?",
    body: "Add the money you're putting in, plus any loan. We'll check it covers your opening costs with a cushion for the early months.",
    hint: "many first owners self-fund $30k–$150k, often with a small loan.",
  },
];

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
  vendor_candidate_id: string | null;
  quantity: number;
  unit_cost_cents: number;
  priority_tier: PriorityTier;
  financing_method: FinancingMethod;
  source: EquipmentSource;
  notes: string | null;
  archived: boolean;
  // TIM-1253: per-item depreciation horizon and capitalization month.
  useful_life_years: number;          // 1–50, default 7
  purchase_month: number | null;      // 1–12, null = month 1 of operations
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveState =
  | { kind: "idle"; lastSavedAt: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

type Tab = "forecast" | "personnel" | "funding" | "projections" | "balance-sheet" | "cash-flow" | "break-even" | "ratios" | "startup";

// TIM-1257: deriveFinancialInputs + findForecastLineByKey now live in
// @/lib/financial-projection (single source of truth, unit-testable).

// TIM-1253: map equipment categories to the AssetCategory taxonomy on ForecastLine.
function equipmentCategoryToAsset(cat: EquipmentCategory): AssetCategory {
  switch (cat) {
    case "pos_tech": case "pos": return "pos_tech";
    case "furniture_fixtures": case "furniture": case "signage_decor": case "signage": return "furniture";
    default: return "equipment";
  }
}

// TIM-1253: convert active buildout_equipment_items to synthetic capex ForecastLines
// for computation. These are NEVER persisted — they exist only for the projection engine.
export function equipmentItemsToCapexLines(items: EquipmentItem[]): ForecastLine[] {
  return items
    .filter((i) => !i.archived && i.unit_cost_cents > 0)
    .map((i): ForecastLine => ({
      id: `equipment-item:${i.id}`,
      label: i.name || "Equipment",
      category: "capex",
      mode: "flat",
      value: i.unit_cost_cents * i.quantity,
      useful_life_years: i.useful_life_years ?? 7,
      asset_category: equipmentCategoryToAsset(i.category),
      linked_equipment_item_id: i.id,
      ramp: {
        enabled: true,
        start_month: i.purchase_month ?? 1,
        ramp_months: 0,
        start_pct: 100,
      },
    }));
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
  // TIM-1253: equipment items from buildout_equipment_items — shared-read from the DB.
  // These drive per-item capex depreciation in the projections without re-typing.
  initialEquipmentItems?: EquipmentItem[];
  // TIM-1117: blended COGS pct from the Menu module (or null when no priced
  // items exist). When a COGS forecast line opts to "link to menu", this rate
  // is applied instead of the user-entered % value.
  menuBlendedCogsPct?: number | null;
  // TIM-1168: per-item breakdown for the "How is this calculated?" reveal.
  menuCogsItems?: { name: string; price_cents: number; cogs_cents: number; expected_mix_pct: number; cogs_pct: number }[];
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

// ── Owner contributions editor (TIM-1169) ─────────────────────────────────────

function OwnerContributionsEditor({
  contributions,
  canEdit,
  currencyCode,
  onChange,
}: {
  contributions: { month_index: number; amount_cents: number }[];
  canEdit: boolean;
  currencyCode: string;
  onChange: (next: { month_index: number; amount_cents: number }[]) => void;
}) {
  const rowCls =
    "text-sm border border-[#e0e0e0] rounded-lg px-2 py-1.5 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf]";
  function update(idx: number, patch: Partial<{ month_index: number; amount_cents: number }>) {
    const next = contributions.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  }
  function remove(idx: number) {
    onChange(contributions.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...contributions, { month_index: 1, amount_cents: 0 }]);
  }
  return (
    <div className="space-y-2">
      {contributions.length === 0 && (
        <p className="text-[10px] text-[#afafaf]">
          None — add one if you plan to inject more cash later (e.g. month 6, $5,000).
        </p>
      )}
      {contributions.map((c, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-[10px] text-[#6b6b6b] w-12">Month</span>
          <NumericInput
            type="number"
            min={1}
            max={60}
            step={1}
            value={c.month_index}
            disabled={!canEdit}
            onChange={(e) =>
              update(idx, {
                month_index: Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)),
              })
            }
            className={rowCls + " w-16 text-right"}
            aria-label="Contribution month"
          />
          <span className="text-[10px] text-[#6b6b6b]">{currencyCode}</span>
          <NumericInput
            type="number"
            min={0}
            step={100}
            value={c.amount_cents ? c.amount_cents / 100 : ""}
            placeholder="0"
            disabled={!canEdit}
            onChange={(e) =>
              update(idx, {
                amount_cents: Math.max(
                  0,
                  Math.round((parseFloat(e.target.value) || 0) * 100)
                ),
              })
            }
            className={rowCls + " flex-1 text-right"}
            aria-label="Contribution amount"
          />
          {canEdit && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-[#afafaf] hover:text-[#a13d3d] text-xs"
              aria-label="Remove contribution"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={add}
          className="text-xs font-medium text-[#155e63] hover:bg-[#155e63]/5 px-2 py-1 rounded-md"
        >
          + Add contribution
        </button>
      )}
      <p className="text-[10px] text-[#afafaf] mt-1">
        Cash you put into the business at a future month. Shows up on the cash flow as a financing inflow.
      </p>
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

// TIM-1244: progressive-disclosure wrapper. Collapsible section with a teal
// label header and a chevron; "advanced" tags rarely-used groups so the page
// leads with the inputs that matter most and feels calm, not like a tax form.
function Section({
  id,
  title,
  defaultOpen = false,
  advanced = false,
  children,
}: {
  id?: string;
  title: string;
  defaultOpen?: boolean;
  advanced?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // TIM-1244 (v2): the guided tour expands the section a target lives in before
  // spotlighting it. It dispatches a window event with the section id.
  useEffect(() => {
    if (!id) return;
    function onExpand(e: Event) {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id === id) setOpen(true);
    }
    window.addEventListener("financials-tour-expand", onExpand as EventListener);
    return () => window.removeEventListener("financials-tour-expand", onExpand as EventListener);
  }, [id]);
  return (
    <div id={id}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#155e63]">
            {title}
          </span>
          {advanced && (
            <span className="text-[9px] font-medium uppercase tracking-wide text-[#afafaf] bg-[#f3f3f1] rounded px-1.5 py-0.5">
              Advanced
            </span>
          )}
        </span>
        <ChevronDown
          size={15}
          className={`text-[#afafaf] group-hover:text-[#6b6b6b] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {open && children}
    </div>
  );
}

function ForecastTab({
  mp,
  canEdit,
  onUpdateMp,
  menuBlendedCogsPct,
  menuCogsItems,
  equipmentItems,
  onStartWizard,
  onGoToStartup,
  manualLines,
  overrideCounts,
  onClearLineOverrides,
  onGoToProjections,
}: {
  mp: MonthlyProjections;
  canEdit: boolean;
  onUpdateMp: (next: MonthlyProjections) => void;
  menuBlendedCogsPct: number | null;
  menuCogsItems: { name: string; price_cents: number; cogs_cents: number; expected_mix_pct: number; cogs_pct: number }[];
  equipmentItems: EquipmentItem[];
  onStartWizard?: () => void;
  onGoToStartup?: () => void;
  // TIM-1310: grid-level customizations surfaced on the input page so the
  // relationship between assumptions and the customized projection is visible.
  manualLines: string[];
  overrideCounts: Record<string, number>;
  onClearLineOverrides: (lineId: string) => void;
  onGoToProjections?: () => void;
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
  const avgCustomersPerDay =
    openDays.length > 0 ? Math.round(totalWeeklyCustomers / openDays.length) : 0;
  const weeklyHours = computeWeeklyHours(mp.weekly_schedule);

  // TIM-1245: beverage/food split of the average ticket. avg_ticket stays the
  // single engine driver; the split just attributes it so the owner can read
  // average beverage/food sales per day.
  const splitOn = mp.revenue_split_enabled === true;
  const bevTicketCents = mp.beverage_ticket_cents ?? 0;
  const foodTicketCents = mp.food_ticket_cents ?? 0;
  function setBeverageTicket(cents: number) {
    const bev = Math.max(0, Math.round(cents));
    update({ beverage_ticket_cents: bev, avg_ticket_cents: bev + foodTicketCents });
  }
  function setFoodTicket(cents: number) {
    const food = Math.max(0, Math.round(cents));
    update({ food_ticket_cents: food, avg_ticket_cents: bevTicketCents + food });
  }
  function toggleSplit(on: boolean) {
    if (on) {
      update({
        revenue_split_enabled: true,
        beverage_ticket_cents: mp.beverage_ticket_cents ?? mp.avg_ticket_cents,
        food_ticket_cents: mp.food_ticket_cents ?? 0,
      });
    } else {
      update({ revenue_split_enabled: false });
    }
  }

  const inputCls =
    "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
  const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";

  // TIM-1310: summarize grid-level customizations for this input page. A line is
  // "customized" if it has any per-cell month override or is in full manual mode.
  const customizedLineIds = new Set<string>([
    ...Object.keys(overrideCounts),
    ...(manualLines ?? []),
  ]);
  const totalOverrideCells = Object.values(overrideCounts).reduce((a, b) => a + b, 0);
  const baseRevenueOverrides = overrideCounts[BASE_REVENUE_LINE_ID] ?? 0;
  const baseRevenueManual = (manualLines ?? []).includes(BASE_REVENUE_LINE_ID);

  return (
    <div className="space-y-6">
      {onStartWizard && (
        <div className="rounded-xl border border-[#155e63]/20 bg-[#155e63]/5 px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <Compass size={18} className="text-[#155e63] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[#1a1a1a]">New here? Let us walk you through this page.</p>
              <p className="text-xs text-[#6b6b6b] mt-0.5">
                We&apos;ll highlight each field and explain it as you fill it in.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onStartWizard}
            className="text-xs font-semibold text-white bg-[#155e63] rounded-lg px-4 py-2 hover:bg-[#124e52] transition-colors whitespace-nowrap"
          >
            Start guided setup
          </button>
        </div>
      )}

      {/* TIM-1310: when lines carry grid-level customizations, surface them here
          so the relationship between these assumptions and the customized
          projection is never a mystery, and document the precedence. */}
      {customizedLineIds.size > 0 && (
        <div className="rounded-xl border border-[#b9dada] bg-[#eaf4f4] px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#155e63] inline-block mt-1.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[#155e63]">
                {customizedLineIds.size} {customizedLineIds.size === 1 ? "line is" : "lines are"} customized on the projections grid
                {totalOverrideCells > 0 && (
                  <span className="font-normal text-[#2a4a4c]">
                    {" "}({totalOverrideCells} month{totalOverrideCells === 1 ? "" : "s"})
                  </span>
                )}
              </p>
              <p className="text-xs text-[#2a4a4c] mt-0.5 max-w-prose">
                These lines have manual month values that win over the assumptions below until you clear them.
                Each customized line is tagged with a <span className="font-semibold text-[#155e63]">customized</span> badge,
                and you can view it on the grid or clear it back to the assumption from there.
              </p>
            </div>
          </div>
          {onGoToProjections && (
            <button
              type="button"
              onClick={onGoToProjections}
              className="text-xs font-semibold text-[#155e63] border border-[#155e63]/30 bg-white rounded-lg px-3 py-1.5 hover:bg-[#155e63]/5 transition-colors whitespace-nowrap"
            >
              View on grid
            </button>
          )}
        </div>
      )}

      {/* Customer Flow */}
      <Section id="section-customer-flow" title="Customer Flow by Day" defaultOpen>
        <div id="tour-customer-flow" className="rounded-xl border border-[#efefef] bg-white p-4">
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
                  <NumericInput
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
      </Section>

      {/* Operating Schedule */}
      <Section title="Operating Schedule" advanced>
        <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-[#efefef] bg-[#faf9f7]">
                  <th className="py-2.5 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] w-16">Day</th>
                  <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] w-16">Open</th>
                  <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] w-36">Opens</th>
                  <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] w-36">Closes</th>
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
                            className="text-sm border border-[#e0e0e0] rounded-lg px-2 py-1.5 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors w-32 sm:w-36"
                          />
                        ) : (
                          <span className="text-sm text-[#c0c0c0]">Closed</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {sched.open ? (
                          <input
                            type="time"
                            value={sched.close_time}
                            onChange={(e) => updateScheduleDay(day, { close_time: e.target.value })}
                            disabled={!canEdit}
                            className="text-sm border border-[#e0e0e0] rounded-lg px-2 py-1.5 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors w-32 sm:w-36"
                          />
                        ) : (
                          <span className="text-sm text-[#c0c0c0]"></span>
                        )}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 text-right text-sm text-[#6b6b6b]">
                        {sched.open ? `${hours % 1 === 0 ? hours : hours.toFixed(1)}h` : ""}
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
      </Section>

      {/* Primary Revenue Streams (TIM-1245) — was "Revenue Drivers" */}
      <Section id="section-revenue" title="Primary Revenue Streams" defaultOpen>
        <div id="tour-revenue" className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Your day-to-day food &amp; beverage sales. Customers per day (above) ×
            average sale is your primary revenue. Keep it as one number, or split it
            into beverage and food to plan each separately.
          </p>
          {(baseRevenueOverrides > 0 || baseRevenueManual) && (
            <div className="mb-4 rounded-lg border border-[#b9dada] bg-[#eaf4f4] px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#155e63] inline-block mt-1.5 shrink-0" aria-hidden="true" />
                <p className="text-xs text-[#2a4a4c]">
                  <span className="font-semibold text-[#155e63]">Foot-traffic revenue is customized on the grid</span>
                  {baseRevenueManual
                    ? " (entered manually for every month)"
                    : ` (${baseRevenueOverrides} month${baseRevenueOverrides === 1 ? "" : "s"} overridden)`}
                  . Those values win over this assumption until you clear them.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onGoToProjections && (
                  <button
                    type="button"
                    onClick={onGoToProjections}
                    className="text-[11px] font-semibold text-[#155e63] hover:underline"
                  >
                    View on grid
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onClearLineOverrides(BASE_REVENUE_LINE_ID)}
                    className="text-[11px] font-semibold text-[#a13d3d] hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {splitOn ? (
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Beverage — average per sale ({mp.currency_code ?? "USD"})</label>
                  <NumericInput
                    className={inputCls}
                    type="number"
                    min={0}
                    step={0.5}
                    value={bevTicketCents ? bevTicketCents / 100 : ""}
                    onChange={(e) => setBeverageTicket((parseFloat(e.target.value) || 0) * 100)}
                    placeholder="5.50"
                    disabled={!canEdit}
                  />
                  <p className="text-[10px] text-[#afafaf] mt-1">Espresso, drip, tea, etc.</p>
                </div>
                <div>
                  <label className={labelCls}>Food — average per sale ({mp.currency_code ?? "USD"})</label>
                  <NumericInput
                    className={inputCls}
                    type="number"
                    min={0}
                    step={0.5}
                    value={foodTicketCents ? foodTicketCents / 100 : ""}
                    onChange={(e) => setFoodTicket((parseFloat(e.target.value) || 0) * 100)}
                    placeholder="2.00"
                    disabled={!canEdit}
                  />
                  <p className="text-[10px] text-[#afafaf] mt-1">Pastries, sandwiches, snacks</p>
                </div>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Average ticket ({mp.currency_code ?? "USD"})</label>
                <NumericInput
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
            )}
            <div id="tour-cogs">
              <label className={labelCls}>COGS % of revenue</label>
              <NumericInput
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

          {/* Progressive disclosure: optional beverage/food split */}
          <label className="flex items-center gap-2 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={splitOn}
              onChange={(e) => toggleSplit(e.target.checked)}
              disabled={!canEdit}
              className="w-3.5 h-3.5 accent-[#155e63] disabled:opacity-50"
            />
            <span className="text-xs font-medium text-[#1a1a1a]">
              Split into beverage &amp; food sales
            </span>
          </label>

          {splitOn && (
            <div className="mt-3 rounded-lg border border-[#e8f4f4] bg-[#f5fbfb] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#155e63] mb-1.5">
                Average sales per day {avgCustomersPerDay > 0 ? `(at ~${avgCustomersPerDay} customers/day)` : ""}
              </p>
              {avgCustomersPerDay > 0 ? (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[#6b6b6b]">Beverage</span>
                    <p className="font-semibold text-[#1a1a1a]">
                      {formatCurrency((bevTicketCents * avgCustomersPerDay) / 100, mp.currency_code ?? "USD")}/day
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6b6b6b]">Food</span>
                    <p className="font-semibold text-[#1a1a1a]">
                      {formatCurrency((foodTicketCents * avgCustomersPerDay) / 100, mp.currency_code ?? "USD")}/day
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6b6b6b]">Total</span>
                    <p className="font-semibold text-[#155e63]">
                      {formatCurrency((mp.avg_ticket_cents * avgCustomersPerDay) / 100, mp.currency_code ?? "USD")}/day
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-[#afafaf]">
                  Add customers per day above to see beverage and food sales per day.
                </p>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Additional Revenue Streams (TIM-1245) — promoted to a first-class section */}
      <Section title="Additional Revenue Streams" defaultOpen>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Income beyond your primary food &amp; beverage sales. Use the quick-add
            chips to start a common stream, or add your own. Each line can be a fixed
            monthly amount; click the arrow to expand a line and ramp it up or grow it over time.
          </p>
          <ForecastLinesEditor
            lines={mp.forecast_lines}
            canEdit={canEdit}
            onChange={updateForecastLines}
            currencyCode={mp.currency_code ?? "USD"}
            menuBlendedCogsPct={menuBlendedCogsPct}
            menuCogsItems={menuCogsItems}
            categories={["revenue"]}
            revenueStarterLabels={["Retail Sales", "Events", "Workshops", "Wholesale"]}
            manualLines={manualLines}
            overrideCounts={overrideCounts}
            onClearLineOverrides={onClearLineOverrides}
            onGoToProjections={onGoToProjections}
          />
        </div>
      </Section>

      {/* Costs & Expenses — COGS / Overhead / Capex */}
      <Section id="section-costs" title="Costs & Expenses" defaultOpen>
        <div id="tour-costs" className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Add, rename, or remove any line. For COGS lines, toggle{" "}
            <span className="font-semibold">$</span> (static monthly amount) or{" "}
            <span className="font-semibold">%</span> (percent of revenue). For operating
            expenses, pick the basis from the <span className="font-semibold">% of</span>{" "}
            dropdown: a fixed monthly amount, percent of overall revenue, or percent of a
            specific revenue stream. Click the arrow to expand a line and configure a
            ramp-up period or month-over-month growth.
          </p>
          <ForecastLinesEditor
            lines={mp.forecast_lines}
            canEdit={canEdit}
            onChange={updateForecastLines}
            currencyCode={mp.currency_code ?? "USD"}
            menuBlendedCogsPct={menuBlendedCogsPct}
            menuCogsItems={menuCogsItems}
            categories={["cogs", "overhead", "capex"]}
            manualLines={manualLines}
            overrideCounts={overrideCounts}
            onClearLineOverrides={onClearLineOverrides}
            onGoToProjections={onGoToProjections}
          />
          {/* TIM-1253: show equipment items from Build-Out & Equipment workspace
              as read-only capex entries so the user sees them in the capex
              schedule without re-typing. Editing happens in the other workspace. */}
          {equipmentItems.filter((i) => !i.archived && i.unit_cost_cents > 0).length > 0 && (
            <div className="mt-4 border-t border-[#efefef] pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#155e63] mb-2">
                Asset Purchases from Build-Out &amp; Equipment
              </p>
              <div className="space-y-1">
                {equipmentItems
                  .filter((i) => !i.archived && i.unit_cost_cents > 0)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg bg-[#f4f9f8] text-xs"
                    >
                      <span className="font-medium text-[#1a1a1a] truncate min-w-0 flex-1">
                        {item.name || "Unnamed asset"}
                      </span>
                      <span className="text-[#6b6b6b] shrink-0">
                        {formatCurrency((item.unit_cost_cents * item.quantity) / 100)}
                      </span>
                      <span className="text-[#afafaf] shrink-0 hidden sm:inline">
                        {item.useful_life_years ?? 7}yr life
                      </span>
                    </div>
                  ))}
              </div>
              <a
                href="/workspace/buildout-equipment"
                className="mt-2 inline-block text-xs font-medium text-[#155e63] hover:underline"
              >
                Edit in Build-Out &amp; Equipment →
              </a>
            </div>
          )}
        </div>
      </Section>

      {/* Other Operating Costs — TIM-1180 */}
      <Section title="Other Operating Costs" advanced>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Costs that scale with sales but aren&apos;t line items above. These flow into your
            P&amp;L, break-even, and ratios.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Payment processing %</label>
              <NumericInput
                className={inputCls}
                type="number"
                min={0}
                max={10}
                step={0.05}
                value={mp.payment_processing_pct ?? ""}
                onChange={(e) =>
                  update({ payment_processing_pct: Math.max(0, parseFloat(e.target.value) || 0) })
                }
                placeholder="2.5"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">% of gross revenue. Card fees: 2.5–3.0%</p>
            </div>
            <div>
              <label className={labelCls}>Spoilage %</label>
              <NumericInput
                className={inputCls}
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={mp.spoilage_pct ?? ""}
                onChange={(e) =>
                  update({ spoilage_pct: Math.max(0, parseFloat(e.target.value) || 0) })
                }
                placeholder="2"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">% of goods COGS lost to waste; typically 2–5%</p>
            </div>
            <div>
              <label className={labelCls}>Loyalty discount %</label>
              <NumericInput
                className={inputCls}
                type="number"
                min={0}
                max={20}
                step={0.1}
                value={mp.loyalty_discount_pct ?? ""}
                onChange={(e) =>
                  update({ loyalty_discount_pct: Math.max(0, parseFloat(e.target.value) || 0) })
                }
                placeholder="1"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">% of revenue redeemed; 0 if no program</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Owner Activity — TIM-1169 */}
      <Section title="Owner Activity" advanced>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Money you (the owner) take out of the business each month, plus any extra cash you put back in
            later on. These move equity and cash without touching net income.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Owner draws ({mp.currency_code ?? "USD"} / month)</label>
              <NumericInput
                className={inputCls}
                type="number"
                min={0}
                step={100}
                value={
                  (mp.owner_draws_monthly_cents ?? 0) > 0
                    ? (mp.owner_draws_monthly_cents ?? 0) / 100
                    : ""
                }
                onChange={(e) =>
                  update({
                    owner_draws_monthly_cents: Math.max(
                      0,
                      Math.round((parseFloat(e.target.value) || 0) * 100)
                    ),
                  })
                }
                placeholder="0"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">
                What you pay yourself from the business each month. Shows up on the cash flow as a financing outflow.
              </p>
            </div>
            <div>
              <label className={labelCls}>Owner contributions</label>
              <OwnerContributionsEditor
                contributions={mp.owner_contributions ?? []}
                canEdit={canEdit}
                currencyCode={mp.currency_code ?? "USD"}
                onChange={(next) => update({ owner_contributions: next })}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Startup & opening costs — TIM-1258: entry moved to the Startup Costs tab
          so owners find it where they expect it, led by equipment. */}
      <Section id="section-startup" title="Startup & Opening Costs" advanced>
        <div className="rounded-xl border border-[#155e63]/20 bg-[#155e63]/5 p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0">
            <Compass size={18} className="text-[#155e63] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#1a1a1a]">
                One-time costs to open the doors live on the Startup Costs tab.
              </p>
              <p className="text-xs text-[#6b6b6b] mt-0.5">
                Start with your equipment, then add build-out and supplies — the total
                builds up from what you actually need, and flows into your balance sheet
                and funding gap.
              </p>
            </div>
          </div>
          {onGoToStartup && (
            <button
              type="button"
              onClick={onGoToStartup}
              className="text-xs font-semibold text-white bg-[#155e63] rounded-lg px-4 py-2 hover:bg-[#124e52] transition-colors whitespace-nowrap"
            >
              Go to Startup Costs →
            </button>
          )}
        </div>
      </Section>

      {/* Tax rates — TIM-1247: sales tax and income tax are clearly separated */}
      {/* TIM-1247: taxes lead the page (not collapsed/advanced) so the two
          clearly labeled rates are visible without hunting — founder feedback
          that the single rate wasn't reaching the user. */}
      <Section id="section-taxes" title="Taxes" defaultOpen>
        <div className="rounded-xl border border-[#efefef] bg-white p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="tour-taxes">
              <label className={labelCls}>Income Tax Rate %</label>
              <NumericInput
                className={inputCls}
                type="number"
                min={0}
                max={100}
                step={1}
                value={mp.income_tax_pct || ""}
                onChange={(e) => update({ income_tax_pct: parseFloat(e.target.value) || 0 })}
                placeholder="25"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">
                Tax on your profit. Applied to pre-tax profit (only when positive)
                and subtracted to reach Net Income on the P&amp;L.
              </p>
            </div>
            <div id="tour-sales-tax">
              <label className={labelCls}>Sales Tax Rate %</label>
              <NumericInput
                className={inputCls}
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={mp.sales_tax_pct || ""}
                onChange={(e) => update({ sales_tax_pct: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-[#afafaf] mt-1">
                Tax you collect from customers and pass through to the state. It
                does not change revenue or profit. Your revenue figures here are
                shown without sales tax. Set your local rate (0% if none).
              </p>
            </div>
          </div>
          <p className="text-[10px] text-[#8a8a8a]">
            Two different taxes. <strong>Income tax</strong> is your cost and
            reduces net income. <strong>Sales tax</strong> is collected on sales
            and remitted to the state: money that passes through you, not income.
          </p>
        </div>
      </Section>

      {/* Fiscal Year Start — TIM-1100 / Currency — TIM-1101 */}
      <Section title="Fiscal Year & Currency" advanced>
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
      </Section>

      {/* Ramp Period */}
      <Section title="Ramp Period" advanced>
        <div className="rounded-xl border border-[#efefef] bg-white p-4">
          <p className="text-xs text-[#6b6b6b] mb-4">
            Reduced revenue assumptions while you build awareness in the first months.
          </p>
          <div className="mb-4">
            <label className={labelCls}>Ramp period (months)</label>
            <NumericInput
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
              <p className="text-xs font-medium text-[#6b6b6b] mb-1">Revenue multiplier per ramp month (%)</p>
              <p className="text-[10px] text-[#afafaf] mb-2">
                Each value is applied to your <strong>base monthly revenue</strong> (the revenue you&apos;d earn at full capacity). 50% means you earn half your projected revenue that month. Example: if your projected revenue is $10,000/month and Month 1 is set to 30%, Month 1 revenue projects to $3,000.
              </p>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(mp.ramp_months ?? 0, 6)}, minmax(0,1fr))` }}
              >
                {Array.from({ length: mp.ramp_months ?? 0 }).map((_, i) => {
                  const val = (mp.ramp_multipliers ?? [])[i] ?? 100;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-[#afafaf]">Month {i + 1}</span>
                      <NumericInput
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
      </Section>

      {/* Monthly Growth Rate */}
      <Section title="Monthly Growth Rate" advanced>
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
              <NumericInput
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
                      <span className="text-[10px] text-[#afafaf]">Month {i + 1}</span>
                      <NumericInput
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
      </Section>
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
  const labels = fiscalYearMonthLabels(fiscalYearStartMonth);
  const data = y1.map((s, i) => ({
    label: labels[i] ?? `M${i + 1}`,
    revenue: s.revenue_cents,
  }));
  const series = [
    { key: "revenue", label: "Monthly Revenue", color: CHART_COLORS.primary },
  ];
  return (
    <ChartCard
      title="Year 1 Monthly Revenue"
      description="Projected revenue for each month of your first operating year."
    >
      <FinancialBarChart
        data={data}
        series={series}
        currencyCode={currencyCode}
        height={240}
        stack={false}
      />
    </ChartCard>
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
  manualLines,
  onSetOverride,
  onClearOverride,
  onToggleManual,
  onApplyForward,
}: {
  projections: FinancialProjections;
  slices: MonthlySlice[];
  canEdit: boolean;
  critique: CritiqueResult | null;
  onCritiqueUpdate: (c: CritiqueResult | null) => void;
  fiscalYearStartMonth: number;
  currencyCode: string;
  manualLines: string[];
  onSetOverride: (lineId: string, monthIndexAbs: number, cents: number) => void;
  onClearOverride: (lineId: string, monthIndexAbs: number) => void;
  onToggleManual: (lineId: string, manual: boolean) => void;
  onApplyForward: (lineId: string, fromMonthIndexAbs: number, cents: number, range: ApplyForwardRange) => void;
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
      <PLTab
        slices={slices}
        fiscalYearStartMonth={fiscalYearStartMonth}
        currencyCode={currencyCode}
        editable={canEdit}
        manualLines={manualLines}
        onSetOverride={onSetOverride}
        onClearOverride={onClearOverride}
        onToggleManual={onToggleManual}
        onApplyForward={onApplyForward}
      />

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
            sub: y1.revenue > 0 ? `${((y1.operating_income / y1.revenue) * 100).toFixed(0)}% margin` : "n/a",
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
  initialEquipmentItems = [],
  menuBlendedCogsPct = null,
  menuCogsItems = [],
}: Props) {
  const [mp, setMp] = useState<MonthlyProjections>(initialProjections);
  const [critique, setCritique] = useState<CritiqueResult | null>(initialCritique);
  // TIM-1257: financialInputs is the SINGLE derived view of `mp` consumed by the
  // Funding/Startup/Break-Even/Balance-Sheet tabs. It must be a pure memo of `mp`
  // so ANY upstream edit (customer flow, funding sources, costs) recomputes every
  // dependent tab. It was previously a separate useState patched field-by-field in
  // handleMpUpdate, which silently omitted customers_per_day, days_per_week, and the
  // funding-derived loan/equity fields — so those tabs showed stale numbers.
  const financialInputs = useMemo(() => deriveFinancialInputs(mp), [mp]);
  const [activeTab, setActiveTab] = useState<Tab>("forecast");
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: initialModelUpdatedAt,
  });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);

  // TIM-1244 (v2): inline contextual guided setup. Auto-opens ONCE on the first
  // visit to the planner, then never again on its own — it's re-triggerable via
  // the on-page "Guided setup" button. Each invocation runs a single tour.
  const [tourOpen, setTourOpen] = useState(false);
  const [tourSeq, setTourSeq] = useState(0); // restart the tour from step 1 on each open

  const saveWizardPref = useCallback((pref: WizardPref) => {
    void fetch(`/api/ui-prefs/${WIZARD_PREF_KEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pref),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ui-prefs/${WIZARD_PREF_KEY}`);
        if (!res.ok) return;
        const { data } = (await res.json()) as { data: WizardPref | null };
        if (cancelled || data) return; // only the very first visit auto-opens
        // Mark it seen immediately so a reload never re-triggers the auto-open,
        // even if they close it without finishing.
        saveWizardPref({ status: "in_progress" });
        setTourOpen(true);
      } catch {
        // Network hiccup — silently skip auto-open; the button still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saveWizardPref]);

  function openWizard() {
    if (tourOpen) return; // one invocation at a time
    setTourSeq((n) => n + 1);
    setTourOpen(true);
  }

  const expandTourSection = useCallback((sectionId: string) => {
    window.dispatchEvent(
      new CustomEvent("financials-tour-expand", { detail: { id: sectionId } })
    );
  }, []);

  const inFlightController = useRef<AbortController | null>(null);
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMpRef = useRef<MonthlyProjections>(initialProjections);
  const latestCritiqueRef = useRef<CritiqueResult | null>(initialCritique);

  const { promoteOnEdit } = useWorkspaceStatus();

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
    if (progress.filled > 0) promoteOnEdit("financials");
  }, [progress.filled, promoteOnEdit]);

  // TIM-1253: derive EquipmentSummary from actual buildout_equipment_items so
  // startup_equipment_total and financed_total in FinancialProjections are real.
  const equipment = useMemo(() => {
    const active = initialEquipmentItems.filter((i) => !i.archived);
    const total_cost_cents = active.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);
    const FINANCED: FinancingMethod[] = ["loan", "lease", "in_house_financing", "credit_card", "credit", "other"];
    const financed_cost_cents = active
      .filter((i) => FINANCED.includes(i.financing_method))
      .reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);
    return { total_cost_cents, financed_cost_cents };
  }, [initialEquipmentItems]);

  // TIM-1258: when the owner has real equipment items in the Build-Out &
  // Equipment workspace, the Startup tab sources the Equipment line from that
  // total (read-only). Otherwise it falls back to the legacy startup_costs
  // equipment bucket — mirroring the projection's mpForProjection logic.
  const hasEquipmentItems = useMemo(
    () => initialEquipmentItems.some((i) => !i.archived && i.unit_cost_cents > 0),
    [initialEquipmentItems]
  );

  // TIM-1253: build an mp variant used ONLY for computation — it adds the
  // synthetic per-item capex ForecastLines from buildout_equipment_items and
  // zeros out startup_costs.equipment_cents so that TIM-1246's aggregate
  // depreciation path doesn't double-count with the per-item lines.
  const mpForProjection = useMemo(() => {
    const itemLines = equipmentItemsToCapexLines(initialEquipmentItems);
    if (itemLines.length === 0) return mp;
    const sc = mp.startup_costs ?? defaultStartupCosts();
    return {
      ...mp,
      startup_costs: { ...sc, equipment_cents: 0 },
      forecast_lines: [
        ...mp.forecast_lines.filter((l) => !l.linked_equipment_item_id),
        ...itemLines,
      ],
    };
  }, [mp, initialEquipmentItems]);

  // TIM-1254b: per-asset capex rows for the Startup tab Capital Assets section.
  // capexLines = user-authored capex ForecastLines (not linked to equipment items).
  // equipmentItemLines = synthetic lines from buildout_equipment_items.
  const startupCapexLines = useMemo(
    () => mp.forecast_lines.filter((l) => l.category === "capex" && !l.linked_equipment_item_id),
    [mp.forecast_lines]
  );
  const startupEquipmentItemLines = useMemo(
    () => equipmentItemsToCapexLines(initialEquipmentItems),
    [initialEquipmentItems]
  );

  // TIM-1117: feed the blended menu COGS pct into the projection so menu-linked
  // COGS lines compute against menu costing rather than the user-entered %.
  const projectionCtx = useMemo(
    () => ({ menu_blended_cogs_pct: menuBlendedCogsPct }),
    [menuBlendedCogsPct]
  );

  const projections = useMemo(
    () => computeProjections(mpForProjection, equipment, projectionCtx),
    [mpForProjection, equipment, projectionCtx]
  );

  const slices = useMemo(() => {
    // TIM-1181: feed the opening-balance-sheet inputs (fixed assets + pre-opening
    // costs) so the balance sheet reconciles against the funding sources and the
    // accounting identity holds. P&L display fields (payment processing %,
    // spoilage %) are intentionally excluded — they render as line items but are
    // not part of computed operating income, so passing them here would make the
    // P&L sub-lines exceed the operating-expense total.
    const fi = deriveFinancialInputs(mpForProjection);
    const balanceSheetInputs = {
      equipment_cost_cents: fi.equipment_cost_cents,
      buildout_cost_cents: fi.buildout_cost_cents,
      rent_deposits_cents: fi.rent_deposits_cents,
      license_permits_cents: fi.license_permits_cents,
      pre_opening_marketing_cents: fi.pre_opening_marketing_cents,
      initial_inventory_cents: fi.initial_inventory_cents,
      startup_supplies_cents: fi.startup_supplies_cents,
      professional_fees_cents: fi.professional_fees_cents,
    };
    return computeMonthlySlices(mpForProjection, equipment, balanceSheetInputs, projectionCtx);
  }, [mpForProjection, equipment, projectionCtx]);

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
    // TIM-1257: `mp` is the single source of truth. Setting it recomputes
    // financialInputs, projections, and slices via their memos, so every
    // dependent tab updates immediately. Do not maintain a parallel inputs copy.
    setMp(next);
    scheduleSave(next);
  }

  function handleFundingUpdate(next: FundingSourceLine[]) {
    handleMpUpdate({ ...mp, funding_sources: next });
  }

  // TIM-1258: startup costs are now entered directly on the Startup Costs tab.
  // Every edit writes to mp.startup_costs (source of truth) through handleMpUpdate,
  // so the change propagates to the balance sheet, funding gap, and exports.
  function handleStartupCostUpdate(key: keyof StartupCosts, cents: number) {
    const cur = mp.startup_costs ?? defaultStartupCosts();
    handleMpUpdate({
      ...mp,
      startup_costs: { ...cur, [key]: Math.max(0, Math.round(cents)) },
    });
  }

  function handlePersonnelUpdate(next: PersonnelLine[]) {
    handleMpUpdate({ ...mp, personnel: next });
  }

  // TIM-1243: manual override handlers. All mutate manual_overrides / manual_lines
  // on the model; recompute flows downstream automatically via the slices memo.
  function handleSetOverride(lineId: string, monthIndexAbs: number, cents: number) {
    const others = (mp.manual_overrides ?? []).filter(
      (o) => !(o.line_id === lineId && o.month_index === monthIndexAbs)
    );
    handleMpUpdate({
      ...mp,
      manual_overrides: [
        ...others,
        { line_id: lineId, month_index: monthIndexAbs, amount_cents: Math.max(0, Math.round(cents)) },
      ],
    });
  }

  function handleClearOverride(lineId: string, monthIndexAbs: number) {
    handleMpUpdate({
      ...mp,
      manual_overrides: (mp.manual_overrides ?? []).filter(
        (o) => !(o.line_id === lineId && o.month_index === monthIndexAbs)
      ),
    });
  }

  // Seed a line's current calculated values into overrides for all 60 months so
  // switching to manual entry is non-destructive ("starts with fields, then
  // converts to information" — LivePlan). Switching back drops them.
  function amountForLine(slice: MonthlySlice, lineId: string): number {
    if (lineId === BASE_REVENUE_LINE_ID) return slice.base_revenue_cents;
    const found = [
      ...(slice.forecast_line_amounts ?? []),
      ...(slice.personnel_line_amounts ?? []),
    ].find((a) => a.id === lineId);
    return found?.amount_cents ?? 0;
  }

  function handleToggleManual(lineId: string, manual: boolean) {
    const withoutLine = (mp.manual_overrides ?? []).filter((o) => o.line_id !== lineId);
    if (manual) {
      const seeds = slices.map((s) => ({
        line_id: lineId,
        month_index: s.month_index,
        amount_cents: amountForLine(s, lineId),
      }));
      handleMpUpdate({
        ...mp,
        manual_overrides: [...withoutLine, ...seeds],
        manual_lines: Array.from(new Set([...(mp.manual_lines ?? []), lineId])),
      });
    } else {
      handleMpUpdate({
        ...mp,
        manual_overrides: withoutLine,
        manual_lines: (mp.manual_lines ?? []).filter((id) => id !== lineId),
      });
    }
  }

  // TIM-1310: apply an overridden cell's value to a range of later months in a
  // single action. Writes per-cell overrides for the target months; it does not
  // flip the line into full-manual mode (the rest of the line keeps computing).
  function handleApplyForward(
    lineId: string,
    fromMonthIndexAbs: number,
    cents: number,
    range: ApplyForwardRange
  ) {
    const targets = applyForwardMonthIndices(fromMonthIndexAbs, range);
    if (targets.length === 0) return;
    const amt = Math.max(0, Math.round(cents));
    const targetSet = new Set(targets);
    const others = (mp.manual_overrides ?? []).filter(
      (o) => !(o.line_id === lineId && targetSet.has(o.month_index))
    );
    handleMpUpdate({
      ...mp,
      manual_overrides: [
        ...others,
        ...targets.map((month_index) => ({ line_id: lineId, month_index, amount_cents: amt })),
      ],
    });
  }

  // TIM-1310: clear every manual override for a line and drop it from manual
  // mode — the "manage/clear from the input page" affordance. The line reverts
  // to assumption-driven values.
  function handleClearLineOverrides(lineId: string) {
    handleMpUpdate({
      ...mp,
      manual_overrides: (mp.manual_overrides ?? []).filter((o) => o.line_id !== lineId),
      manual_lines: (mp.manual_lines ?? []).filter((id) => id !== lineId),
    });
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

  // TIM-1244 (v2): guided-tour outcomes. The owner fills the real fields as they
  // go, so there's nothing to map back — per-field autosave already persisted it.
  function handleTourFinish() {
    saveWizardPref({ status: "completed" });
    setTourOpen(false);
  }
  function handleTourSkip() {
    saveWizardPref({ status: "skipped" });
    setTourOpen(false);
  }
  function handleTourClose() {
    saveWizardPref({ status: "in_progress" });
    setTourOpen(false);
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
    { id: "personnel", label: "Salaries" },
    { id: "funding", label: "Funding" },
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
            {canEdit && (
              <button
                type="button"
                onClick={openWizard}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#155e63] rounded-lg px-3 py-1.5 hover:bg-[#124e52] transition-colors"
                title="Walk through your forecast inputs step by step, with a hint on each field"
              >
                <Compass size={12} aria-hidden="true" />
                Guided setup
              </button>
            )}
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
            menuCogsItems={menuCogsItems}
            equipmentItems={initialEquipmentItems}
            onStartWizard={openWizard}
            onGoToStartup={() => setActiveTab("startup")}
            manualLines={mp.manual_lines ?? []}
            overrideCounts={manualOverrideCountsByLine(mp.manual_overrides)}
            onClearLineOverrides={handleClearLineOverrides}
            onGoToProjections={() => setActiveTab("projections")}
          />
        )}
        {activeTab === "personnel" && (
          <>
            <OrgSyncPanel
              personnel={mp.personnel ?? []}
              enabled={mp.org_sync_enabled ?? false}
              canEdit={canEdit}
              currencyCode={currencyCode}
              onToggle={(next) => handleMpUpdate({ ...mp, org_sync_enabled: next })}
              onPersonnelChange={handlePersonnelUpdate}
            />
            <PersonnelEditor
              personnel={mp.personnel ?? []}
              canEdit={canEdit}
              currencyCode={currencyCode}
              onChange={handlePersonnelUpdate}
            />
          </>
        )}
        {activeTab === "funding" && (
          <FundingTab
            sources={mp.funding_sources ?? []}
            inputs={financialInputs}
            canEdit={canEdit}
            currencyCode={currencyCode}
            onChange={handleFundingUpdate}
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
            manualLines={mp.manual_lines ?? []}
            onSetOverride={handleSetOverride}
            onClearOverride={handleClearOverride}
            onToggleManual={handleToggleManual}
            onApplyForward={handleApplyForward}
          />
        )}
        {activeTab === "balance-sheet" && (
          <BalanceSheetTab
            slices={slices}
            fiscalYearStartMonth={fiscalYearStartMonth}
            currencyCode={currencyCode}
            financialInputs={financialInputs}
          />
        )}
        {activeTab === "cash-flow" && (
          <CashFlowTab slices={slices} fiscalYearStartMonth={fiscalYearStartMonth} currencyCode={currencyCode} />
        )}
        {activeTab === "break-even" && <BreakEvenTab slices={slices} inputs={financialInputs} forecastLines={mp.forecast_lines} currencyCode={currencyCode} />}
        {activeTab === "ratios" && <RatiosTab slices={slices} />}
        {activeTab === "startup" && (
          <StartupTab
            startupCosts={mp.startup_costs ?? defaultStartupCosts()}
            equipmentTotalCents={
              hasEquipmentItems
                ? equipment.total_cost_cents
                : (mp.startup_costs ?? defaultStartupCosts()).equipment_cents
            }
            hasEquipmentItems={hasEquipmentItems}
            capexLines={startupCapexLines}
            equipmentItemLines={startupEquipmentItemLines}
            fundingSources={mp.funding_sources ?? []}
            currencyCode={currencyCode}
            canEdit={canEdit}
            onUpdateField={handleStartupCostUpdate}
          />
        )}
      </div>

      {tourOpen && canEdit && (
        <GuidedTour
          key={tourSeq}
          steps={TOUR_STEPS}
          onTabChange={(tab) => setActiveTab(tab as Tab)}
          onExpandSection={expandTourSection}
          onFinish={handleTourFinish}
          onSkip={handleTourSkip}
          onClose={handleTourClose}
        />
      )}

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
