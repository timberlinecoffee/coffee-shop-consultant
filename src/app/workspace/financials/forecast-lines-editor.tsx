"use client";

// TIM-1102: LivePlan-style flexible forecast-line editor. Renders per-category
// (Revenue / COGS / Overhead / Capex) sections, each with editable lines that
// support flat-$ vs %-of-sales modes, optional ramp periods, and optional
// per-line growth rates.
// TIM-1117: COGS lines can target a parent revenue stream and optionally
// derive their pct from menu item costing.
// TIM-1118: Overhead rows replace the inline $/% toggle with a combined
// "% of …" dropdown so each operating expense can be tied to a specific
// revenue stream, overall revenue, or kept as a fixed monthly amount.

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Sliders } from "lucide-react";
import type {
  ForecastLine,
  ForecastCategory,
  LineRamp,
  LineGrowth,
} from "@/lib/financial-projection";
import { currencySymbol } from "@/lib/currency";

// TIM-1167: Each category gets a plain-English description, an "includes" /
// "doesn't include" pair so brand-new users know exactly what belongs on each
// line, and a concrete example so the input feels less abstract.
const CATEGORY_META: Record<
  ForecastCategory,
  {
    label: string;
    hint: string;
    includes: string;
    excludes: string;
    example: string;
    valueLabel: string;
  }
> = {
  revenue: {
    label: "Additional Revenue Streams",
    hint: "Income that does NOT come through your counter — added on top of In-Store Ticket Sales above.",
    includes: "Wholesale beans to other cafes, catering invoices, subscription boxes shipped to homes, classes, online orders shipped (not picked up in-store), event bookings.",
    excludes: "Anything a customer pays for at your counter or POS — that's already counted in In-Store Ticket Sales. Don't double-count.",
    example: "e.g. \"Wholesale Coffee Beans — $4,200 / mo\" or \"Catering — 8% growth / mo\".",
    valueLabel: "of base revenue",
  },
  cogs: {
    label: "Cost Of Goods Sold (COGS)",
    hint: "What it costs you to make what you sell. Scales with the revenue stream you tie it to.",
    includes: "Coffee beans, milk, syrups, cups & lids, food ingredients, packaging, wholesale supply costs.",
    excludes: "Labor (that's an Operating Expense), rent, utilities, equipment purchases.",
    example: "e.g. \"Beverage Ingredients — 28% of In-Store Sales\".",
    valueLabel: "of revenue",
  },
  overhead: {
    label: "Operating Expenses (Overhead)",
    hint: "What it costs to keep the doors open every month — fixed bills and variable expenses that don't come from product cost.",
    includes: "Labor & payroll taxes, rent, utilities, insurance, marketing, software, repairs, supplies.",
    excludes: "Product ingredients (those go under COGS) and one-time equipment purchases (those go under Asset Purchases).",
    example: "e.g. \"Rent — Fixed $4,500 / mo\" or \"Labor — 32% of total revenue\".",
    valueLabel: "of revenue",
  },
  capex: {
    label: "Asset Purchases (Capex)",
    hint: "One-time investments. Charged in the month you buy them and depreciated over time.",
    includes: "Espresso machine, grinders, refrigeration, furniture, signage, build-out & renovations.",
    excludes: "Recurring monthly costs (those are Operating Expenses) and consumables like cups (those are COGS).",
    example: "e.g. \"La Marzocco Linea PB — $18,500, Month 1\".",
    valueLabel: "(one-time)",
  },
};

export interface RevenueStreamOption {
  id: string;          // matches ForecastLine.revenue_stream_id
  label: string;
}

const DEFAULT_STREAM_ID = "all";

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `line:${crypto.randomUUID()}`;
  }
  return `line:${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function defaultRamp(): LineRamp {
  return { enabled: true, start_month: 1, ramp_months: 3, start_pct: 30 };
}

function defaultGrowth(): LineGrowth {
  return { enabled: true, monthly_pct: 1 };
}

interface LineRowProps {
  line: ForecastLine;
  canEdit: boolean;
  onChange: (next: ForecastLine) => void;
  onDelete: () => void;
  currencyCode: string;
  streamOptions: RevenueStreamOption[];
  menuBlendedCogsPct: number | null;
}

function LineRow({ line, canEdit, onChange, onDelete, currencyCode, streamOptions, menuBlendedCogsPct }: LineRowProps) {
  const sym = currencySymbol(currencyCode);
  const [expanded, setExpanded] = useState(false);
  const inputCls =
    "text-sm border border-[#e0e0e0] rounded-lg px-3 py-1.5 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";

  const isCapex = line.category === "capex";
  const isCogs = line.category === "cogs";
  const isOverhead = line.category === "overhead";
  const menuLinked = isCogs && line.menu_linked === true;
  const hasMenuData = typeof menuBlendedCogsPct === "number";
  const streamId = line.revenue_stream_id ?? DEFAULT_STREAM_ID;
  const displayPct = menuLinked && hasMenuData ? (menuBlendedCogsPct as number) : null;

  // TIM-1118: encode the combined (mode, revenue_stream_id) state for the
  // overhead "% of" dropdown as a single string. "flat" means fixed $; any
  // other value is a stream id ("all" = overall, "base" = foot-traffic, or a
  // specific revenue line id).
  const overheadModeValue: string = line.mode === "flat" ? "flat" : streamId;

  function applyOverheadModeChoice(next: string) {
    if (next === "flat") {
      onChange({ ...line, mode: "flat", revenue_stream_id: undefined });
      return;
    }
    onChange({
      ...line,
      mode: "pct",
      revenue_stream_id: next === DEFAULT_STREAM_ID ? undefined : next,
    });
  }

  // Capex: only flat mode; one-time charge in start_month. No pct toggle, no growth.
  // COGS (TIM-1117): can target a parent revenue stream and optionally derive % from the menu.
  // Overhead (TIM-1118): a single "% of" dropdown replaces the $/% toggle and
  // picks both the mode (fixed $ vs. pct) and the revenue stream the pct
  // applies to.
  return (
    <div className="border border-[#efefef] rounded-xl bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[#afafaf] hover:text-[#1a1a1a] shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <input
          type="text"
          value={line.label}
          onChange={(e) => onChange({ ...line, label: e.target.value })}
          disabled={!canEdit}
          className={`${inputCls} flex-1 min-w-0 font-medium`}
          aria-label="Line item name"
        />

        {isOverhead ? (
          <select
            className={`${inputCls} shrink-0 w-44 py-1`}
            value={overheadModeValue}
            disabled={!canEdit}
            onChange={(e) => applyOverheadModeChoice(e.target.value)}
            aria-label="Expense basis"
            title="How this expense scales: a fixed amount, % of overall revenue, or % of a specific revenue stream"
          >
            <option value="flat">Fixed {sym}</option>
            {streamOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                % of {opt.label}
              </option>
            ))}
          </select>
        ) : !isCapex ? (
          <div className="flex rounded-lg border border-[#e0e0e0] overflow-hidden shrink-0">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onChange({ ...line, mode: "flat" })}
              className={`text-xs px-2 py-1 font-medium transition-colors ${
                line.mode === "flat" ? "bg-[#155e63] text-white" : "bg-white text-[#6b6b6b] hover:text-[#1a1a1a]"
              }`}
              aria-label="Static amount"
            >
              {sym}
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onChange({ ...line, mode: "pct" })}
              className={`text-xs px-2 py-1 font-medium transition-colors ${
                line.mode === "pct" ? "bg-[#155e63] text-white" : "bg-white text-[#6b6b6b] hover:text-[#1a1a1a]"
              }`}
              aria-label="Percent of revenue"
            >
              %
            </button>
          </div>
        ) : null}

        <div className="relative w-28 shrink-0">
          {menuLinked ? (
            <>
              <input
                className={`${inputCls} w-full pr-6 bg-[#f5fbfb] text-[#155e63] font-medium`}
                type="text"
                value={displayPct !== null ? displayPct.toFixed(1) : "n/a"}
                readOnly
                disabled
                aria-label="Menu-derived percent"
                title="Computed from menu item costing"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#155e63] pointer-events-none">
                %
              </span>
            </>
          ) : line.mode === "flat" ? (
            <>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#afafaf] pointer-events-none">
                {sym}
              </span>
              <input
                className={`${inputCls} w-full pl-5`}
                type="number"
                min={0}
                step={50}
                value={line.value ? line.value / 100 : ""}
                onChange={(e) =>
                  onChange({
                    ...line,
                    value: Math.round((parseFloat(e.target.value) || 0) * 100),
                  })
                }
                placeholder="0"
                disabled={!canEdit}
                aria-label="Amount"
              />
            </>
          ) : (
            <>
              <input
                className={`${inputCls} w-full pr-6`}
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={line.value || ""}
                onChange={(e) => onChange({ ...line, value: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                disabled={!canEdit}
                aria-label="Percent"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#afafaf] pointer-events-none">
                %
              </span>
            </>
          )}
        </div>

        {!isCapex && !isOverhead && (
          <span className="text-[10px] text-[#afafaf] shrink-0 w-16">
            {menuLinked
              ? "from menu"
              : line.mode === "pct"
                ? "% of rev"
                : "/ mo"}
          </span>
        )}
        {isOverhead && (
          <span className="text-[10px] text-[#afafaf] shrink-0 w-12">
            {line.mode === "pct" ? "" : "/ mo"}
          </span>
        )}
        {isCapex && (
          <span className="text-[10px] text-[#afafaf] shrink-0 w-16">one-time</span>
        )}

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          disabled={!canEdit}
          className={`text-xs px-2 py-1 rounded-md transition-colors shrink-0 ${
            line.ramp?.enabled || line.growth?.enabled || isCapex
              ? "bg-[#155e63]/10 text-[#155e63]"
              : "text-[#afafaf] hover:text-[#1a1a1a]"
          }`}
          aria-label="Advanced settings"
          title="Ramp & growth"
        >
          <Sliders size={12} />
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={!canEdit}
          className="text-[#afafaf] hover:text-[#a13d3d] shrink-0 disabled:opacity-50"
          aria-label="Remove line item"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-[#f5f5f5] pt-3 space-y-3 bg-[#fafafa]">
          {isCogs && (
            <div>
              <label className="block text-[10px] font-medium text-[#6b6b6b] mb-1">
                Applies to revenue stream
              </label>
              <select
                className={inputCls + " w-full max-w-xs"}
                value={streamId}
                disabled={!canEdit || line.mode === "flat"}
                onChange={(e) => {
                  const next = e.target.value;
                  onChange({
                    ...line,
                    revenue_stream_id: next === DEFAULT_STREAM_ID ? undefined : next,
                  });
                }}
                aria-label="Revenue stream this COGS line applies to"
              >
                {streamOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[#afafaf] mt-1">
                {line.mode === "flat"
                  ? "Stream selection applies to % mode only. Flat $ COGS doesn't scale with revenue."
                  : "By default, COGS is % of the linked revenue stream."}
              </p>
              <label className="flex items-center gap-2 cursor-pointer mt-3">
                <input
                  type="checkbox"
                  checked={menuLinked}
                  disabled={!canEdit || !hasMenuData}
                  onChange={(e) => {
                    onChange({
                      ...line,
                      menu_linked: e.target.checked ? true : undefined,
                      // When turning on, force pct mode so the menu rate has a base.
                      mode: e.target.checked ? "pct" : line.mode,
                    });
                  }}
                  className="w-3.5 h-3.5 accent-[#155e63] disabled:opacity-50"
                />
                <span className="text-xs font-medium text-[#1a1a1a]">
                  Link to menu: derive COGS from menu item costs × volume
                </span>
              </label>
              <p className="text-[10px] text-[#afafaf] mt-1 ml-6">
                {hasMenuData
                  ? `Blended menu COGS: ${(menuBlendedCogsPct as number).toFixed(1)}% of priced items.`
                  : "Add menu items with prices and expected mix to enable this."}
              </p>
            </div>
          )}

          {/* Ramp */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={line.ramp?.enabled ?? false}
                disabled={!canEdit}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange({
                      ...line,
                      ramp: line.ramp ? { ...line.ramp, enabled: true } : defaultRamp(),
                    });
                  } else if (line.ramp) {
                    onChange({ ...line, ramp: { ...line.ramp, enabled: false } });
                  }
                }}
                className="w-3.5 h-3.5 accent-[#155e63]"
              />
              <span className="text-xs font-medium text-[#1a1a1a]">
                Ramp period: line starts below full level and ramps up
              </span>
            </label>
            {line.ramp?.enabled && (
              <div className="ml-6 mt-2 grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-[#6b6b6b] mb-1">Start month</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={line.ramp.start_month}
                    disabled={!canEdit}
                    onChange={(e) =>
                      onChange({
                        ...line,
                        ramp: { ...line.ramp!, start_month: Math.max(1, parseInt(e.target.value, 10) || 1) },
                      })
                    }
                    className={inputCls + " w-full"}
                  />
                </div>
                {!isCapex && (
                  <>
                    <div>
                      <label className="block text-[10px] font-medium text-[#6b6b6b] mb-1">
                        Ramp duration (mo)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        value={line.ramp.ramp_months}
                        disabled={!canEdit}
                        onChange={(e) =>
                          onChange({
                            ...line,
                            ramp: {
                              ...line.ramp!,
                              ramp_months: Math.max(0, Math.min(24, parseInt(e.target.value, 10) || 0)),
                            },
                          })
                        }
                        className={inputCls + " w-full"}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[#6b6b6b] mb-1">
                        Start at % of full
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={line.ramp.start_pct}
                        disabled={!canEdit}
                        onChange={(e) =>
                          onChange({
                            ...line,
                            ramp: {
                              ...line.ramp!,
                              start_pct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)),
                            },
                          })
                        }
                        className={inputCls + " w-full"}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Growth (not for capex) */}
          {!isCapex && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={line.growth?.enabled ?? false}
                  disabled={!canEdit}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange({
                        ...line,
                        growth: line.growth ? { ...line.growth, enabled: true } : defaultGrowth(),
                      });
                    } else if (line.growth) {
                      onChange({ ...line, growth: { ...line.growth, enabled: false } });
                    }
                  }}
                  className="w-3.5 h-3.5 accent-[#155e63]"
                />
                <span className="text-xs font-medium text-[#1a1a1a]">
                  Monthly growth: compounds each month after ramp completes
                </span>
              </label>
              {line.growth?.enabled && (
                <div className="ml-6 mt-2 max-w-[200px]">
                  <label className="block text-[10px] font-medium text-[#6b6b6b] mb-1">Growth % / mo</label>
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    step={0.1}
                    value={line.growth.monthly_pct}
                    disabled={!canEdit}
                    onChange={(e) =>
                      onChange({
                        ...line,
                        growth: { ...line.growth!, monthly_pct: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className={inputCls + " w-full"}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  category: ForecastCategory;
  lines: ForecastLine[];
  canEdit: boolean;
  onLinesChange: (next: ForecastLine[]) => void;
  currencyCode: string;
  streamOptions: RevenueStreamOption[];
  menuBlendedCogsPct: number | null;
}

function CategorySection({ category, lines, canEdit, onLinesChange, currencyCode, streamOptions, menuBlendedCogsPct }: SectionProps) {
  const meta = CATEGORY_META[category];
  const myLines = lines.filter((l) => l.category === category);

  function addLine() {
    const defaultMode = category === "capex" ? "flat" : (category === "cogs" ? "pct" : "flat");
    const newLine: ForecastLine = {
      id: genId(),
      label: `New ${meta.label.split(" ")[0].toLowerCase()} line`,
      category,
      mode: defaultMode,
      value: 0,
    };
    if (category === "capex") {
      // Capex defaults to start at month 1
      newLine.ramp = { enabled: true, start_month: 1, ramp_months: 0, start_pct: 100 };
    }
    if (category === "cogs") {
      // TIM-1117: default new COGS lines to "all revenue" (legacy behavior).
      // Users pick a specific revenue stream in the line's expanded panel.
      newLine.revenue_stream_id = undefined;
    }
    onLinesChange([...lines, newLine]);
  }

  function updateLine(idx: number, next: ForecastLine) {
    const allMyIdx = lines.map((l, i) => (l.category === category ? i : -1)).filter((i) => i >= 0);
    const targetIdx = allMyIdx[idx];
    if (targetIdx === undefined) return;
    const copy = [...lines];
    copy[targetIdx] = next;
    onLinesChange(copy);
  }

  function deleteLine(idx: number) {
    const allMyIdx = lines.map((l, i) => (l.category === category ? i : -1)).filter((i) => i >= 0);
    const targetIdx = allMyIdx[idx];
    if (targetIdx === undefined) return;
    onLinesChange(lines.filter((_, i) => i !== targetIdx));
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#155e63]">{meta.label}</p>
          <p className="text-xs text-[#6b6b6b] mt-1 leading-snug">{meta.hint}</p>
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[11px] text-[#6b6b6b] leading-snug">
              <span className="font-semibold text-[#1a1a1a]">Includes:</span> {meta.includes}
            </p>
            <p className="text-[11px] text-[#6b6b6b] leading-snug">
              <span className="font-semibold text-[#1a1a1a]">Doesn&rsquo;t include:</span> {meta.excludes}
            </p>
            <p className="text-[11px] text-[#afafaf] italic leading-snug">{meta.example}</p>
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1 text-xs font-medium text-[#155e63] hover:bg-[#155e63]/5 px-2 py-1 rounded-md shrink-0"
          >
            <Plus size={12} /> Add line
          </button>
        )}
      </div>
      <div className="space-y-2">
        {myLines.length === 0 ? (
          <p className="text-xs text-[#afafaf] italic py-2 px-3 bg-[#faf9f7] rounded-lg">
            No {meta.label.toLowerCase()} lines yet.
          </p>
        ) : (
          myLines.map((line, idx) => (
            <LineRow
              key={line.id}
              line={line}
              canEdit={canEdit}
              onChange={(next) => updateLine(idx, next)}
              onDelete={() => deleteLine(idx)}
              currencyCode={currencyCode}
              streamOptions={streamOptions}
              menuBlendedCogsPct={menuBlendedCogsPct}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface Props {
  lines: ForecastLine[];
  canEdit: boolean;
  onChange: (next: ForecastLine[]) => void;
  currencyCode?: string;
  menuBlendedCogsPct?: number | null;
}

// Build the revenue stream picker options from the current forecast lines.
// "All revenue" is the legacy / safe default; "Base (foot-traffic)" is the
// non-line ticket sales; each revenue line shows up by its user-entered label.
function streamOptionsFromLines(lines: ForecastLine[]): RevenueStreamOption[] {
  // TIM-1167: "base" used to read "foot-traffic ticket sales" — confusing for
  // new users who didn't know whether that meant just walk-ins, just POS, etc.
  // Canonical term is now "In-Store Ticket Sales" (counter checkouts).
  const opts: RevenueStreamOption[] = [
    { id: DEFAULT_STREAM_ID, label: "Total revenue (everything)" },
    { id: "base", label: "In-Store Ticket Sales" },
  ];
  for (const l of lines) {
    if (l.category === "revenue") {
      opts.push({ id: l.id, label: l.label || "Revenue line" });
    }
  }
  return opts;
}

export function ForecastLinesEditor({
  lines,
  canEdit,
  onChange,
  currencyCode = "USD",
  menuBlendedCogsPct = null,
}: Props) {
  const streamOptions = streamOptionsFromLines(lines);
  const shared = {
    lines,
    canEdit,
    onLinesChange: onChange,
    currencyCode,
    streamOptions,
    menuBlendedCogsPct,
  };
  return (
    <div className="space-y-6">
      <CategorySection category="revenue" {...shared} />
      <CategorySection category="cogs" {...shared} />
      <CategorySection category="overhead" {...shared} />
      <CategorySection category="capex" {...shared} />
    </div>
  );
}
