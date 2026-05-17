"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BreakEvenSeries } from "@/lib/financials/calc";

interface BreakEvenChartProps {
  series: BreakEvenSeries;
  inputsAreEmpty: boolean;
}

const currency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function BreakEvenChart({ series, inputsAreEmpty }: BreakEvenChartProps) {
  const data = series.rows.map((row) => ({
    month: row.month,
    revenue: row.cumulativeRevenue,
    fixedCosts: row.fixedCost * row.month,
    totalCosts: row.cumulativeCost,
  }));

  return (
    <section className="bg-white rounded-2xl border border-[#efefef] p-6">
      <header className="mb-4">
        <h2 className="font-semibold text-lg text-[#1a1a1a]">Break-even projection</h2>
        <p className="text-xs text-[#6b6b6b] mt-1">
          Cumulative revenue vs. cumulative costs across the first 12 months. Where the
          revenue line passes total costs is the month you’ve repaid your start-up cash.
        </p>
      </header>

      {inputsAreEmpty ? (
        <EmptyState message="Add startup costs, monthly revenue, and monthly fixed costs to see a break-even projection." />
      ) : (
        <>
          <div className="h-72 w-full" data-testid="break-even-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#efefef" />
                <XAxis
                  dataKey="month"
                  stroke="#6b6b6b"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(m) => `M${m}`}
                />
                <YAxis
                  stroke="#6b6b6b"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => currency(v)}
                  width={80}
                />
                <Tooltip
                  formatter={(value) => currency(Number(value))}
                  labelFormatter={(label) => `Month ${label}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  name="Cumulative revenue"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#155e63"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  name="Cumulative total costs"
                  type="monotone"
                  dataKey="totalCosts"
                  stroke="#b45309"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  name="Cumulative fixed costs"
                  type="monotone"
                  dataKey="fixedCosts"
                  stroke="#6b6b6b"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                />
                {series.breakEvenMonth ? (
                  <ReferenceLine
                    x={series.breakEvenMonth}
                    stroke="#155e63"
                    strokeDasharray="2 4"
                    label={{
                      value: `Break-even M${series.breakEvenMonth}`,
                      position: "top",
                      fill: "#155e63",
                      fontSize: 12,
                    }}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-[#6b6b6b] mt-3" data-testid="break-even-summary">
            {series.breakEvenMonth
              ? `At current numbers, you recover startup cash in month ${series.breakEvenMonth}.`
              : "At current numbers, revenue does not cover costs within 12 months. Increase revenue or trim costs to see a break-even point."}
          </p>
        </>
      )}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-72 flex items-center justify-center bg-[#faf9f7] rounded-xl border border-dashed border-[#e5e5e5]">
      <p className="text-xs text-[#6b6b6b] max-w-xs text-center px-4">{message}</p>
    </div>
  );
}
