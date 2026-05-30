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
import { ChevronDown, ChevronRight, Plus, Trash2, Info, AlertCircle, RotateCcw, ExternalLink } from "lucide-react";
import type {
  ForecastLine,
  ForecastCategory,
  LineRamp,
  LineGrowth,
} from "@/lib/financial-projection";
import { currencySymbol } from "@/lib/currency";
import { NumericInput } from "@/components/ui/numeric-input";
import { TruncatedText } from "@/components/ui/TruncatedText";

const CATEGORY_META: Record<ForecastCategory, { label: string; hint: string; valueLabel: string }> = {
  revenue: {
    label: "Revenue",
    hint: "Income beyond your primary food & beverage sales — retail, events, workshops, wholesale. Add, rename, or remove any stream.",
    valueLabel: "of base revenue",
  },
  cogs: {
    label: "Cost Of Goods (COGS)",
    hint: "Costs that scale with a revenue stream: ingredients, packaging, wholesale supply. Default: % of the linked revenue stream.",
    valueLabel: "of revenue",
  },
  overhead: {
    label: "Operating Expenses (Overhead)",
    hint: "Fixed and variable expenses to run the business: labor, rent, utilities, marketing. Use the \"% of\" dropdown on each line to tie it to a specific revenue stream, overall revenue, or a fixed monthly amount.",
    valueLabel: "of revenue",
  },
  capex: {
    label: "Asset Purchases (Capex)",
    hint: "One-time investments (equipment, build-out, technology). Charged in the start month and depreciated over the asset's useful life — the per-month expense flows to your P&L without affecting cash again.",
    valueLabel: "(one-time)",
  },
};

export interface RevenueStreamOption {
  id: string;          // matches ForecastLine.revenue_stream_id
  label: string;
}

export interface MenuCogsItem {
  name: string;
  price_cents: number;
  cogs_cents: number;
  expected_mix_pct: number;
  cogs_pct: number;
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
  menuCogsItems: MenuCogsItem[];
  // TIM-1310: grid-level customizations for this line, reflected on the input page.
  overrideCount?: number;
  manualMode?: boolean;
  onViewOverrides?: () => void;
  onClearOverrides?: () => void;
}

function LineRow({ line, canEdit, onChange, onDelete, currencyCode, streamOptions, menuBlendedCogsPct, menuCogsItems, overrideCount = 0, manualMode = false, onViewOverrides, onClearOverrides }: LineRowProps) {
  const sym = currencySymbol(currencyCode);
  const [expanded, setExpanded] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const inputCls =
    "text-sm border border-[var(--border-medium)] rounded-lg px-3 py-1.5 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";

  const isCapex = line.category === "capex";
  const isCogs = line.category === "cogs";
  const isOverhead = line.category === "overhead";
  const isRevenue = line.category === "revenue";
  const menuLinked = isCogs && line.menu_linked === true;
  const hasMenuData = typeof menuBlendedCogsPct === "number";
  // TIM-1168: visually flag manual override — when menu data exists but this line is not auto-linked.
  const isManualOverride = isCogs && hasMenuData && !menuLinked;
  const streamId = line.revenue_stream_id ?? DEFAULT_STREAM_ID;
  const displayPct = menuLinked && hasMenuData ? (menuBlendedCogsPct as number) : null;

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

  return (
    <div className="border border-[var(--border)] rounded-xl bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`shrink-0 transition-colors ${
            line.ramp?.enabled || line.growth?.enabled || isCapex
              ? "text-[var(--teal)]"
              : "text-[var(--dark-grey)] hover:text-[var(--foreground)]"
          }`}
          aria-label={expanded ? "Collapse" : "Expand"}
          title="Ramp & growth"
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

        {/* TIM-1168: manual override badge — visible when menu data exists but auto is off */}
        {isManualOverride && (
          <span
            className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--warning-amber-bg-9)] text-[var(--warning-text-4)] border border-[var(--warning-amber-bg)]"
            title="You've entered this manually. Enable 'Link to menu' to auto-calculate from your menu."
          >
            manual
          </span>
        )}

        {/* TIM-1310: grid-level customization badge — keeps the founder-loved dot
            and surfaces overrides on the input page. Customized values win over
            this assumption until cleared. */}
        {(overrideCount > 0 || manualMode) && (
          <span
            className="shrink-0 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--teal-bg-subtle)] text-[var(--teal)] border border-[var(--teal-bg-950)]"
            title={
              manualMode
                ? "This line is entered manually for every month on the projections grid. Those values win over this assumption until cleared."
                : `This line has ${overrideCount} customized month${overrideCount === 1 ? "" : "s"} on the projections grid. Those values win over this assumption until cleared.`
            }
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] inline-block" aria-hidden="true" />
            {manualMode ? "manual entry" : `${overrideCount} customized`}
            {onViewOverrides && (
              <button
                type="button"
                onClick={onViewOverrides}
                title="View on the projections grid"
                aria-label="View customizations on the projections grid"
                className="ml-0.5 inline-flex items-center hover:text-[var(--teal-dark)]"
              >
                <ExternalLink size={9} />
              </button>
            )}
            {canEdit && onClearOverrides && (
              <button
                type="button"
                onClick={onClearOverrides}
                title="Clear customizations for this line (reverts to this assumption)"
                aria-label="Clear customizations for this line"
                className="inline-flex items-center hover:text-[var(--error)]"
              >
                <RotateCcw size={9} />
              </button>
            )}
          </span>
        )}

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
        ) : !isCapex && !isRevenue ? (
          <div className="flex rounded-lg border border-[var(--border-medium)] overflow-hidden shrink-0">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onChange({ ...line, mode: "flat" })}
              className={`text-xs px-2 py-1 font-medium transition-colors ${
                line.mode === "flat" ? "bg-[var(--teal)] text-white" : "bg-white text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
                line.mode === "pct" ? "bg-[var(--teal)] text-white" : "bg-white text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
                className={`${inputCls} w-full pr-6 bg-[var(--teal-bg-muted)] text-[var(--teal)] font-medium`}
                type="text"
                value={displayPct !== null ? displayPct.toFixed(1) : "n/a"}
                readOnly
                disabled
                aria-label="Menu-derived percent"
                title="Computed from menu item costing"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--teal)] pointer-events-none">
                %
              </span>
            </>
          ) : line.mode === "flat" || isRevenue ? (
            <>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--dark-grey)] pointer-events-none">
                {sym}
              </span>
              <NumericInput
                className={`${inputCls} w-full pl-5`}
                type="number"
                min={0}
                step={50}
                value={isRevenue && line.mode !== "flat" ? "" : line.value ? line.value / 100 : ""}
                onChange={(e) =>
                  onChange({
                    ...line,
                    mode: "flat",
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
              <NumericInput
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
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--dark-grey)] pointer-events-none">
                %
              </span>
            </>
          )}
        </div>

        {!isCapex && !isOverhead && (
          menuLinked ? (
            <button
              type="button"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="flex items-center gap-1 text-[10px] text-[var(--teal)] font-medium shrink-0 hover:underline"
              title="How is this calculated?"
            >
              <Info size={10} />
              auto
            </button>
          ) : (
            <span className="text-[10px] text-[var(--dark-grey)] shrink-0 w-16">
              {isRevenue ? "/ mo" : line.mode === "pct" ? "% of rev" : "/ mo"}
            </span>
          )
        )}
        {isOverhead && (
          <span className="text-[10px] text-[var(--dark-grey)] shrink-0 w-12">
            {line.mode === "pct" ? "" : "/ mo"}
          </span>
        )}
        {isCapex && (
          <span className="text-[10px] text-[var(--dark-grey)] shrink-0 w-16">one-time</span>
        )}

        <button
          type="button"
          onClick={onDelete}
          disabled={!canEdit}
          className="text-[var(--dark-grey)] hover:text-[var(--error)] shrink-0 disabled:opacity-50"
          aria-label="Remove line item"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* TIM-1168: inline breakdown reveal triggered from the "auto" button */}
      {menuLinked && showBreakdown && !expanded && menuCogsItems.length > 0 && (
        <div className="px-3 pb-3 pt-2 border-t border-[var(--teal-bg-e8f)] bg-[var(--teal-bg-muted)]">
          <p className="text-[10px] text-[var(--muted-foreground)] mb-2">
            Weighted average COGS % from your menu items (by expected sales mix):
          </p>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[var(--dark-grey)]">
                <th className="text-left pb-1 font-medium">Item</th>
                <th className="text-right pb-1 font-medium">Mix %</th>
                <th className="text-right pb-1 font-medium">COGS %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--teal-bg-600)]">
              {menuCogsItems.map((it, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2 text-[var(--foreground)]">{it.name}</td>
                  <td className="py-1 text-right text-[var(--muted-foreground)]">{it.expected_mix_pct.toFixed(0)}%</td>
                  <td className="py-1 text-right font-medium text-[var(--teal)]">{it.cogs_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--teal-bg-lighter)]">
                <td className="pt-1.5 font-semibold text-[var(--foreground)]">Blended</td>
                <td />
                <td className="pt-1.5 text-right font-bold text-[var(--teal)]">{(menuBlendedCogsPct as number).toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--neutral-cool-100)] pt-3 space-y-3 bg-[var(--neutral-cool-50)]">
          {isCapex && (
            <div>
              <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-1">
                Useful life (years)
              </label>
              <NumericInput
                type="number"
                min={1}
                max={50}
                step={1}
                value={line.useful_life_years ?? 7}
                disabled={!canEdit}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onChange({
                    ...line,
                    useful_life_years: isFinite(v) && v > 0 ? Math.round(v) : 7,
                  });
                }}
                className={inputCls + " w-full max-w-[140px]"}
                aria-label="Useful life in years"
              />
              <p className="text-[10px] text-[var(--dark-grey)] mt-1">
                Spreads the cost on your P&amp;L over this many years. Common defaults: POS hardware 3y, espresso & equipment 5–7y, vehicles 5y, build-out & furniture 10–15y.
              </p>
            </div>
          )}
          {isCogs && (
            <div>
              <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-1">
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
              <p className="text-[10px] text-[var(--dark-grey)] mt-1">
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
                  className="w-3.5 h-3.5 accent-[var(--teal)] disabled:opacity-50"
                />
                <span className="text-xs font-medium text-[var(--foreground)]">
                  Link to menu: derive COGS from menu item costs × volume
                </span>
              </label>
              <p className="text-[10px] text-[var(--dark-grey)] mt-1 ml-6">
                {hasMenuData
                  ? `Blended menu COGS: ${(menuBlendedCogsPct as number).toFixed(1)}% of priced items.`
                  : "Add menu items with prices and expected mix to enable this."}
              </p>

              {/* TIM-1168: "How is this calculated?" breakdown */}
              {menuLinked && menuCogsItems.length > 0 && (
                <div className="mt-3 ml-6">
                  <button
                    type="button"
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    className="flex items-center gap-1 text-[10px] font-medium text-[var(--teal)] hover:underline"
                  >
                    <Info size={10} />
                    {showBreakdown ? "Hide calculation" : "How is this calculated?"}
                  </button>
                  {showBreakdown && (
                    <div className="mt-2 rounded-lg border border-[var(--teal-bg-e8f)] bg-[var(--teal-bg-muted)] p-3">
                      <p className="text-[10px] text-[var(--muted-foreground)] mb-2">
                        Blended COGS % = weighted average of (ingredient cost ÷ sell price) across all priced menu items, weighted by their expected sales mix.
                      </p>
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-[var(--dark-grey)]">
                            <th className="text-left pb-1 font-medium">Item</th>
                            <th className="text-right pb-1 font-medium">Mix %</th>
                            <th className="text-right pb-1 font-medium">COGS %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--teal-bg-e8f)]">
                          {menuCogsItems.map((it, i) => (
                            <tr key={i}>
                              <td className="py-1 pr-2 text-[var(--foreground)]" style={{ maxWidth: 120 }}>
                                <TruncatedText text={it.name} />
                              </td>
                              <td className="py-1 text-right text-[var(--muted-foreground)]">{it.expected_mix_pct.toFixed(0)}%</td>
                              <td className="py-1 text-right font-medium text-[var(--teal)]">{it.cogs_pct.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-[var(--teal-bg-lighter)]">
                            <td className="pt-1.5 font-semibold text-[var(--foreground)]">Blended</td>
                            <td />
                            <td className="pt-1.5 text-right font-bold text-[var(--teal)]">
                              {(menuBlendedCogsPct as number).toFixed(1)}%
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
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
                className="w-3.5 h-3.5 accent-[var(--teal)]"
              />
              <span className="text-xs font-medium text-[var(--foreground)]">
                Ramp period: line starts below full level and ramps up
              </span>
            </label>
            {line.ramp?.enabled && (
              <div className="ml-6 mt-2 grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-1">Start month</label>
                  <NumericInput
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
                      <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-1">
                        Ramp duration (mo)
                      </label>
                      <NumericInput
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
                      <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-1">
                        Start at % of full
                      </label>
                      <NumericInput
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
                  className="w-3.5 h-3.5 accent-[var(--teal)]"
                />
                <span className="text-xs font-medium text-[var(--foreground)]">
                  Monthly growth: compounds each month after ramp completes
                </span>
              </label>
              {line.growth?.enabled && (
                <div className="ml-6 mt-2 max-w-[200px]">
                  <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-1">Growth % / mo</label>
                  <NumericInput
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
  menuCogsItems: MenuCogsItem[];
  // TIM-1245: one-tap starter streams for the revenue section (e.g. Retail
  // Sales, Events, Workshops, Wholesale). Already-present labels are hidden.
  starterLabels?: string[];
  // TIM-1310: grid-level customizations reflected per line.
  overrideCounts: Record<string, number>;
  manualLines: string[];
  onClearLineOverrides?: (lineId: string) => void;
  onGoToProjections?: () => void;
}

function CategorySection({ category, lines, canEdit, onLinesChange, currencyCode, streamOptions, menuBlendedCogsPct, menuCogsItems, starterLabels, overrideCounts, manualLines, onClearLineOverrides, onGoToProjections }: SectionProps) {
  const meta = CATEGORY_META[category];
  const myLines = lines.filter((l) => l.category === category);
  const hasMenuData = typeof menuBlendedCogsPct === "number";

  const existingLabels = new Set(myLines.map((l) => l.label.trim().toLowerCase()));
  const availableStarters = (starterLabels ?? []).filter(
    (s) => !existingLabels.has(s.trim().toLowerCase())
  );

  function addLine(label?: string) {
    const defaultMode = category === "capex" ? "flat" : (category === "cogs" ? "pct" : "flat");
    const newLine: ForecastLine = {
      id: genId(),
      label: label ?? `New ${meta.label.split(" ")[0].toLowerCase()} line`,
      category,
      mode: defaultMode,
      value: 0,
    };
    if (category === "capex") {
      // Capex defaults to start at month 1 with 7-year straight-line depreciation
      newLine.ramp = { enabled: true, start_month: 1, ramp_months: 0, start_pct: 100 };
      newLine.useful_life_years = 7;
    }
    if (category === "cogs") {
      // TIM-1168: auto-link to menu when menu data exists (best-ergonomics default).
      // Falls back to manual pct when no menu is built yet.
      newLine.revenue_stream_id = undefined;
      if (hasMenuData) {
        newLine.menu_linked = true;
      }
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
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--teal)]">{meta.label}</p>
          <p className="text-[10px] text-[var(--dark-grey)] mt-0.5">{meta.hint}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => addLine()}
            className="flex items-center gap-1 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-2 py-1 rounded-md"
          >
            <Plus size={12} /> Add line
          </button>
        )}
      </div>
      {canEdit && availableStarters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-[10px] text-[var(--dark-grey)]">Quick add:</span>
          {availableStarters.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => addLine(label)}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--teal)] border border-[var(--teal)]/25 bg-[var(--teal)]/5 hover:bg-[var(--teal)]/10 px-2 py-0.5 rounded-full transition-colors"
            >
              <Plus size={10} /> {label}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {/* TIM-1168: COGS empty-state guides user to menu builder when no menu data exists */}
        {category === "cogs" && !hasMenuData && myLines.length === 0 && (
          <div className="flex items-start gap-2.5 py-3 px-3 bg-[var(--warning-bg-4)] border border-[var(--warning-amber-bg-8)] rounded-lg">
            <AlertCircle size={14} className="text-[var(--warning-text-7)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--warning-text-2)]">
                No menu built yet
              </p>
              <p className="text-[10px] text-[var(--warning-text-6)] mt-0.5">
                Build your menu with item prices and ingredient costs in the{" "}
                <a href="/workspace/menu-pricing" className="underline font-medium hover:text-[var(--warning-text-2)]">
                  Menu & Pricing workspace
                </a>
                . COGS will auto-calculate from there. You can also enter a manual % below.
              </p>
            </div>
          </div>
        )}
        {myLines.length === 0 && category !== "cogs" ? (
          <p className="text-xs text-[var(--dark-grey)] italic py-2 px-3 bg-[var(--background)] rounded-lg">
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
              menuCogsItems={menuCogsItems}
              overrideCount={overrideCounts[line.id] ?? 0}
              manualMode={manualLines.includes(line.id)}
              onViewOverrides={onGoToProjections}
              onClearOverrides={onClearLineOverrides ? () => onClearLineOverrides(line.id) : undefined}
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
  menuCogsItems?: MenuCogsItem[];
  // TIM-1245: restrict which category sections render so the workspace can show
  // "Additional Revenue Streams" and "Costs & Expenses" as separate sections.
  // Defaults to all four categories for backward compatibility.
  categories?: ForecastCategory[];
  // Starter streams offered as one-tap chips on the revenue section.
  revenueStarterLabels?: string[];
  // TIM-1310: grid-level customizations to reflect per line on the input page.
  manualLines?: string[];
  overrideCounts?: Record<string, number>;
  onClearLineOverrides?: (lineId: string) => void;
  onGoToProjections?: () => void;
}

// Build the revenue stream picker options from the current forecast lines.
// "All revenue" is the legacy / safe default; "Base (foot-traffic)" is the
// non-line ticket sales; each revenue line shows up by its user-entered label.
function streamOptionsFromLines(lines: ForecastLine[]): RevenueStreamOption[] {
  const opts: RevenueStreamOption[] = [
    { id: DEFAULT_STREAM_ID, label: "All revenue (total)" },
    { id: "base", label: "Base (foot-traffic ticket sales)" },
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
  menuCogsItems = [],
  categories = ["revenue", "cogs", "overhead", "capex"],
  revenueStarterLabels,
  manualLines = [],
  overrideCounts = {},
  onClearLineOverrides,
  onGoToProjections,
}: Props) {
  const streamOptions = streamOptionsFromLines(lines);
  const shared = {
    lines,
    canEdit,
    onLinesChange: onChange,
    currencyCode,
    streamOptions,
    menuBlendedCogsPct,
    menuCogsItems,
    overrideCounts,
    manualLines,
    onClearLineOverrides,
    onGoToProjections,
  };
  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <CategorySection
          key={category}
          category={category}
          {...shared}
          starterLabels={category === "revenue" ? revenueStarterLabels : undefined}
        />
      ))}
    </div>
  );
}
