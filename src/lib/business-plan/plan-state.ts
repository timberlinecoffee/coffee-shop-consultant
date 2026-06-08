// TIM-2334: plan_state — single canonical state object that holds every
// quantitative input for a business plan. Both the narrative LLM (via
// buildBpSectionPrompt) and the financial-table renderer (assembleFinancialPlan
// + the printable's compute pass) read from this object. Numbers are derived
// from MonthlyProjections — the same engine the financial tables use — so the
// narrative and tables can never describe two different businesses.
//
// Background: investor critique on TIM-2315 (Beaver & Beef): narrative said
// 7 staff, table showed 1+2; narrative said raise $280K, sources table $250K,
// uses table $244K; narrative said rent $4,880/mo, P&L line $0; narrative
// said Y1 -$59,825 net loss, table +$31,313. Those contradictions trace to
// two pipelines describing two different businesses. plan_state forces one.

// Relative imports (not @/ aliases) so node:test can load this module
// without the Next.js path-alias resolver (mirrors the lib/*.test.mjs pattern).
import {
  normalizeMonthlyProjections,
  computeMonthlySlices,
  totalCapexCents,
  defaultStartupCosts,
  type MonthlyProjections,
  type MonthlySlice,
  type EquipmentSummary,
  type FundingKind,
  type PersonnelLine,
  type ForecastLine,
} from "../financial-projection.ts";
import type {
  BpLocationCandidate,
  BpEquipmentItem,
  BpHiringRole,
} from "../business-plan.ts";
import {
  applyCoffeeShopVertical,
  computeVerticalReport,
  readCoffeeShopVerticalConfig,
  formatVerticalReportForPrompt,
  type CoffeeShopVerticalReport,
} from "./coffee-shop-model.ts";
import {
  resolveRegion,
  getTaxProfile,
  getLenderProfile,
  effectiveIncomeTaxPct,
  formatRegionForPrompt,
  type Region,
  type TaxProfile,
  type LenderProfile,
} from "./tax-profiles.ts";
import {
  buildPlanStateEntities,
  extractFundingSourcesForEntities,
  formatEntitiesForPrompt,
  type PlanStateEntity,
} from "./entities.ts";
import {
  buildLocalClaims,
  formatLocalClaimsForPrompt,
  LOCAL_CLAIMS_DIRECTIVE,
  type PlanStateCompetitor,
  type PlanStateLocalClaims,
} from "./local-claims.ts";
import {
  buildLenderMetrics,
  formatLenderMetricsForPrompt,
  type LenderMetricsBundle,
} from "./lender-metrics.ts";

// ── Public types ─────────────────────────────────────────────────────────────

export interface PlanStateCapitalLine {
  kind: FundingKind;
  label: string;
  amount_cents: number;
  // Present only on kind === "loan".
  term_months?: number;
  annual_rate_pct?: number;
}

export interface PlanStateCapitalStack {
  total_raise_cents: number;
  equity_cents: number;       // founder + investor + grants
  debt_cents: number;         // loans
  founder_equity_cents: number;
  investor_equity_cents: number;
  grants_cents: number;
  sources: PlanStateCapitalLine[];
}

export interface PlanStateUseOfFundsLine {
  key: string;       // stable id (matches startup_costs field name)
  label: string;
  amount_cents: number;
}

export interface PlanStateUseOfFunds {
  total_cents: number;
  lines: PlanStateUseOfFundsLine[];
}

export interface PlanStateRevenue {
  avg_ticket_cents: number;
  customers_per_day_avg: number;
  open_days_per_week: number;
  ramp_months: number;
  growth_mode: "simple" | "custom";
  growth_monthly_pct: number;
}

export interface PlanStateCogs {
  blended_pct: number;          // weighted blended rate, computed not entered
  base_cogs_pct: number;        // foot-traffic base revenue COGS pct
  menu_blended_pct: number | null;
}

export interface PlanStateLaborRole {
  role: string;
  headcount: number;
  pay_basis: "annual" | "monthly" | "hourly";
  pay_amount_cents: number;
  hours_per_week: number | null;
  cost_category: "cogs" | "overhead";
  monthly_loaded_cost_cents: number;
}

export interface PlanStateLabor {
  total_headcount: number;
  monthly_loaded_cost_cents: number;   // total monthly payroll (steady-state)
  cogs_monthly_cents: number;          // direct service labor
  overhead_monthly_cents: number;      // operating labor
  roles: PlanStateLaborRole[];
  owner_draws_monthly_cents: number;
}

export interface PlanStateLease {
  monthly_rent_cents: number;
  chosen_location_name: string | null;
  chosen_address: string | null;
  sq_ft: number | null;
}

export interface PlanStateOpexLine {
  key: string;
  label: string;
  monthly_cents: number;       // steady-state, post-ramp
}

export interface PlanStateOpex {
  monthly_total_cents: number;
  lines: PlanStateOpexLine[];
}

export interface PlanStateCapex {
  total_cents: number;
  equipment_count: number;
  buildout_useful_life_years: number;
  equipment_useful_life_years: number;
}

export interface PlanStateTax {
  income_tax_pct: number;
  sales_tax_pct: number;
  // TIM-2339: When a region was resolved, the engine's tax rate is set to the
  // region-aware value (e.g. Alberta CCPC ~11% for Y1, not the generic 25%).
  // engine_default_overridden is true when the user was at the engine default
  // and we substituted the regional rate.
  engine_default_overridden: boolean;
  // Region-aware tax profile (entity type, tiered rates, sales-tax structure).
  // Null when no region was resolvable from the workspace inputs.
  region_profile: TaxProfile | null;
}

export interface PlanStateYearSummary {
  year: number;                // 1..5
  revenue_cents: number;
  cogs_cents: number;
  gross_profit_cents: number;
  total_opex_cents: number;
  operating_income_cents: number;
  net_income_cents: number;
  ending_cash_cents: number;
}

export interface PlanStateBreakEven {
  // Year 1 monthly breakdown (high level — full monthly grid lives in the
  // appendix). Used by the narrative for the "path to profitability" claim.
  first_profitable_month_index: number | null;   // 1..60, null if never
}

export interface PlanStateMeta {
  shop_name: string;
  currency_code: string;
  fiscal_year_start_month: number;
}

export interface PlanState {
  meta: PlanStateMeta;
  capital_stack: PlanStateCapitalStack;
  use_of_funds: PlanStateUseOfFunds;
  revenue: PlanStateRevenue;
  cogs: PlanStateCogs;
  labor: PlanStateLabor;
  lease: PlanStateLease;
  opex: PlanStateOpex;
  capex: PlanStateCapex;
  tax: PlanStateTax;
  // TIM-2339: resolved region (country + state/province) and lender profile.
  // Drives the tax rate the engine uses for Y1 net income, and the lender
  // references the narrative is allowed to cite. Null when the workspace has
  // no country set yet — narrative falls back to a generic tax rate and the
  // engine default. The narrative is forbidden from referencing SBA in non-US
  // plans because of the lender block surfaced in formatPlanStateForPrompt.
  region: Region | null;
  lender_profile: LenderProfile | null;
  years: PlanStateYearSummary[];          // years 1..5 (sparse if upstream model is shorter)
  break_even: PlanStateBreakEven;
  // TIM-2338: coffee-shop vertical model report — present when the financial
  // model carries a coffee_shop_vertical_config. Surfaces daypart staffing,
  // lease object summary, labor by year, depreciation schedule, working
  // capital, and cost inflation rates. Narrative consumes these for the
  // investor-grade structural detail; financial tables consume the same
  // numbers via the engine's slices, so they cannot diverge.
  vertical_model: CoffeeShopVerticalReport | null;
  // TIM-2337: canonical entity registry — every proper noun the narrative
  // is allowed to reference (business name, equipment, locations, lenders,
  // hiring roles, plus a built-in coffee-brand vocabulary with known
  // misspellings). The prompt cites canonical spellings; a post-generation
  // canonicalizer rewrites near-misses (Levenshtein ≤ 2) and aliases.
  // Investor critique #5 on Beaver & Beef: "Whitehouse Farms" vs
  // "Whitehorse Farms", "La Marzocko" vs "La Marzocco" — exactly the
  // typos this registry prevents.
  entities: PlanStateEntity[];
  // TIM-2340: local-claim guardrails — user-entered competitors, the
  // explicit "no direct competitors" toggle, and the resolved city the
  // geography validator scopes to. The narrative is forbidden from inventing
  // foot traffic, demographic stats, or competitor addresses; this block is
  // the ONLY source for those claims. Investor critique #6 on Beaver & Beef:
  // "800 to 1,200 pedestrians per day", "Kawa Espresso Bar (11 Ave SE)",
  // "Bridgeland/Aspen Landing corridor" — exactly what this block prevents.
  local_claims: PlanStateLocalClaims;
  // TIM-2341: lender-ready metrics computed from the same engine slices the
  // financial tables read. Surfaces unit economics buildup, sensitivity (Y1
  // net at ±10% ticket / ±20% COGS / ±3mo ramp), DSCR by year, break-even,
  // CapEx schedule, depreciation schedule, and working capital — every
  // table-stakes lender metric the investor flagged as missing on TIM-2315.
  lender_metrics: LenderMetricsBundle;
}

// ── Builder inputs (parallels what /generate already loads) ──────────────────

export interface BuildPlanStateInputs {
  shopName: string;
  // financial_models row JSON — { forecast_inputs?, monthly_projections?, startup_costs? }
  financialModel: unknown;
  locationCandidates: BpLocationCandidate[];
  equipment: BpEquipmentItem[];
  hiringRoles: BpHiringRole[];
  // Optional precomputed blended menu COGS — same value /generate passes to
  // assembleFinancialPlan, kept here so we don't have to re-walk the menu rows.
  menuBlendedCogsPct: number | null;
  // TIM-2339: country (ISO-2) resolved by loadPlanContext from
  // plan_hiring_settings.hiring_country OR a signed location_candidate. When
  // provided, plan_state computes a region-aware tax profile and lender list
  // and OVERRIDES mp.income_tax_pct (only when the user is still on the engine
  // default 25%) so Y1 tax matches the regional rate.
  locationCountry?: string | null;
  // TIM-2340: user-entered competitors + explicit "no competitors" toggle
  // from the concept workspace, plus resolved city label for the geography
  // validator. Surfaced into plan_state.local_claims so the narrative prompt
  // names only real businesses and references only real adjacencies.
  competitors?: PlanStateCompetitor[];
  noDirectCompetitorsIdentified?: boolean;
  cityLabel?: string | null;
}

// ── Builder ──────────────────────────────────────────────────────────────────

const OPEX_LINE_LABELS: Record<string, string> = {
  rent: "Rent",
  marketing: "Marketing",
  utilities: "Utilities",
  insurance: "Insurance",
  tech: "Tech & Software",
  maintenance: "Maintenance",
  supplies: "Supplies",
  interest: "Interest",
  labor: "Labor",
};

const USE_OF_FUNDS_LABELS: Record<string, string> = {
  buildout_cents: "Build-out",
  equipment_cents: "Equipment",
  deposits_cents: "Deposits",
  licenses_cents: "Licenses & permits",
  pre_opening_marketing_cents: "Pre-opening marketing",
  initial_inventory_cents: "Initial inventory",
  startup_supplies_cents: "Startup supplies",
  professional_fees_cents: "Professional fees",
  working_capital_reserve_cents: "Working capital reserve",
  opening_cash_buffer_cents: "Opening cash buffer",
};

function steadyStateMonthly(line: ForecastLine, openDaysPerWeek: number, avgDailyCustomers: number, avgTicketCents: number): number {
  // For flat lines we return the literal monthly value. For % lines we apply
  // to steady-state monthly revenue (open days × 4.33 weeks × daily customers
  // × avg ticket). This is a "what the line costs in a typical post-ramp
  // month" view for the use-of-funds story — the precise per-month numbers
  // live in MonthlySlice.
  if (line.mode === "flat") return line.value;
  const monthlyRevenue = Math.round(openDaysPerWeek * (52 / 12) * avgDailyCustomers * avgTicketCents);
  return Math.round((line.value / 100) * monthlyRevenue);
}

function monthlyLoadedCost(p: PersonnelLine): number {
  // Mirrors the engine's loaded-cost calc closely enough for the narrative
  // ground-truth payload. The precise per-month numbers from the engine are
  // already in MonthlySlice; this is the steady-state per-role view that the
  // narrative quotes.
  const head = Math.max(0, p.headcount || 0);
  let basePayMonthly = 0;
  if (p.pay_basis === "monthly") basePayMonthly = p.pay_amount_cents;
  else if (p.pay_basis === "annual") basePayMonthly = Math.round(p.pay_amount_cents / 12);
  else basePayMonthly = Math.round((p.pay_amount_cents * (p.hours_per_week || 0) * 52) / 12);
  const benefits = Math.round((basePayMonthly * (p.benefits_pct || 0)) / 100) + (p.benefits_fixed_cents || 0);
  return (basePayMonthly + benefits) * head;
}

export function buildPlanState(inp: BuildPlanStateInputs): PlanState {
  // 1. Normalize financial model — same call /generate already makes for tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fm = (inp.financialModel ?? {}) as any;
  let mp: MonthlyProjections = normalizeMonthlyProjections(
    fm.forecast_inputs ?? fm.monthly_projections
  );

  // TIM-2338: apply coffee-shop vertical config (when present) BEFORE the
  // engine pass. The apply() step rewrites the rent line with the escalator,
  // adds wage growth onto personnel, weights COGS by product mix, synthesizes
  // capex lines from the equipment list, and configures cost inflation on
  // utilities/supplies/maintenance/insurance/marketing. Engine then runs over
  // the resulting MP, so financial tables AND the vertical report read the
  // same coherent monthly slices.
  const verticalCfg = readCoffeeShopVerticalConfig(mp.coffee_shop_vertical_config);
  if (verticalCfg) {
    mp = applyCoffeeShopVertical(mp, verticalCfg).mp;
  }

  // TIM-2339: resolve region BEFORE running the engine so we can override the
  // engine's flat 25% default with a region-aware rate (Alberta CCPC ~11%, US
  // C-corp 21% + state, UK Ltd 19%, etc.). The override only fires when the
  // user is at the engine default — if they explicitly customized the rate in
  // the financials workspace, that customization wins.
  const chosenForRegion = (inp.locationCandidates ?? []).find((c) => c.status === "chosen")
    ?? (inp.locationCandidates ?? [])[0]
    ?? null;
  // location_candidates carry `city` + `country` via the TIM-1145 address
  // autocomplete migration. They're not on the BpLocationCandidate type yet
  // (only `address` is) — read them defensively from the row object.
  const rawCity = chosenForRegion
    ? (chosenForRegion as unknown as { city?: string | null }).city ?? null
    : null;
  const rawCountry = (chosenForRegion as unknown as { country?: string | null } | null)?.country
    ?? inp.locationCountry
    ?? null;
  const region = resolveRegion({
    country: rawCountry,
    city: rawCity,
    address: chosenForRegion?.address ?? null,
  });

  const engineDefaultTaxPct = 25; // financial-projection.ts default — keep in sync
  let engineDefaultOverridden = false;
  let regionTaxProfile: TaxProfile | null = null;
  let regionLenderProfile: LenderProfile | null = null;
  if (region) {
    regionTaxProfile = getTaxProfile(region);
    regionLenderProfile = getLenderProfile(region);
    if (mp.income_tax_pct === engineDefaultTaxPct) {
      // Use the small-business rate for the initial slice pass — most new
      // shops sit well under the SBD threshold in Y1. effectiveIncomeTaxPct
      // re-checks below once we know projected Y1 income, in case a bigger
      // shop's projections push above the threshold.
      mp = { ...mp, income_tax_pct: regionTaxProfile.small_business_rate_pct };
      engineDefaultOverridden = true;
    }
  }

  // 2. Compute per-month slices — exactly the rollup the financial table renderer uses.
  const totalEquipCostUsd = (inp.equipment ?? []).reduce(
    (sum, e) => sum + (e.cost_local ?? 0), 0
  );
  const equipSummary: EquipmentSummary = {
    total_cost_cents: Math.round(totalEquipCostUsd * 100),
    financed_cost_cents: Math.round(totalEquipCostUsd * 100),
  };
  let slices: MonthlySlice[] = computeMonthlySlices(mp, equipSummary, {}, {
    menu_blended_cogs_pct: inp.menuBlendedCogsPct ?? null,
  });

  // TIM-2339: if the initial Y1 projected income blows past the small-business
  // threshold (rare for new shops, but possible), re-run with the general rate.
  if (engineDefaultOverridden && regionTaxProfile && regionTaxProfile.small_business_threshold_cents != null) {
    const y1Pre = slices.filter((s) => s.year === 1);
    const projectedY1Income = y1Pre.reduce((a, r) => a + r.net_income_cents, 0);
    const effective = effectiveIncomeTaxPct(regionTaxProfile, projectedY1Income);
    if (Math.abs(effective - mp.income_tax_pct) > 0.001) {
      mp = { ...mp, income_tax_pct: effective };
      slices = computeMonthlySlices(mp, equipSummary, {}, {
        menu_blended_cogs_pct: inp.menuBlendedCogsPct ?? null,
      });
    }
  }

  // 3. Capital stack — funding_sources is the source of truth.
  const fundingSources = mp.funding_sources ?? [];
  const sumKind = (kind: FundingKind) =>
    fundingSources.filter((s) => s.kind === kind).reduce((acc, s) => acc + (s.amount_cents || 0), 0);
  const founderEquity = sumKind("founder_equity");
  const investorEquity = sumKind("investor_equity");
  const grants = sumKind("grant");
  const debt = sumKind("loan");
  const equity = founderEquity + investorEquity + grants;
  const capitalStack: PlanStateCapitalStack = {
    total_raise_cents: equity + debt,
    equity_cents: equity,
    debt_cents: debt,
    founder_equity_cents: founderEquity,
    investor_equity_cents: investorEquity,
    grants_cents: grants,
    sources: fundingSources.map((s) => ({
      kind: s.kind,
      label: s.label,
      amount_cents: s.amount_cents || 0,
      ...(s.kind === "loan"
        ? { term_months: s.term_months, annual_rate_pct: s.annual_rate_pct }
        : {}),
    })),
  };

  // 4. Use of funds — startup_costs persisted on MonthlyProjections.
  const sc = mp.startup_costs ?? defaultStartupCosts();
  const useLines: PlanStateUseOfFundsLine[] = [];
  for (const [key, label] of Object.entries(USE_OF_FUNDS_LABELS)) {
    const cents = Number((sc as unknown as Record<string, number>)[key] ?? 0);
    if (cents > 0) useLines.push({ key, label, amount_cents: cents });
  }
  const useTotal = useLines.reduce((a, l) => a + l.amount_cents, 0);

  // 5. Revenue assumptions.
  const openDaysPerWeek = Object.values(mp.weekly_schedule).filter((d) => d.open).length;
  const openDailyFlow = (Object.entries(mp.weekly_schedule) as [keyof typeof mp.weekly_schedule, { open: boolean }][])
    .filter(([, d]) => d.open)
    .reduce((sum, [k]) => sum + (mp.daily_flow[k] ?? 0), 0);
  const avgDailyCustomers = openDaysPerWeek > 0 ? Math.round(openDailyFlow / openDaysPerWeek) : 0;
  const revenue: PlanStateRevenue = {
    avg_ticket_cents: mp.avg_ticket_cents,
    customers_per_day_avg: avgDailyCustomers,
    open_days_per_week: openDaysPerWeek,
    ramp_months: mp.ramp_months,
    growth_mode: mp.growth_mode,
    growth_monthly_pct: mp.growth_monthly_pct,
  };

  // 6. COGS rates — blended is computed (not entered), so the narrative MUST
  // quote what the financial engine actually computes, not workspace assumptions.
  // We compute the blended Y1 COGS rate from the actual slices (post-ramp,
  // averaged across months 1..12). That matches what the P&L will show.
  const y1 = slices.filter((s) => s.year === 1);
  const y1RevenueCents = y1.reduce((a, r) => a + r.net_revenue_cents, 0);
  const y1CogsCents = y1.reduce((a, r) => a + r.total_cogs_cents, 0);
  const blendedPct = y1RevenueCents > 0
    ? Math.round((y1CogsCents / y1RevenueCents) * 1000) / 10
    : 0;
  const cogs: PlanStateCogs = {
    blended_pct: blendedPct,
    base_cogs_pct: mp.cogs_pct,
    menu_blended_pct: inp.menuBlendedCogsPct,
  };

  // 7. Labor — personnel is the canonical source of truth. We also surface
  // the workspace hiring_plan_roles count so divergence is visible to whoever
  // reads plan_state — but the AUTHORITATIVE headcount and payroll come from
  // MonthlyProjections.personnel, the same source the financial tables use.
  const personnelRoles: PlanStateLaborRole[] = (mp.personnel ?? []).map((p) => ({
    role: p.role,
    headcount: p.headcount || 0,
    pay_basis: p.pay_basis,
    pay_amount_cents: p.pay_amount_cents,
    hours_per_week: p.hours_per_week ?? null,
    cost_category: p.cost_category,
    monthly_loaded_cost_cents: monthlyLoadedCost(p),
  }));
  const totalHeadcount = personnelRoles.reduce((a, r) => a + r.headcount, 0);
  const monthlyLoadedTotal = personnelRoles.reduce((a, r) => a + r.monthly_loaded_cost_cents, 0);
  const cogsMonthly = personnelRoles
    .filter((r) => r.cost_category === "cogs")
    .reduce((a, r) => a + r.monthly_loaded_cost_cents, 0);
  const overheadMonthly = personnelRoles
    .filter((r) => r.cost_category === "overhead")
    .reduce((a, r) => a + r.monthly_loaded_cost_cents, 0);
  const labor: PlanStateLabor = {
    total_headcount: totalHeadcount,
    monthly_loaded_cost_cents: monthlyLoadedTotal,
    cogs_monthly_cents: cogsMonthly,
    overhead_monthly_cents: overheadMonthly,
    roles: personnelRoles,
    owner_draws_monthly_cents: mp.owner_draws_monthly_cents ?? 0,
  };
  void inp.hiringRoles; // captured for future divergence diagnostics; not authoritative here

  // 8. Lease — chosen location candidate provides the address & sq ft; rent
  // comes from the rent forecast_line. If the rent line is missing or zero,
  // monthly_rent_cents is 0 — the SAME value the P&L will show. Investor
  // critique #3: narrative claimed rent $4,880/mo, P&L showed $0 — that's
  // exactly the divergence this field eliminates.
  const rentLine = (mp.forecast_lines ?? []).find((l) => l.legacy_key === "rent");
  const rentMonthlyCents = rentLine?.mode === "flat" ? rentLine.value : 0;
  const chosen = (inp.locationCandidates ?? []).find((c) => c.status === "chosen")
    ?? (inp.locationCandidates ?? [])[0]
    ?? null;
  const lease: PlanStateLease = {
    monthly_rent_cents: rentMonthlyCents,
    chosen_location_name: chosen?.name ?? null,
    chosen_address: chosen?.address ?? null,
    sq_ft: chosen?.sq_ft ?? null,
  };

  // 9. Opex — itemized monthly steady-state per forecast_line (overhead only).
  const opexLines: PlanStateOpexLine[] = (mp.forecast_lines ?? [])
    .filter((l) => l.category === "overhead")
    .map((l) => ({
      key: l.legacy_key ?? l.id,
      label: OPEX_LINE_LABELS[l.legacy_key ?? ""] ?? l.label,
      monthly_cents: steadyStateMonthly(l, openDaysPerWeek, avgDailyCustomers, mp.avg_ticket_cents),
    }))
    .filter((l) => l.monthly_cents > 0);
  const opex: PlanStateOpex = {
    monthly_total_cents: opexLines.reduce((a, l) => a + l.monthly_cents, 0),
    lines: opexLines,
  };

  // 10. Capex — total from MonthlyProjections (forecast_lines + startup_costs).
  const capex: PlanStateCapex = {
    total_cents: totalCapexCents(mp),
    equipment_count: (inp.equipment ?? []).length,
    buildout_useful_life_years: sc.buildout_useful_life_years ?? 15,
    equipment_useful_life_years: sc.equipment_useful_life_years ?? 7,
  };

  // 11. Tax.
  const tax: PlanStateTax = {
    income_tax_pct: mp.income_tax_pct ?? 0,
    sales_tax_pct: mp.sales_tax_pct ?? 0,
    engine_default_overridden: engineDefaultOverridden,
    region_profile: regionTaxProfile,
  };

  // 12. Years 1..5 — summed from the same slices the financial tables use,
  // so narrative "Y1 net income" matches "Y1 net income" in the P&L exactly.
  const years: PlanStateYearSummary[] = [];
  for (let yr = 1; yr <= 5; yr++) {
    const yrSlices = slices.filter((s) => s.year === yr);
    if (yrSlices.length === 0) continue;
    years.push({
      year: yr,
      revenue_cents: yrSlices.reduce((a, r) => a + r.net_revenue_cents, 0),
      cogs_cents: yrSlices.reduce((a, r) => a + r.total_cogs_cents, 0),
      gross_profit_cents: yrSlices.reduce((a, r) => a + (r.net_revenue_cents - r.total_cogs_cents), 0),
      total_opex_cents: yrSlices.reduce((a, r) => a + r.total_opex_cents, 0),
      operating_income_cents: yrSlices.reduce((a, r) => a + r.operating_income_cents, 0),
      net_income_cents: yrSlices.reduce((a, r) => a + r.net_income_cents, 0),
      ending_cash_cents: yrSlices[yrSlices.length - 1].cash_cents,
    });
  }

  // 13. Break-even — first month with positive net income.
  const firstProfitable = slices.find((s) => s.net_income_cents > 0);
  const breakEven: PlanStateBreakEven = {
    first_profitable_month_index: firstProfitable?.month_index ?? null,
  };

  // TIM-2338: compute the vertical report from the SAME slices the financial
  // tables read, so labor-by-year, lease 5-yr total, working-capital deltas,
  // and depreciation match the P&L line-for-line.
  const verticalModel = verticalCfg ? computeVerticalReport(mp, verticalCfg, slices) : null;

  // TIM-2337: canonical entity registry — proper nouns the narrative is
  // allowed to reference. Pulls from the same structured workspaces the
  // financial side already trusts (equipment, location_candidates, hiring,
  // funding_sources) plus a built-in coffee-brand vocabulary.
  const entities = buildPlanStateEntities({
    shopName: inp.shopName,
    locationCandidates: inp.locationCandidates ?? [],
    equipment: inp.equipment ?? [],
    hiringRoles: inp.hiringRoles ?? [],
    fundingSources: extractFundingSourcesForEntities(mp),
  });

  // TIM-2340: local-claims block — user-entered competitors + city label.
  // If the caller didn't provide a cityLabel, fall back to the chosen
  // location_candidate's city field (read defensively — the BpLocationCandidate
  // type only declares address, but city is on the row via TIM-1145).
  const fallbackCityLabel = chosen
    ? ((chosen as unknown as { city?: string | null }).city ?? null)
    : null;
  const local_claims = buildLocalClaims({
    competitors: inp.competitors ?? [],
    noDirectCompetitorsIdentified: inp.noDirectCompetitorsIdentified ?? false,
    cityLabel: inp.cityLabel ?? fallbackCityLabel ?? null,
  });

  // TIM-2341: lender-ready metrics. Same engine slices the financial tables
  // already use — sensitivity re-runs the same engine with one perturbed
  // input, DSCR pulls EBITDA + debt-service straight from the slices.
  const lender_metrics = buildLenderMetrics({
    mp,
    slices,
    equipment: equipSummary,
    menuBlendedCogsPct: inp.menuBlendedCogsPct ?? null,
  });

  return {
    meta: {
      shop_name: inp.shopName,
      currency_code: mp.currency_code,
      fiscal_year_start_month: mp.fiscal_year_start_month,
    },
    capital_stack: capitalStack,
    use_of_funds: { total_cents: useTotal, lines: useLines },
    revenue,
    cogs,
    labor,
    lease,
    opex,
    capex,
    tax,
    region,
    lender_profile: regionLenderProfile,
    years,
    break_even: breakEven,
    vertical_model: verticalModel,
    entities,
    local_claims,
    lender_metrics,
  };
}

// ── Narrative-ground-truth serializer ────────────────────────────────────────
// Renders plan_state into a compact "Ground Truth Numbers" block that the
// narrative LLM is forced to quote verbatim. The exact same numbers will
// appear in the financial tables — so narrative + tables can no longer
// describe two different businesses.

function fmtCents(cents: number, currencyCode: string): string {
  // Render as a dollar figure with grouping. Currency code surfaces via the
  // ISO code (e.g. "USD 4,880/mo") rather than a symbol so non-USD plans
  // render unambiguously and the LLM has no ambiguity to "fix" by guessing.
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const hasDecimals = Math.abs(dollars - Math.round(dollars)) > 0.005;
  const formatted = hasDecimals
    ? abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(abs).toLocaleString("en-US");
  const sign = dollars < 0 ? "-" : "";
  return `${sign}${currencyCode} ${formatted}`;
}

export function formatPlanStateForPrompt(state: PlanState): string {
  const cc = state.meta.currency_code;
  const c = (n: number) => fmtCents(n, cc);
  const lines: string[] = [];
  lines.push(`Ground Truth Numbers — these are the EXACT figures the financial tables will show.`);
  lines.push(`Quote them verbatim in narrative text. Do not round to different round numbers. Do not invent additional numeric claims that are not in this block.`);
  lines.push("");
  lines.push(`Shop: ${state.meta.shop_name} (currency ${cc})`);
  lines.push("");

  // Capital stack
  lines.push(`Capital Stack`);
  lines.push(`- Total raise: ${c(state.capital_stack.total_raise_cents)}`);
  lines.push(`- Equity: ${c(state.capital_stack.equity_cents)} (founder ${c(state.capital_stack.founder_equity_cents)}, investor ${c(state.capital_stack.investor_equity_cents)}, grants ${c(state.capital_stack.grants_cents)})`);
  lines.push(`- Debt: ${c(state.capital_stack.debt_cents)}`);
  for (const s of state.capital_stack.sources) {
    const loanBits = s.kind === "loan" && s.term_months
      ? ` (${s.term_months}mo @ ${s.annual_rate_pct ?? 0}%)`
      : "";
    lines.push(`  · ${s.label} [${s.kind}]: ${c(s.amount_cents)}${loanBits}`);
  }
  lines.push("");

  // Use of funds
  lines.push(`Use of Funds — total ${c(state.use_of_funds.total_cents)}`);
  for (const l of state.use_of_funds.lines) {
    lines.push(`- ${l.label}: ${c(l.amount_cents)}`);
  }
  lines.push("");

  // Revenue
  lines.push(`Revenue Assumptions`);
  lines.push(`- Avg ticket: ${c(state.revenue.avg_ticket_cents)}`);
  lines.push(`- Customers/day (avg open day): ${state.revenue.customers_per_day_avg}`);
  lines.push(`- Open days/week: ${state.revenue.open_days_per_week}`);
  lines.push(`- Ramp: ${state.revenue.ramp_months} months`);
  lines.push(`- Growth: ${state.revenue.growth_mode === "simple" ? `${state.revenue.growth_monthly_pct}%/mo` : "custom monthly"}`);
  lines.push("");

  // COGS
  lines.push(`COGS`);
  lines.push(`- Blended Year-1 rate (computed): ${state.cogs.blended_pct}%`);
  lines.push(`- Base foot-traffic COGS: ${state.cogs.base_cogs_pct}%`);
  if (state.cogs.menu_blended_pct != null) {
    lines.push(`- Menu blended COGS: ${state.cogs.menu_blended_pct}%`);
  }
  lines.push("");

  // Labor — the headcount used in the financial tables.
  lines.push(`Labor — TOTAL HEADCOUNT ${state.labor.total_headcount}, monthly loaded payroll ${c(state.labor.monthly_loaded_cost_cents)}`);
  lines.push(`- COGS labor (direct service): ${c(state.labor.cogs_monthly_cents)}/mo`);
  lines.push(`- Overhead labor: ${c(state.labor.overhead_monthly_cents)}/mo`);
  for (const r of state.labor.roles) {
    const payBits = r.pay_basis === "hourly"
      ? `${c(r.pay_amount_cents)}/hr × ${r.hours_per_week ?? 0}hrs/wk`
      : r.pay_basis === "annual"
        ? `${c(r.pay_amount_cents)}/yr`
        : `${c(r.pay_amount_cents)}/mo`;
    lines.push(`  · ${r.role} ×${r.headcount} [${r.cost_category}] — ${payBits} (loaded ${c(r.monthly_loaded_cost_cents)}/mo)`);
  }
  if (state.labor.owner_draws_monthly_cents > 0) {
    lines.push(`- Owner draws: ${c(state.labor.owner_draws_monthly_cents)}/mo`);
  }
  lines.push("");

  // Lease
  lines.push(`Lease`);
  lines.push(`- Monthly rent (as it appears on the P&L every month): ${c(state.lease.monthly_rent_cents)}`);
  if (state.lease.chosen_location_name) lines.push(`- Chosen location: ${state.lease.chosen_location_name}`);
  if (state.lease.chosen_address) lines.push(`- Address: ${state.lease.chosen_address}`);
  if (state.lease.sq_ft) lines.push(`- Size: ${state.lease.sq_ft.toLocaleString()} sq ft`);
  lines.push("");

  // Opex
  if (state.opex.lines.length > 0) {
    lines.push(`Operating Expenses — monthly steady-state ${c(state.opex.monthly_total_cents)}`);
    for (const l of state.opex.lines) {
      lines.push(`- ${l.label}: ${c(l.monthly_cents)}/mo`);
    }
    lines.push("");
  }

  // Capex
  lines.push(`Capital Assets`);
  lines.push(`- Total capex: ${c(state.capex.total_cents)} (${state.capex.equipment_count} equipment items)`);
  lines.push(`- Depreciation: build-out ${state.capex.buildout_useful_life_years}yr, equipment ${state.capex.equipment_useful_life_years}yr straight-line`);
  lines.push("");

  // Tax
  lines.push(`Tax`);
  lines.push(`- Income tax (rate the financial tables use for Y1 tax expense): ${state.tax.income_tax_pct}%`);
  lines.push(`- Sales tax (pass-through, not on P&L): ${state.tax.sales_tax_pct}%`);
  if (state.tax.region_profile) {
    lines.push(`- Entity type the rate assumes: ${state.tax.region_profile.entity_label}`);
    if (state.tax.engine_default_overridden) {
      lines.push(`- Rate was set from the region profile (${state.tax.region_profile.region_label}); the workspace was on the engine default before this regeneration.`);
    }
  }
  lines.push("");

  // 5-year summary
  if (state.years.length > 0) {
    lines.push(`5-Year Summary — these EXACT figures will appear in the Projected P&L and Net Profit by Year tables`);
    for (const y of state.years) {
      lines.push(`- Year ${y.year}: Revenue ${c(y.revenue_cents)}, COGS ${c(y.cogs_cents)}, Gross Profit ${c(y.gross_profit_cents)}, Operating Income ${c(y.operating_income_cents)}, Net Income ${c(y.net_income_cents)}, Ending Cash ${c(y.ending_cash_cents)}`);
    }
    lines.push("");
  }

  // Break-even
  if (state.break_even.first_profitable_month_index != null) {
    const m = state.break_even.first_profitable_month_index;
    const yr = Math.ceil(m / 12);
    const monthInYr = ((m - 1) % 12) + 1;
    lines.push(`Break-even: first profitable month is month ${m} of operations (Year ${yr}, month ${monthInYr})`);
  } else {
    lines.push(`Break-even: no profitable month within the projection horizon`);
  }

  // TIM-2338: vertical model block — appended only when the plan has a
  // coffee-shop vertical config. Adds daypart staffing, lease 5-yr total,
  // labor by year, depreciation schedule, and working capital so the
  // narrative quotes investor-grade structural detail verbatim.
  if (state.vertical_model) {
    lines.push("");
    lines.push(formatVerticalReportForPrompt(state.vertical_model, cc));
  }

  // TIM-2339: region + lender block. Investor critique called out the regen
  // referencing SBA financing in a Calgary plan and applying a generic 25%
  // tax rate. This block forces the narrative to (a) cite only lenders that
  // exist in the region and (b) match the financial-table tax expense the
  // engine just computed.
  if (state.region && state.tax.region_profile && state.lender_profile) {
    lines.push("");
    lines.push(formatRegionForPrompt(state.region, state.tax.region_profile, state.lender_profile));
  }

  // TIM-2337: controlled vocabulary block — canonical spellings for every
  // proper noun the narrative is allowed to use. The post-generation
  // canonicalizer rewrites aliases and Levenshtein ≤ 2 near-misses, but
  // surfacing the registry into the prompt itself nudges the model away
  // from inventing variants in the first place.
  if (state.entities && state.entities.length > 0) {
    // TIM-2486: pass the plan's currency code so equipment cost lines render
    // as e.g. "CAD 6,800" instead of "$6,800" — eliminates a USD inference
    // path for the LLM on international plans.
    const block = formatEntitiesForPrompt(state.entities, state.meta.currency_code);
    if (block) {
      lines.push("");
      lines.push(block);
    }
  }

  // TIM-2340: local-claims directive + block. Forbids inventing pedestrian
  // counts, demographic stats, competitor addresses, and cross-region
  // neighborhood adjacencies; gives the LLM sentinel hedge phrases for the
  // qualitative fallback so voice quality stays grounded.
  lines.push("");
  lines.push(LOCAL_CLAIMS_DIRECTIVE);
  lines.push("");
  lines.push(formatLocalClaimsForPrompt(state.local_claims));

  // TIM-2341: lender-ready metrics block. Surfaces unit economics buildup,
  // sensitivity, DSCR, break-even, CapEx schedule, depreciation schedule,
  // and working-capital requirement so every lender-stakeholder claim the
  // narrative makes matches the engine's own numbers verbatim.
  lines.push("");
  lines.push(formatLenderMetricsForPrompt(state.lender_metrics, cc));

  return lines.join("\n").trim();
}
