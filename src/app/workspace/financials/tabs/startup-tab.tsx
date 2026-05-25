"use client";

import { type FinancialInputs, fmt } from "@/lib/financial-projection";

interface Props {
  inputs: FinancialInputs;
}

interface LineItem {
  label: string;
  value: number;
  note?: string;
}

export function StartupTab({ inputs }: Props) {
  const items: LineItem[] = [
    { label: "Equipment", value: inputs.equipment_cost_cents, note: "From your equipment plan" },
    { label: "Build-Out And Renovation", value: inputs.buildout_cost_cents },
    { label: "Deposits (Rent, Utilities)", value: inputs.rent_deposits_cents },
    { label: "Licenses And Permits", value: inputs.license_permits_cents },
    { label: "Pre-Opening Marketing", value: inputs.pre_opening_marketing_cents },
    { label: "Initial Inventory", value: inputs.initial_inventory_cents },
    { label: "Working Capital Reserve", value: inputs.working_capital_reserve_cents, note: "Target: 3–6 months of fixed costs" },
    { label: "Opening Cash Buffer", value: inputs.opening_cash_buffer_cents },
  ];

  const totalStartup = items.reduce((sum, i) => sum + i.value, 0);
  const totalFunding = inputs.owner_capital_cents + inputs.loan_amount_cents;
  const fundingGap = totalStartup - totalFunding;

  const monthlyPayment = (() => {
    const p = inputs.loan_amount_cents;
    const r = inputs.loan_annual_rate_pct / 100 / 12;
    const n = inputs.loan_term_months;
    if (p <= 0 || n <= 0) return 0;
    if (r <= 0) return Math.round(p / n);
    return Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
  })();

  return (
    <div className="space-y-4">
      {/* Startup cost table */}
      <div className="rounded-2xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <p className="text-sm font-semibold text-[#1a1a1a]">What It Takes To Open The Door</p>
          <p className="text-xs text-[#afafaf] mt-0.5">All one-time costs to get to opening day.</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {items.map((item) => (
              <tr key={item.label} className="border-t border-[#f0f0f0]">
                <td className="py-3 pl-5 pr-4">
                  <span className="text-[#1a1a1a]">{item.label}</span>
                  {item.note && <span className="ml-2 text-xs text-[#afafaf]">({item.note})</span>}
                </td>
                <td className="py-3 pr-5 text-right font-medium">{fmt(item.value)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[#155e63] bg-[#f7fafa]">
              <td className="py-3 pl-5 pr-4 font-semibold">Total Startup Cost</td>
              <td className="py-3 pr-5 text-right font-bold text-lg">{fmt(totalStartup)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Funding sources */}
      <div className="rounded-2xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <p className="text-sm font-semibold text-[#1a1a1a]">Funding Sources</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-t border-[#f0f0f0]">
              <td className="py-3 pl-5 pr-4 text-[#1a1a1a]">Owner Capital</td>
              <td className="py-3 pr-5 text-right font-medium">{fmt(inputs.owner_capital_cents)}</td>
            </tr>
            <tr className="border-t border-[#f0f0f0]">
              <td className="py-3 pl-5 pr-4 text-[#1a1a1a]">Loan Amount
                <span className="ml-2 text-xs text-[#afafaf]">
                  ({inputs.loan_term_months} mo @ {inputs.loan_annual_rate_pct}%, {fmt(monthlyPayment)}/mo)
                </span>
              </td>
              <td className="py-3 pr-5 text-right font-medium">{fmt(inputs.loan_amount_cents)}</td>
            </tr>
            <tr className="border-t-2 border-[#155e63] bg-[#f7fafa]">
              <td className="py-3 pl-5 pr-4 font-semibold">Total Funding</td>
              <td className="py-3 pr-5 text-right font-bold">{fmt(totalFunding)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Funding gap */}
      <div className={`rounded-2xl border px-5 py-4 ${fundingGap <= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-semibold ${fundingGap <= 0 ? "text-green-800" : "text-red-800"}`}>
              {fundingGap <= 0 ? "Fully Funded" : "Funding Gap"}
            </p>
            <p className={`text-xs mt-0.5 ${fundingGap <= 0 ? "text-green-700" : "text-red-700"}`}>
              {fundingGap <= 0
                ? `You have ${fmt(Math.abs(fundingGap))} in surplus funding. That becomes your additional opening cash.`
                : `You need ${fmt(fundingGap)} more in funding to cover your startup costs.`}
            </p>
          </div>
          <p className={`text-2xl font-bold ${fundingGap <= 0 ? "text-green-800" : "text-red-700"}`}>
            {fundingGap <= 0 ? fmt(Math.abs(fundingGap)) : fmt(fundingGap)}
          </p>
        </div>
      </div>

      {/* Helpful context */}
      <div className="rounded-2xl border border-[#e5eef0] bg-[#f0f9f9] px-5 py-4">
        <p className="text-xs font-semibold text-[#155e63] uppercase tracking-wide mb-2">A Few Things Worth Knowing</p>
        <div className="space-y-2 text-sm text-[#2a4a4c] leading-relaxed">
          <p>The working capital reserve and opening cash buffer are not spent. They sit in your bank account as a cushion. Banks and lenders like to see 3 months of fixed costs in reserve before you open.</p>
          <p>Equipment is on a {inputs.depreciation_years}-year depreciation schedule, which reduces your taxable income over time. That is the main reason to separate it from build-out costs.</p>
          {inputs.loan_amount_cents > 0 && (
            <p>Your loan payment of {fmt(monthlyPayment)}/month starts from day one. Before you have any revenue. Make sure your opening cash buffer can cover at least 3 months of loan payments.</p>
          )}
        </div>
      </div>
    </div>
  );
}
