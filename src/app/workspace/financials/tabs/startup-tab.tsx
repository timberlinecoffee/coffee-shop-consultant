"use client";

import { type FinancialInputs, type FundingSourceLine, fmt } from "@/lib/financial-projection";

interface Props {
  inputs: FinancialInputs;
  fundingSources?: FundingSourceLine[];
  currencyCode?: string;
}

interface LineItem {
  label: string;
  value: number;
  note?: string;
}

export function StartupTab({ inputs, fundingSources, currencyCode = "USD" }: Props) {
  const f = (v: number) => fmt(v, currencyCode);
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

  // TIM-1122: when funding_sources are configured, show the rich breakdown.
  // Otherwise fall back to the legacy single-loan view from FinancialInputs.
  const sources = fundingSources ?? [];
  const hasFundingSources = sources.length > 0;

  const sumKind = (kind: FundingSourceLine["kind"]) =>
    sources.filter((s) => s.kind === kind).reduce((acc, s) => acc + s.amount_cents, 0);

  const founderTotal = hasFundingSources ? sumKind("founder_equity") : inputs.owner_capital_cents;
  const investorTotal = sumKind("investor_equity");
  const grantTotal = sumKind("grant");
  const loanTotal = hasFundingSources ? sumKind("loan") : inputs.loan_amount_cents;
  const totalFunding = founderTotal + investorTotal + grantTotal + loanTotal;
  const fundingGap = totalStartup - totalFunding;

  const loanLines = sources.filter((s) => s.kind === "loan" && s.amount_cents > 0);

  const monthlyPaymentFor = (line: FundingSourceLine) => {
    const p = line.amount_cents;
    const n = Math.max(0, line.term_months ?? 0);
    const r = ((line.annual_rate_pct ?? 0) / 100) / 12;
    if (p <= 0 || n <= 0) return 0;
    if (r <= 0) return Math.round(p / n);
    return Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
  };

  const totalMonthlyLoanPayment = hasFundingSources
    ? loanLines.reduce((acc, l) => acc + monthlyPaymentFor(l), 0)
    : (() => {
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
                <td className="py-3 pr-5 text-right font-medium">{f(item.value)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[#155e63] bg-[#f7fafa]">
              <td className="py-3 pl-5 pr-4 font-semibold">Total Startup Cost</td>
              <td className="py-3 pr-5 text-right font-bold text-lg">{f(totalStartup)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Funding sources */}
      <div className="rounded-2xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-[#1a1a1a]">Funding Sources</p>
          {hasFundingSources && (
            <p className="text-xs text-[#afafaf]">Edit in the Funding tab</p>
          )}
        </div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {hasFundingSources ? (
              <>
                {founderTotal > 0 && (
                  <tr className="border-t border-[#f0f0f0]">
                    <td className="py-3 pl-5 pr-4 text-[#1a1a1a]">Founder Equity</td>
                    <td className="py-3 pr-5 text-right font-medium">{f(founderTotal)}</td>
                  </tr>
                )}
                {investorTotal > 0 && (
                  <tr className="border-t border-[#f0f0f0]">
                    <td className="py-3 pl-5 pr-4 text-[#1a1a1a]">Investor Equity</td>
                    <td className="py-3 pr-5 text-right font-medium">{f(investorTotal)}</td>
                  </tr>
                )}
                {grantTotal > 0 && (
                  <tr className="border-t border-[#f0f0f0]">
                    <td className="py-3 pl-5 pr-4 text-[#1a1a1a]">Grants / Other</td>
                    <td className="py-3 pr-5 text-right font-medium">{f(grantTotal)}</td>
                  </tr>
                )}
                {loanLines.map((l) => (
                  <tr key={l.id} className="border-t border-[#f0f0f0]">
                    <td className="py-3 pl-5 pr-4 text-[#1a1a1a]">
                      {l.label}
                      <span className="ml-2 text-xs text-[#afafaf]">
                        ({l.term_months ?? 0} mo @ {l.annual_rate_pct ?? 0}% : {f(monthlyPaymentFor(l))}/mo)
                      </span>
                    </td>
                    <td className="py-3 pr-5 text-right font-medium">{f(l.amount_cents)}</td>
                  </tr>
                ))}
              </>
            ) : (
              <>
                <tr className="border-t border-[#f0f0f0]">
                  <td className="py-3 pl-5 pr-4 text-[#1a1a1a]">Owner Capital</td>
                  <td className="py-3 pr-5 text-right font-medium">{f(inputs.owner_capital_cents)}</td>
                </tr>
                <tr className="border-t border-[#f0f0f0]">
                  <td className="py-3 pl-5 pr-4 text-[#1a1a1a]">Loan Amount
                    <span className="ml-2 text-xs text-[#afafaf]">
                      ({inputs.loan_term_months} mo @ {inputs.loan_annual_rate_pct}% : {f(totalMonthlyLoanPayment)}/mo)
                    </span>
                  </td>
                  <td className="py-3 pr-5 text-right font-medium">{f(inputs.loan_amount_cents)}</td>
                </tr>
              </>
            )}
            <tr className="border-t-2 border-[#155e63] bg-[#f7fafa]">
              <td className="py-3 pl-5 pr-4 font-semibold">Total Funding</td>
              <td className="py-3 pr-5 text-right font-bold">{f(totalFunding)}</td>
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
                ? `You have ${f(Math.abs(fundingGap))} in surplus funding — that becomes your additional opening cash.`
                : `You need ${f(fundingGap)} more in funding to cover your startup costs.`}
            </p>
          </div>
          <p className={`text-2xl font-bold ${fundingGap <= 0 ? "text-green-800" : "text-red-700"}`}>
            {fundingGap <= 0 ? f(Math.abs(fundingGap)) : f(fundingGap)}
          </p>
        </div>
      </div>

      {/* Helpful context */}
      <div className="rounded-2xl border border-[#e5eef0] bg-[#f0f9f9] px-5 py-4">
        <p className="text-xs font-semibold text-[#155e63] uppercase tracking-wide mb-2">A Few Things Worth Knowing</p>
        <div className="space-y-2 text-sm text-[#2a4a4c] leading-relaxed">
          <p>The working capital reserve and opening cash buffer are not spent — they sit in your bank account as a cushion. Banks and lenders like to see 3 months of fixed costs in reserve before you open.</p>
          <p>Equipment is on a {inputs.depreciation_years}-year depreciation schedule, which reduces your taxable income over time. That is the main reason to separate it from build-out costs.</p>
          {loanTotal > 0 && (
            <p>Your loan payment of {f(totalMonthlyLoanPayment)}/month starts from day one : before you have any revenue. Make sure your opening cash buffer can cover at least 3 months of loan payments.</p>
          )}
        </div>
      </div>
    </div>
  );
}
