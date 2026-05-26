"use client";

import { type MonthlySlice, type FinancialInputs, fmt } from "@/lib/financial-projection";
import { currencySymbol } from "@/lib/currency";

interface Props {
  slices: MonthlySlice[];
  inputs: FinancialInputs;
  currencyCode?: string;
}

function computeBreakEven(inputs: FinancialInputs, slices: MonthlySlice[]) {
  // Use Year 1 Month 1 as the base
  const m1 = slices[0];
  if (!m1) return null;

  const avgTicket = inputs.avg_ticket_cents / 100;
  const nr = m1.net_revenue_cents;
  if (nr <= 0 || avgTicket <= 0) return null;

  // Variable costs per dollar of revenue (COGS + payment processing + spoilage + labor if hourly)
  // We treat labor as fixed since it's % of revenue — actually it's semi-variable.
  // Simplified: variable = COGS + payment processing + spoilage (COGS-based)
  const variableCents = m1.total_cogs_cents + m1.payment_processing_cents + m1.spoilage_cents;
  const variablePct = variableCents / nr;
  const contributionMarginPct = 1 - variablePct;
  const avgVariableCost = avgTicket * variablePct;
  const contributionPerTicket = avgTicket - avgVariableCost;

  // Fixed costs = everything that doesn't scale with revenue
  const fixedCosts = m1.rent_cents + m1.insurance_cents + m1.tech_cents +
    m1.maintenance_cents + m1.supplies_cents + m1.utilities_cents +
    m1.other_opex_cents + m1.interest_cents + m1.depreciation_cents;

  const breakEvenRevenue = contributionMarginPct > 0
    ? fixedCosts / contributionMarginPct
    : Infinity;
  const breakEvenTransactions = contributionPerTicket > 0
    ? Math.ceil(fixedCosts / 100 / contributionPerTicket)
    : Infinity;

  const projectedTransactions = Math.round(
    inputs.customers_per_day * (inputs.days_per_week * 52 / 12)
  );
  const transactionSurplus = projectedTransactions - breakEvenTransactions;

  const daysPerMonth = inputs.days_per_week * 52 / 12;
  const daysToBreakEven = breakEvenTransactions / inputs.customers_per_day;

  return {
    breakEvenTransactions,
    breakEvenRevenue,
    projectedTransactions,
    transactionSurplus,
    contributionMarginPct,
    contributionPerTicket,
    daysToBreakEven,
    fixedCosts,
    avgTicket,
  };
}

function SensitivityRow({
  label,
  baseValue,
  scenarios,
}: {
  label: string;
  baseValue: number;
  scenarios: { label: string; value: number }[];
}) {
  return (
    <tr>
      <td className="py-2.5 pl-4 pr-4 text-sm text-[#1a1a1a]">{label}</td>
      <td className="py-2.5 px-3 text-right text-sm font-semibold">{baseValue.toLocaleString()}</td>
      {scenarios.map((s, i) => (
        <td
          key={i}
          className={`py-2.5 px-3 text-right text-sm ${s.value > baseValue ? "text-green-700" : s.value < baseValue ? "text-red-600" : ""}`}
        >
          {isFinite(s.value) ? s.value.toLocaleString() : "N/A"}
        </td>
      ))}
    </tr>
  );
}

export function BreakEvenTab({ slices, inputs, currencyCode = "USD" }: Props) {
  const result = computeBreakEven(inputs, slices);

  if (!result) {
    return (
      <div className="rounded-2xl border border-[#efefef] bg-white px-5 py-8 text-center text-sm text-[#afafaf]">
        Enter your revenue assumptions in the Inputs tab to see break-even analysis.
      </div>
    );
  }

  const {
    breakEvenTransactions, breakEvenRevenue, projectedTransactions,
    transactionSurplus, contributionMarginPct, daysToBreakEven, fixedCosts, avgTicket,
  } = result;

  const surplusPct = projectedTransactions > 0
    ? transactionSurplus / projectedTransactions
    : 0;

  // Sensitivity scenarios: ticket -10%, traffic -15%, fixed costs +10%
  const sensitivityBase = breakEvenTransactions;

  function beAt(ticketMult: number, trafficMult: number, fixedMult: number) {
    const ticket = avgTicket * ticketMult;
    const fixedC = fixedCosts * fixedMult;
    const m1 = slices[0];
    if (!m1) return Infinity;
    const nr = m1.net_revenue_cents;
    const varPct = (m1.total_cogs_cents + m1.payment_processing_cents + m1.spoilage_cents) / (nr || 1);
    const cm = 1 - varPct;
    const cp = ticket * cm;
    return cp > 0 ? Math.ceil(fixedC / 100 / cp) : Infinity;
  }

  const projectedCustomers = inputs.customers_per_day * (inputs.days_per_week * 52 / 12);

  const barMax = Math.max(projectedCustomers, breakEvenTransactions) * 1.1;
  const breakEvenWidth = Math.min(100, (breakEvenTransactions / barMax) * 100);
  const projectedWidth = Math.min(100, (projectedCustomers / barMax) * 100);

  return (
    <div className="space-y-4">
      {/* Primary metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#efefef] bg-white px-5 py-4">
          <p className="text-xs text-[#6b6b6b] uppercase tracking-wide mb-1">Break-Even Transactions / Month</p>
          <p className="text-3xl font-bold text-[#1a1a1a]">{isFinite(breakEvenTransactions) ? breakEvenTransactions.toLocaleString() : "N/A"}</p>
          <p className="text-xs text-[#afafaf] mt-1">
            {isFinite(daysToBreakEven) ? `${daysToBreakEven.toFixed(1)} days of foot traffic` : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-[#efefef] bg-white px-5 py-4">
          <p className="text-xs text-[#6b6b6b] uppercase tracking-wide mb-1">Break-Even Revenue / Month</p>
          <p className="text-3xl font-bold text-[#1a1a1a]">{isFinite(breakEvenRevenue) ? fmt(breakEvenRevenue, currencyCode) : "N/A"}</p>
          <p className="text-xs text-[#afafaf] mt-1">Contribution margin {(contributionMarginPct * 100).toFixed(1)}%</p>
        </div>
        <div className={`rounded-2xl border px-5 py-4 col-span-2 sm:col-span-1 ${transactionSurplus >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          <p className={`text-xs uppercase tracking-wide mb-1 ${transactionSurplus >= 0 ? "text-green-700" : "text-red-700"}`}>
            {transactionSurplus >= 0 ? "Projected Surplus" : "Projected Shortfall"}
          </p>
          <p className={`text-3xl font-bold ${transactionSurplus >= 0 ? "text-green-800" : "text-red-700"}`}>
            {Math.abs(transactionSurplus).toLocaleString()}
          </p>
          <p className={`text-xs mt-1 ${transactionSurplus >= 0 ? "text-green-700" : "text-red-700"}`}>
            transactions {transactionSurplus >= 0 ? "above" : "below"} break-even
          </p>
        </div>
      </div>

      {/* Visual bar */}
      <div className="rounded-2xl border border-[#efefef] bg-white px-5 py-5">
        <p className="text-sm font-semibold text-[#1a1a1a] mb-4">Monthly Transactions vs. Break-Even</p>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-[#6b6b6b] mb-1">
              <span>Break-Even Threshold</span>
              <span>{isFinite(breakEvenTransactions) ? breakEvenTransactions.toLocaleString() : "N/A"} transactions</span>
            </div>
            <div className="h-4 rounded-full bg-[#f0f0f0] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#e0b96a]"
                style={{ width: `${breakEvenWidth}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-[#6b6b6b] mb-1">
              <span>Projected Transactions</span>
              <span>{Math.round(projectedCustomers).toLocaleString()} transactions</span>
            </div>
            <div className="h-4 rounded-full bg-[#f0f0f0] overflow-hidden">
              <div
                className={`h-full rounded-full ${transactionSurplus >= 0 ? "bg-[#155e63]" : "bg-red-500"}`}
                style={{ width: `${projectedWidth}%` }}
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-[#afafaf] mt-3">
          Based on {inputs.customers_per_day} customers/day, {inputs.days_per_week} days/week, {currencySymbol(currencyCode)}{avgTicket.toFixed(2)} avg ticket.
        </p>
      </div>

      {/* Sensitivity table */}
      <div className="rounded-2xl border border-[#efefef] bg-white overflow-x-auto">
        <div className="px-5 pt-5 pb-2">
          <p className="text-sm font-semibold text-[#1a1a1a]">Sensitivity Analysis</p>
          <p className="text-xs text-[#afafaf] mt-0.5">How does break-even shift if key variables change?</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#efefef]">
              <th className="py-2.5 pl-4 pr-4 text-left text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide">Scenario</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide">Base</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide">-10%</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide">-5%</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide">+5%</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide">+10%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            <SensitivityRow
              label="Avg Ticket"
              baseValue={sensitivityBase}
              scenarios={[
                { label: "-10%", value: beAt(0.9, 1, 1) },
                { label: "-5%", value: beAt(0.95, 1, 1) },
                { label: "+5%", value: beAt(1.05, 1, 1) },
                { label: "+10%", value: beAt(1.1, 1, 1) },
              ]}
            />
            <SensitivityRow
              label="Fixed Costs"
              baseValue={sensitivityBase}
              scenarios={[
                { label: "-10%", value: beAt(1, 1, 0.9) },
                { label: "-5%", value: beAt(1, 1, 0.95) },
                { label: "+5%", value: beAt(1, 1, 1.05) },
                { label: "+10%", value: beAt(1, 1, 1.1) },
              ]}
            />
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-[#afafaf]">Break-even transactions per month required to cover fixed costs.</p>
      </div>

      {/* Critique */}
      <div className="rounded-2xl border border-[#e5eef0] bg-[#f0f9f9] px-5 py-4">
        <p className="text-xs font-semibold text-[#155e63] uppercase tracking-wide mb-1">What The Numbers Are Saying</p>
        <BreakEvenCritique
          breakEvenTransactions={breakEvenTransactions}
          projectedTransactions={Math.round(projectedCustomers)}
          transactionSurplus={transactionSurplus}
          inputs={inputs}
        />
      </div>
    </div>
  );
}

function BreakEvenCritique({
  breakEvenTransactions,
  projectedTransactions,
  transactionSurplus,
  inputs,
}: {
  breakEvenTransactions: number;
  projectedTransactions: number;
  transactionSurplus: number;
  inputs: FinancialInputs;
}) {
  const dailyBreakEven = isFinite(breakEvenTransactions)
    ? Math.ceil(breakEvenTransactions / (inputs.days_per_week * 52 / 12))
    : null;

  const lines: string[] = [];

  if (!isFinite(breakEvenTransactions)) {
    lines.push("Your variable costs exceed revenue — something is off in your COGS or pricing. Check your inputs.");
  } else if (transactionSurplus < 0) {
    lines.push(`You need ${breakEvenTransactions.toLocaleString()} transactions a month to break even but are projecting only ${projectedTransactions.toLocaleString()}. That is a gap of ${Math.abs(transactionSurplus).toLocaleString()} customers. You need to either bring in more traffic, raise your average ticket, or cut fixed costs.`);
  } else if (transactionSurplus < breakEvenTransactions * 0.1) {
    lines.push(`You are projecting to break even at ${breakEvenTransactions.toLocaleString()} transactions a month — and your traffic estimate is only ${transactionSurplus.toLocaleString()} above that. A single slow week could put you in the red. That is thin.`);
  } else {
    lines.push(`You are projecting to break even at ${breakEvenTransactions.toLocaleString()} transactions a month. That is about ${dailyBreakEven} customers a day — realistic for a neighborhood spot with steady foot traffic. You have a buffer of ${transactionSurplus.toLocaleString()} transactions above break-even.`);
  }

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-[#2a4a4c] leading-relaxed">{line}</p>
      ))}
    </div>
  );
}
