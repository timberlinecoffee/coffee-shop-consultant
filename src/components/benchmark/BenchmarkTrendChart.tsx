"use client";

// TIM-2472: Line chart showing user value + cohort median + best-practice band over time.
// TIM-2841: Internally responsive via ResizeObserver when ui_revamp_v2 is on.
// Uses Recharts, following the pattern in financial-charts.tsx.

import { useEffect, useRef, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useUiRevamp } from "@/hooks/useUiRevamp";
import type { PercentilePoint } from "./types";

interface BenchmarkTrendChartProps {
  data: PercentilePoint[];
  unit?: string;
  height?: number;
}

export function BenchmarkTrendChart({ data, unit = "", height: heightProp }: BenchmarkTrendChartProps) {
  const uiRevamp = useUiRevamp();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setContainerWidth(w);
    });
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const height = heightProp != null
    ? heightProp
    : uiRevamp
    ? containerWidth < 480
      ? 160
      : containerWidth < 768
      ? 180
      : 180
    : 180;

  if (!data || data.length === 0) return null;

  const fmtTick = (v: number) => `${v}${unit}`;

  return (
    <div ref={containerRef}>
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtTick}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, border: "1px solid var(--border)", borderRadius: 8 }}
          formatter={(value: number, name: string) => [`${value}${unit}`, name]}
        />
        {/* Best-practice band as area between bpLow and bpHigh */}
        <Area
          dataKey="bpHigh"
          stroke="none"
          fill="var(--bench-green-bg)"
          legendType="none"
          name="BP high"
        />
        <Area
          dataKey="bpLow"
          stroke="none"
          fill="var(--background)"
          legendType="none"
          name="BP low"
        />
        <Line
          dataKey="cohortMedian"
          stroke="var(--bench-blue-border)"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          name="Cohort median"
        />
        <Line
          dataKey="userValue"
          stroke="var(--teal)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--teal)" }}
          name="You"
        />
        <Legend
          iconSize={8}
          wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );
}
