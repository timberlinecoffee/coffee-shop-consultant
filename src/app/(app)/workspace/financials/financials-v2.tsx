"use client";

// TIM-2594: FinancialsV2 — 3-tab layout (Inputs / Reports / Compare) behind
// ui_revamp_v2 flag. Navigation only — all data, calculations, and Scout
// suggestions carry through unchanged from FinancialsWorkspace.

import { useState, useCallback, useEffect } from "react";
import { BarChart2, ChevronDown, CheckCircle, Circle, Minus } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { WorkspaceSubNav } from "@/components/workspace/WorkspaceSubNav";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import { WorkspaceActionButton, WORKSPACE_ACTION_ICON_SIZE } from "@/components/workspace/WorkspaceActionButton";
import { WorkspaceActionMenu, WorkspaceActionMenuItem } from "@/components/workspace/WorkspaceActionMenu";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import { ConflictNoticeBadge } from "@/components/cross-suite/ConflictNoticeBadge";
import { PLTab } from "./tabs/pl-tab";
import { BalanceSheetTab } from "./tabs/balance-sheet-tab";
import { CashFlowTab } from "./tabs/cash-flow-tab";
import { BreakEvenTab } from "./tabs/break-even-tab";
import { RatiosTab } from "./tabs/ratios-tab";
import { StartupTab } from "./tabs/startup-tab";
import { FundingTab } from "./tabs/funding-tab";
import { DepreciationTab } from "./tabs/depreciation-tab";
import { PersonnelEditor } from "./personnel-editor";
import { OrgSyncPanel } from "./org-sync-panel";
import { ForecastLinesEditor } from "./forecast-lines-editor";
import { PaywallModal } from "@/components/paywall-modal";
import { NumericInput } from "@/components/ui/numeric-input";
import { MoneyInput } from "@/components/ui/money-input";
import { LabelWithHint } from "@/components/ui/label-with-hint";
import { InfoTip } from "@/components/ui/info-tip";
import { MenuTicketReconciliationBanner } from "@/components/cross-suite/MenuTicketReconciliationBanner";
import { DismissibleCallout } from "@/components/DismissibleCallout";
import { GuidedTour, type TourStep } from "./guided-tour";
import { Compass, FileDown, Sheet } from "lucide-react";
import { CURRENCIES } from "@/lib/currency";
import {
  type MonthlyProjections,
  type MonthlySlice,
  type FinancialProjections,
  type DayKey,
  type DaySchedule,
  type ForecastLine,
  type FundingSourceLine,
  type StartupCosts,
  type PersonnelLine,
  type FinancialInputs,
  type ApplyForwardRange,
  defaultStartupCosts,
  computeDayHours,
  computeWeeklyHours,
  formatCurrency,
  BASE_REVENUE_LINE_ID,
  manualOverrideCountsByLine,
  fiscalYearMonthLabels,
} from "@/lib/financial-projection";
import type { CritiqueResult } from "@/lib/financials";
import type { MinWageInfo } from "@/lib/wages/minimum-wage";
import type { OpeningRunwayResult } from "@/lib/business-plan/opening-runway";
import type { EquipmentItem } from "./financials-workspace";

// ── Types ─────────────────────────────────────────────────────────────────────

type V2Tab = "inputs" | "reports";
type SectionStatus = "complete" | "in_progress" | "empty";

// TIM-3488: v2 has a single Inputs tab with four accordion sections, so every
// step targets the inputs tab and names the AccordionSection id that holds the
// spotlighted field. The targetIds match the in-content `id="tour-*"` markers.
const TOUR_STEPS_V2: TourStep[] = [
  {
    id: "customers",
    tab: "inputs",
    targetId: "tour-customer-flow",
    sectionId: "v2-section-daily-traffic",
    title: "How busy is a typical day?",
    body: "Enter the customers you expect on each open day. This is the biggest driver of your revenue.",
    hint: "a new neighborhood cafe often sees 80–150 customers a day.",
    why: "We only count sales on days you're open.",
  },
  {
    id: "ticket",
    tab: "inputs",
    targetId: "tour-revenue",
    sectionId: "v2-section-revenue",
    title: "What does a customer spend?",
    body: "Set your average sale per visit: one drink, or a drink plus a pastry. Customers x average sale is your daily revenue.",
    hint: "most espresso bars land between $6 and $10 per visit.",
  },
  {
    id: "cogs",
    tab: "inputs",
    targetId: "tour-cogs",
    sectionId: "v2-section-revenue",
    title: "How much of each sale is ingredients?",
    body: "Your cost of goods (coffee, milk, cups, syrups) as a percentage of the sale price.",
    hint: "a well-run coffee shop keeps this around 28–35%.",
  },
  // Steps inside the Costs & Overhead accordion follow DOM order
  // (Cost lines → Personnel → Startup → Funding) so the spotlight scrolls
  // monotonically down the section instead of bouncing up and down.
  {
    id: "costs",
    tab: "inputs",
    targetId: "tour-costs",
    sectionId: "v2-section-costs",
    title: "Set your monthly running costs",
    body: "Rent, utilities, insurance, marketing and more live here. Edit any line; toggle a flat dollar amount or a percent of sales.",
    hint: "rent for a small cafe is often 8–12% of sales.",
  },
  {
    id: "staffing",
    tab: "inputs",
    targetId: "tour-personnel",
    sectionId: "v2-section-costs",
    title: "Add your team",
    body: "Add your baristas and any manager here, with their pay. We add a payroll cushion for taxes and benefits automatically.",
    hint: "baristas often earn $15–$20/hr; a manager $40k–$55k a year.",
    why: "Staff is usually the largest cost in a coffee shop.",
  },
  {
    id: "startup",
    tab: "inputs",
    targetId: "tour-startup-capital-assets",
    sectionId: "v2-section-costs",
    title: "Add up your opening costs",
    body: "Your one-time costs to open live here. Capital assets (espresso machine, grinders, build-out) flow in automatically from the Equipment & Supplies workspace; add supplies, deposits and other one-time costs directly.",
    hint: "opening a small espresso bar often runs $80k–$250k all in.",
  },
  {
    id: "funding",
    tab: "inputs",
    targetId: "tour-funding",
    sectionId: "v2-section-costs",
    title: "How are you paying for it?",
    body: "Add the money you're putting in, plus any loan. We'll check it covers your opening costs with a cushion for the early months.",
    hint: "many first owners self-fund $30k–$150k, often with a small loan.",
  },
  {
    id: "taxes",
    tab: "inputs",
    targetId: "tour-taxes",
    sectionId: "v2-section-growth",
    title: "Set your income tax rate",
    body: "This is income tax: the share of profit you'll set aside. You only pay it when the shop is profitable, and only on the profit.",
    hint: "~25% of profit is a safe starting point.",
  },
  {
    id: "sales-tax",
    tab: "inputs",
    targetId: "tour-sales-tax",
    sectionId: "v2-section-growth",
    title: "Now your sales tax rate",
    body: "Sales tax is separate: you collect it from customers and pass it through to the state. It does not change your revenue or profit.",
    hint: "U.S. sales tax is typically 0% to 10%, depending on your state and city.",
  },
];

// ── Shared day constants ───────────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
const DAY_FULL_LABELS: Record<DayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SectionStatus }) {
  if (status === "complete") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--teal)] bg-[var(--teal-tint-100)] border border-[var(--teal-tint)] px-2 py-0.5 rounded-full shrink-0">
        <CheckCircle size={10} aria-hidden="true" />
        Complete
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
        <Circle size={10} aria-hidden="true" />
        In progress
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--muted-foreground)] bg-[var(--background)] border border-[var(--border)] px-2 py-0.5 rounded-full shrink-0">
      <Minus size={10} aria-hidden="true" />
      Empty
    </span>
  );
}

// ── AccordionSection ──────────────────────────────────────────────────────────

// TIM-3488: `id` lets the guided tour open this section before spotlighting a
// field inside it. The matching event name is dispatched by FinancialsV2's
// onExpandSection handler.
function AccordionSection({
  id,
  title,
  status,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  status: SectionStatus;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!id) return;
    function onExpand(e: Event) {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id === id) setOpen(true);
    }
    window.addEventListener("financials-v2-tour-expand", onExpand as EventListener);
    return () => window.removeEventListener("financials-v2-tour-expand", onExpand as EventListener);
  }, [id]);

  return (
    <div id={id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--background)] transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <ChevronDown
            size={16}
            className={`text-[var(--muted-foreground)] transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          <SectionHeader title={title} className="mb-0 flex-1" />
        </div>
        <StatusBadge status={status} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-[var(--border)] space-y-5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function InputsProgressBar({ statuses }: { statuses: SectionStatus[] }) {
  const complete = statuses.filter((s) => s === "complete").length;
  const pct = Math.round((complete / statuses.length) * 100);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          Input completion
        </span>
        <span className="text-xs font-semibold text-[var(--teal)]">
          {complete} of {statuses.length} sections complete
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--teal)] transition-all duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

// ── Section-status derivers ───────────────────────────────────────────────────

function getDailyTrafficStatus(mp: MonthlyProjections): SectionStatus {
  const openDays = DAY_KEYS.filter((d) => mp.weekly_schedule[d].open);
  if (openDays.length === 0) return "empty";
  const filled = openDays.filter((d) => (mp.daily_flow[d] ?? 0) > 0);
  if (filled.length === openDays.length) return "complete";
  if (filled.length > 0) return "in_progress";
  return "empty";
}

function getRevenueStreamsStatus(mp: MonthlyProjections): SectionStatus {
  const hasTicket = (mp.avg_ticket_cents ?? 0) > 0;
  const hasCogs = (mp.cogs_pct ?? 0) > 0;
  if (hasTicket && hasCogs) return "complete";
  if (hasTicket || hasCogs) return "in_progress";
  return "empty";
}

function getCostsOverheadStatus(mp: MonthlyProjections): SectionStatus {
  const hasCostLines = mp.forecast_lines.some(
    (l) => ["overhead", "cogs"].includes(l.category) && (l.value ?? 0) > 0
  );
  const hasPersonnel = (mp.personnel ?? []).length > 0;
  const sc = mp.startup_costs ?? defaultStartupCosts();
  const hasStartup =
    (sc.equipment_cents ?? 0) > 0 ||
    (sc.buildout_cents ?? 0) > 0 ||
    (sc.initial_inventory_cents ?? 0) > 0;
  const hasFunding = (mp.funding_sources ?? []).length > 0;
  const count = [hasCostLines, hasPersonnel, hasStartup, hasFunding].filter(Boolean).length;
  if (count >= 3) return "complete";
  if (count > 0) return "in_progress";
  return "empty";
}

function getGrowthRampStatus(mp: MonthlyProjections): SectionStatus {
  const hasTaxes = (mp.income_tax_pct ?? 0) > 0 || (mp.sales_tax_pct ?? 0) > 0;
  const hasGrowth =
    (mp.growth_monthly_pct ?? 0) !== 0 || (mp.growth_custom_monthly ?? []).length > 0;
  if (hasTaxes && hasGrowth) return "complete";
  if (hasTaxes || hasGrowth) return "in_progress";
  return "empty";
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FinancialsV2Props {
  planId: string;
  mp: MonthlyProjections;
  onMpUpdate: (next: MonthlyProjections) => void;
  financialInputs: FinancialInputs;
  projections: FinancialProjections;
  slices: MonthlySlice[];
  canEdit: boolean;
  saveState: {
    kind: "idle" | "dirty" | "saving" | "saved" | "error";
    lastSavedAt?: string | null;
    at?: string;
    message?: string;
  };
  onManualSave: () => void;
  onFundingUpdate: (next: FundingSourceLine[]) => void;
  onStartupCostUpdate: (key: keyof StartupCosts, cents: number) => void;
  onPersonnelUpdate: (next: PersonnelLine[]) => void;
  onSetOverride: (lineId: string, monthIndexAbs: number, cents: number) => void;
  onClearOverride: (lineId: string, monthIndexAbs: number) => void;
  onToggleManual: (lineId: string, manual: boolean) => void;
  onApplyForward: (lineId: string, fromMonthIndexAbs: number, cents: number, range: ApplyForwardRange) => void;
  onClearLineOverrides: (lineId: string) => void;
  onCritiqueUpdate: (c: CritiqueResult | null) => void;
  menuBlendedCogsPct: number | null;
  menuCogsItems: { name: string; price_cents: number; cogs_cents: number; expected_mix_pct: number; cogs_pct: number }[];
  isRefreshingMenu: boolean;
  onRefreshMenu: () => void;
  isRefreshingEquipment: boolean;
  onRefreshEquipment: () => void;
  liveEquipmentItems: EquipmentItem[];
  equipment: { total_cost_cents: number; financed_cost_cents: number };
  hasEquipmentItems: boolean;
  startupCapexLines: ForecastLine[];
  startupEquipmentItemLines: ForecastLine[];
  openingRunway: OpeningRunwayResult;
  minimumWage: MinWageInfo | null;
  paywallOpen: boolean;
  onPaywallClose: () => void;
  onOpenWizard: () => void;
  // TIM-3488: state for the inline guided tour. Owned by the parent so the
  // first-visit auto-open and the pref-write callbacks stay in one place.
  tourOpen: boolean;
  tourSeq: number;
  onTourFinish: () => void;
  onTourSkip: () => void;
  onTourClose: (index: number) => void;
  initialTrialMessagesUsed?: number;
}

// ── Daily Traffic & Schedule section content ──────────────────────────────────

function DailyTrafficContent({
  mp,
  canEdit,
  onUpdate,
}: {
  mp: MonthlyProjections;
  canEdit: boolean;
  onUpdate: (next: MonthlyProjections) => void;
}) {
  const openDays = DAY_KEYS.filter((d) => mp.weekly_schedule[d].open);
  const weeklyHours = computeWeeklyHours(mp.weekly_schedule);

  function updateFlow(day: DayKey, val: number) {
    onUpdate({ ...mp, daily_flow: { ...mp.daily_flow, [day]: val } });
  }

  function updateScheduleDay(day: DayKey, patch: Partial<DaySchedule>) {
    onUpdate({
      ...mp,
      weekly_schedule: {
        ...mp.weekly_schedule,
        [day]: { ...mp.weekly_schedule[day], ...patch },
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* Customer flow */}
      <div id="tour-customer-flow" className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Customer Flow by Day
        </p>
        {openDays.length === 0 ? (
          <p className="text-xs text-[var(--dark-grey)] text-center py-2">
            No open days selected below.
          </p>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${openDays.length}, minmax(0, 1fr))` }}
          >
            {openDays.map((day) => {
              const val = mp.daily_flow[day] || 0;
              const maxVal = Math.max(...openDays.map((d) => mp.daily_flow[d] || 0), 1);
              const barPct = (val / maxVal) * 100;
              return (
                <div key={day} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-[var(--muted-foreground)]">
                    {DAY_LABELS[day]}
                  </span>
                  <div className="relative w-full h-12 bg-[var(--neutral-cool-150)] rounded-md overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-[var(--teal)]/20 transition-all duration-200"
                      style={{ height: `${barPct}%` }}
                    />
                  </div>
                  <NumericInput
                    type="number"
                    min={0}
                    max={999}
                    className="w-full text-center text-xs border border-[var(--border-medium)] rounded-md py-1 px-0 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
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
        )}
        {openDays.length > 0 && (
          <p className="text-xs text-[var(--dark-grey)] mt-2">
            Weekly total:{" "}
            {openDays.reduce((s, d) => s + (mp.daily_flow[d] || 0), 0).toLocaleString()} customers
          </p>
        )}
      </div>

      {/* Operating schedule */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden relative">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] px-4 pt-4 pb-2">
          Operating Schedule
        </p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-10 bottom-0 z-10 w-8 bg-gradient-to-l from-white to-transparent sm:hidden"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                <th className="py-2 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] w-16">Day</th>
                <th className="py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] w-16">Open</th>
                <th className="py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] w-32">Opens</th>
                <th className="py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] w-32">Closes</th>
                <th className="py-2 pl-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)]">Hrs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--neutral-cool-100)]">
              {DAY_KEYS.map((day) => {
                const sched = mp.weekly_schedule[day];
                const hours = computeDayHours(sched);
                return (
                  <tr key={day} className={!sched.open ? "bg-[var(--background)]" : ""}>
                    <td className="py-2 pl-4 pr-2 text-xs font-medium text-[var(--foreground)]">
                      {DAY_LABELS[day]}
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={sched.open}
                        onChange={(e) => updateScheduleDay(day, { open: e.target.checked })}
                        disabled={!canEdit}
                        className="w-4 h-4 accent-[var(--teal)] cursor-pointer disabled:cursor-default"
                        aria-label={`${DAY_FULL_LABELS[day]} open`}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      {sched.open ? (
                        <input
                          type="time"
                          value={sched.open_time}
                          onChange={(e) => updateScheduleDay(day, { open_time: e.target.value })}
                          disabled={!canEdit}
                          className="text-xs border border-[var(--border)] rounded-xl px-2 py-1 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] w-28"
                        />
                      ) : (
                        <span className="text-xs text-[var(--neutral-cool-400)]">Closed</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {sched.open ? (
                        <input
                          type="time"
                          value={sched.close_time}
                          onChange={(e) => updateScheduleDay(day, { close_time: e.target.value })}
                          disabled={!canEdit}
                          className="text-xs border border-[var(--border)] rounded-xl px-2 py-1 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] w-28"
                        />
                      ) : null}
                    </td>
                    <td className="py-2 pl-2 pr-4 text-right text-xs text-[var(--muted-foreground)]">
                      {/* eslint-disable-next-line no-restricted-syntax */}
                      {sched.open ? `${hours % 1 === 0 ? hours : hours.toFixed(1)}h` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-medium)] bg-[var(--background)]">
                <td colSpan={4} className="py-2 pl-4 text-xs font-semibold text-[var(--muted-foreground)]">
                  Weekly total
                </td>
                <td className="py-2 pl-2 pr-4 text-right text-xs font-semibold text-[var(--foreground)]">
                  {/* eslint-disable-next-line no-restricted-syntax */}
                  {weeklyHours % 1 === 0 ? weeklyHours : weeklyHours.toFixed(1)}h
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Revenue Streams section content ───────────────────────────────────────────

function RevenueStreamsContent({
  mp,
  canEdit,
  onUpdate,
  menuBlendedCogsPct,
  menuCogsItems,
  manualLines,
  overrideCounts,
  onClearLineOverrides,
  onGoToProjections,
  onRefreshMenu,
  isRefreshingMenu,
}: {
  mp: MonthlyProjections;
  canEdit: boolean;
  onUpdate: (next: MonthlyProjections) => void;
  menuBlendedCogsPct: number | null;
  menuCogsItems: { name: string; price_cents: number; cogs_cents: number; expected_mix_pct: number; cogs_pct: number }[];
  manualLines: string[];
  overrideCounts: Record<string, number>;
  onClearLineOverrides: (lineId: string) => void;
  onGoToProjections: () => void;
  onRefreshMenu: () => void;
  isRefreshingMenu: boolean;
}) {
  const inputCls =
    "w-full text-sm border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
  const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";
  const currencyCode = mp.currency_code ?? "USD";

  const openDays = DAY_KEYS.filter((d) => mp.weekly_schedule[d].open);
  const avgCustomersPerDay =
    openDays.length > 0
      ? Math.round(openDays.reduce((s, d) => s + (mp.daily_flow[d] || 0), 0) / openDays.length)
      : 0;

  const splitOn = mp.revenue_split_enabled === true;
  const bevTicketCents = mp.beverage_ticket_cents ?? 0;
  const foodTicketCents = mp.food_ticket_cents ?? 0;

  const baseRevenueOverrides = overrideCounts[BASE_REVENUE_LINE_ID] ?? 0;
  const baseRevenueManual = manualLines.includes(BASE_REVENUE_LINE_ID);

  return (
    <div className="space-y-4">
      {/* Primary Revenue */}
      <div id="tour-revenue" className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Primary Revenue Streams
        </p>

        {(baseRevenueOverrides > 0 || baseRevenueManual) && (
          <div className="mb-3 rounded-lg border border-[var(--teal-bg-950)] bg-[var(--teal-bg-subtle)] px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap">
            <p className="text-xs text-[var(--teal-deeper)]">
              <span className="font-semibold text-[var(--teal)]">Foot-traffic revenue is customized on the grid</span>
              {baseRevenueManual
                ? " (entered manually for every month)"
                : ` (${baseRevenueOverrides} month${baseRevenueOverrides === 1 ? "" : "s"} overridden)`}
              . Those values win over this assumption until you clear them.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={onGoToProjections} className="text-[11px] font-semibold text-[var(--teal)] hover:underline">
                View on Grid
              </button>
              {canEdit && (
                <button type="button" onClick={() => onClearLineOverrides(BASE_REVENUE_LINE_ID)} className="text-[11px] font-semibold text-[var(--error)] hover:underline">
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
                <label className={labelCls}>Beverage: avg per sale</label>
                <MoneyInput
                  currencyCode={currencyCode}
                  className={inputCls}
                  min={0}
                  step={0.5}
                  value={bevTicketCents ? bevTicketCents / 100 : ""}
                  onChange={(e) => {
                    const bev = Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100));
                    onUpdate({ ...mp, beverage_ticket_cents: bev, avg_ticket_cents: bev + foodTicketCents });
                  }}
                  placeholder="5.50"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className={labelCls}>Food: avg per sale</label>
                <MoneyInput
                  currencyCode={currencyCode}
                  className={inputCls}
                  min={0}
                  step={0.5}
                  value={foodTicketCents ? foodTicketCents / 100 : ""}
                  onChange={(e) => {
                    const food = Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100));
                    onUpdate({ ...mp, food_ticket_cents: food, avg_ticket_cents: bevTicketCents + food });
                  }}
                  placeholder="2.00"
                  disabled={!canEdit}
                />
              </div>
            </div>
          ) : (
            <div>
              <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Average ticket" hint="Typical espresso bar: $6–$10">
                Average ticket
              </LabelWithHint>
              <MoneyInput
                currencyCode={currencyCode}
                className={inputCls}
                min={0}
                step={0.5}
                value={mp.avg_ticket_cents ? mp.avg_ticket_cents / 100 : ""}
                onChange={(e) =>
                  onUpdate({ ...mp, avg_ticket_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
                placeholder="7.50"
                disabled={!canEdit}
              />
            </div>
          )}
          <div id="tour-cogs">
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="COGS % of revenue" hint="Typical coffee shop: 28–35%">
              COGS % of revenue
            </LabelWithHint>
            <NumericInput
              className={inputCls}
              type="number"
              min={0}
              max={100}
              value={mp.cogs_pct || ""}
              onChange={(e) => onUpdate({ ...mp, cogs_pct: parseFloat(e.target.value) || 0 })}
              placeholder="30"
              disabled={!canEdit}
            />
          </div>
        </div>

        <MenuTicketReconciliationBanner origin="financials" className="mt-3" />

        <label className="flex items-center gap-2 cursor-pointer mt-3">
          <input
            type="checkbox"
            checked={splitOn}
            onChange={(e) => {
              if (e.target.checked) {
                onUpdate({
                  ...mp,
                  revenue_split_enabled: true,
                  beverage_ticket_cents: mp.beverage_ticket_cents ?? mp.avg_ticket_cents,
                  food_ticket_cents: mp.food_ticket_cents ?? 0,
                });
              } else {
                onUpdate({ ...mp, revenue_split_enabled: false });
              }
            }}
            disabled={!canEdit}
            className="w-3.5 h-3.5 accent-[var(--teal)] disabled:opacity-50"
          />
          <span className="text-xs font-medium text-[var(--foreground)]">Split into beverage &amp; food sales</span>
        </label>

        {splitOn && avgCustomersPerDay > 0 && (
          <div className="mt-3 rounded-lg border border-[var(--teal-bg-e8f)] bg-[var(--teal-bg-muted)] px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)] mb-1.5">
              Avg sales/day (~{avgCustomersPerDay} customers)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-[var(--muted-foreground)]">Beverage</span>
                <p className="font-semibold">{formatCurrency((bevTicketCents * avgCustomersPerDay) / 100, currencyCode)}/day</p>
              </div>
              <div>
                <span className="text-[var(--muted-foreground)]">Food</span>
                <p className="font-semibold">{formatCurrency((foodTicketCents * avgCustomersPerDay) / 100, currencyCode)}/day</p>
              </div>
              <div>
                <span className="text-[var(--muted-foreground)]">Total</span>
                <p className="font-semibold text-[var(--teal)]">{formatCurrency((mp.avg_ticket_cents * avgCustomersPerDay) / 100, currencyCode)}/day</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Additional revenue */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Additional Revenue Streams
        </p>
        <ForecastLinesEditor
          lines={mp.forecast_lines}
          canEdit={canEdit}
          onChange={(next) => onUpdate({ ...mp, forecast_lines: next })}
          currencyCode={currencyCode}
          menuBlendedCogsPct={menuBlendedCogsPct}
          menuCogsItems={menuCogsItems}
          categories={["revenue"]}
          revenueStarterLabels={["Retail Sales", "Events", "Workshops", "Wholesale"]}
          manualLines={manualLines}
          overrideCounts={overrideCounts}
          onClearLineOverrides={onClearLineOverrides}
          onGoToProjections={onGoToProjections}
          hideCategoryHeader
        />
      </div>
    </div>
  );
}

// ── Costs & Overhead section content ──────────────────────────────────────────

function CostsOverheadContent({
  mp,
  canEdit,
  onUpdate,
  menuBlendedCogsPct,
  menuCogsItems,
  manualLines,
  overrideCounts,
  onClearLineOverrides,
  onGoToProjections,
  onRefreshMenu,
  isRefreshingMenu,
  onRefreshEquipment,
  isRefreshingEquipment,
  financialInputs,
  equipment,
  hasEquipmentItems,
  startupCapexLines,
  startupEquipmentItemLines,
  openingRunway,
  onStartupCostUpdate,
  onPersonnelUpdate,
  onFundingUpdate,
  minimumWage,
}: {
  mp: MonthlyProjections;
  canEdit: boolean;
  onUpdate: (next: MonthlyProjections) => void;
  menuBlendedCogsPct: number | null;
  menuCogsItems: { name: string; price_cents: number; cogs_cents: number; expected_mix_pct: number; cogs_pct: number }[];
  manualLines: string[];
  overrideCounts: Record<string, number>;
  onClearLineOverrides: (lineId: string) => void;
  onGoToProjections: () => void;
  onRefreshMenu: () => void;
  isRefreshingMenu: boolean;
  onRefreshEquipment: () => void;
  isRefreshingEquipment: boolean;
  financialInputs: FinancialInputs;
  equipment: { total_cost_cents: number; financed_cost_cents: number };
  hasEquipmentItems: boolean;
  startupCapexLines: ForecastLine[];
  startupEquipmentItemLines: ForecastLine[];
  openingRunway: OpeningRunwayResult;
  onStartupCostUpdate: (key: keyof StartupCosts, cents: number) => void;
  onPersonnelUpdate: (next: PersonnelLine[]) => void;
  onFundingUpdate: (next: FundingSourceLine[]) => void;
  minimumWage: MinWageInfo | null;
}) {
  const inputCls =
    "w-full text-sm border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
  const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";
  const currencyCode = mp.currency_code ?? "USD";

  return (
    <div className="space-y-4">
      {/* Cost lines */}
      <div id="tour-costs" className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Costs &amp; Expenses
        </p>
        <ForecastLinesEditor
          lines={mp.forecast_lines}
          canEdit={canEdit}
          onChange={(next) => onUpdate({ ...mp, forecast_lines: next })}
          currencyCode={currencyCode}
          menuBlendedCogsPct={menuBlendedCogsPct}
          menuCogsItems={menuCogsItems}
          categories={["cogs", "overhead"]}
          manualLines={manualLines}
          overrideCounts={overrideCounts}
          onClearLineOverrides={onClearLineOverrides}
          onGoToProjections={onGoToProjections}
          onRefreshMenu={onRefreshMenu}
          isRefreshingMenu={isRefreshingMenu}
          onRefreshEquipment={onRefreshEquipment}
          isRefreshingEquipment={isRefreshingEquipment}
        />
      </div>

      {/* Other operating costs */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Other Operating Costs
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Payment processing %" hint="% of gross revenue. Card fees: 2.5–3.0%">
              Payment processing %
            </LabelWithHint>
            <NumericInput
              className={inputCls}
              type="number"
              min={0}
              max={10}
              step={0.05}
              value={mp.payment_processing_pct ?? ""}
              onChange={(e) => onUpdate({ ...mp, payment_processing_pct: Math.max(0, parseFloat(e.target.value) || 0) })}
              placeholder="2.5"
              disabled={!canEdit}
            />
          </div>
          <div>
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Spoilage %" hint="% of goods COGS lost to waste; typically 2–5%">
              Spoilage %
            </LabelWithHint>
            <NumericInput
              className={inputCls}
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={mp.spoilage_pct ?? ""}
              onChange={(e) => onUpdate({ ...mp, spoilage_pct: Math.max(0, parseFloat(e.target.value) || 0) })}
              placeholder="2"
              disabled={!canEdit}
            />
          </div>
          <div>
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Loyalty discount %" hint="% of revenue redeemed; 0 if no program">
              Loyalty discount %
            </LabelWithHint>
            <NumericInput
              className={inputCls}
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={mp.loyalty_discount_pct ?? ""}
              onChange={(e) => onUpdate({ ...mp, loyalty_discount_pct: Math.max(0, parseFloat(e.target.value) || 0) })}
              placeholder="1"
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>

      {/* Personnel / Salaries — `id="tour-personnel"` lives on the inner
          PersonnelEditor root, so the wrapper here intentionally has no id to
          avoid a duplicate-id DOM. */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)]">
          Personnel &amp; Salaries
        </p>
        <OrgSyncPanel
          personnel={mp.personnel ?? []}
          enabled={mp.org_sync_enabled ?? false}
          canEdit={canEdit}
          currencyCode={currencyCode}
          onToggle={(next) => onUpdate({ ...mp, org_sync_enabled: next })}
          onPersonnelChange={onPersonnelUpdate}
        />
        <PersonnelEditor
          personnel={mp.personnel ?? []}
          canEdit={canEdit}
          currencyCode={currencyCode}
          onChange={onPersonnelUpdate}
          minimumWage={minimumWage}
        />
      </div>

      {/* Startup Costs — `id="tour-startup-capital-assets"` lives on the inner
          StartupTab root. */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)]">
          Startup &amp; Opening Costs
        </p>
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
          onUpdateField={onStartupCostUpdate}
          openingRunway={openingRunway}
        />
      </div>

      {/* Funding — `id="tour-funding"` lives on the inner FundingTab root. */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)]">
          Funding &amp; Loans
        </p>
        <FundingTab
          sources={mp.funding_sources ?? []}
          inputs={financialInputs}
          canEdit={canEdit}
          currencyCode={currencyCode}
          onChange={onFundingUpdate}
        />
      </div>
    </div>
  );
}

// ── Growth & Ramp section content ─────────────────────────────────────────────

function GrowthRampContent({
  mp,
  canEdit,
  onUpdate,
}: {
  mp: MonthlyProjections;
  canEdit: boolean;
  onUpdate: (next: MonthlyProjections) => void;
}) {
  const inputCls =
    "w-full text-sm border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
  const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";

  return (
    <div className="space-y-4">
      {/* Ramp period */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Ramp Period
        </p>
        <div className="mb-3">
          <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Ramp period (months)" hint="0 = no ramp; 1–12 months">
            Ramp period (months)
          </LabelWithHint>
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
              onUpdate({ ...mp, ramp_months: n, ramp_multipliers: next });
            }}
            placeholder="0"
            disabled={!canEdit}
          />
        </div>
        {(mp.ramp_months ?? 0) > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Revenue multiplier per ramp month (%)</span>
              <InfoTip label="Revenue multiplier per ramp month">
                Each value is applied to your base monthly revenue. 50% means you earn half your projected revenue that month.
              </InfoTip>
            </div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.min(mp.ramp_months ?? 0, 6)}, minmax(0,1fr))` }}
            >
              {Array.from({ length: mp.ramp_months ?? 0 }).map((_, i) => {
                const val = (mp.ramp_multipliers ?? [])[i] ?? 100;
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-[var(--dark-grey)]">Month {i + 1}</span>
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
                        onUpdate({ ...mp, ramp_multipliers: next });
                      }}
                      className="w-full text-center text-xs border border-[var(--border-medium)] rounded-md py-1.5 px-1 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                    />
                    <span className="text-[10px] text-[var(--neutral-cool-400)]">%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Monthly growth */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Monthly Growth Rate
        </p>
        <div className="flex items-center gap-1 mb-3 bg-[var(--background)] border border-[var(--border)] rounded-xl p-1 w-fit">
          {(["simple", "custom"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={!canEdit}
              onClick={() => onUpdate({ ...mp, growth_mode: mode })}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors capitalize disabled:opacity-50 ${
                (mp.growth_mode ?? "simple") === mode
                  ? "bg-[var(--teal)] text-white"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        {(mp.growth_mode ?? "simple") === "simple" ? (
          <div>
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Monthly growth %" hint="Compounded monthly after ramp. 2%/month ≈ 27% annually.">
              Monthly growth %
            </LabelWithHint>
            <NumericInput
              className={`${inputCls} max-w-[140px]`}
              type="number"
              min={-100}
              max={100}
              step={0.1}
              value={mp.growth_monthly_pct ?? 0}
              onChange={(e) => onUpdate({ ...mp, growth_monthly_pct: parseFloat(e.target.value) || 0 })}
              placeholder="2"
              disabled={!canEdit}
            />
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs text-[var(--muted-foreground)]">Per-month growth %</span>
              <InfoTip label="Per-month growth %">Month 1 is the first post-ramp month. Months 13+ use the last entered rate.</InfoTip>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {Array.from({ length: 12 }).map((_, i) => {
                const val = (mp.growth_custom_monthly ?? [])[i] ?? (mp.growth_monthly_pct ?? 0);
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-[var(--dark-grey)]">M{i + 1}</span>
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
                        onUpdate({ ...mp, growth_custom_monthly: next });
                      }}
                      className="w-full text-center text-xs border border-[var(--border-medium)] rounded-md py-1 px-0.5 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                    />
                    <span className="text-[10px] text-[var(--neutral-cool-400)]">%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Taxes */}
      <div id="tour-taxes" className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Tax Rates
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Income Tax Rate %" hint="Tax on profit only. ~25% is a safe starting point.">
              Income Tax Rate %
            </LabelWithHint>
            <NumericInput
              className={inputCls}
              type="number"
              min={0}
              max={100}
              step={1}
              value={mp.income_tax_pct || ""}
              onChange={(e) => onUpdate({ ...mp, income_tax_pct: parseFloat(e.target.value) || 0 })}
              placeholder="25"
              disabled={!canEdit}
            />
          </div>
          <div id="tour-sales-tax">
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Sales Tax Rate %" hint="Collected from customers, passed to state. 0% if none.">
              Sales Tax Rate %
            </LabelWithHint>
            <NumericInput
              className={inputCls}
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={mp.sales_tax_pct || ""}
              onChange={(e) => onUpdate({ ...mp, sales_tax_pct: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>

      {/* Fiscal Year & Currency */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Fiscal Year &amp; Currency
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Starting month" hint="Month-to-month columns re-index from this month.">
              Starting month
            </LabelWithHint>
            <select
              className={inputCls}
              value={mp.fiscal_year_start_month ?? 1}
              onChange={(e) => onUpdate({ ...mp, fiscal_year_start_month: parseInt(e.target.value, 10) || 1 })}
              disabled={!canEdit}
            >
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Currency" hint="Drives symbol + formatting across the planner.">
              Currency
            </LabelWithHint>
            <select
              className={inputCls}
              value={mp.currency_code ?? "USD"}
              onChange={(e) => onUpdate({ ...mp, currency_code: e.target.value })}
              disabled={!canEdit}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}: {c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Owner Activity */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3">
          Owner Activity
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <LabelWithHint className={labelCls.replace(" mb-1", "")} hintLabel="Owner draws" hint="What you pay yourself monthly. Shows on cash flow as financing outflow.">
              Owner draws / month
            </LabelWithHint>
            <MoneyInput
              currencyCode={mp.currency_code ?? "USD"}
              className={inputCls}
              min={0}
              step={100}
              value={(mp.owner_draws_monthly_cents ?? 0) > 0 ? (mp.owner_draws_monthly_cents ?? 0) / 100 : ""}
              onChange={(e) =>
                onUpdate({
                  ...mp,
                  owner_draws_monthly_cents: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                })
              }
              placeholder="0"
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reports tab — all 6 sub-reports stacked ───────────────────────────────────

function ReportsTab({
  slices,
  projections,
  financialInputs,
  fiscalYearStartMonth,
  currencyCode,
  canEdit,
  manualLines,
  liveEquipmentItems,
  forecastLines,
  menuBlendedCogsPct,
  menuCogsItems,
  overrideCounts,
  onSetOverride,
  onClearOverride,
  onToggleManual,
  onApplyForward,
  onClearLineOverrides,
  onGoToProjections,
  onChangeForecastLines,
}: {
  slices: MonthlySlice[];
  projections: FinancialProjections;
  financialInputs: FinancialInputs;
  fiscalYearStartMonth: number;
  currencyCode: string;
  canEdit: boolean;
  manualLines: string[];
  liveEquipmentItems: EquipmentItem[];
  forecastLines: ForecastLine[];
  menuBlendedCogsPct: number | null;
  menuCogsItems: { name: string; price_cents: number; cogs_cents: number; expected_mix_pct: number; cogs_pct: number }[];
  overrideCounts: Record<string, number>;
  onSetOverride: (lineId: string, monthIndexAbs: number, cents: number) => void;
  onClearOverride: (lineId: string, monthIndexAbs: number) => void;
  onToggleManual: (lineId: string, manual: boolean) => void;
  onApplyForward: (lineId: string, fromMonthIndexAbs: number, cents: number, range: ApplyForwardRange) => void;
  onClearLineOverrides: (lineId: string) => void;
  onGoToProjections: () => void;
  onChangeForecastLines: (next: ForecastLine[]) => void;
}) {
  return (
    <div className="space-y-8">
      {/* P&L */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Profit &amp; Loss</h2>
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
      </section>

      <div className="border-t border-[var(--border)]" />

      {/* Cash Flow */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Cash Flow</h2>
        <CashFlowTab slices={slices} fiscalYearStartMonth={fiscalYearStartMonth} currencyCode={currencyCode} />
      </section>

      <div className="border-t border-[var(--border)]" />

      {/* Balance Sheet */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Balance Sheet</h2>
        <BalanceSheetTab
          slices={slices}
          fiscalYearStartMonth={fiscalYearStartMonth}
          currencyCode={currencyCode}
          financialInputs={financialInputs}
        />
      </section>

      <div className="border-t border-[var(--border)]" />

      {/* Break-Even */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Break-Even</h2>
        <BreakEvenTab
          slices={slices}
          inputs={financialInputs}
          forecastLines={forecastLines}
          currencyCode={currencyCode}
        />
      </section>

      <div className="border-t border-[var(--border)]" />

      {/* Depreciation */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Depreciation Schedule</h2>
        <DepreciationTab
          equipmentItems={liveEquipmentItems}
          slices={slices}
          fiscalYearStartMonth={fiscalYearStartMonth}
          currencyCode={currencyCode}
          forecastLines={forecastLines}
          canEdit={canEdit}
          onChangeForecastLines={onChangeForecastLines}
          menuBlendedCogsPct={menuBlendedCogsPct}
          menuCogsItems={menuCogsItems}
          manualLines={manualLines}
          overrideCounts={overrideCounts}
          onClearLineOverrides={onClearLineOverrides}
          onGoToProjections={onGoToProjections}
        />
      </section>

      <div className="border-t border-[var(--border)]" />

      {/* Ratios */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Health Check</h2>
        <RatiosTab slices={slices} />
      </section>
    </div>
  );
}

// ── FinancialsV2 ──────────────────────────────────────────────────────────────

export function FinancialsV2({
  planId,
  mp,
  onMpUpdate,
  financialInputs,
  projections,
  slices,
  canEdit,
  saveState,
  onManualSave,
  onFundingUpdate,
  onStartupCostUpdate,
  onPersonnelUpdate,
  onSetOverride,
  onClearOverride,
  onToggleManual,
  onApplyForward,
  onClearLineOverrides,
  onCritiqueUpdate,
  menuBlendedCogsPct,
  menuCogsItems,
  isRefreshingMenu,
  onRefreshMenu,
  isRefreshingEquipment,
  onRefreshEquipment,
  liveEquipmentItems,
  equipment,
  hasEquipmentItems,
  startupCapexLines,
  startupEquipmentItemLines,
  openingRunway,
  minimumWage,
  paywallOpen,
  onPaywallClose,
  onOpenWizard,
  tourOpen,
  tourSeq,
  onTourFinish,
  onTourSkip,
  onTourClose,
  initialTrialMessagesUsed,
}: FinancialsV2Props) {
  const [activeTab, setActiveTab] = useState<V2Tab>("inputs");

  // TIM-3488: open the v2 AccordionSection that owns the spotlighted field
  // before the GuidedTour measures it.
  const expandTourSection = useCallback((sectionId: string) => {
    window.dispatchEvent(
      new CustomEvent("financials-v2-tour-expand", { detail: { id: sectionId } }),
    );
  }, []);
  const fiscalYearStartMonth = mp.fiscal_year_start_month ?? 1;
  const currencyCode = mp.currency_code ?? "USD";
  const manualLines = mp.manual_lines ?? [];
  const overrideCounts = manualOverrideCountsByLine(mp.manual_overrides);

  // Section statuses for progress bar
  const s1 = getDailyTrafficStatus(mp);
  const s2 = getRevenueStreamsStatus(mp);
  const s3 = getCostsOverheadStatus(mp);
  const s4 = getGrowthRampStatus(mp);
  const statuses: SectionStatus[] = [s1, s2, s3, s4];

  const tabs: { id: V2Tab; label: string; badge?: number }[] = [
    { id: "inputs", label: "Inputs" },
    { id: "reports", label: "Reports" },
  ];

  const lastSavedAt =
    saveState.kind === "saved" ? (saveState.at ?? null) : saveState.kind === "idle" ? (saveState.lastSavedAt ?? null) : null;

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="w-full px-6 pt-8 pb-16">
        <WorkspaceHeader
          Icon={BarChart2}
          title="Financials"
          description="Plan your startup costs, forecast revenue, and project Year 1–5 performance."
          actions={
            <>
              {/* TIM-3676: shared Scout entry point, matches Business Plan / Marketing / Hiring / Ops Playbook. */}
              <AskScoutButton
                workspaceKey="financials"
                focusLabel="financials"
                hasContent
              />
              {canEdit && (
                <WorkspaceActionButton
                  variant="primary"
                  onClick={onOpenWizard}
                  aria-label="Guided setup"
                  title="Walk through your forecast inputs step by step"
                >
                  <Compass size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                  <span>Guided setup</span>
                </WorkspaceActionButton>
              )}
              <WorkspaceActionMenu>
                {({ closeMenu }) => (
                  <>
                    <WorkspaceActionMenuItem
                      Icon={FileDown}
                      label="Export PDF"
                      onClick={() => {
                        closeMenu();
                        window.location.assign("/api/workspaces/financials/export/pdf");
                      }}
                    />
                    <WorkspaceActionMenuItem
                      Icon={Sheet}
                      label="Export Excel"
                      onClick={() => {
                        closeMenu();
                        window.location.assign("/api/workspaces/financials/export/xlsx");
                      }}
                    />
                  </>
                )}
              </WorkspaceActionMenu>
              <SaveStatusAndButton
                saving={saveState.kind === "saving"}
                savedAt={saveState.kind === "saved" ? (saveState.at ?? null) : lastSavedAt}
                error={saveState.kind === "error" ? (saveState.message ?? null) : null}
                unsaved={saveState.kind === "dirty"}
                canEdit={canEdit}
                onSave={onManualSave}
              />
            </>
          }
        />

        <div className="mb-4">
          <ConflictNoticeBadge />
        </div>

        <div className="mb-5">
          <WorkspaceSubNav
            tabs={tabs.map((t) => ({ key: t.id, label: t.label, badge: t.badge }))}
            active={activeTab}
            onSelect={setActiveTab}
            ariaLabel="Financials v2 sections"
            className="mb-0"
          />
        </div>

        {/* ── Inputs tab ────────────────────────────────────────────────────── */}
        {activeTab === "inputs" && (
          <div>
            <InputsProgressBar statuses={statuses} />
            <div className="space-y-3">
              <AccordionSection id="v2-section-daily-traffic" title="Daily Traffic & Schedule" status={s1} defaultOpen>
                <DailyTrafficContent mp={mp} canEdit={canEdit} onUpdate={onMpUpdate} />
              </AccordionSection>

              <AccordionSection id="v2-section-revenue" title="Revenue Streams" status={s2} defaultOpen>
                <RevenueStreamsContent
                  mp={mp}
                  canEdit={canEdit}
                  onUpdate={onMpUpdate}
                  menuBlendedCogsPct={menuBlendedCogsPct}
                  menuCogsItems={menuCogsItems}
                  manualLines={manualLines}
                  overrideCounts={overrideCounts}
                  onClearLineOverrides={onClearLineOverrides}
                  onGoToProjections={() => setActiveTab("reports")}
                  onRefreshMenu={onRefreshMenu}
                  isRefreshingMenu={isRefreshingMenu}
                />
              </AccordionSection>

              <AccordionSection id="v2-section-costs" title="Costs & Overhead" status={s3}>
                <CostsOverheadContent
                  mp={mp}
                  canEdit={canEdit}
                  onUpdate={onMpUpdate}
                  menuBlendedCogsPct={menuBlendedCogsPct}
                  menuCogsItems={menuCogsItems}
                  manualLines={manualLines}
                  overrideCounts={overrideCounts}
                  onClearLineOverrides={onClearLineOverrides}
                  onGoToProjections={() => setActiveTab("reports")}
                  onRefreshMenu={onRefreshMenu}
                  isRefreshingMenu={isRefreshingMenu}
                  onRefreshEquipment={onRefreshEquipment}
                  isRefreshingEquipment={isRefreshingEquipment}
                  financialInputs={financialInputs}
                  equipment={equipment}
                  hasEquipmentItems={hasEquipmentItems}
                  startupCapexLines={startupCapexLines}
                  startupEquipmentItemLines={startupEquipmentItemLines}
                  openingRunway={openingRunway}
                  onStartupCostUpdate={onStartupCostUpdate}
                  onPersonnelUpdate={onPersonnelUpdate}
                  onFundingUpdate={onFundingUpdate}
                  minimumWage={minimumWage}
                />
              </AccordionSection>

              <AccordionSection id="v2-section-growth" title="Growth & Ramp" status={s4}>
                <GrowthRampContent mp={mp} canEdit={canEdit} onUpdate={onMpUpdate} />
              </AccordionSection>
            </div>
          </div>
        )}

        {/* ── Reports tab ───────────────────────────────────────────────────── */}
        {activeTab === "reports" && (
          <ReportsTab
            slices={slices}
            projections={projections}
            financialInputs={financialInputs}
            fiscalYearStartMonth={fiscalYearStartMonth}
            currencyCode={currencyCode}
            canEdit={canEdit}
            manualLines={manualLines}
            liveEquipmentItems={liveEquipmentItems}
            forecastLines={mp.forecast_lines}
            menuBlendedCogsPct={menuBlendedCogsPct}
            menuCogsItems={menuCogsItems}
            overrideCounts={overrideCounts}
            onSetOverride={onSetOverride}
            onClearOverride={onClearOverride}
            onToggleManual={onToggleManual}
            onApplyForward={onApplyForward}
            onClearLineOverrides={onClearLineOverrides}
            onGoToProjections={() => setActiveTab("reports")}
            onChangeForecastLines={(next) => onMpUpdate({ ...mp, forecast_lines: next })}
          />
        )}

      </div>

      <PaywallModal open={paywallOpen} onClose={onPaywallClose} variant="copilot_trial" />

      {tourOpen && canEdit && (
        <GuidedTour
          key={tourSeq}
          steps={TOUR_STEPS_V2}
          onTabChange={(tab) => {
            // v2 only has "inputs" and "reports" tabs; every tour step lives
            // under "inputs", so any v1-shaped tab string routes there.
            setActiveTab(tab === "reports" ? "reports" : "inputs");
          }}
          onExpandSection={expandTourSection}
          onFinish={onTourFinish}
          onSkip={onTourSkip}
          onClose={onTourClose}
        />
      )}
    </div>
  );
}
