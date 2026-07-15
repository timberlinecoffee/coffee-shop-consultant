"use client";

// TIM-972: Financial Suite — DB-backed architecture.
// TIM-1004: Per-day schedule + itemized operating expenses.
// TIM-1029: Equipment tab removed; now lives in Build Out & Equipment workspace.
// TIM-2594: FinancialsV2 — 3-tab layout behind ui_revamp_v2 flag.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useUiRevamp } from "@/hooks/useUiRevamp";
import { FinancialsV2 } from "./financials-v2";
import { BarChart2, X, AlertTriangle, FileDown, Sheet, Compass, ChevronDown } from "lucide-react";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { NumericInput } from "@/components/ui/numeric-input";
import { MoneyInput } from "@/components/ui/money-input";
import { InfoTip } from "@/components/ui/info-tip";
import { LabelWithHint } from "@/components/ui/label-with-hint";
import { SectionHeader } from "@/components/section-header";
import { SectionHelp } from "@/components/ui/section-help";
import { WorkspaceSubNav } from "@/components/workspace/WorkspaceSubNav";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import { ConflictNoticeBadge } from "@/components/cross-suite/ConflictNoticeBadge";
import { MenuTicketReconciliationBanner } from "@/components/cross-suite/MenuTicketReconciliationBanner";
import { DismissibleCallout } from "@/components/DismissibleCallout";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import {
  WorkspaceActionMenu,
  WorkspaceActionMenuItem,
} from "@/components/workspace/WorkspaceActionMenu";
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
  computeMenuBlendedCogsPct,
  buildMenuCogsBreakdown,
  groupMenuItemsByCategory,
  computeCategoryMonthlyCogsCents,
  type MenuCogsCategoryGroup,
  type ApplyForwardRange,
} from "@/lib/financial-projection";
import {
  MenuCogsSyncSection,
  AdditionalCogsSection,
  CogsSectionsGrandTotal,
} from "./cogs-sections";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES } from "@/lib/currency";
import { fmtIntegerPct } from "@/lib/formatters";
import type { MinWageInfo } from "@/lib/wages/minimum-wage";
import { ChartCard, FinancialBarChart, CHART_COLORS } from "./tabs/financial-charts";
import { brandCssVars, BP_BRAND_CHANNEL_NAME } from "@/lib/bp-brand-channel";
import { PLTab } from "./tabs/pl-tab";
import { BalanceSheetTab } from "./tabs/balance-sheet-tab";
import { CashFlowTab } from "./tabs/cash-flow-tab";
import { BreakEvenTab } from "./tabs/break-even-tab";
import { RatiosTab } from "./tabs/ratios-tab";
import { StartupTab } from "./tabs/startup-tab";
import { computeOpeningRunway } from "@/lib/business-plan/opening-runway";
import { FundingTab } from "./tabs/funding-tab";
import { DepreciationTab } from "./tabs/depreciation-tab";
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
    body: "Your one-time costs to open live here. Capital assets (espresso machine, grinders, build-out) flow in automatically from the Equipment & Supplies workspace; add supplies, deposits and other one-time costs directly. The total builds up as you go.",
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

type Tab = "forecast" | "personnel" | "funding" | "projections" | "balance-sheet" | "cash-flow" | "break-even" | "ratios" | "startup" | "depreciation";

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
      linked_equipment_category: i.category || undefined,
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
  // TIM-3733: menu items grouped by category — seeds the Finance COGS sync section on first render.
  menuCogsByCategory?: MenuCogsCategoryGroup[];
  // TIM-2518: resolved local minimum wage. Threaded to PersonnelEditor so the
  // hourly wage input warns when the entered rate is below the legal floor.
  minimumWage?: MinWageInfo | null;
  // TIM-2755: BP branding accent color. When set, chart fills/lines and labels
  // use this color instead of the global --teal token.
  initialAccentColor?: string | null;
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
        stroke={allPositive ? "var(--teal)" : "var(--error)"}
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
    "text-sm border border-[var(--border)] rounded-xl px-2 py-1.5 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]";
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
        <p className="text-[10px] text-[var(--dark-grey)]">
          None. Add one if you plan to inject more cash later (e.g. month 6, $5,000).
        </p>
      )}
      {contributions.map((c, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--muted-foreground)] w-12">Month</span>
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
          <MoneyInput
            currencyCode={currencyCode}
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
            wrapperClassName="flex-1"
            className={rowCls + " text-right"}
            aria-label="Contribution amount"
          />
          {canEdit && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-[var(--dark-grey)] hover:text-[var(--error)] text-xs"
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
          className="text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-2 py-1 rounded-md"
        >
          + Add contribution
        </button>
      )}
      <p className="text-[10px] text-[var(--dark-grey)] mt-1">
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
// label header and a chevron.
// TIM-1438: optional `hint` renders the section description behind a "?" icon
// so the input page stays scannable (founder feedback: instructions add
// unnecessary clutter, move them behind a question-mark toggle).
// TIM-2429: dropped the "Advanced" badge — every input is needed for thorough
// financials, so labelling some as advanced discouraged owners from filling
// fields we actually need. Open/closed state is now controlled by the parent
// so it can persist per-user via /api/ui-prefs/financials.forecastInputs.sections.
function Section({
  id,
  title,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  help,
  children,
}: {
  id?: string;
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) onOpenChange?.(next);
      else setUncontrolledOpen(next);
    },
    [isControlled, onOpenChange],
  );
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
  }, [id, setOpen]);
  return (
    <div id={id}>
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
          className="flex items-center gap-2 flex-1 min-w-0 text-left text-[var(--dark-grey)] hover:text-[var(--muted-foreground)] transition-colors"
        >
          <ChevronDown
            size={15}
            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          <SectionHeader title={title} className="mb-0 flex-1" />
        </button>
        {help != null && <SectionHelp title={title}>{help}</SectionHelp>}
      </div>
      {open && children}
    </div>
  );
}

// TIM-2429: per-user persistence of Forecast Inputs accordion open/closed state.
// Thin wrapper over the TIM-1215 `user_ui_prefs` table via /api/ui-prefs/:key.
// One row per page; the JSON blob maps section slug -> boolean. Default state
// (all open) is applied for any slug not present in the stored blob.
const FORECAST_INPUTS_PREF_KEY = "financials.forecastInputs.sections";

function useForecastSectionState(defaultOpen: boolean) {
  const [state, setState] = useState<Record<string, boolean>>({});
  const latestRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ui-prefs/${FORECAST_INPUTS_PREF_KEY}`);
        if (!res.ok || cancelled) return;
        const { data } = (await res.json()) as { data: unknown };
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const next: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
            if (typeof v === "boolean") next[k] = v;
          }
          if (!cancelled) {
            latestRef.current = next;
            setState(next);
          }
        }
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const isOpen = useCallback(
    (slug: string) => (slug in state ? state[slug] : defaultOpen),
    [state, defaultOpen],
  );
  const setOpen = useCallback((slug: string, next: boolean) => {
    setState((prev) => {
      const merged = { ...prev, [slug]: next };
      latestRef.current = merged;
      void fetch(`/api/ui-prefs/${FORECAST_INPUTS_PREF_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      }).catch(() => {});
      return merged;
    });
  }, []);
  return { isOpen, setOpen };
}

function ForecastTab({
  mp,
  canEdit,
  onUpdateMp,
  menuBlendedCogsPct,
  menuCogsItems,
  menuCogsByCategory,
  onStartWizard,
  onGoToStartup,
  manualLines,
  overrideCounts,
  onClearLineOverrides,
  onGoToProjections,
  onRefreshMenu,
  isRefreshingMenu,
  onRefreshEquipment,
  isRefreshingEquipment,
  onCogsMenuAnalyse,
  cogsMenuAnalyseLoading,
  cogsMenuAnalyseError,
  cogsMenuAnalyseResult,
  onCogsAdditionalAnalyse,
  cogsAdditionalAnalyseLoading,
  cogsAdditionalAnalyseError,
  cogsAdditionalAnalyseResult,
}: {
  mp: MonthlyProjections;
  canEdit: boolean;
  onUpdateMp: (next: MonthlyProjections) => void;
  menuBlendedCogsPct: number | null;
  menuCogsItems: { name: string; price_cents: number; cogs_cents: number; expected_mix_pct: number; cogs_pct: number }[];
  // TIM-3733: menu items grouped by category for the COGS sync section
  menuCogsByCategory: MenuCogsCategoryGroup[];
  onStartWizard?: () => void;
  onGoToStartup?: () => void;
  // TIM-1310: grid-level customizations surfaced on the input page so the
  // relationship between assumptions and the customized projection is visible.
  manualLines: string[];
  overrideCounts: Record<string, number>;
  onClearLineOverrides: (lineId: string) => void;
  onGoToProjections?: () => void;
  // TIM-1713: provenance refresh controls
  onRefreshMenu?: () => void;
  isRefreshingMenu?: boolean;
  onRefreshEquipment?: () => void;
  isRefreshingEquipment?: boolean;
  // TIM-3887: Analyse-with-AI for COGS sections.
  onCogsMenuAnalyse?: () => void;
  cogsMenuAnalyseLoading?: boolean;
  cogsMenuAnalyseError?: string | null;
  cogsMenuAnalyseResult?: import("@/components/location-lease/InlineAnalysisCard").AnalyseResponse | null;
  onCogsAdditionalAnalyse?: () => void;
  cogsAdditionalAnalyseLoading?: boolean;
  cogsAdditionalAnalyseError?: string | null;
  cogsAdditionalAnalyseResult?: import("@/components/location-lease/InlineAnalysisCard").AnalyseResponse | null;
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

  // TIM-2429: per-user persisted accordion state for this tab. Defaults all
  // open on a clean load; collapses survive reload + new session for the user.
  const sections = useForecastSectionState(true);

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
    "w-full text-sm border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
  const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";

  // TIM-1352: the per-line "customized" pill is the single canonical indicator
  // for grid-level customizations (founder: "the pill beside the line item is
  // way more elegant"). The redundant top-of-page summary callout was removed.
  // The base-revenue line has no line-row pill, so it keeps its own inline
  // indicator inside the revenue section below.
  const baseRevenueOverrides = overrideCounts[BASE_REVENUE_LINE_ID] ?? 0;
  const baseRevenueManual = (manualLines ?? []).includes(BASE_REVENUE_LINE_ID);

  return (
    <div className="space-y-6">
      {onStartWizard && (
        <DismissibleCallout
          calloutKey="financials.guided-setup-intro"
          icon={Compass}
          heading="New here? Let us walk you through this page."
          subcopy="We'll highlight each field and explain it as you fill it in."
          action={{
            label: "Start guided setup",
            onClick: onStartWizard,
            variant: "primary",
          }}
        />
      )}

      {/* Customer Flow */}
      <Section
        id="section-customer-flow"
        title="Customer Flow by Day"
        open={sections.isOpen("customer-flow")}
        onOpenChange={(n) => sections.setOpen("customer-flow", n)}
        help="Estimated customers per open day. Closed days are excluded from revenue calculations."
      >
        <div id="tour-customer-flow" className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${openDays.length || 7}, minmax(52px, 1fr))`, minWidth: `${(openDays.length || 7) * 60}px` }}>
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
                  <span className="text-[10px] font-medium text-[var(--muted-foreground)]">{DAY_LABELS[day]}</span>
                  <div className="relative w-full h-16 bg-[var(--neutral-cool-150)] rounded-md overflow-hidden">
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
          </div>
          {openDays.length === 0 && (
            <p className="text-xs text-[var(--dark-grey)] text-center py-4">No open days selected.</p>
          )}
          <p className="text-xs text-[var(--dark-grey)] mt-3">
            Weekly total: {totalWeeklyCustomers.toLocaleString()} customers across {openDays.length} open day{openDays.length !== 1 ? "s" : ""}
          </p>
        </div>
      </Section>

      {/* Operating Schedule */}
      <Section
        title="Operating Schedule"
        open={sections.isOpen("operating-schedule")}
        onOpenChange={(n) => sections.setOpen("operating-schedule", n)}
      >
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-white to-transparent sm:hidden"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                  <th className="py-2.5 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] w-16">Day</th>
                  <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] w-16">Open</th>
                  <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] w-36">Opens</th>
                  <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] w-36">Closes</th>
                  <th className="py-2.5 pl-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] w-16">Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--neutral-cool-100)]">
                {DAY_KEYS.map((day) => {
                  const sched = mp.weekly_schedule[day];
                  const hours = computeDayHours(sched);
                  return (
                    <tr key={day} className={!sched.open ? "bg-[var(--background)]" : ""}>
                      {/* TIM-1894: body cells match Equipment-table reference (text-xs, was text-sm). */}
                      <td className="py-2.5 pl-4 pr-2 text-xs font-medium text-[var(--foreground)]">
                        {DAY_LABELS[day]}
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="checkbox"
                          checked={sched.open}
                          onChange={(e) => updateScheduleDay(day, { open: e.target.checked })}
                          disabled={!canEdit}
                          className="w-4 h-4 accent-[var(--teal)] cursor-pointer disabled:cursor-default"
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
                            className="text-sm border border-[var(--border)] rounded-xl px-2 py-1.5 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors w-32 sm:w-36"
                          />
                        ) : (
                          <span className="text-xs text-[var(--neutral-cool-400)]">Closed</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {sched.open ? (
                          <input
                            type="time"
                            value={sched.close_time}
                            onChange={(e) => updateScheduleDay(day, { close_time: e.target.value })}
                            disabled={!canEdit}
                            className="text-sm border border-[var(--border)] rounded-xl px-2 py-1.5 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors w-32 sm:w-36"
                          />
                        ) : (
                          <span className="text-sm text-[var(--neutral-cool-400)]"></span>
                        )}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 text-right text-xs text-[var(--muted-foreground)]">
                        {/* eslint-disable-next-line no-restricted-syntax -- hours-of-operation display: integer if whole, else 1dp; not a currency/percent/ratio */}
                        {sched.open ? `${hours % 1 === 0 ? hours : hours.toFixed(1)}h` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border-medium)] bg-[var(--background)]">
                  <td colSpan={4} className="py-2.5 pl-4 pr-2 text-xs font-semibold text-[var(--muted-foreground)]">
                    Weekly total
                  </td>
                  <td className="py-2.5 pl-2 pr-4 text-right text-xs font-semibold text-[var(--foreground)]">
                    {/* eslint-disable-next-line no-restricted-syntax -- hours-of-operation total: integer if whole, else 1dp; not a currency/percent/ratio */}
                    {weeklyHours % 1 === 0 ? weeklyHours : weeklyHours.toFixed(1)}h
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Section>

      {/* Primary Revenue Streams (TIM-1245) — was "Revenue Drivers" */}
      <Section
        id="section-revenue"
        title="Primary Revenue Streams"
        open={sections.isOpen("primary-revenue")}
        onOpenChange={(n) => sections.setOpen("primary-revenue", n)}
        help="Your day-to-day food & beverage sales. Customers per day (above) × average sale is your primary revenue. Keep it as one number, or split it into beverage and food to plan each separately."
      >
        <div id="tour-revenue" className="rounded-xl border border-[var(--border)] bg-white p-4">
          {(baseRevenueOverrides > 0 || baseRevenueManual) && (
            <div className="mb-4 rounded-lg border border-[var(--teal-bg-950)] bg-[var(--teal-bg-subtle)] px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] inline-block mt-1.5 shrink-0" aria-hidden="true" />
                <p className="text-xs text-[var(--teal-deeper)]">
                  <span className="font-semibold text-[var(--teal)]">Foot-traffic revenue is customized on the grid</span>
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
                    className="text-[11px] font-semibold text-[var(--teal)] hover:underline"
                  >
                    View on grid
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onClearLineOverrides(BASE_REVENUE_LINE_ID)}
                    className="text-[11px] font-semibold text-[var(--error)] hover:underline"
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
                  <LabelWithHint
                    className={labelCls.replace(" mb-1", "")}
                    hintLabel="Beverage average per sale"
                    hint="Espresso, drip, tea, etc."
                  >
                    Beverage: average per sale
                  </LabelWithHint>
                  <MoneyInput
                    currencyCode={mp.currency_code ?? "USD"}
                    className={inputCls}
                    min={0}
                    step={0.5}
                    value={bevTicketCents ? bevTicketCents / 100 : ""}
                    onChange={(e) => setBeverageTicket((parseFloat(e.target.value) || 0) * 100)}
                    placeholder="5.50"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <LabelWithHint
                    className={labelCls.replace(" mb-1", "")}
                    hintLabel="Food average per sale"
                    hint="Pastries, sandwiches, snacks"
                  >
                    Food: average per sale
                  </LabelWithHint>
                  <MoneyInput
                    currencyCode={mp.currency_code ?? "USD"}
                    className={inputCls}
                    min={0}
                    step={0.5}
                    value={foodTicketCents ? foodTicketCents / 100 : ""}
                    onChange={(e) => setFoodTicket((parseFloat(e.target.value) || 0) * 100)}
                    placeholder="2.00"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            ) : (
              <div>
                <LabelWithHint
                  className={labelCls.replace(" mb-1", "")}
                  hintLabel="Average ticket"
                  hint="Typical espresso bar: $6–$10"
                >
                  Average ticket
                </LabelWithHint>
                <MoneyInput
                  currencyCode={mp.currency_code ?? "USD"}
                  className={inputCls}
                  min={0}
                  step={0.5}
                  value={mp.avg_ticket_cents ? mp.avg_ticket_cents / 100 : ""}
                  onChange={(e) =>
                    update({ avg_ticket_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                  }
                  placeholder="7.50"
                  disabled={!canEdit}
                />
              </div>
            )}
            {/* TIM-3733: COGS replaced with three-section block */}
            <div id="tour-cogs" className="col-span-full">
              <MenuCogsSyncSection
                canEdit={canEdit}
                categoryGroups={menuCogsByCategory}
                categoryUnits={mp.menu_cogs_category_units ?? {}}
                onCategoryUnitsChange={(units) => update({ menu_cogs_category_units: units })}
                syncedAt={mp.menu_cogs_synced_at}
                isRefreshing={isRefreshingMenu ?? false}
                onSync={() => {
                  onRefreshMenu?.();
                  update({ menu_cogs_synced_at: new Date().toISOString() });
                }}
                currencyCode={mp.currency_code ?? "USD"}
                onAnalyse={onCogsMenuAnalyse}
                analyseLoading={cogsMenuAnalyseLoading}
                analyseError={cogsMenuAnalyseError}
                analyseResult={cogsMenuAnalyseResult}
              />
              <AdditionalCogsSection
                canEdit={canEdit}
                items={mp.additional_cogs_items ?? []}
                onItemsChange={(items) => update({ additional_cogs_items: items })}
                currencyCode={mp.currency_code ?? "USD"}
                onAnalyse={onCogsAdditionalAnalyse}
                analyseLoading={cogsAdditionalAnalyseLoading}
                analyseError={cogsAdditionalAnalyseError}
                analyseResult={cogsAdditionalAnalyseResult}
              />
              <CogsSectionsGrandTotal
                menuSubtotalCents={menuCogsByCategory.reduce((sum, g) => {
                  const units = (mp.menu_cogs_category_units ?? {})[g.category_id ?? "__uncategorized__"] ?? 0;
                  return sum + computeCategoryMonthlyCogsCents(g, units);
                }, 0)}
                additionalSubtotalCents={
                  (mp.additional_cogs_items ?? []).reduce((s, it) => s + (it.monthly_cost_cents || 0), 0)
                }
                currencyCode={mp.currency_code ?? "USD"}
              />
            </div>
          </div>

          {/* TIM-2482 (F13): inline reconciliation banner — surfaces only
              when the menu's popularity-weighted blended ticket drifts
              meaningfully from this Forecast Inputs avg ticket. Sync button
              opens the cross-suite resolver on menu_ticket_mismatch. */}
          <MenuTicketReconciliationBanner origin="financials" className="mt-3" />

          {/* Progressive disclosure: optional beverage/food split */}
          <label className="flex items-center gap-2 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={splitOn}
              onChange={(e) => toggleSplit(e.target.checked)}
              disabled={!canEdit}
              className="w-3.5 h-3.5 accent-[var(--teal)] disabled:opacity-50"
            />
            <span className="text-xs font-medium text-[var(--foreground)]">
              Split into beverage &amp; food sales
            </span>
          </label>

          {splitOn && (
            <div className="mt-3 rounded-lg border border-[var(--teal-bg-e8f)] bg-[var(--teal-bg-muted)] px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)] mb-1.5">
                Average sales per day {avgCustomersPerDay > 0 ? `(at ~${avgCustomersPerDay} customers/day)` : ""}
              </p>
              {avgCustomersPerDay > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[var(--muted-foreground)]">Beverage</span>
                    <p className="font-semibold text-[var(--foreground)]">
                      {formatCurrency((bevTicketCents * avgCustomersPerDay) / 100, mp.currency_code ?? "USD")}/day
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)]">Food</span>
                    <p className="font-semibold text-[var(--foreground)]">
                      {formatCurrency((foodTicketCents * avgCustomersPerDay) / 100, mp.currency_code ?? "USD")}/day
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)]">Total</span>
                    <p className="font-semibold text-[var(--teal)]">
                      {formatCurrency((mp.avg_ticket_cents * avgCustomersPerDay) / 100, mp.currency_code ?? "USD")}/day
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-[var(--dark-grey)]">
                  Add customers per day above to see beverage and food sales per day.
                </p>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Additional Revenue Streams (TIM-1245) — promoted to a first-class section */}
      <Section
        title="Additional Revenue Streams"
        open={sections.isOpen("additional-revenue")}
        onOpenChange={(n) => sections.setOpen("additional-revenue", n)}
        help="Income beyond your primary food & beverage sales. Use the quick-add chips to start a common stream, or add your own. Each line can be a fixed monthly amount; click the arrow to expand a line and ramp it up or grow it over time."
      >
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
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
            hideCategoryHeader
          />
        </div>
      </Section>

      {/* Costs & Expenses — COGS / Overhead / Capex */}
      <Section
        id="section-costs"
        title="Costs & Expenses"
        open={sections.isOpen("costs")}
        onOpenChange={(n) => sections.setOpen("costs", n)}
        help={<>Add, rename, or remove any line. For COGS lines, toggle <strong>$</strong> (static monthly amount) or <strong>%</strong> (percent of revenue). For operating expenses, pick the basis from the <strong>% of</strong> dropdown: a fixed monthly amount, percent of overall revenue, or percent of a specific revenue stream. Click the arrow to expand a line and configure a ramp-up period or month-over-month growth.</>}
      >
        <div id="tour-costs" className="rounded-xl border border-[var(--border)] bg-white p-4">
          <ForecastLinesEditor
            lines={mp.forecast_lines}
            canEdit={canEdit}
            onChange={updateForecastLines}
            currencyCode={mp.currency_code ?? "USD"}
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
      </Section>

      {/* Other Operating Costs — TIM-1180 */}
      <Section
        title="Other Operating Costs"
        open={sections.isOpen("other-operating-costs")}
        onOpenChange={(n) => sections.setOpen("other-operating-costs", n)}
        help="Costs that scale with sales but aren't line items above. These flow into your P&L, break-even, and ratios."
      >
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <LabelWithHint
                className={labelCls.replace(" mb-1", "")}
                hintLabel="Payment processing %"
                hint="% of gross revenue. Card fees: 2.5–3.0%"
              >
                Payment processing %
              </LabelWithHint>
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
            </div>
            <div>
              <LabelWithHint
                className={labelCls.replace(" mb-1", "")}
                hintLabel="Spoilage %"
                hint="% of goods COGS lost to waste; typically 2–5%"
              >
                Spoilage %
              </LabelWithHint>
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
            </div>
            <div>
              <LabelWithHint
                className={labelCls.replace(" mb-1", "")}
                hintLabel="Loyalty discount %"
                hint="% of revenue redeemed; 0 if no program"
              >
                Loyalty discount %
              </LabelWithHint>
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
            </div>
          </div>
        </div>
      </Section>

      {/* Owner Activity — TIM-1169 */}
      <Section
        title="Owner Activity"
        open={sections.isOpen("owner-activity")}
        onOpenChange={(n) => sections.setOpen("owner-activity", n)}
        help="Money you (the owner) take out of the business each month, plus any extra cash you put back in later on. These move equity and cash without touching net income."
      >
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <LabelWithHint
                className={labelCls.replace(" mb-1", "")}
                hintLabel="Owner draws"
                hint="What you pay yourself from the business each month. Shows up on the cash flow as a financing outflow."
              >
                Owner draws / month
              </LabelWithHint>
              <MoneyInput
                currencyCode={mp.currency_code ?? "USD"}
                className={inputCls}
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
      <Section
        id="section-startup"
        title="Startup & Opening Costs"
        open={sections.isOpen("startup")}
        onOpenChange={(n) => sections.setOpen("startup", n)}
      >
        <DismissibleCallout
          calloutKey="financials.startup-costs-tab-pointer"
          icon={Compass}
          heading="One-time costs to open the doors live on the Startup Costs tab."
          subcopy="Start with your equipment, then add build-out and supplies. The total builds up from what you actually need and flows into your balance sheet and funding gap."
          action={
            onGoToStartup
              ? {
                  label: "Go to Startup Costs →",
                  onClick: onGoToStartup,
                  variant: "primary",
                }
              : undefined
          }
        />
      </Section>

      {/* Tax rates — TIM-1247: sales tax and income tax are clearly separated */}
      {/* TIM-1247: taxes lead the page (not collapsed/advanced) so the two
          clearly labeled rates are visible without hunting — founder feedback
          that the single rate wasn't reaching the user. */}
      <Section
        id="section-taxes"
        title="Taxes"
        open={sections.isOpen("taxes")}
        onOpenChange={(n) => sections.setOpen("taxes", n)}
        help={<>Two different taxes. <strong>Income tax</strong> is your cost and reduces net income. <strong>Sales tax</strong> is collected on sales and remitted to the state: money that passes through you, not income.</>}
      >
        <div className="rounded-xl border border-[var(--border)] bg-white p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="tour-taxes">
              <LabelWithHint
                className={labelCls.replace(" mb-1", "")}
                hintLabel="Income Tax Rate %"
                hint={
                  <>
                    Tax on your profit. Applied to pre-tax profit (only when positive)
                    and subtracted to reach Net Income on the P&amp;L.
                  </>
                }
              >
                Income Tax Rate %
              </LabelWithHint>
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
            </div>
            <div id="tour-sales-tax">
              <LabelWithHint
                className={labelCls.replace(" mb-1", "")}
                hintLabel="Sales Tax Rate %"
                hint={
                  <>
                    Tax you collect from customers and pass through to the state. It
                    does not change revenue or profit. Your revenue figures here are
                    shown without sales tax. Set your local rate (0% if none).
                  </>
                }
              >
                Sales Tax Rate %
              </LabelWithHint>
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
            </div>
          </div>
        </div>
      </Section>

      {/* Fiscal Year Start — TIM-1100 / Currency — TIM-1101 */}
      <Section
        title="Fiscal Year & Currency"
        open={sections.isOpen("fiscal-year-currency")}
        onOpenChange={(n) => sections.setOpen("fiscal-year-currency", n)}
      >
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <LabelWithHint
                className={labelCls.replace(" mb-1", "")}
                hintLabel="Starting month"
                hint="Month-to-month columns, projections, and exports re-index from this month."
              >
                Starting month
              </LabelWithHint>
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
            </div>
            <div>
              <LabelWithHint
                className={labelCls.replace(" mb-1", "")}
                hintLabel="Currency"
                hint="Drives symbol + formatting across the planner, AI assessment, and exports."
              >
                Currency
              </LabelWithHint>
              <select
                className={inputCls}
                value={mp.currency_code ?? "USD"}
                onChange={(e) => update({ currency_code: e.target.value })}
                disabled={!canEdit}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}: {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Section>

      {/* Ramp Period */}
      <Section
        title="Ramp Period"
        open={sections.isOpen("ramp-period")}
        onOpenChange={(n) => sections.setOpen("ramp-period", n)}
        help="Reduced revenue assumptions while you build awareness in the first months."
      >
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4">
            <LabelWithHint
              className={labelCls.replace(" mb-1", "")}
              hintLabel="Ramp period (months)"
              hint="0 = no ramp; 1–12 months"
            >
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
                update({ ramp_months: n, ramp_multipliers: next });
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
                  Each value is applied to your <strong>base monthly revenue</strong> (the revenue you&apos;d earn at full capacity). 50% means you earn half your projected revenue that month. Example: if your projected revenue is $10,000/month and Month 1 is set to 30%, Month 1 revenue projects to $3,000.
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
                          update({ ramp_multipliers: next });
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
      </Section>

      {/* Monthly Growth Rate */}
      <Section
        title="Monthly Growth Rate"
        open={sections.isOpen("monthly-growth")}
        onOpenChange={(n) => sections.setOpen("monthly-growth", n)}
      >
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex items-center gap-1 mb-4 bg-[var(--background)] border border-[var(--border)] rounded-xl p-1 w-fit">
            {(["simple", "custom"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={!canEdit}
                onClick={() => update({ growth_mode: mode })}
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
              <LabelWithHint
                className={labelCls.replace(" mb-1", "")}
                hintLabel="Monthly growth %"
                hint="Compounded monthly after ramp period ends. 2% / month ≈ 27% annually."
              >
                Monthly growth %
              </LabelWithHint>
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
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs text-[var(--muted-foreground)]">Per-month growth %</span>
                <InfoTip label="Per-month growth %">
                  Per-month growth % after ramp ends. Month 1 is the first post-ramp month.
                </InfoTip>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {Array.from({ length: 12 }).map((_, i) => {
                  const val = (mp.growth_custom_monthly ?? [])[i] ?? (mp.growth_monthly_pct ?? 0);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-[var(--dark-grey)]">Month {i + 1}</span>
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
                        className="w-full text-center text-xs border border-[var(--border-medium)] rounded-md py-1.5 px-1 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                      />
                      <span className="text-[10px] text-[var(--neutral-cool-400)]">%</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-[var(--dark-grey)] mt-3">
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
    highlight ? "text-[var(--teal)]" : negative ? "text-[var(--error)]" : "text-[var(--foreground)]"
  }`;
  return (
    <>
      {separator && (
        <tr>
          <td colSpan={5} className="py-0">
            <div className="border-t border-[var(--border-medium)] mx-4" />
          </td>
        </tr>
      )}
      <tr>
        <td
          className={`py-2 pr-2 text-sm ${indent ? "pl-8" : "pl-4"} ${
            bold ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]"
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

// TIM-1311: top-of-page summary for the Salaries tab, matching the P&L revenue
// chart (TIM-1261). Year 1 monthly total payroll, stacked into service labor
// (counted inside COGS) vs. overhead labor (the P&L "Labor" opex line). Hidden
// when there is no personnel cost modeled.
function PayrollSummaryChart({
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
  const totalPayroll = y1.reduce((sum, s) => sum + (s.labor_cogs_cents ?? 0) + (s.labor_cents ?? 0), 0);
  if (totalPayroll === 0) return null;
  const labels = fiscalYearMonthLabels(fiscalYearStartMonth);
  const data = y1.map((s, i) => ({
    label: labels[i] ?? `M${i + 1}`,
    service_labor: s.labor_cogs_cents ?? 0,
    overhead_labor: s.labor_cents ?? 0,
  }));
  const series = [
    { key: "service_labor", label: "Barista Wages", color: CHART_COLORS.warning },
    { key: "overhead_labor", label: "Management Wages", color: CHART_COLORS.primary },
  ];
  return (
    <div className="mb-6">
      <ChartCard
        title="Year 1 Monthly Payroll"
        description="Total payroll for each month of your first operating year, split into service labor (counted in COGS) and overhead labor."
      >
        <FinancialBarChart data={data} series={series} currencyCode={currencyCode} height={240} />
      </ChartCard>
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
    strength: "text-[var(--teal)]",
    weakness: "text-[var(--error)]",
    suggestion: "text-[var(--muted-foreground)]",
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          {
            label: "Year 1 Gross Margin",
            value: fmtIntegerPct(y1.gross_margin_pct / 100),
            sub: "Gross margin",
            ok: y1.gross_margin_pct >= 60,
          },
          {
            label: "Year 1 Operating Profit",
            value: formatCurrency(y1.operating_income, currencyCode),
            sub: y1.revenue > 0 ? `${fmtIntegerPct(y1.operating_income / y1.revenue)} margin` : "n/a",
            ok: y1.operating_income >= 0,
          },
          {
            label: "Year 5 Net Income",
            value: formatCurrency(y5.net_income, currencyCode),
            sub: "Net income",
            ok: y5.net_income >= 0,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-xl border p-4 text-center ${
              kpi.ok ? "border-[var(--teal-tint)] bg-[var(--teal-tint-500)]" : "border-[var(--error-bg-10)] bg-[var(--error-bg-3)]"
            }`}
          >
            <p className="text-[10px] font-medium text-[var(--muted-foreground)] mb-1">{kpi.label}</p>
            <p className={`text-lg font-bold ${kpi.ok ? "text-[var(--teal)]" : "text-[var(--error)]"}`}>
              {kpi.value}
            </p>
            <p className="text-[10px] text-[var(--dark-grey)] mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* AI Assessment */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-bold text-[var(--foreground)] leading-tight">AI Assessment</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Benchmarked against comparable independent coffee shops.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={generateAssessment}
              disabled={assessmentStatus === "loading"}
              className="text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-60 shrink-0"
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
          <p className="px-5 py-4 text-sm text-[var(--error)]">Could not generate. Try again.</p>
        )}
        {localAssessment ? (
          <ul className="divide-y divide-[var(--neutral-cool-100)]">
            {localAssessment.bullets.map((b, i) => (
              <li key={i} className="px-5 py-3 flex items-start gap-3">
                <span className={`text-sm font-bold shrink-0 mt-0.5 ${bulletColor[b.type]}`}>
                  {bulletIcon[b.type]}
                </span>
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-[var(--foreground)] leading-relaxed">{b.text}</p>
                  {b.type !== "strength" && b.recommendation && (
                    <p className="text-sm text-[var(--foreground)] leading-relaxed">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--neutral-cool-600)] mr-2">
                        Recommendation
                      </span>
                      {b.recommendation}
                    </p>
                  )}
                  {b.type !== "strength" && b.next_step && (
                    <p className="text-sm text-[var(--teal)] leading-relaxed">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--neutral-cool-600)] mr-2">
                        Next Step
                      </span>
                      {b.next_step}
                    </p>
                  )}
                  {b.type !== "strength" && b.why && (
                    <p className="text-xs text-[var(--muted-foreground)] leading-relaxed italic">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--neutral-cool-600)] mr-2 not-italic">
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
          <p className="px-5 py-4 text-sm text-[var(--dark-grey)]">
            Run an assessment to get feedback on your projections.
          </p>
        )}
        {localAssessment?.generated_at && (
          <p className="px-5 py-3 border-t border-[var(--neutral-cool-100)] text-[10px] text-[var(--dark-grey)]">
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
  menuCogsByCategory = [],
  minimumWage = null,
  initialAccentColor = null,
}: Props) {
  // TIM-2755: track the BP brand accent color so CSS vars stay live when the
  // user changes the color in the BP panel (via BroadcastChannel) or on page load.
  const [accentColor, setAccentColor] = useState<string | null>(initialAccentColor);

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(BP_BRAND_CHANNEL_NAME);
      ch.onmessage = (e: MessageEvent<{ accentColor?: string }>) => {
        if (typeof e.data?.accentColor === "string") {
          setAccentColor(e.data.accentColor);
        }
      };
    } catch {
      // BroadcastChannel not available (SSR guard — shouldn't happen in client component).
    }
    return () => { try { ch?.close(); } catch { /* noop */ } };
  }, []);

  const brandStyle = useMemo(
    () => (accentColor ? (brandCssVars(accentColor) as CSSProperties) : {}),
    [accentColor]
  );

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

  // TIM-1713: live-refreshable copies of server-fetched sync sources.
  const [liveMenuBlendedCogsPct, setLiveMenuBlendedCogsPct] = useState<number | null>(menuBlendedCogsPct);
  const [liveMenuCogsItems, setLiveMenuCogsItems] = useState(menuCogsItems);
  // TIM-3733: category-grouped menu COGS for the Finance COGS sync section.
  // Seeded from server props so the section is populated on first render.
  const [liveMenuCogsByCategory, setLiveMenuCogsByCategory] = useState<MenuCogsCategoryGroup[]>(menuCogsByCategory);
  const [liveEquipmentItems, setLiveEquipmentItems] = useState<EquipmentItem[]>(initialEquipmentItems);
  const [isRefreshingMenu, setIsRefreshingMenu] = useState(false);
  const [isRefreshingEquipment, setIsRefreshingEquipment] = useState(false);

  // TIM-3887: Analyse-with-AI state for COGS sections.
  const [cogsMenuAnalyseLoading, setCogsMenuAnalyseLoading] = useState(false);
  const [cogsMenuAnalyseError, setCogsMenuAnalyseError] = useState<string | null>(null);
  const [cogsMenuAnalyseResult, setCogsMenuAnalyseResult] = useState<import("@/components/location-lease/InlineAnalysisCard").AnalyseResponse | null>(null);
  const [cogsAdditionalAnalyseLoading, setCogsAdditionalAnalyseLoading] = useState(false);
  const [cogsAdditionalAnalyseError, setCogsAdditionalAnalyseError] = useState<string | null>(null);
  const [cogsAdditionalAnalyseResult, setCogsAdditionalAnalyseResult] = useState<import("@/components/location-lease/InlineAnalysisCard").AnalyseResponse | null>(null);

  const handleCogsMenuAnalyse = useCallback(async () => {
    setCogsMenuAnalyseLoading(true);
    setCogsMenuAnalyseError(null);
    setCogsMenuAnalyseResult(null);
    try {
      const res = await fetch("/api/ai/analyse/financials-cogs-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        let msg = "Analysis failed — please try again.";
        try { msg = (await res.json())?.error ?? msg; } catch { /* non-JSON body */ }
        setCogsMenuAnalyseError(msg);
      } else {
        setCogsMenuAnalyseResult(await res.json());
      }
    } catch {
      setCogsMenuAnalyseError("Analysis failed — please try again.");
    }
    setCogsMenuAnalyseLoading(false);
  }, []);

  const handleCogsAdditionalAnalyse = useCallback(async () => {
    setCogsAdditionalAnalyseLoading(true);
    setCogsAdditionalAnalyseError(null);
    setCogsAdditionalAnalyseResult(null);
    try {
      const res = await fetch("/api/ai/analyse/financials-cogs-additional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        let msg = "Analysis failed — please try again.";
        try { msg = (await res.json())?.error ?? msg; } catch { /* non-JSON body */ }
        setCogsAdditionalAnalyseError(msg);
      } else {
        setCogsAdditionalAnalyseResult(await res.json());
      }
    } catch {
      setCogsAdditionalAnalyseError("Analysis failed — please try again.");
    }
    setCogsAdditionalAnalyseLoading(false);
  }, []);

  const handleRefreshMenu = useCallback(async () => {
    setIsRefreshingMenu(true);
    try {
      const supabase = createClient();
      // TIM-1799: include expected_popularity and recompute via the shared
      // helpers so an in-app refresh matches the server load exactly (shared-read,
      // no stale snapshot) and surfaces every priced item incl. Beverages.
      // TIM-3733: also select id, category_id, category_name for the COGS sync section.
      const { data } = await supabase
        .from("menu_items_with_cogs")
        .select("id, name, category_id, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived")
        .eq("plan_id", planId)
        .eq("archived", false);
      if (data) {
        setLiveMenuBlendedCogsPct(computeMenuBlendedCogsPct(data));
        setLiveMenuCogsItems(buildMenuCogsBreakdown(data));
        setLiveMenuCogsByCategory(groupMenuItemsByCategory(data));
      }
    } catch {
      // silently ignore — stale data is better than an error state
    }
    setIsRefreshingMenu(false);
  }, [planId]);

  const handleRefreshEquipment = useCallback(async () => {
    setIsRefreshingEquipment(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("buildout_equipment_items")
        .select("*")
        .eq("plan_id", planId)
        .eq("archived", false)
        .order("position");
      if (data) {
        setLiveEquipmentItems(data as EquipmentItem[]);
      }
    } catch {
      // silently ignore
    }
    setIsRefreshingEquipment(false);
  }, [planId]);

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
    const active = liveEquipmentItems.filter((i) => !i.archived);
    const total_cost_cents = active.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);
    const FINANCED: FinancingMethod[] = ["loan", "lease", "in_house_financing", "credit_card", "credit", "other"];
    const financed_cost_cents = active
      .filter((i) => FINANCED.includes(i.financing_method))
      .reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);
    return { total_cost_cents, financed_cost_cents };
  }, [liveEquipmentItems]);

  // TIM-1258: when the owner has real equipment items in the Build-Out &
  // Equipment workspace, the Startup tab sources the Equipment line from that
  // total (read-only). Otherwise it falls back to the legacy startup_costs
  // equipment bucket — mirroring the projection's mpForProjection logic.
  const hasEquipmentItems = useMemo(
    () => liveEquipmentItems.some((i) => !i.archived && i.unit_cost_cents > 0),
    [liveEquipmentItems]
  );

  // TIM-1253: build an mp variant used ONLY for computation — it adds the
  // synthetic per-item capex ForecastLines from buildout_equipment_items and
  // zeros out startup_costs.equipment_cents so that TIM-1246's aggregate
  // depreciation path doesn't double-count with the per-item lines.
  const mpForProjection = useMemo(() => {
    const itemLines = equipmentItemsToCapexLines(liveEquipmentItems);
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
  }, [mp, liveEquipmentItems]);

  // TIM-1254b: per-asset capex rows for the Startup tab Capital Assets section.
  // capexLines = user-authored capex ForecastLines (not linked to equipment items).
  // equipmentItemLines = synthetic lines from buildout_equipment_items.
  const startupCapexLines = useMemo(
    () => mp.forecast_lines.filter((l) => l.category === "capex" && !l.linked_equipment_item_id),
    [mp.forecast_lines]
  );
  const startupEquipmentItemLines = useMemo(
    () => equipmentItemsToCapexLines(liveEquipmentItems),
    [liveEquipmentItems]
  );

  // TIM-1117 / TIM-3735: feed blended menu COGS pct AND the centralized COGS
  // Grand Total (menu + additional) into the projection context. The Grand Total
  // drives baseCogs when available; the blended pct is the fallback for any
  // menu-linked COGS forecast lines.
  const projectionCtx = useMemo(() => {
    const menuGrandTotal = liveMenuCogsByCategory.reduce((sum, g) => {
      const units = (mpForProjection.menu_cogs_category_units ?? {})[g.category_id ?? "__uncategorized__"] ?? 0;
      return sum + computeCategoryMonthlyCogsCents(g, units);
    }, 0);
    const additionalGrandTotal = (mpForProjection.additional_cogs_items ?? []).reduce(
      (s, it) => s + (it.monthly_cost_cents || 0),
      0
    );
    const grandTotal = menuGrandTotal + additionalGrandTotal;
    return {
      menu_blended_cogs_pct: liveMenuBlendedCogsPct,
      cogs_grand_total_monthly_cents: grandTotal > 0 ? grandTotal : null,
    };
  }, [liveMenuBlendedCogsPct, liveMenuCogsByCategory, mpForProjection.menu_cogs_category_units, mpForProjection.additional_cogs_items]);

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

  // TIM-2517: opening cash runway during ramp — drives the Startup-tab callout
  // that warns founders when their working-capital + cash buffer cannot absorb
  // the projected loss months before break-even.
  const openingRunway = useMemo(() => {
    const sc = mp.startup_costs ?? defaultStartupCosts();
    const openingCashCents =
      (sc.working_capital_reserve_cents ?? 0) + (sc.opening_cash_buffer_cents ?? 0);
    const rampMonths = Math.max(0, Math.min(12, mp.ramp_months ?? 0));
    // Use either the configured ramp window or, when none is set, scan the
    // first 6 months for the loss-period regardless. Either way the helper
    // filters to negative net-income months only.
    const window = rampMonths > 0 ? rampMonths : 6;
    const rampMonthlyNetIncomeCents = slices.slice(0, window).map((s) => s.net_income_cents);
    return computeOpeningRunway({ openingCashCents, rampMonthlyNetIncomeCents });
  }, [mp.startup_costs, mp.ramp_months, slices]);

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
            message: "Subscription paused. Reactivate to keep editing.",
          });
          setPaywallOpen(true);
          return;
        }
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        const data = (await res.json()) as { updated_at?: string };
        if (controller.signal.aborted) return;
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

  // TIM-2594: branch to v2 layout when ui_revamp_v2 flag is on.
  const uiRevampV2 = useUiRevamp();

  if (uiRevampV2) {
    return (
      <div style={brandStyle}>
      <FinancialsV2
        planId={planId}
        mp={mp}
        onMpUpdate={handleMpUpdate}
        financialInputs={financialInputs}
        projections={projections}
        slices={slices}
        canEdit={canEdit}
        saveState={saveState}
        onManualSave={handleManualSave}
        onFundingUpdate={handleFundingUpdate}
        onStartupCostUpdate={handleStartupCostUpdate}
        onPersonnelUpdate={handlePersonnelUpdate}
        onSetOverride={handleSetOverride}
        onClearOverride={handleClearOverride}
        onToggleManual={handleToggleManual}
        onApplyForward={handleApplyForward}
        onClearLineOverrides={handleClearLineOverrides}
        onCritiqueUpdate={handleCritiqueUpdate}
        menuBlendedCogsPct={liveMenuBlendedCogsPct}
        menuCogsItems={liveMenuCogsItems}
        isRefreshingMenu={isRefreshingMenu}
        onRefreshMenu={handleRefreshMenu}
        isRefreshingEquipment={isRefreshingEquipment}
        onRefreshEquipment={handleRefreshEquipment}
        liveEquipmentItems={liveEquipmentItems}
        equipment={equipment}
        hasEquipmentItems={hasEquipmentItems}
        startupCapexLines={startupCapexLines}
        startupEquipmentItemLines={startupEquipmentItemLines}
        openingRunway={openingRunway}
        minimumWage={minimumWage}
        paywallOpen={paywallOpen}
        onPaywallClose={() => setPaywallOpen(false)}
        onOpenWizard={openWizard}
        tourOpen={tourOpen}
        tourSeq={tourSeq}
        onTourFinish={handleTourFinish}
        onTourSkip={handleTourSkip}
        onTourClose={handleTourClose}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "forecast", label: "Budget Inputs" },
    { id: "personnel", label: "Salaries" },
    { id: "funding", label: "Funding" },
    { id: "projections", label: "Profit & Loss" },
    { id: "balance-sheet", label: "Balance Sheet" },
    { id: "cash-flow", label: "Cash Flow" },
    { id: "break-even", label: "Break-Even" },
    { id: "ratios", label: "Health Check" },
    { id: "startup", label: "Startup Costs" },
    { id: "depreciation", label: "Depreciation Schedule" },
  ];

  const fiscalYearStartMonth = mp.fiscal_year_start_month ?? 1;
  const currencyCode = mp.currency_code ?? "USD";

  return (
    <div className="bg-[var(--background)] min-h-screen" style={brandStyle}>
      <div className="w-full px-4 sm:px-6 pt-8 pb-16">
        {/* TIM-1745 / TIM-1894 / TIM-1937: action toolbar (Guided setup /
            Export PDF / Export Excel / SaveStatusAndButton) lives top-right on
            the same band as the title via the canonical WorkspaceHeader.
            TIM-1937: the saved-status text + Save button render through the
            paired SaveStatusAndButton at the end of the row so the indicator
            sits immediately to the left of Save with no other action between
            them (the board reopened the chrome ship over this gap). */}
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
              {/* TIM-2413: primary hero CTA + SaveStatusAndButton stay outside;
                  Export PDF + Export Excel live inside the hamburger (2 secondary
                  utilities meets the >=2 threshold). Cluster order:
                  [Primary] [⋯] [SaveStatusAndButton]. */}
              {canEdit && (
                <WorkspaceActionButton
                  variant="primary"
                  onClick={openWizard}
                  aria-label="Guided setup"
                  title="Walk through your forecast inputs step by step, with a hint on each field"
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
                savedAt={saveState.kind === "saved" ? saveState.at : lastSavedAt}
                error={saveState.kind === "error" ? saveState.message : null}
                unsaved={saveState.kind === "dirty"}
                canEdit={canEdit}
                onSave={handleManualSave}
              />
            </>
          }
        />

        {/* TIM-2426: Cross-Suite Conflict Resolver entry point. Renders nothing
            when there's no conflict; renders an amber pill + opens the resolver
            modal when the consistency engine flags Hiring ↔ Financials drift. */}
        <div className="mb-4">
          <ConflictNoticeBadge />
        </div>

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

        {/* TIM-1745: tabs sit flush above the content; the action toolbar that
            used to share this row now lives in the page header (top-right). */}
        <div className="mb-5">
          <WorkspaceSubNav
            tabs={tabs.map((t) => ({ key: t.id, label: t.label, badge: t.badge }))}
            active={activeTab}
            onSelect={setActiveTab}
            ariaLabel="Financials sections"
            className="mb-0"
          />
        </div>

        {activeTab === "forecast" && (
          <ForecastTab
            mp={mp}
            canEdit={canEdit}
            onUpdateMp={handleMpUpdate}
            menuBlendedCogsPct={liveMenuBlendedCogsPct}
            menuCogsItems={liveMenuCogsItems}
            menuCogsByCategory={liveMenuCogsByCategory}
            onStartWizard={openWizard}
            onGoToStartup={() => setActiveTab("startup")}
            manualLines={mp.manual_lines ?? []}
            overrideCounts={manualOverrideCountsByLine(mp.manual_overrides)}
            onClearLineOverrides={handleClearLineOverrides}
            onGoToProjections={() => setActiveTab("projections")}
            onRefreshMenu={handleRefreshMenu}
            isRefreshingMenu={isRefreshingMenu}
            onRefreshEquipment={handleRefreshEquipment}
            isRefreshingEquipment={isRefreshingEquipment}
            onCogsMenuAnalyse={handleCogsMenuAnalyse}
            cogsMenuAnalyseLoading={cogsMenuAnalyseLoading}
            cogsMenuAnalyseError={cogsMenuAnalyseError}
            cogsMenuAnalyseResult={cogsMenuAnalyseResult}
            onCogsAdditionalAnalyse={handleCogsAdditionalAnalyse}
            cogsAdditionalAnalyseLoading={cogsAdditionalAnalyseLoading}
            cogsAdditionalAnalyseError={cogsAdditionalAnalyseError}
            cogsAdditionalAnalyseResult={cogsAdditionalAnalyseResult}
          />
        )}
        {activeTab === "personnel" && (
          <>
            <PayrollSummaryChart
              slices={slices}
              fiscalYearStartMonth={fiscalYearStartMonth}
              currencyCode={currencyCode}
            />
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
              minimumWage={minimumWage}
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
            openingRunway={openingRunway}
          />
        )}
        {activeTab === "depreciation" && (
          <DepreciationTab
            equipmentItems={liveEquipmentItems}
            slices={slices}
            fiscalYearStartMonth={fiscalYearStartMonth}
            currencyCode={currencyCode}
            forecastLines={mp.forecast_lines}
            canEdit={canEdit}
            onChangeForecastLines={(next) => handleMpUpdate({ ...mp, forecast_lines: next })}
            menuBlendedCogsPct={menuBlendedCogsPct}
            menuCogsItems={menuCogsItems}
            manualLines={mp.manual_lines ?? []}
            overrideCounts={manualOverrideCountsByLine(mp.manual_overrides)}
            onClearLineOverrides={handleClearLineOverrides}
            onGoToProjections={() => setActiveTab("projections")}
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
    </div>
  );
}
