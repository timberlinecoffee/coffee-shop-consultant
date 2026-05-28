"use client";

import { type FundingSourceLine, type StartupCosts, fmt } from "@/lib/financial-projection";

interface Props {
  startupCosts: StartupCosts;
  // TIM-1258: Equipment is sourced from the Build-Out & Equipment workspace so
  // the owner enters each asset once and it flows in here. Falls back to the
  // legacy startup_costs.equipment bucket when no items exist yet.
  equipmentTotalCents: number;
  hasEquipmentItems: boolean;
  fundingSources?: FundingSourceLine[];
  currencyCode?: string;
  canEdit: boolean;
  onUpdateField: (key: keyof StartupCosts, cents: number) => void;
}

// TIM-1258: every line the owner enters directly. Equipment is intentionally NOT
// here — it leads as a read-only, sourced row so the total builds up from real
// purchases rather than a discouraging target. Ordered equipment → build-out →
// supplies → the rest → cash cushions.
const EDITABLE_FIELDS: { key: keyof StartupCosts; label: string; hint?: string }[] = [
  { key: "buildout_cents", label: "Build-Out & Renovation", hint: "Leasehold improvements, plumbing, electrical, flooring, paint" },
  { key: "startup_supplies_cents", label: "Startup Supplies & Smallwares", hint: "Cups, lids, smallwares, cleaning, packaging — the consumables you open with" },
  { key: "initial_inventory_cents", label: "Initial Inventory", hint: "Opening coffee, food, and retail stock" },
  { key: "deposits_cents", label: "Deposits (Rent, Utilities)", hint: "Refundable deposits held by your landlord and utilities" },
  { key: "licenses_cents", label: "Licenses & Permits", hint: "Business license, food service, health and signage permits" },
  { key: "professional_fees_cents", label: "Professional & Legal Fees", hint: "Entity formation, attorney, accountant and bookkeeping setup" },
  { key: "pre_opening_marketing_cents", label: "Pre-Opening Marketing", hint: "Sign, launch promo, grand-opening spend before day one" },
  { key: "working_capital_reserve_cents", label: "Working Capital Reserve", hint: "Cushion: 3–6 months of fixed costs (stays in the bank)" },
  { key: "opening_cash_buffer_cents", label: "Opening Cash Buffer", hint: "Extra cash on hand for the first slow months" },
];

export function StartupTab({
  startupCosts,
  equipmentTotalCents,
  hasEquipmentItems,
  fundingSources,
  currencyCode = "USD",
  canEdit,
  onUpdateField,
}: Props) {
  const f = (v: number) => fmt(v, currencyCode);

  const editableTotal = EDITABLE_FIELDS.reduce(
    (sum, fld) => sum + (startupCosts[fld.key] as number),
    0
  );
  const totalStartup = equipmentTotalCents + editableTotal;
  const nothingEntered = totalStartup === 0;

  // Funding sources (TIM-1122): read straight from funding_sources so edits in
  // the Funding tab show here immediately (shared model state).
  const sources = fundingSources ?? [];
  const sumKind = (kind: FundingSourceLine["kind"]) =>
    sources.filter((s) => s.kind === kind).reduce((acc, s) => acc + (s.amount_cents || 0), 0);

  const founderTotal = sumKind("founder_equity");
  const investorTotal = sumKind("investor_equity");
  const grantTotal = sumKind("grant");
  const loanLines = sources.filter((s) => s.kind === "loan" && s.amount_cents > 0);
  const loanTotal = loanLines.reduce((acc, l) => acc + l.amount_cents, 0);
  const totalFunding = founderTotal + investorTotal + grantTotal + loanTotal;
  const fundingGap = totalStartup - totalFunding;

  const monthlyPaymentFor = (line: FundingSourceLine) => {
    const p = line.amount_cents;
    const n = Math.max(0, line.term_months ?? 0);
    const r = ((line.annual_rate_pct ?? 0) / 100) / 12;
    if (p <= 0 || n <= 0) return 0;
    if (r <= 0) return Math.round(p / n);
    return Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  };
  const totalMonthlyLoanPayment = loanLines.reduce((acc, l) => acc + monthlyPaymentFor(l), 0);

  const equipmentLife = startupCosts.equipment_useful_life_years || 7;

  const inputCls =
    "w-32 text-sm text-right border border-[#e0e0e0] rounded-lg px-3 py-1.5 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";

  return (
    <div className="space-y-4">
      {/* Equipment-first guidance — TIM-1258: lead the owner to enter equipment
          first instead of handing them a big discouraging total. */}
      {nothingEntered && (
        <div className="rounded-2xl border border-[#155e63]/20 bg-[#155e63]/5 px-5 py-4">
          <p className="text-sm font-semibold text-[#1a1a1a]">Start with your equipment.</p>
          <p className="text-xs text-[#6b6b6b] mt-1 leading-relaxed">
            Your espresso machine, grinders, fridge and POS are usually the biggest part of
            opening. Build them in the Build-Out &amp; Equipment workspace and they flow in
            here automatically — then fill in the rest below. Your total builds up from what
            you actually need, one line at a time.
          </p>
          <a
            href="/workspace/buildout-equipment"
            className="mt-3 inline-block text-xs font-semibold text-white bg-[#155e63] rounded-lg px-4 py-2 hover:bg-[#124e52] transition-colors"
          >
            Add your equipment →
          </a>
        </div>
      )}

      {/* Startup cost table */}
      <div className="rounded-2xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <p className="text-sm font-semibold text-[#1a1a1a]">What It Takes To Open The Door</p>
          <p className="text-xs text-[#afafaf] mt-0.5">
            Enter each one-time cost below. The total adds itself up as you go.
          </p>
        </div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {/* Equipment — sourced, read-only, leads the list */}
            <tr id="tour-startup-equipment" className="border-t border-[#f0f0f0]">
              <td className="py-3 pl-5 pr-4">
                <span className="text-[#1a1a1a]">Equipment</span>
                <a
                  href="/workspace/buildout-equipment"
                  className="ml-2 text-xs font-medium text-[#155e63] hover:underline"
                >
                  {hasEquipmentItems ? "Edit in Build-Out & Equipment →" : "Add in Build-Out & Equipment →"}
                </a>
                <p className="text-[10px] text-[#afafaf] mt-0.5">
                  {hasEquipmentItems
                    ? "From your Build-Out & Equipment plan"
                    : "Entered once in Build-Out & Equipment, flows in here automatically"}
                </p>
              </td>
              <td className="py-3 pr-5 text-right font-medium align-top">{f(equipmentTotalCents)}</td>
            </tr>

            {/* Everything else — entered right here */}
            {EDITABLE_FIELDS.map((fld) => (
              <tr key={fld.key} className="border-t border-[#f0f0f0]">
                <td className="py-3 pl-5 pr-4">
                  <label htmlFor={`startup-${fld.key}`} className="text-[#1a1a1a]">
                    {fld.label}
                  </label>
                  {fld.hint && <p className="text-[10px] text-[#afafaf] mt-0.5">{fld.hint}</p>}
                </td>
                <td className="py-3 pr-5 text-right align-top">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs text-[#afafaf]">{currencyCode}</span>
                    <input
                      id={`startup-${fld.key}`}
                      className={inputCls}
                      type="number"
                      min={0}
                      step={100}
                      value={(startupCosts[fld.key] as number) ? (startupCosts[fld.key] as number) / 100 : ""}
                      onChange={(e) => onUpdateField(fld.key, (parseFloat(e.target.value) || 0) * 100)}
                      placeholder="0"
                      disabled={!canEdit}
                    />
                  </div>
                </td>
              </tr>
            ))}

            <tr className="border-t-2 border-[#155e63] bg-[#f7fafa]">
              <td className="py-3 pl-5 pr-4 font-semibold">Total Startup Cost</td>
              <td className="py-3 pr-5 text-right font-bold text-lg">{f(totalStartup)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Funding sources — edited in the Funding tab, reflected here */}
      <div className="rounded-2xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-[#1a1a1a]">Funding Sources</p>
          <p className="text-xs text-[#afafaf]">Edit in the Funding tab</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <tbody>
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
            {totalFunding === 0 && (
              <tr className="border-t border-[#f0f0f0]">
                <td className="py-3 pl-5 pr-4 text-[#afafaf]" colSpan={2}>
                  No funding sources yet — add how you&apos;ll pay for it in the Funding tab.
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-[#155e63] bg-[#f7fafa]">
              <td className="py-3 pl-5 pr-4 font-semibold">Total Funding</td>
              <td className="py-3 pr-5 text-right font-bold">{f(totalFunding)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Funding gap — only once the owner has entered some costs, so they are
          never handed a discouraging shortfall before they start. */}
      {!nothingEntered && (
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
                {totalFunding === 0
                  ? "Add your funding sources in the Funding tab to see how this is covered."
                  : fundingGap <= 0
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
      )}

      {/* Helpful context */}
      <div className="rounded-2xl border border-[#e5eef0] bg-[#f0f9f9] px-5 py-4">
        <p className="text-xs font-semibold text-[#155e63] uppercase tracking-wide mb-2">A Few Things Worth Knowing</p>
        <div className="space-y-2 text-sm text-[#2a4a4c] leading-relaxed">
          <p>The working capital reserve and opening cash buffer are not spent — they sit in your bank account as a cushion. Banks and lenders like to see 3 months of fixed costs in reserve before you open.</p>
          <p>Equipment is on a {equipmentLife}-year depreciation schedule, which reduces your taxable income over time. That is the main reason to separate it from build-out costs. Enter your equipment in the Build-Out &amp; Equipment workspace so each asset depreciates on its own useful life.</p>
          {loanTotal > 0 && (
            <p>Your loan payment of {f(totalMonthlyLoanPayment)}/month starts from day one : before you have any revenue. Make sure your opening cash buffer can cover at least 3 months of loan payments.</p>
          )}
        </div>
      </div>
    </div>
  );
}
