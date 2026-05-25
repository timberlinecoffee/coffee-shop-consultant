"use client";

import { type FinancialInputs, fmt } from "@/lib/financial-projection";

interface Props {
  inputs: FinancialInputs;
  onChange: (next: FinancialInputs) => void;
  disabled?: boolean;
}

function Field({
  label,
  hint,
  value,
  onChange,
  type = "number",
  min,
  max,
  step,
  disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[#f0f0f0] last:border-b-0">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-[#1a1a1a]">{label}</span>
        {hint && <p className="text-xs text-[#afafaf] mt-0.5">{hint}</p>}
      </div>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (isFinite(v)) onChange(v);
        }}
        className="w-28 text-right text-sm border border-[#e0e0e0] rounded-lg px-2.5 py-1.5 bg-[#faf9f7] focus:outline-none focus:ring-2 focus:ring-[#155e63] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-5 pt-5 pb-2">
      <h3 className="text-sm font-semibold text-[#155e63] uppercase tracking-wide">{title}</h3>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#efefef] bg-white mb-4">
      <SectionHeader title={title} />
      <div className="px-5 pb-4">{children}</div>
    </div>
  );
}

// Dollars to cents
const d2c = (dollars: number) => Math.round(dollars * 100);
// Cents to dollars
const c2d = (cents: number) => Math.round(cents) / 100;

export function InputsTab({ inputs, onChange, disabled }: Props) {
  const set = <K extends keyof FinancialInputs>(key: K, value: FinancialInputs[K]) =>
    onChange({ ...inputs, [key]: value });

  const total_startup = inputs.buildout_cost_cents + inputs.rent_deposits_cents +
    inputs.license_permits_cents + inputs.pre_opening_marketing_cents +
    inputs.initial_inventory_cents + inputs.equipment_cost_cents +
    inputs.working_capital_reserve_cents + inputs.opening_cash_buffer_cents;

  const funding_gap = total_startup - inputs.owner_capital_cents - inputs.loan_amount_cents;

  return (
    <div>
      <Section title="Operating Schedule">
        <Field label="Days Open Per Week" hint="5=Mon–Fri, 6=Mon–Sat, 7=every day"
          value={inputs.days_per_week} min={1} max={7}
          onChange={(v) => set("days_per_week", v)} disabled={disabled} />
        <Field label="Hours Open Per Day"
          value={inputs.hours_per_day} min={4} max={24}
          onChange={(v) => set("hours_per_day", v)} disabled={disabled} />
      </Section>

      <Section title="Revenue Assumptions">
        <Field label="Average Ticket ($)" hint="Excluding tips and sales tax"
          value={c2d(inputs.avg_ticket_cents)} step={0.25} min={0}
          onChange={(v) => set("avg_ticket_cents", d2c(v))} disabled={disabled} />
        <Field label="Customers Per Day" hint="Unique transactions, not heads"
          value={inputs.customers_per_day} min={0} step={5}
          onChange={(v) => set("customers_per_day", v)} disabled={disabled} />
        <div className="pt-3 pb-1">
          <p className="text-xs font-medium text-[#6b6b6b] uppercase tracking-wide mb-2">Revenue Mix (must total 100%)</p>
          <Field label="Beverage %" hint="Espresso, drip, cold drinks"
            value={inputs.beverage_revenue_pct} min={0} max={100} step={1}
            onChange={(v) => set("beverage_revenue_pct", v)} disabled={disabled} />
          <Field label="Food %"
            value={inputs.food_revenue_pct} min={0} max={100} step={1}
            onChange={(v) => set("food_revenue_pct", v)} disabled={disabled} />
          <Field label="Retail %" hint="Bags of beans, merchandise"
            value={inputs.retail_revenue_pct} min={0} max={100} step={1}
            onChange={(v) => set("retail_revenue_pct", v)} disabled={disabled} />
        </div>
        <p className="text-xs text-[#afafaf] mt-1">
          Tips and sales tax are pass-throughs — not included in revenue projections.
        </p>
      </Section>

      <Section title="Cost Of Goods Sold">
        <Field label="Beverage COGS %" hint="% of beverage revenue; typically 25–35%"
          value={inputs.beverage_cogs_pct} min={0} max={100} step={0.5}
          onChange={(v) => set("beverage_cogs_pct", v)} disabled={disabled} />
        <Field label="Food COGS %" hint="% of food revenue; typically 28–35%"
          value={inputs.food_cogs_pct} min={0} max={100} step={0.5}
          onChange={(v) => set("food_cogs_pct", v)} disabled={disabled} />
        <Field label="Retail COGS %" hint="% of retail revenue; typically 45–55%"
          value={inputs.retail_cogs_pct} min={0} max={100} step={0.5}
          onChange={(v) => set("retail_cogs_pct", v)} disabled={disabled} />
      </Section>

      <Section title="Operating Expenses">
        <Field label="Rent ($/month)" hint="Base rent only; excludes CAM/NNN"
          value={c2d(inputs.rent_cents)} step={50} min={0}
          onChange={(v) => set("rent_cents", d2c(v))} disabled={disabled} />
        <Field label="Labor % Of Revenue" hint="Wages + payroll taxes; typically 28–35%"
          value={inputs.labor_pct} min={0} max={100} step={0.5}
          onChange={(v) => set("labor_pct", v)} disabled={disabled} />
        <Field label="Marketing % Of Revenue" hint="Ads, promos, social; typically 1–3%"
          value={inputs.marketing_pct} min={0} max={100} step={0.5}
          onChange={(v) => set("marketing_pct", v)} disabled={disabled} />
        <Field label="Utilities ($/month)" hint="Electric, gas, water, internet"
          value={c2d(inputs.utilities_cents)} step={25} min={0}
          onChange={(v) => set("utilities_cents", d2c(v))} disabled={disabled} />
        <Field label="Insurance ($/month)"
          value={c2d(inputs.insurance_cents)} step={25} min={0}
          onChange={(v) => set("insurance_cents", d2c(v))} disabled={disabled} />
        <Field label="Technology ($/month)" hint="POS, payment SaaS, scheduling"
          value={c2d(inputs.tech_cents)} step={10} min={0}
          onChange={(v) => set("tech_cents", d2c(v))} disabled={disabled} />
        <Field label="Maintenance ($/month)" hint="Repairs, smallwares replacement"
          value={c2d(inputs.maintenance_cents)} step={10} min={0}
          onChange={(v) => set("maintenance_cents", d2c(v))} disabled={disabled} />
        <Field label="Supplies ($/month)" hint="Cleaning, paper, packaging"
          value={c2d(inputs.supplies_cents)} step={10} min={0}
          onChange={(v) => set("supplies_cents", d2c(v))} disabled={disabled} />
        <Field label="Payment Processing %" hint="Stripe/Square; typically 2.5–3.0%"
          value={inputs.payment_processing_pct} min={0} max={10} step={0.05}
          onChange={(v) => set("payment_processing_pct", v)} disabled={disabled} />
        <Field label="Spoilage % Of COGS" hint="Expired product loss; typically 2–5%"
          value={inputs.spoilage_pct} min={0} max={20} step={0.5}
          onChange={(v) => set("spoilage_pct", v)} disabled={disabled} />
        <Field label="Loyalty Discount % Of Revenue" hint="Redemption cost; 0 if no loyalty program"
          value={inputs.loyalty_discount_pct} min={0} max={20} step={0.1}
          onChange={(v) => set("loyalty_discount_pct", v)} disabled={disabled} />
        <Field label="Other ($/month)"
          value={c2d(inputs.other_opex_cents)} step={25} min={0}
          onChange={(v) => set("other_opex_cents", d2c(v))} disabled={disabled} />
      </Section>

      <Section title="Startup Costs">
        <Field label="Build-Out & Renovation ($)"
          value={c2d(inputs.buildout_cost_cents)} step={1000} min={0}
          onChange={(v) => set("buildout_cost_cents", d2c(v))} disabled={disabled} />
        <Field label="Equipment ($)"
          value={c2d(inputs.equipment_cost_cents)} step={1000} min={0}
          onChange={(v) => set("equipment_cost_cents", d2c(v))} disabled={disabled} />
        <Field label="Deposits (Rent, Utilities) ($)"
          value={c2d(inputs.rent_deposits_cents)} step={500} min={0}
          onChange={(v) => set("rent_deposits_cents", d2c(v))} disabled={disabled} />
        <Field label="Licenses & Permits ($)"
          value={c2d(inputs.license_permits_cents)} step={100} min={0}
          onChange={(v) => set("license_permits_cents", d2c(v))} disabled={disabled} />
        <Field label="Pre-Opening Marketing ($)"
          value={c2d(inputs.pre_opening_marketing_cents)} step={500} min={0}
          onChange={(v) => set("pre_opening_marketing_cents", d2c(v))} disabled={disabled} />
        <Field label="Initial Inventory ($)"
          value={c2d(inputs.initial_inventory_cents)} step={500} min={0}
          onChange={(v) => set("initial_inventory_cents", d2c(v))} disabled={disabled} />
        <Field label="Working Capital Reserve ($)" hint="Target: 3–6 months of fixed costs"
          value={c2d(inputs.working_capital_reserve_cents)} step={1000} min={0}
          onChange={(v) => set("working_capital_reserve_cents", d2c(v))} disabled={disabled} />
        <Field label="Opening Cash Buffer ($)"
          value={c2d(inputs.opening_cash_buffer_cents)} step={500} min={0}
          onChange={(v) => set("opening_cash_buffer_cents", d2c(v))} disabled={disabled} />
        <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
          <div className="flex justify-between text-sm font-semibold">
            <span>Total Startup Cost</span>
            <span>{fmt(total_startup)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-[#6b6b6b]">Less: Owner Capital</span>
            <span className="text-[#6b6b6b]">({fmt(inputs.owner_capital_cents)})</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-[#6b6b6b]">Less: Loan Amount</span>
            <span className="text-[#6b6b6b]">({fmt(inputs.loan_amount_cents)})</span>
          </div>
          <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-[#f0f0f0]">
            <span>Funding Gap</span>
            <span className={funding_gap > 0 ? "text-red-600" : "text-[#155e63]"}>
              {funding_gap > 0 ? fmt(funding_gap) : fmt(funding_gap) + " (funded)"}
            </span>
          </div>
        </div>
      </Section>

      <Section title="Financing">
        <Field label="Owner Capital ($)" hint="Personal injection at open"
          value={c2d(inputs.owner_capital_cents)} step={1000} min={0}
          onChange={(v) => set("owner_capital_cents", d2c(v))} disabled={disabled} />
        <Field label="Loan Amount ($)"
          value={c2d(inputs.loan_amount_cents)} step={1000} min={0}
          onChange={(v) => set("loan_amount_cents", d2c(v))} disabled={disabled} />
        <Field label="Loan Term (months)"
          value={inputs.loan_term_months} min={12} max={360} step={12}
          onChange={(v) => set("loan_term_months", v)} disabled={disabled} />
        <Field label="Annual Interest Rate (%)"
          value={inputs.loan_annual_rate_pct} min={0} max={30} step={0.25}
          onChange={(v) => set("loan_annual_rate_pct", v)} disabled={disabled} />
        <Field label="Depreciation Period (years)" hint="Equipment useful life; typically 5–10 years"
          value={inputs.depreciation_years} min={1} max={20} step={1}
          onChange={(v) => set("depreciation_years", v)} disabled={disabled} />
        <Field label="Tax Rate (%)" hint="Combined federal + state effective rate"
          value={inputs.tax_rate_pct} min={0} max={50} step={1}
          onChange={(v) => set("tax_rate_pct", v)} disabled={disabled} />
      </Section>

      <Section title="Balance Sheet Assumptions">
        <Field label="Days Of Inventory" hint="How many days of COGS you hold in stock; typically 5–14"
          value={inputs.days_inventory} min={0} max={60} step={1}
          onChange={(v) => set("days_inventory", v)} disabled={disabled} />
        <Field label="Days Payable" hint="How many days before you pay suppliers; typically 7–30"
          value={inputs.days_payable} min={0} max={90} step={1}
          onChange={(v) => set("days_payable", v)} disabled={disabled} />
        <Field label="Days Receivable" hint="For catering/wholesale; 0 for cash-only retail"
          value={inputs.days_receivable} min={0} max={90} step={1}
          onChange={(v) => set("days_receivable", v)} disabled={disabled} />
      </Section>
    </div>
  );
}
