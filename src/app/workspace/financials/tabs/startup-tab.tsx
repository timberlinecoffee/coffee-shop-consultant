"use client";

import {
  type FinancialInputs,
  type ForecastLine,
  type FundingSourceLine,
  type StartupCosts,
  fmt,
} from "@/lib/financial-projection";

interface Props {
  inputs: FinancialInputs;
  fundingSources?: FundingSourceLine[];
  currencyCode?: string;
  // TIM-1254: per-asset capex ForecastLines (from forecast_lines, not from equipment items).
  capexLines?: ForecastLine[];
  // TIM-1254: synthetic capex lines sourced from buildout_equipment_items.
  equipmentItemLines?: ForecastLine[];
  // TIM-1254: for legacy migration of startup_costs.buildout_cents/equipment_cents.
  startupCosts?: StartupCosts;
}

interface LineItem {
  label: string;
  value: number;
  note?: string;
}

export function StartupTab({
  inputs,
  fundingSources,
  currencyCode = "USD",
  capexLines,
  equipmentItemLines,
  startupCosts,
}: Props) {
  const f = (v: number) => fmt(v, currencyCode);

  // ── Capital-asset rows ────────────────────────────────────────────────────────
  // Priority: (1) real capex ForecastLines, (2) equipment-item synthetic lines,
  // (3) legacy migration from startup_costs lump sums when no per-asset data yet.
  const realLines = (capexLines ?? []).filter((l) => !l.linked_equipment_item_id);
  const itemLines = equipmentItemLines ?? [];
  const hasPerAssetData = realLines.length > 0 || itemLines.length > 0;

  interface CapexRow {
    key: string;
    label: string;
    value: number;
    lifeYears?: number;
    fromWorkspace?: boolean;
    legacy?: boolean;
  }

  const capexRows: CapexRow[] = [];
  if (hasPerAssetData) {
    for (const l of realLines) {
      capexRows.push({
        key: l.id,
        label: l.label,
        value: l.value,
        lifeYears: l.useful_life_years ?? 7,
      });
    }
    for (const l of itemLines) {
      capexRows.push({
        key: l.id,
        label: l.label,
        value: l.value,
        lifeYears: l.useful_life_years ?? 7,
        fromWorkspace: true,
      });
    }
  } else {
    // Legacy migration: user has not entered per-asset data yet; show lump sums.
    const sc = startupCosts;
    const buildout = sc?.buildout_cents ?? inputs.buildout_cost_cents;
    const equipment = sc?.equipment_cents ?? inputs.equipment_cost_cents;
    const buildoutLife = sc?.buildout_useful_life_years ?? 15;
    const equipLife = sc?.equipment_useful_life_years ?? 7;
    if (buildout > 0) {
      capexRows.push({ key: "legacy:build_out", label: "Build-Out & Renovation", value: buildout, lifeYears: buildoutLife, legacy: true });
    }
    if (equipment > 0) {
      capexRows.push({ key: "legacy:equipment", label: "Equipment", value: equipment, lifeYears: equipLife, legacy: true });
    }
  }

  const totalCapital = capexRows.reduce((sum, r) => sum + r.value, 0);

  // ── Non-capital one-time costs ────────────────────────────────────────────────
  const otherItems: LineItem[] = [
    { label: "Deposits (Rent, Utilities)", value: inputs.rent_deposits_cents },
    { label: "Licenses And Permits", value: inputs.license_permits_cents },
    { label: "Pre-Opening Marketing", value: inputs.pre_opening_marketing_cents },
    { label: "Initial Inventory", value: inputs.initial_inventory_cents },
    {
      label: "Working Capital Reserve",
      value: inputs.working_capital_reserve_cents,
      note: "Target: 3–6 months of fixed costs",
    },
    { label: "Opening Cash Buffer", value: inputs.opening_cash_buffer_cents },
  ];

  const totalStartup = totalCapital + otherItems.reduce((sum, i) => sum + i.value, 0);

  // ── Funding sources ────────────────────────────────────────────────────────────
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
    return Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  };

  const totalMonthlyLoanPayment = hasFundingSources
    ? loanLines.reduce((acc, l) => acc + monthlyPaymentFor(l), 0)
    : (() => {
        const p = inputs.loan_amount_cents;
        const r = (inputs.loan_annual_rate_pct / 100) / 12;
        const n = inputs.loan_term_months;
        if (p <= 0 || n <= 0) return 0;
        if (r <= 0) return Math.round(p / n);
        return Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
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
            {/* ── Capital assets section ─────────────────────────────────── */}
            {capexRows.length > 0 && (
              <>
                <tr className="border-t border-[#f0f0f0] bg-[#fafafa]">
                  <td colSpan={2} className="py-2 pl-5 pr-4">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#155e63]">
                      Capital Assets
                    </span>
                  </td>
                </tr>
                {capexRows.map((row) => (
                  <tr key={row.key} className="border-t border-[#f0f0f0]">
                    <td className="py-3 pl-5 pr-4">
                      <span className="text-[#1a1a1a]">{row.label}</span>
                      {row.lifeYears && (
                        <span className="ml-2 text-xs text-[#afafaf]">
                          {row.lifeYears}yr life
                          {row.fromWorkspace && " · from Build-Out & Equipment"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-5 text-right font-medium">{f(row.value)}</td>
                  </tr>
                ))}
              </>
            )}

            {/* ── Other one-time costs ───────────────────────────────────── */}
            {otherItems.map((item) => (
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
                        ({l.term_months ?? 0} mo @ {l.annual_rate_pct ?? 0}% :{" "}
                        {f(monthlyPaymentFor(l))}/mo)
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
                  <td className="py-3 pl-5 pr-4 text-[#1a1a1a]">
                    Loan Amount
                    <span className="ml-2 text-xs text-[#afafaf]">
                      ({inputs.loan_term_months} mo @ {inputs.loan_annual_rate_pct}% :{" "}
                      {f(totalMonthlyLoanPayment)}/mo)
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
      <div
        className={`rounded-2xl border px-5 py-4 ${
          fundingGap <= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p
              className={`text-sm font-semibold ${
                fundingGap <= 0 ? "text-green-800" : "text-red-800"
              }`}
            >
              {fundingGap <= 0 ? "Fully Funded" : "Funding Gap"}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                fundingGap <= 0 ? "text-green-700" : "text-red-700"
              }`}
            >
              {fundingGap <= 0
                ? `You have ${f(Math.abs(fundingGap))} in surplus funding — that becomes your additional opening cash.`
                : `You need ${f(fundingGap)} more in funding to cover your startup costs.`}
            </p>
          </div>
          <p
            className={`text-2xl font-bold ${
              fundingGap <= 0 ? "text-green-800" : "text-red-700"
            }`}
          >
            {fundingGap <= 0 ? f(Math.abs(fundingGap)) : f(fundingGap)}
          </p>
        </div>
      </div>

      {/* Helpful context */}
      <div className="rounded-2xl border border-[#e5eef0] bg-[#f0f9f9] px-5 py-4">
        <p className="text-xs font-semibold text-[#155e63] uppercase tracking-wide mb-2">
          A Few Things Worth Knowing
        </p>
        <div className="space-y-2 text-sm text-[#2a4a4c] leading-relaxed">
          <p>
            The working capital reserve and opening cash buffer are not spent — they sit in your
            bank account as a cushion. Banks and lenders like to see 3 months of fixed costs in
            reserve before you open.
          </p>
          {capexRows.length > 0 ? (
            <p>
              Each capital asset depreciates straight-line over its own useful life, reducing your
              taxable income over time. You can adjust the useful life for any asset in the Costs
              &amp; Expenses section.
            </p>
          ) : (
            <p>
              Capital assets (build-out, equipment) depreciate straight-line over their useful life,
              reducing your taxable income. Add individual assets in the Costs &amp; Expenses section
              to set per-asset depreciation schedules.
            </p>
          )}
          {loanTotal > 0 && (
            <p>
              Your loan payment of {f(totalMonthlyLoanPayment)}/month starts from day one — before
              you have any revenue. Make sure your opening cash buffer can cover at least 3 months of
              loan payments.
            </p>
          )}
        </div>
      </div>

      {/* Legacy migration hint */}
      {!hasPerAssetData && capexRows.some((r) => r.legacy) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          These build-out and equipment totals are lump-sum estimates. Add individual assets in
          the <strong>Costs &amp; Expenses</strong> section or the guided setup to assign per-asset
          useful lives and get precise depreciation.
        </div>
      )}
    </div>
  );
}
