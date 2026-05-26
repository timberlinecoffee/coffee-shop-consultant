// Financial projection engine — TIM-1019
// Computes 60-month P&L, cash flow, and balance sheet projections for a coffee shop.
// All monetary values in cents. Growth factors match the annual model: Y1=1.0, Y3=1.3, Y5=1.55.

export interface FinancialInputs {
  // Operating schedule
  days_per_week: number;
  hours_per_day: number;

  // Revenue
  avg_ticket_cents: number;
  customers_per_day: number;

  // Revenue mix (% of net revenue; must sum to 100)
  beverage_revenue_pct: number;
  food_revenue_pct: number;
  retail_revenue_pct: number;

  // COGS by category (% of that category's revenue)
  beverage_cogs_pct: number;
  food_cogs_pct: number;
  retail_cogs_pct: number;

  // OpEx — flat monthly (cents)
  rent_cents: number;
  utilities_cents: number;
  insurance_cents: number;
  tech_cents: number;
  maintenance_cents: number;
  supplies_cents: number;
  other_opex_cents: number;

  // OpEx — % of revenue / COGS
  labor_pct: number;
  marketing_pct: number;
  payment_processing_pct: number;
  spoilage_pct: number;       // % of total COGS
  loyalty_discount_pct: number; // % of gross revenue

  // Balance sheet assumptions
  days_inventory: number;
  days_payable: number;
  days_receivable: number;

  // Startup costs (cents)
  buildout_cost_cents: number;
  rent_deposits_cents: number;
  license_permits_cents: number;
  pre_opening_marketing_cents: number;
  initial_inventory_cents: number;
  working_capital_reserve_cents: number;
  opening_cash_buffer_cents: number;

  // Financing
  owner_capital_cents: number;
  loan_amount_cents: number;
  loan_term_months: number;
  loan_annual_rate_pct: number;

  // Equipment
  equipment_cost_cents: number;
  depreciation_years: number;

  // Tax
  tax_rate_pct: number;
}

export interface MonthlySlice {
  year: number;
  month: number; // 1-12

  // P&L (cents)
  gross_revenue_cents: number;
  loyalty_discounts_cents: number;
  net_revenue_cents: number;
  beverage_cogs_cents: number;
  food_cogs_cents: number;
  retail_cogs_cents: number;
  total_cogs_cents: number;
  gross_profit_cents: number;
  labor_cents: number;
  rent_cents: number;
  marketing_cents: number;
  utilities_cents: number;
  insurance_cents: number;
  tech_cents: number;
  maintenance_cents: number;
  supplies_cents: number;
  payment_processing_cents: number;
  spoilage_cents: number;
  other_opex_cents: number;
  total_opex_cents: number;
  operating_income_cents: number;
  depreciation_cents: number;
  ebitda_cents: number;
  interest_cents: number;
  income_before_taxes_cents: number;
  taxes_cents: number;
  net_income_cents: number;

  // Cash flow
  capex_cents: number;
  loan_proceeds_cents: number;
  loan_repayment_cents: number;
  principal_repayment_cents: number;
  owner_contribution_cents: number;
  net_cash_cents: number;

  // Balance sheet end-of-month (cents)
  cash_cents: number;
  accounts_receivable_cents: number;
  inventory_cents: number;
  fixed_assets_gross_cents: number;
  accumulated_depreciation_cents: number;
  net_fixed_assets_cents: number;
  other_assets_cents: number;
  total_assets_cents: number;
  accounts_payable_cents: number;
  current_debt_cents: number;
  long_term_debt_cents: number;
  total_liabilities_cents: number;
  owner_equity_cents: number;
  retained_earnings_cents: number;
  total_equity_cents: number;
  total_liabilities_and_equity_cents: number;
}

// Growth factors by year: Y1=1.0, Y3=1.3, Y5=1.55 (linear interpolation for Y2/Y4)
const GROWTH_FACTORS: Record<number, number> = {
  1: 1.0,
  2: 1.15,
  3: 1.3,
  4: 1.425,
  5: 1.55,
};

function r(n: number): number {
  return Math.round(n);
}

function monthlyLoanPayment(principal: number, annualRatePct: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  if (annualRatePct <= 0) return r(principal / termMonths);
  const monthlyRate = annualRatePct / 100 / 12;
  return r(principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths) / (Math.pow(1 + monthlyRate, termMonths) - 1));
}

export const FINANCIAL_INPUTS_DEFAULTS: FinancialInputs = {
  days_per_week: 6,
  hours_per_day: 10,
  avg_ticket_cents: 900,
  customers_per_day: 80,
  beverage_revenue_pct: 80,
  food_revenue_pct: 15,
  retail_revenue_pct: 5,
  beverage_cogs_pct: 30,
  food_cogs_pct: 32,
  retail_cogs_pct: 50,
  rent_cents: 350000,
  utilities_cents: 60000,
  insurance_cents: 40000,
  tech_cents: 30000,
  maintenance_cents: 20000,
  supplies_cents: 25000,
  other_opex_cents: 20000,
  labor_pct: 30,
  marketing_pct: 2,
  payment_processing_pct: 2.75,
  spoilage_pct: 3,
  loyalty_discount_pct: 0,
  days_inventory: 7,
  days_payable: 14,
  days_receivable: 0,
  buildout_cost_cents: 5000000,
  rent_deposits_cents: 700000,
  license_permits_cents: 200000,
  pre_opening_marketing_cents: 300000,
  initial_inventory_cents: 200000,
  working_capital_reserve_cents: 1000000,
  opening_cash_buffer_cents: 500000,
  owner_capital_cents: 5000000,
  loan_amount_cents: 5000000,
  loan_term_months: 60,
  loan_annual_rate_pct: 7,
  equipment_cost_cents: 4000000,
  depreciation_years: 7,
  tax_rate_pct: 25,
};

export function normalizeFinancialInputs(raw: unknown): FinancialInputs {
  const defaults = FINANCIAL_INPUTS_DEFAULTS;
  if (!raw || typeof raw !== "object") return { ...defaults };
  const r = raw as Record<string, unknown>;
  const n = (key: keyof FinancialInputs) => {
    const v = r[key];
    return typeof v === "number" && isFinite(v) ? v : defaults[key];
  };
  return {
    days_per_week: n("days_per_week"),
    hours_per_day: n("hours_per_day"),
    avg_ticket_cents: n("avg_ticket_cents"),
    customers_per_day: n("customers_per_day"),
    beverage_revenue_pct: n("beverage_revenue_pct"),
    food_revenue_pct: n("food_revenue_pct"),
    retail_revenue_pct: n("retail_revenue_pct"),
    beverage_cogs_pct: n("beverage_cogs_pct"),
    food_cogs_pct: n("food_cogs_pct"),
    retail_cogs_pct: n("retail_cogs_pct"),
    rent_cents: n("rent_cents"),
    utilities_cents: n("utilities_cents"),
    insurance_cents: n("insurance_cents"),
    tech_cents: n("tech_cents"),
    maintenance_cents: n("maintenance_cents"),
    supplies_cents: n("supplies_cents"),
    other_opex_cents: n("other_opex_cents"),
    labor_pct: n("labor_pct"),
    marketing_pct: n("marketing_pct"),
    payment_processing_pct: n("payment_processing_pct"),
    spoilage_pct: n("spoilage_pct"),
    loyalty_discount_pct: n("loyalty_discount_pct"),
    days_inventory: n("days_inventory"),
    days_payable: n("days_payable"),
    days_receivable: n("days_receivable"),
    buildout_cost_cents: n("buildout_cost_cents"),
    rent_deposits_cents: n("rent_deposits_cents"),
    license_permits_cents: n("license_permits_cents"),
    pre_opening_marketing_cents: n("pre_opening_marketing_cents"),
    initial_inventory_cents: n("initial_inventory_cents"),
    working_capital_reserve_cents: n("working_capital_reserve_cents"),
    opening_cash_buffer_cents: n("opening_cash_buffer_cents"),
    owner_capital_cents: n("owner_capital_cents"),
    loan_amount_cents: n("loan_amount_cents"),
    loan_term_months: n("loan_term_months"),
    loan_annual_rate_pct: n("loan_annual_rate_pct"),
    equipment_cost_cents: n("equipment_cost_cents"),
    depreciation_years: n("depreciation_years"),
    tax_rate_pct: n("tax_rate_pct"),
  };
}

export function computeMonthlyProjections(inputs: FinancialInputs): MonthlySlice[] {
  const {
    days_per_week, avg_ticket_cents, customers_per_day,
    beverage_revenue_pct, food_revenue_pct, retail_revenue_pct,
    beverage_cogs_pct, food_cogs_pct, retail_cogs_pct,
    rent_cents: rent, utilities_cents: utilities, insurance_cents: insurance,
    tech_cents: tech, maintenance_cents: maintenance, supplies_cents: supplies,
    other_opex_cents: other_opex,
    labor_pct, marketing_pct, payment_processing_pct, spoilage_pct,
    loyalty_discount_pct,
    days_inventory, days_payable, days_receivable,
    buildout_cost_cents, rent_deposits_cents, license_permits_cents,
    pre_opening_marketing_cents, initial_inventory_cents,
    owner_capital_cents, loan_amount_cents, loan_term_months, loan_annual_rate_pct,
    equipment_cost_cents, depreciation_years, tax_rate_pct,
  } = inputs;

  // Monthly base revenue (weeks per month ≈ 52/12)
  const baseGrossRevenue = r(customers_per_day * (days_per_week * 52 / 12) * avg_ticket_cents);
  const monthlyEquipmentDepreciation = depreciation_years > 0
    ? r(equipment_cost_cents / (depreciation_years * 12))
    : 0;
  // Buildout is a leasehold improvement depreciated straight-line over 15 years
  const monthlyBuildoutDepreciation = buildout_cost_cents > 0
    ? r(buildout_cost_cents / (15 * 12))
    : 0;
  const monthlyDepreciation = monthlyEquipmentDepreciation + monthlyBuildoutDepreciation;

  // Loan amortization
  const monthlyPayment = monthlyLoanPayment(loan_amount_cents, loan_annual_rate_pct, loan_term_months);
  const monthlyRate = loan_annual_rate_pct / 100 / 12;

  // Starting balance sheet
  const nonReserveStartupCosts = buildout_cost_cents + rent_deposits_cents + license_permits_cents
    + pre_opening_marketing_cents + initial_inventory_cents + equipment_cost_cents;
  let cashBalance = owner_capital_cents + loan_amount_cents - nonReserveStartupCosts;
  let loanBalance = loan_amount_cents;
  let accumulatedDepreciation = 0;
  // Pre-opening expenses (licenses, marketing) hit retained earnings on day 0
  let retainedEarnings = -(license_permits_cents + pre_opening_marketing_cents);
  // Other assets = deposits (prepaid rent etc.)
  const otherAssets = rent_deposits_cents;

  const slices: MonthlySlice[] = [];

  for (let totalMonth = 1; totalMonth <= 60; totalMonth++) {
    const year = Math.ceil(totalMonth / 12);
    const month = ((totalMonth - 1) % 12) + 1;
    const growthFactor = GROWTH_FACTORS[year] ?? 1.0;

    // P&L
    const gross_revenue = r(baseGrossRevenue * growthFactor);
    const loyalty_discounts = r(gross_revenue * loyalty_discount_pct / 100);
    const net_revenue = gross_revenue - loyalty_discounts;

    const bev_revenue = r(net_revenue * beverage_revenue_pct / 100);
    const food_revenue = r(net_revenue * food_revenue_pct / 100);
    const retail_revenue = net_revenue - bev_revenue - food_revenue;

    const beverage_cogs = r(bev_revenue * beverage_cogs_pct / 100);
    const food_cogs = r(food_revenue * food_cogs_pct / 100);
    const retail_cogs = r(retail_revenue * retail_cogs_pct / 100);
    const total_cogs = beverage_cogs + food_cogs + retail_cogs;
    const gross_profit = net_revenue - total_cogs;

    const labor = r(net_revenue * labor_pct / 100);
    const marketing = r(net_revenue * marketing_pct / 100);
    const payment_processing = r(net_revenue * payment_processing_pct / 100);
    const spoilage = r(total_cogs * spoilage_pct / 100);

    const total_opex = labor + rent + marketing + utilities + insurance + tech + maintenance + supplies + payment_processing + spoilage + other_opex;
    const operating_income = gross_profit - total_opex;
    const ebitda = operating_income + monthlyDepreciation;

    // Loan interest
    const interest = loanBalance > 0 ? r(loanBalance * monthlyRate) : 0;
    const income_before_taxes = operating_income - monthlyDepreciation - interest;
    const taxes = income_before_taxes > 0 ? r(income_before_taxes * tax_rate_pct / 100) : 0;
    const net_income = income_before_taxes - taxes;

    // Loan payment (principal + interest)
    const loan_repayment = loanBalance > 0 ? Math.min(monthlyPayment, loanBalance + interest) : 0;
    const principal_repayment = Math.max(0, loan_repayment - interest);

    // Cash flow
    const capex = 0; // CAPEX was pre-opening; month 1+ = 0 ongoing
    const loan_proceeds = 0; // proceeds were pre-opening
    const owner_contribution = 0;

    // Working capital changes (month over month)
    const prev_ar = slices.length > 0 ? slices[slices.length - 1].accounts_receivable_cents : 0;
    const prev_inventory = slices.length > 0 ? slices[slices.length - 1].inventory_cents : initial_inventory_cents;
    const prev_ap = slices.length > 0 ? slices[slices.length - 1].accounts_payable_cents : 0;

    const ar_now = days_receivable > 0 ? r(net_revenue * days_receivable / 30) : 0;
    const inventory_now = r(total_cogs * days_inventory / 30);
    const ap_now = r(total_cogs * days_payable / 30);

    const delta_ar = ar_now - prev_ar;
    const delta_inventory = inventory_now - prev_inventory;
    const delta_ap = ap_now - prev_ap;

    const net_cash_operating = net_income + monthlyDepreciation - delta_ar - delta_inventory + delta_ap;
    const net_cash_investing = -capex;
    // Interest is already deducted in net_income (operating); financing only tracks principal
    const net_cash_financing = loan_proceeds + owner_contribution - principal_repayment;
    const net_cash = net_cash_operating + net_cash_investing + net_cash_financing;

    // Balance sheet updates
    loanBalance = Math.max(0, loanBalance - principal_repayment);
    accumulatedDepreciation += monthlyDepreciation;
    retainedEarnings += net_income;
    cashBalance += net_cash;

    const fixed_assets_gross = equipment_cost_cents + buildout_cost_cents;
    const net_fixed_assets = Math.max(0, fixed_assets_gross - accumulatedDepreciation);
    const total_assets = cashBalance + ar_now + inventory_now + net_fixed_assets + otherAssets;

    // Current portion of LTD = next 12 months' estimated principal
    const current_debt = loanBalance > 0
      ? Math.min(loanBalance, r((monthlyPayment - loanBalance * monthlyRate) * 12))
      : 0;
    const long_term_debt = Math.max(0, loanBalance - current_debt);

    const total_liabilities = ap_now + current_debt + long_term_debt;
    const total_equity = owner_capital_cents + retainedEarnings;
    const total_liabilities_and_equity = total_liabilities + total_equity;

    slices.push({
      year,
      month,
      gross_revenue_cents: gross_revenue,
      loyalty_discounts_cents: loyalty_discounts,
      net_revenue_cents: net_revenue,
      beverage_cogs_cents: beverage_cogs,
      food_cogs_cents: food_cogs,
      retail_cogs_cents: retail_cogs,
      total_cogs_cents: total_cogs,
      gross_profit_cents: gross_profit,
      labor_cents: labor,
      rent_cents: rent,
      marketing_cents: marketing,
      utilities_cents: utilities,
      insurance_cents: insurance,
      tech_cents: tech,
      maintenance_cents: maintenance,
      supplies_cents: supplies,
      payment_processing_cents: payment_processing,
      spoilage_cents: spoilage,
      other_opex_cents: other_opex,
      total_opex_cents: total_opex,
      operating_income_cents: operating_income,
      depreciation_cents: monthlyDepreciation,
      ebitda_cents: ebitda,
      interest_cents: interest,
      income_before_taxes_cents: income_before_taxes,
      taxes_cents: taxes,
      net_income_cents: net_income,
      capex_cents: capex,
      loan_proceeds_cents: loan_proceeds,
      loan_repayment_cents: loan_repayment,
      principal_repayment_cents: principal_repayment,
      owner_contribution_cents: owner_contribution,
      net_cash_cents: net_cash,
      cash_cents: cashBalance,
      accounts_receivable_cents: ar_now,
      inventory_cents: inventory_now,
      fixed_assets_gross_cents: fixed_assets_gross,
      accumulated_depreciation_cents: accumulatedDepreciation,
      net_fixed_assets_cents: net_fixed_assets,
      other_assets_cents: otherAssets,
      total_assets_cents: total_assets,
      accounts_payable_cents: ap_now,
      current_debt_cents: current_debt,
      long_term_debt_cents: long_term_debt,
      total_liabilities_cents: total_liabilities,
      owner_equity_cents: owner_capital_cents,
      retained_earnings_cents: retainedEarnings,
      total_equity_cents: total_equity,
      total_liabilities_and_equity_cents: total_liabilities_and_equity,
    });
  }

  return slices;
}

export interface AnnualSummary {
  year: number;
  net_revenue_cents: number;
  total_cogs_cents: number;
  gross_profit_cents: number;
  total_opex_cents: number;
  operating_income_cents: number;
  net_income_cents: number;
  // End-of-year balance sheet snapshot (last month of year)
  cash_cents: number;
  total_assets_cents: number;
  total_liabilities_cents: number;
  total_equity_cents: number;
}

export function computeAnnualSummary(slices: MonthlySlice[], year: number): AnnualSummary {
  const yearSlices = slices.filter((s) => s.year === year);
  const last = yearSlices[yearSlices.length - 1];
  const sum = (key: keyof MonthlySlice) =>
    yearSlices.reduce((acc, s) => acc + (s[key] as number), 0);

  return {
    year,
    net_revenue_cents: sum("net_revenue_cents"),
    total_cogs_cents: sum("total_cogs_cents"),
    gross_profit_cents: sum("gross_profit_cents"),
    total_opex_cents: sum("total_opex_cents"),
    operating_income_cents: sum("operating_income_cents"),
    net_income_cents: sum("net_income_cents"),
    cash_cents: last?.cash_cents ?? 0,
    total_assets_cents: last?.total_assets_cents ?? 0,
    total_liabilities_cents: last?.total_liabilities_cents ?? 0,
    total_equity_cents: last?.total_equity_cents ?? 0,
  };
}

// Quarterly rollup: 1=Q1, 2=Q2, 3=Q3, 4=Q4
export function getQuarterSlices(slices: MonthlySlice[], year: number, quarter: number): MonthlySlice[] {
  const startMonth = (quarter - 1) * 3 + 1;
  return slices.filter((s) => s.year === year && s.month >= startMonth && s.month < startMonth + 3);
}

export function sumSlices(slices: MonthlySlice[]): Partial<MonthlySlice> {
  if (slices.length === 0) return {};
  const last = slices[slices.length - 1];
  const sum = (key: keyof MonthlySlice) =>
    slices.reduce((acc, s) => acc + (s[key] as number), 0);
  return {
    gross_revenue_cents: sum("gross_revenue_cents"),
    loyalty_discounts_cents: sum("loyalty_discounts_cents"),
    net_revenue_cents: sum("net_revenue_cents"),
    beverage_cogs_cents: sum("beverage_cogs_cents"),
    food_cogs_cents: sum("food_cogs_cents"),
    retail_cogs_cents: sum("retail_cogs_cents"),
    total_cogs_cents: sum("total_cogs_cents"),
    gross_profit_cents: sum("gross_profit_cents"),
    labor_cents: sum("labor_cents"),
    rent_cents: sum("rent_cents"),
    marketing_cents: sum("marketing_cents"),
    utilities_cents: sum("utilities_cents"),
    insurance_cents: sum("insurance_cents"),
    tech_cents: sum("tech_cents"),
    maintenance_cents: sum("maintenance_cents"),
    supplies_cents: sum("supplies_cents"),
    payment_processing_cents: sum("payment_processing_cents"),
    spoilage_cents: sum("spoilage_cents"),
    other_opex_cents: sum("other_opex_cents"),
    total_opex_cents: sum("total_opex_cents"),
    operating_income_cents: sum("operating_income_cents"),
    depreciation_cents: sum("depreciation_cents"),
    ebitda_cents: sum("ebitda_cents"),
    interest_cents: sum("interest_cents"),
    income_before_taxes_cents: sum("income_before_taxes_cents"),
    taxes_cents: sum("taxes_cents"),
    net_income_cents: sum("net_income_cents"),
    capex_cents: sum("capex_cents"),
    loan_repayment_cents: sum("loan_repayment_cents"),
    principal_repayment_cents: sum("principal_repayment_cents"),
    net_cash_cents: sum("net_cash_cents"),
    // Balance sheet: end-of-period snapshot
    cash_cents: last.cash_cents,
    accounts_receivable_cents: last.accounts_receivable_cents,
    inventory_cents: last.inventory_cents,
    fixed_assets_gross_cents: last.fixed_assets_gross_cents,
    accumulated_depreciation_cents: last.accumulated_depreciation_cents,
    net_fixed_assets_cents: last.net_fixed_assets_cents,
    other_assets_cents: last.other_assets_cents,
    total_assets_cents: last.total_assets_cents,
    accounts_payable_cents: last.accounts_payable_cents,
    current_debt_cents: last.current_debt_cents,
    long_term_debt_cents: last.long_term_debt_cents,
    total_liabilities_cents: last.total_liabilities_cents,
    owner_equity_cents: last.owner_equity_cents,
    retained_earnings_cents: last.retained_earnings_cents,
    total_equity_cents: last.total_equity_cents,
    total_liabilities_and_equity_cents: last.total_liabilities_and_equity_cents,
  };
}

export function fmt(cents: number, compact = false): string {
  const dollars = cents / 100;
  if (compact && Math.abs(dollars) >= 1000) {
    return "$" + (dollars / 1000).toFixed(1) + "K";
  }
  return "$" + dollars.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return (numerator / denominator * 100).toFixed(1) + "%";
}
