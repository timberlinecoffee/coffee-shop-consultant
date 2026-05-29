"use client";

// TIM-1206: Salaries / Personnel plan editor (LivePlan-style). Each row is a
// role: headcount, hire timing, pay (annual / monthly / hourly × expected
// hours), benefits burden, and a COGS-labor vs operating-overhead designation.
// This is the single source of truth for labor — its loaded cost flows into the
// P&L, cash flow, and break-even via the projection engine.

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Users } from "lucide-react";
import type { PersonnelLine, PersonnelPayBasis, PersonnelSeasonal } from "@/lib/financial-projection";
import { personnelLoadedMonthlyCents, fmt } from "@/lib/financial-projection";
import { currencySymbol } from "@/lib/currency";
import { NumericInput } from "@/components/ui/numeric-input";

// TIM-1260: calendar months (1=Jan) and common-season quick picks for the
// recurring seasonal staffing pattern.
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
const SEASON_PRESETS: { label: string; months: number[] }[] = [
  { label: "Summer", months: [6, 7, 8] },
  { label: "Fall", months: [9, 10, 11] },
  { label: "Winter", months: [12, 1, 2] },
  { label: "Spring", months: [3, 4, 5] },
];

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `staff:${crypto.randomUUID()}`;
  }
  return `staff:${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

const PAY_BASIS_LABEL: Record<PersonnelPayBasis, string> = {
  annual: "Annual Salary",
  monthly: "Monthly Salary",
  hourly: "Hourly",
};

const inputCls =
  "text-sm border border-[var(--border-medium)] rounded-lg px-3 py-1.5 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
const fieldLabelCls = "block text-[10px] font-medium text-[var(--muted-foreground)] mb-1";

interface RowProps {
  line: PersonnelLine;
  canEdit: boolean;
  currencyCode: string;
  onChange: (next: PersonnelLine) => void;
  onDelete: () => void;
}

function PersonnelRow({ line, canEdit, currencyCode, onChange, onDelete }: RowProps) {
  const sym = currencySymbol(currencyCode);
  const [expanded, setExpanded] = useState(false);
  const isHourly = line.pay_basis === "hourly";
  const loaded = personnelLoadedMonthlyCents(line);
  const seasonalOn = line.seasonal?.enabled ?? false;
  const activeMonths = line.seasonal?.active_months ?? [];

  function updateSeasonal(patch: Partial<PersonnelSeasonal>) {
    const cur: PersonnelSeasonal = line.seasonal ?? {
      enabled: true,
      active_months: [6, 7, 8],
      repeat_yearly: true,
    };
    onChange({ ...line, seasonal: { ...cur, ...patch } });
  }
  function toggleSeasonalMonth(month: number) {
    const cur = line.seasonal?.active_months ?? [];
    const next = cur.includes(month)
      ? cur.filter((m) => m !== month)
      : [...cur, month].sort((a, b) => a - b);
    updateSeasonal({ active_months: next });
  }
  // Recurring season and one-time end are alternative ways to express "not
  // year-round"; enabling one clears the other so only one is ever active.
  function enableSeasonal(enabled: boolean) {
    if (enabled) {
      onChange({
        ...line,
        end_month: undefined,
        seasonal: { enabled: true, active_months: [6, 7, 8], repeat_yearly: true },
      });
    } else {
      const { seasonal: _drop, ...rest } = line;
      void _drop;
      onChange(rest as PersonnelLine);
    }
  }
  function enableEndMonth(enabled: boolean) {
    if (enabled) {
      const { seasonal: _drop, ...rest } = line;
      void _drop;
      onChange({ ...(rest as PersonnelLine), end_month: (line.ramp?.start_month ?? 1) + 2 });
    } else {
      onChange({ ...line, end_month: undefined });
    }
  }

  // Pay amount is shown in whole currency units for salary, dollars for hourly rate.
  const payValue = line.pay_amount_cents ? line.pay_amount_cents / 100 : "";

  return (
    <div className="border border-[var(--border)] rounded-xl bg-white">
      <div className="px-3 py-2.5 space-y-2.5">
        {/* Row A: role + designation + delete */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={`shrink-0 transition-colors ${
              line.ramp?.enabled || line.end_month || line.seasonal?.enabled || line.benefits_fixed_cents
                ? "text-[var(--teal)]"
                : "text-[var(--dark-grey)] hover:text-[var(--foreground)]"
            }`}
            aria-label={expanded ? "Collapse" : "Expand"}
            title="Hire timing, seasonal pattern, fixed benefits"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <input
            type="text"
            value={line.role}
            onChange={(e) => onChange({ ...line, role: e.target.value })}
            disabled={!canEdit}
            className={`${inputCls} flex-1 min-w-0 font-medium`}
            aria-label="Role or title"
            placeholder="Role or person"
          />
          <select
            className={`${inputCls} shrink-0 w-44 py-1`}
            value={line.cost_category}
            disabled={!canEdit}
            onChange={(e) =>
              onChange({ ...line, cost_category: e.target.value === "cogs" ? "cogs" : "overhead" })
            }
            aria-label="Cost category"
            title="Direct service labor reduces gross profit (COGS); overhead labor is an operating expense"
          >
            <option value="cogs">Direct Labor (COGS)</option>
            <option value="overhead">Operating Overhead</option>
          </select>
          <button
            type="button"
            onClick={onDelete}
            disabled={!canEdit}
            className="text-[var(--dark-grey)] hover:text-[var(--error)] shrink-0 disabled:opacity-50"
            aria-label="Remove role"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Row B: headcount + pay basis + pay amount (+ hours) + benefits */}
        <div className="flex flex-wrap items-end gap-3 pl-6">
          <div className="w-20">
            <label className={fieldLabelCls}>Headcount</label>
            <NumericInput
              type="number"
              min={0}
              step={1}
              value={line.headcount || ""}
              disabled={!canEdit}
              onChange={(e) =>
                onChange({ ...line, headcount: Math.max(0, parseInt(e.target.value, 10) || 0) })
              }
              className={`${inputCls} w-full`}
              aria-label="Number of staff in this role"
            />
          </div>
          <div className="w-36">
            <label className={fieldLabelCls}>Pay basis</label>
            <select
              className={`${inputCls} w-full`}
              value={line.pay_basis}
              disabled={!canEdit}
              onChange={(e) => {
                const next = e.target.value as PersonnelPayBasis;
                const patch: PersonnelLine = { ...line, pay_basis: next };
                if (next === "hourly" && line.hours_per_week === undefined) patch.hours_per_week = 30;
                onChange(patch);
              }}
              aria-label="Pay basis"
            >
              {(Object.keys(PAY_BASIS_LABEL) as PersonnelPayBasis[]).map((b) => (
                <option key={b} value={b}>
                  {PAY_BASIS_LABEL[b]}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className={fieldLabelCls}>{isHourly ? "Rate / hour" : "Pay amount"}</label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--dark-grey)] pointer-events-none">
                {sym}
              </span>
              <NumericInput
                type="number"
                min={0}
                step={isHourly ? 0.25 : 100}
                value={payValue}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({
                    ...line,
                    pay_amount_cents: Math.round((parseFloat(e.target.value) || 0) * 100),
                  })
                }
                className={`${inputCls} w-full pl-5`}
                aria-label={isHourly ? "Hourly rate" : "Salary amount"}
              />
            </div>
          </div>
          {isHourly && (
            <div className="w-28">
              <label className={fieldLabelCls}>Hours / week</label>
              <NumericInput
                type="number"
                min={0}
                max={168}
                step={1}
                value={line.hours_per_week ?? ""}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({
                    ...line,
                    hours_per_week: Math.max(0, parseFloat(e.target.value) || 0),
                  })
                }
                className={`${inputCls} w-full`}
                aria-label="Expected hours per week per person"
              />
            </div>
          )}
          <div className="w-28">
            <label className={fieldLabelCls}>Benefits %</label>
            <div className="relative">
              <NumericInput
                type="number"
                min={0}
                max={100}
                step={1}
                value={line.benefits_pct || ""}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({ ...line, benefits_pct: Math.max(0, parseFloat(e.target.value) || 0) })
                }
                className={`${inputCls} w-full pr-6`}
                aria-label="Benefits as a percent of pay"
                title="Payroll taxes, health, and other burden as a % of base pay"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--dark-grey)] pointer-events-none">
                %
              </span>
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] font-medium text-[var(--muted-foreground)]">Loaded cost</p>
            <p className="text-sm font-semibold text-[var(--teal)]">{fmt(loaded, currencyCode)}/mo</p>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-3 border-t border-[var(--neutral-cool-100)] bg-[var(--neutral-cool-50)] space-y-3">
          {/* Fixed per-head benefits */}
          <div>
            <label className={fieldLabelCls}>Fixed benefits ({sym} per person / month)</label>
            <div className="relative w-40">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--dark-grey)] pointer-events-none">
                {sym}
              </span>
              <NumericInput
                type="number"
                min={0}
                step={10}
                value={line.benefits_fixed_cents ? line.benefits_fixed_cents / 100 : ""}
                disabled={!canEdit}
                onChange={(e) => {
                  const v = Math.round((parseFloat(e.target.value) || 0) * 100);
                  onChange({ ...line, benefits_fixed_cents: v > 0 ? v : undefined });
                }}
                className={`${inputCls} w-full pl-5`}
                aria-label="Fixed benefits per person per month"
                placeholder="0"
              />
            </div>
            <p className="text-[10px] text-[var(--dark-grey)] mt-1">
              A flat per-head amount on top of the percentage (e.g. a fixed health stipend).
            </p>
          </div>

          {/* Phased hiring */}
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
                      ramp: line.ramp
                        ? { ...line.ramp, enabled: true }
                        : { enabled: true, start_month: 1, ramp_months: 0, start_pct: 100 },
                    });
                  } else if (line.ramp) {
                    onChange({ ...line, ramp: { ...line.ramp, enabled: false } });
                  }
                }}
                className="w-3.5 h-3.5 accent-[var(--teal)]"
              />
              <span className="text-xs font-medium text-[var(--foreground)]">
                Phased hiring: set the hire month and ramp staffing in gradually
              </span>
            </label>
            {line.ramp?.enabled && (
              <div className="ml-6 mt-2 grid grid-cols-3 gap-3 max-w-md">
                <div>
                  <label className={fieldLabelCls}>Hire month</label>
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
                    className={`${inputCls} w-full`}
                  />
                  <p className="text-[10px] text-[var(--dark-grey)] mt-1">Month 1 = opening</p>
                </div>
                <div>
                  <label className={fieldLabelCls}>Ramp-up months</label>
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
                    className={`${inputCls} w-full`}
                  />
                  <p className="text-[10px] text-[var(--dark-grey)] mt-1">0 = full staff at once</p>
                </div>
                <div>
                  <label className={fieldLabelCls}>Start at % of staff</label>
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
                    className={`${inputCls} w-full`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Recurring seasonal pattern (TIM-1260) */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={seasonalOn}
                disabled={!canEdit}
                onChange={(e) => enableSeasonal(e.target.checked)}
                className="w-3.5 h-3.5 accent-[var(--teal)]"
              />
              <span className="text-xs font-medium text-[var(--foreground)]">
                Recurring season: only pay this role in certain months each year
              </span>
            </label>
            {seasonalOn && (
              <div className="ml-6 mt-2 space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-[var(--dark-grey)]">Quick pick:</span>
                  {SEASON_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => updateSeasonal({ active_months: p.months })}
                      className="text-[10px] px-2 py-0.5 rounded-md border border-[var(--border-medium)] text-[var(--teal)] hover:bg-[var(--teal)]/5 disabled:opacity-50"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Active months">
                  {MONTH_ABBR.map((label, i) => {
                    const month = i + 1;
                    const active = activeMonths.includes(month);
                    return (
                      <button
                        key={month}
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={active}
                        onClick={() => toggleSeasonalMonth(month)}
                        className={`text-[11px] w-10 py-1 rounded-md border transition-colors disabled:opacity-50 ${
                          active
                            ? "bg-[var(--teal)] text-white border-[var(--teal)]"
                            : "bg-white text-[var(--muted-foreground)] border-[var(--border-medium)] hover:border-[var(--teal)]"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={line.seasonal?.repeat_yearly ?? true}
                    disabled={!canEdit}
                    onChange={(e) => updateSeasonal({ repeat_yearly: e.target.checked })}
                    className="w-3.5 h-3.5 accent-[var(--teal)]"
                  />
                  <span className="text-xs text-[var(--foreground)]">Repeat every year</span>
                </label>
                {activeMonths.length === 0 ? (
                  <p className="text-[10px] text-[var(--error)]">Pick at least one active month.</p>
                ) : (
                  <p className="text-[10px] text-[var(--muted-foreground)]">
                    Paid in: {activeMonths.map((m) => MONTH_ABBR[m - 1]).join(", ")}
                    {(line.seasonal?.repeat_yearly ?? true) ? ", every year." : ", first year only."}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* One-time temporary end month */}
          {!seasonalOn && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={typeof line.end_month === "number"}
                  disabled={!canEdit}
                  onChange={(e) => enableEndMonth(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[var(--teal)]"
                />
                <span className="text-xs font-medium text-[var(--foreground)]">
                  Temporary: stop paying this role after a set month (one time)
                </span>
              </label>
              {typeof line.end_month === "number" && (
                <div className="ml-6 mt-2 w-32">
                  <label className={fieldLabelCls}>Last paid month</label>
                  <NumericInput
                    type="number"
                    min={1}
                    max={60}
                    value={line.end_month}
                    disabled={!canEdit}
                    onChange={(e) =>
                      onChange({
                        ...line,
                        end_month: Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)),
                      })
                    }
                    className={`${inputCls} w-full`}
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

interface Props {
  personnel: PersonnelLine[];
  canEdit: boolean;
  onChange: (next: PersonnelLine[]) => void;
  currencyCode?: string;
}

export function PersonnelEditor({ personnel, canEdit, onChange, currencyCode = "USD" }: Props) {
  function addRole() {
    const newRole: PersonnelLine = {
      id: genId(),
      role: "New Role",
      headcount: 1,
      pay_basis: "hourly",
      pay_amount_cents: 1700,
      hours_per_week: 30,
      benefits_pct: 12,
      cost_category: "overhead",
    };
    onChange([...personnel, newRole]);
  }

  function updateRole(idx: number, next: PersonnelLine) {
    const copy = [...personnel];
    copy[idx] = next;
    onChange(copy);
  }

  function deleteRole(idx: number) {
    onChange(personnel.filter((_, i) => i !== idx));
  }

  const totalLoaded = personnel.reduce((sum, p) => sum + personnelLoadedMonthlyCents(p), 0);
  const cogsLoaded = personnel
    .filter((p) => p.cost_category === "cogs")
    .reduce((sum, p) => sum + personnelLoadedMonthlyCents(p), 0);
  const overheadLoaded = totalLoaded - cogsLoaded;
  const totalHeadcount = personnel.reduce((sum, p) => sum + (p.headcount || 0), 0);

  return (
    <div className="space-y-4" id="tour-personnel">
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-[var(--teal)]" aria-hidden="true" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--teal)]">Staff & Salaries</p>
              <p className="text-[10px] text-[var(--dark-grey)] mt-0.5">
                Each role drives labor cost on your P&amp;L, cash flow, and break-even. Mark baristas
                and other hands-on staff as Direct Labor; managers and back-office roles as Overhead.
              </p>
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addRole}
              className="flex items-center gap-1 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-2 py-1 rounded-md shrink-0"
            >
              <Plus size={12} /> Add role
            </button>
          )}
        </div>

        <div className="space-y-2">
          {personnel.length === 0 ? (
            <p className="text-xs text-[var(--dark-grey)] italic py-3 px-3 bg-[var(--background)] rounded-lg">
              No staff yet. Add roles to model your payroll — or leave this empty if you&apos;re
              running owner-only (use an owner draw on the Forecast tab instead of a salary).
            </p>
          ) : (
            personnel.map((line, idx) => (
              <PersonnelRow
                key={line.id}
                line={line}
                canEdit={canEdit}
                currencyCode={currencyCode}
                onChange={(next) => updateRole(idx, next)}
                onDelete={() => deleteRole(idx)}
              />
            ))
          )}
        </div>
      </div>

      {personnel.length > 0 && (
        <div className="rounded-xl border border-[var(--teal-tint-400)] bg-[var(--teal-tint-100)] px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--teal)]">Total Headcount</p>
              <p className="text-lg font-bold text-[var(--foreground)]">{totalHeadcount}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--teal)]">Loaded Payroll / Month</p>
              <p className="text-lg font-bold text-[var(--foreground)]">{fmt(totalLoaded, currencyCode)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--teal)]">Direct Labor (COGS)</p>
              <p className="text-lg font-bold text-[var(--foreground)]">{fmt(cogsLoaded, currencyCode)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--teal)]">Overhead Labor</p>
              <p className="text-lg font-bold text-[var(--foreground)]">{fmt(overheadLoaded, currencyCode)}</p>
            </div>
          </div>
          <p className="text-[10px] text-[var(--muted-foreground)] mt-3">
            Loaded cost includes benefits. At full staffing — phased hires ramp in over the months
            you set. This is the labor figure used everywhere else in your plan.
          </p>
        </div>
      )}
    </div>
  );
}
