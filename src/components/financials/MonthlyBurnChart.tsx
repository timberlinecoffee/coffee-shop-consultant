"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BreakEvenSeries } from "@/lib/financials/calc";

interface MonthlyBurnChartProps {
  series: BreakEvenSeries;
  inputsAreEmpty: boolean;
}

const currency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function MonthlyBurnChart({ series, inputsAreEmpty }: MonthlyBurnChartProps) {
  const data = series.rows.map((row) => ({
    month: row.month,
    net: row.netMonthly,
  }));

  return (
    <section className="bg-white rounded-2xl border border-[#efefef] p-6">
      <header className="mb-4">
        <h2 className="font-semibold text-lg text-[#1a1a1a]">Monthly net burn</h2>
        <p className="text-xs text-[#6b6b6b] mt-1">
          Net cash per month assuming steady revenue. Bars below the line are months you
          spend more than you bring in.
        </p>
      </header>

      {inputsAreEmpty ? (
        <EmptyState message="Add monthly revenue and costs to see your monthly burn." />
      ) : (
        <div className="h-72 w-full" data-testid="monthly-burn-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
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
              <ReferenceLine y={0} stroke="#1a1a1a" />
              <Bar dataKey="net" name="Net monthly">
                {data.map((row) => (
                  <Cell
                    key={row.month}
                    fill={row.net >= 0 ? "#155e63" : "#b45309"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
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
