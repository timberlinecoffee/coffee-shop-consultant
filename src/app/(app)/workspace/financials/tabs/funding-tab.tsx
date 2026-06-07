"use client";

// TIM-1122: Funding Sources tab. Editor for founder equity, loans, investor
// equity, and grants. Reconciles total funding (sources) against total startup
// costs (uses). Loan terms drive the cash-flow loan-repayment line and the
// balance-sheet long-term-debt line via computeMonthlySlices.

import { Plus, Trash2 } from "lucide-react";
import type {
  FundingSourceLine,
  FundingKind,
  FinancialInputs,
} from "@/lib/financial-projection";
import { fmt } from "@/lib/financial-projection";
import { currencySymbol } from "@/lib/currency";
import { NumericInput } from "@/components/ui/numeric-input";
import { InfoTip } from "@/components/ui/info-tip";

const KIND_META: Record<FundingKind, { label: string; hint: string }> = {
  founder_equity: {
    label: "Founder Equity",
    hint: "Cash you put into the business yourself. Sits on the Equity side of the balance sheet.",
  },
  loan: {
    label: "Loans",
    hint: "Bank or SBA loans. Each line amortizes independently. The principal pays down the loan on Cash Flow and the Balance Sheet, while the interest portion lands on the P&L as an expense. Set a draw month to time the proceeds to a later phase.",
  },
  investor_equity: {
    label: "Investor Equity",
    hint: "Cash from outside investors in exchange for ownership. Tracked separately so you can see total dilution.",
  },
  grant: {
    label: "Grants / Other",
    hint: "Non-repayable funding such as grants, family gifts, or pre-sale deposits. Treated as equity for accounting purposes.",
  },
};

function genId(kind: FundingKind): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `funding:${kind}:${crypto.randomUUID()}`;
  }
  return `funding:${kind}:${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function newLine(kind: FundingKind): FundingSourceLine {
  switch (kind) {
    case "loan":
      return {
        id: genId(kind),
        kind,
        label: "Loan",
        amount_cents: 0,
        term_months: 60,
        annual_rate_pct: 7,
      };
    case "investor_equity":
      return { id: genId(kind), kind, label: "Investor", amount_cents: 0, pct_ownership: 0 };
    case "grant":
      return { id: genId(kind), kind, label: "Grant", amount_cents: 0 };
    case "founder_equity":
    default:
      return { id: genId(kind), kind, label: "Founder Equity", amount_cents: 0 };
  }
}

function loanMonthlyPaymentCents(line: FundingSourceLine): number {
  if (line.kind !== "loan") return 0;
  const p = line.amount_cents;
  const n = Math.max(0, line.term_months ?? 0);
  const r = ((line.annual_rate_pct ?? 0) / 100) / 12;
  if (p <= 0 || n <= 0) return 0;
  if (r <= 0) return Math.round(p / n);
  return Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

interface LineRowProps {
  line: FundingSourceLine;
  canEdit: boolean;
  currencyCode: string;
  onChange: (next: FundingSourceLine) => void;
  onDelete: () => void;
}

function LineRow({ line, canEdit, currencyCode, onChange, onDelete }: LineRowProps) {
  const sym = currencySymbol(currencyCode);
  const inputCls =
    "text-sm border border-[var(--border-medium)] rounded-lg px-3 py-1.5 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";

  return (
    <div className="border border-[var(--border)] rounded-xl bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Label</label>
          <input
            className={`${inputCls} w-full`}
            type="text"
            value={line.label}
            disabled={!canEdit}
            onChange={(e) => onChange({ ...line, label: e.target.value })}
            placeholder={KIND_META[line.kind].label}
          />
        </div>

        <div className="w-[160px]">
          <label className="block text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">
            Amount ({sym})
          </label>
          <NumericInput
            className={`${inputCls} w-full`}
            type="number"
            min={0}
            step={100}
            value={line.amount_cents ? line.amount_cents / 100 : ""}
            disabled={!canEdit}
            onChange={(e) =>
              onChange({ ...line, amount_cents: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)) })
            }
            placeholder="0"
          />
        </div>

        {line.kind === "loan" && (
          <>
            <div className="w-[120px]">
              <label className="block text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Term (months)</label>
              <NumericInput
                className={`${inputCls} w-full`}
                type="number"
                min={1}
                max={480}
                step={1}
                value={line.term_months ?? 60}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({ ...line, term_months: Math.max(1, parseInt(e.target.value, 10) || 0) })
                }
              />
            </div>
            <div className="w-[120px]">
              <label className="block text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Rate (% APR)</label>
              <NumericInput
                className={`${inputCls} w-full`}
                type="number"
                min={0}
                max={30}
                step={0.1}
                value={line.annual_rate_pct ?? 0}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({ ...line, annual_rate_pct: Math.max(0, parseFloat(e.target.value) || 0) })
                }
              />
            </div>
            <div className="w-[110px]">
              <label className="block text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Draw Month</label>
              <NumericInput
                className={`${inputCls} w-full`}
                type="number"
                min={1}
                max={60}
                step={1}
                value={line.draw_month ?? 1}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({ ...line, draw_month: Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)) })
                }
              />
            </div>
            <div className="text-xs text-[var(--muted-foreground)] pb-1.5">
              <span className="block text-[10px] uppercase tracking-wider text-[var(--dark-grey)]">Monthly Payment</span>
              <span className="font-semibold text-[var(--teal)]">{fmt(loanMonthlyPaymentCents(line), currencyCode)}</span>
            </div>
          </>
        )}

        {line.kind === "investor_equity" && (
          <div className="w-[140px]">
            <label className="block text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Ownership %</label>
            <NumericInput
              className={`${inputCls} w-full`}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={line.pct_ownership ?? 0}
              disabled={!canEdit}
              onChange={(e) =>
                onChange({ ...line, pct_ownership: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })
              }
            />
          </div>
        )}

        {(line.kind === "grant" || line.kind === "founder_equity") && (
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Notes (optional)</label>
            <input
              className={`${inputCls} w-full`}
              type="text"
              value={line.notes ?? ""}
              disabled={!canEdit}
              onChange={(e) => onChange({ ...line, notes: e.target.value })}
              placeholder="Source, conditions, etc."
            />
          </div>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={onDelete}
            className="text-[var(--error)] hover:text-[var(--error-dark)] p-2 rounded-md hover:bg-[var(--error-bg-3)] transition-colors"
            aria-label="Remove line"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function CategorySection({
  kind,
  lines,
  canEdit,
  currencyCode,
  onChange,
}: {
  kind: FundingKind;
  lines: FundingSourceLine[];
  canEdit: boolean;
  currencyCode: string;
  onChange: (next: FundingSourceLine[]) => void;
}) {
  const meta = KIND_META[kind];
  const subtotal = lines.reduce((s, l) => s + l.amount_cents, 0);

  function updateLine(id: string, next: FundingSourceLine) {
    onChange(lines.map((l) => (l.id === id ? next : l)));
  }
  function deleteLine(id: string) {
    onChange(lines.filter((l) => l.id !== id));
  }
  function addLine() {
    onChange([...lines, newLine(kind)]);
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-bold text-[var(--foreground)] leading-tight">{meta.label}</h3>
          <InfoTip label={meta.label}>{meta.hint}</InfoTip>
        </div>
        <span className="text-sm font-semibold text-[var(--teal)] tabular-nums">{fmt(subtotal, currencyCode)}</span>
      </div>
      <div className="space-y-2">
        {lines.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            canEdit={canEdit}
            currencyCode={currencyCode}
            onChange={(next) => updateLine(l.id, next)}
            onDelete={() => deleteLine(l.id)}
          />
        ))}
        {lines.length === 0 && (
          <p className="text-xs text-[var(--dark-grey)] italic px-2 py-2">No {meta.label.toLowerCase()} added yet.</p>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--teal)] border border-dashed border-[var(--teal)]/40 rounded-lg px-3 py-2 hover:bg-[var(--teal)]/5 transition-colors"
          >
            <Plus size={12} />
            Add {meta.label.replace(/s$/, "").replace(/ \/ Other$/, "")}
          </button>
        )}
      </div>
    </div>
  );
}

interface Props {
  sources: FundingSourceLine[];
  inputs: FinancialInputs;
  canEdit: boolean;
  currencyCode?: string;
  onChange: (next: FundingSourceLine[]) => void;
}

export function FundingTab({ sources, inputs, canEdit, currencyCode = "USD", onChange }: Props) {
  const byKind: Record<FundingKind, FundingSourceLine[]> = {
    founder_equity: [],
    loan: [],
    investor_equity: [],
    grant: [],
  };
  for (const s of sources) byKind[s.kind].push(s);

  const equityTotal =
    byKind.founder_equity.reduce((s, l) => s + l.amount_cents, 0) +
    byKind.investor_equity.reduce((s, l) => s + l.amount_cents, 0) +
    byKind.grant.reduce((s, l) => s + l.amount_cents, 0);
  const loanTotal = byKind.loan.reduce((s, l) => s + l.amount_cents, 0);
  const sourcesTotal = equityTotal + loanTotal;

  const totalUses =
    inputs.buildout_cost_cents +
    inputs.equipment_cost_cents +
    inputs.rent_deposits_cents +
    inputs.license_permits_cents +
    inputs.pre_opening_marketing_cents +
    inputs.initial_inventory_cents +
    inputs.working_capital_reserve_cents +
    inputs.opening_cash_buffer_cents;

  const gap = totalUses - sourcesTotal;
  const totalMonthlyLoanPayment = byKind.loan.reduce((s, l) => s + loanMonthlyPaymentCents(l), 0);
  const investorOwnership = byKind.investor_equity.reduce((s, l) => s + (l.pct_ownership ?? 0), 0);

  function setKindLines(kind: FundingKind, next: FundingSourceLine[]) {
    const others = sources.filter((s) => s.kind !== kind);
    onChange([...others, ...next]);
  }

  return (
    <div className="space-y-4" id="tour-funding">
      <div className="rounded-xl border border-[var(--border)] bg-white p-5">
        <p className="text-base font-bold text-[var(--foreground)] leading-tight">Where The Money Comes From</p>
        <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">
          Add every dollar funding the launch — your own cash, loans, investor checks, and grants. Loans
          generate monthly principal payments on Cash Flow; equity sources land on the Equity side of the
          Balance Sheet.
        </p>
      </div>

      <CategorySection
        kind="founder_equity"
        lines={byKind.founder_equity}
        canEdit={canEdit}
        currencyCode={currencyCode}
        onChange={(next) => setKindLines("founder_equity", next)}
      />
      <CategorySection
        kind="loan"
        lines={byKind.loan}
        canEdit={canEdit}
        currencyCode={currencyCode}
        onChange={(next) => setKindLines("loan", next)}
      />
      <CategorySection
        kind="investor_equity"
        lines={byKind.investor_equity}
        canEdit={canEdit}
        currencyCode={currencyCode}
        onChange={(next) => setKindLines("investor_equity", next)}
      />
      <CategorySection
        kind="grant"
        lines={byKind.grant}
        canEdit={canEdit}
        currencyCode={currencyCode}
        onChange={(next) => setKindLines("grant", next)}
      />

      {/* Reconciliation: Sources vs. Uses */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <p className="text-base font-bold text-[var(--foreground)] leading-tight">Sources Vs. Uses</p>
          <p className="text-xs text-[var(--dark-grey)] mt-0.5">
            Total funding should cover total startup costs. Surplus becomes additional opening cash.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
          <div className="p-5">
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)] mb-3">Sources</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span>Founder Equity</span><span className="tabular-nums">{fmt(byKind.founder_equity.reduce((s, l) => s + l.amount_cents, 0), currencyCode)}</span></li>
              <li className="flex justify-between"><span>Loans</span><span className="tabular-nums">{fmt(loanTotal, currencyCode)}</span></li>
              <li className="flex justify-between"><span>Investor Equity</span><span className="tabular-nums">{fmt(byKind.investor_equity.reduce((s, l) => s + l.amount_cents, 0), currencyCode)}</span></li>
              <li className="flex justify-between"><span>Grants / Other</span><span className="tabular-nums">{fmt(byKind.grant.reduce((s, l) => s + l.amount_cents, 0), currencyCode)}</span></li>
              <li className="flex justify-between border-t border-[var(--border)] pt-1.5 mt-1.5 font-semibold"><span>Total Sources</span><span className="tabular-nums">{fmt(sourcesTotal, currencyCode)}</span></li>
            </ul>
          </div>
          <div className="p-5">
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)] mb-3">Uses</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span>Build-Out</span><span className="tabular-nums">{fmt(inputs.buildout_cost_cents, currencyCode)}</span></li>
              <li className="flex justify-between"><span>Equipment</span><span className="tabular-nums">{fmt(inputs.equipment_cost_cents, currencyCode)}</span></li>
              <li className="flex justify-between"><span>Deposits</span><span className="tabular-nums">{fmt(inputs.rent_deposits_cents, currencyCode)}</span></li>
              <li className="flex justify-between"><span>Licenses And Permits</span><span className="tabular-nums">{fmt(inputs.license_permits_cents, currencyCode)}</span></li>
              <li className="flex justify-between"><span>Pre-Opening Marketing</span><span className="tabular-nums">{fmt(inputs.pre_opening_marketing_cents, currencyCode)}</span></li>
              <li className="flex justify-between"><span>Initial Inventory</span><span className="tabular-nums">{fmt(inputs.initial_inventory_cents, currencyCode)}</span></li>
              <li className="flex justify-between"><span>Working Capital Reserve</span><span className="tabular-nums">{fmt(inputs.working_capital_reserve_cents, currencyCode)}</span></li>
              <li className="flex justify-between"><span>Opening Cash Buffer</span><span className="tabular-nums">{fmt(inputs.opening_cash_buffer_cents, currencyCode)}</span></li>
              <li className="flex justify-between border-t border-[var(--border)] pt-1.5 mt-1.5 font-semibold"><span>Total Uses</span><span className="tabular-nums">{fmt(totalUses, currencyCode)}</span></li>
            </ul>
          </div>
        </div>
        <div className={`px-5 py-4 border-t ${gap <= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-semibold ${gap <= 0 ? "text-green-800" : "text-red-800"}`}>
                {gap <= 0 ? "Fully Funded" : "Funding Gap"}
              </p>
              <p className={`text-xs mt-0.5 ${gap <= 0 ? "text-green-700" : "text-red-700"}`}>
                {gap <= 0
                  ? `Surplus of ${fmt(Math.abs(gap), currencyCode)} flows to opening cash.`
                  : `Need ${fmt(gap, currencyCode)} more to cover startup costs.`}
              </p>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${gap <= 0 ? "text-green-800" : "text-red-700"}`}>
              {fmt(Math.abs(gap), currencyCode)}
            </p>
          </div>
        </div>
      </div>

      {/* Capital structure context */}
      <div className="rounded-xl border border-[var(--teal-tint-400)] bg-[var(--teal-tint-100)] px-5 py-4">
        <p className="text-xs font-semibold text-[var(--teal)] uppercase tracking-wide mb-2">A Few Things Worth Knowing</p>
        <div className="space-y-2 text-sm text-[var(--teal-deeper)] leading-relaxed">
          {loanTotal > 0 && (
            <p>
              Total monthly loan payments add up to <strong>{fmt(totalMonthlyLoanPayment, currencyCode)}</strong>.
              Repayment starts the month after each loan is drawn, often well before steady revenue. Make sure the
              opening cash buffer covers at least three months of it.
            </p>
          )}
          {investorOwnership > 0 && (
            <p>
              You have given up <strong>{investorOwnership.toFixed(1)}%</strong> of the company across all investor
              lines. Common rounds keep dilution under 25% combined; check the cap table before signing anything.
            </p>
          )}
          {sourcesTotal > 0 && loanTotal / sourcesTotal > 0.6 && (
            <p>
              Loans cover more than 60% of your total funding. Lenders typically want to see at least 30–40% equity
              skin-in-the-game — consider raising more founder or investor equity before applying.
            </p>
          )}
          <p>
            The Balance Sheet splits funding into Equity (founder + investor + grants) and Long-Term Debt (loans).
            Cash Flow shows each month&apos;s loan principal payment under Financing Activities.
          </p>
        </div>
      </div>
    </div>
  );
}
