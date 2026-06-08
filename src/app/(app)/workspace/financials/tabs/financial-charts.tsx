"use client";

// TIM-1120: Shared chart components for numeric financial tabs.
// Uses Recharts with the Groundwork palette (teal var(--teal) + accents).

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmt } from "@/lib/financial-projection";
import { currencySymbol } from "@/lib/currency";

// Groundwork palette (taken from existing UI: deep teal primary, red for negatives,
// muted greys for grid + axes). Categorical accents pulled from the same family
// so multiple series read as one chart.
export const CHART_COLORS = {
  primary: "var(--teal)",
  primarySoft: "var(--teal-medium)",
  positive: "var(--teal)",
  negative: "var(--error)",
  warning: "var(--coffee-brown-1)",
  accent: "var(--sage-medium)",
  accentSoft: "var(--sage-tint-2)",
  muted: "var(--muted-foreground)",
  grid: "var(--border)",
  axis: "var(--dark-grey)",
  highlight: "var(--teal-tint-100)",
} as const;

const AXIS_STYLE = { fill: CHART_COLORS.muted, fontSize: 11 } as const;
const TICK_LINE = { stroke: CHART_COLORS.grid } as const;

function compactCurrency(cents: number, currencyCode: string) {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  let value: string;
  if (abs >= 1_000_000) value = `${(dollars / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) value = `${(dollars / 1_000).toFixed(1)}K`;
  else value = dollars.toFixed(0);
  const sym = currencySymbol(currencyCode);
  return dollars < 0 ? `-${sym}${value.slice(1)}` : `${sym}${value}`;
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}

function ChartTooltip({
  active,
  payload,
  label,
  currencyCode,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 shadow-sm">
      <p className="text-[11px] font-semibold text-[var(--foreground)] mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span
            className="inline-block w-2 h-2 rounded-sm shrink-0"
            style={{ background: entry.color ?? CHART_COLORS.primary }}
          />
          <span className="text-[var(--muted-foreground)]">{entry.name}</span>
          <span className="ml-auto font-semibold text-[var(--foreground)] tabular-nums">
            {typeof entry.value === "number" ? fmt(entry.value, currencyCode) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
  type?: "line" | "bar" | "area";
}

export interface ChartDatum {
  label: string;
  [seriesKey: string]: string | number;
}

const DEFAULT_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.warning,
  CHART_COLORS.accent,
  CHART_COLORS.primarySoft,
  CHART_COLORS.negative,
  CHART_COLORS.accentSoft,
];

function resolveColors(series: ChartSeries[]): ChartSeries[] {
  return series.map((s, i) => ({
    ...s,
    color: s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
  }));
}

interface LineChartProps {
  data: ChartDatum[];
  series: ChartSeries[];
  currencyCode: string;
  height?: number;
  showZero?: boolean;
}

export function FinancialLineChart({
  data,
  series,
  currencyCode,
  height = 280,
  showZero = false,
}: LineChartProps) {
  const resolved = resolveColors(series);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={TICK_LINE} axisLine={TICK_LINE} />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={TICK_LINE}
          axisLine={TICK_LINE}
          tickFormatter={(v) => compactCurrency(Number(v), currencyCode)}
          width={70}
        />
        <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="square"
            iconSize={8}
          />
        )}
        {showZero && <ReferenceLine y={0} stroke={CHART_COLORS.axis} strokeDasharray="2 2" />}
        {resolved.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: s.color, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

interface StackedBarChartProps {
  data: ChartDatum[];
  series: ChartSeries[];
  currencyCode: string;
  height?: number;
  stack?: boolean;
}

export function FinancialBarChart({
  data,
  series,
  currencyCode,
  height = 280,
  stack = true,
}: StackedBarChartProps) {
  const resolved = resolveColors(series);
  const stackId = stack ? "stack" : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={TICK_LINE} axisLine={TICK_LINE} />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={TICK_LINE}
          axisLine={TICK_LINE}
          tickFormatter={(v) => compactCurrency(Number(v), currencyCode)}
          width={70}
        />
        <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} cursor={{ fill: CHART_COLORS.highlight }} />
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="square"
            iconSize={8}
          />
        )}
        <ReferenceLine y={0} stroke={CHART_COLORS.axis} />
        {resolved.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            stackId={stackId}
            isAnimationActive={false}
            radius={stack ? [0, 0, 0, 0] : [3, 3, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface AreaChartProps {
  data: ChartDatum[];
  series: ChartSeries[];
  currencyCode: string;
  height?: number;
  stack?: boolean;
}

export function FinancialAreaChart({
  data,
  series,
  currencyCode,
  height = 280,
  stack = true,
}: AreaChartProps) {
  const resolved = resolveColors(series);
  const stackId = stack ? "stack" : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={TICK_LINE} axisLine={TICK_LINE} />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={TICK_LINE}
          axisLine={TICK_LINE}
          tickFormatter={(v) => compactCurrency(Number(v), currencyCode)}
          width={70}
        />
        <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="square"
            iconSize={8}
          />
        )}
        {resolved.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.25}
            strokeWidth={2}
            stackId={stackId}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface ComboChartProps {
  data: ChartDatum[];
  barSeries: ChartSeries[];
  lineSeries: ChartSeries[];
  currencyCode: string;
  height?: number;
}

export function FinancialComboChart({
  data,
  barSeries,
  lineSeries,
  currencyCode,
  height = 320,
}: ComboChartProps) {
  const bars = resolveColors(barSeries);
  const lines = resolveColors(
    lineSeries.map((s, i) => ({
      ...s,
      color: s.color ?? DEFAULT_PALETTE[(barSeries.length + i) % DEFAULT_PALETTE.length],
    }))
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={TICK_LINE} axisLine={TICK_LINE} />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={TICK_LINE}
          axisLine={TICK_LINE}
          tickFormatter={(v) => compactCurrency(Number(v), currencyCode)}
          width={70}
        />
        <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} cursor={{ fill: CHART_COLORS.highlight }} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          iconType="square"
          iconSize={8}
        />
        <ReferenceLine y={0} stroke={CHART_COLORS.axis} />
        {bars.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            stackId="stack"
            isAnimationActive={false}
          />
        ))}
        {lines.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2.5}
            dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── View-mode toggle (Table / Chart) ──────────────────────────────────────────

export type ViewMode = "table" | "chart";

export function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div className="flex rounded-lg border border-[var(--border-medium)] overflow-hidden text-sm">
      {(["table", "chart"] as ViewMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-3 py-1.5 capitalize ${
            mode === m
              ? "bg-[var(--teal)] text-white"
              : "bg-white text-[var(--muted-foreground)] hover:bg-[var(--neutral-cool-100)]"
          }`}
          aria-pressed={mode === m}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-5">
      <div className="mb-3">
        <p className="text-xs font-semibold text-[var(--teal)] uppercase tracking-wide">{title}</p>
        {description && <p className="text-xs text-[var(--muted-foreground)] mt-1">{description}</p>}
      </div>
      {children}
    </div>
  );
}
