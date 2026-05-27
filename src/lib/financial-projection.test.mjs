// TIM-1102: pin computeMonthlyProjections against the new forecast_lines schema.
// TIM-1122: pin funding_sources roll-up + per-loan amortization.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultMonthlyProjections,
  normalizeMonthlyProjections,
  computeMonthlyProjections,
  computeMonthlySlices,
} from "./financial-projection.ts";

test("default model has forecast_lines seeded with legacy overhead keys", () => {
  const mp = defaultMonthlyProjections();
  assert.ok(Array.isArray(mp.forecast_lines));
  assert.ok(mp.forecast_lines.find((l) => l.legacy_key === "labor"));
  assert.ok(mp.forecast_lines.find((l) => l.legacy_key === "rent"));
  assert.ok(mp.forecast_lines.find((l) => l.legacy_key === "marketing"));
});

test("legacy stored payload (no forecast_lines) migrates into labeled lines", () => {
  const raw = {
    avg_ticket_cents: 700,
    cogs_pct: 30,
    labor: { mode: "pct", pct: 28, flat_cents: 0 },
    monthly_rent_cents: 500000,
    marketing: { mode: "pct", pct: 2, flat_cents: 0 },
    utilities_monthly_cents: 70000,
  };
  const mp = normalizeMonthlyProjections(raw);
  const labor = mp.forecast_lines.find((l) => l.legacy_key === "labor");
  assert.equal(labor?.value, 28);
  assert.equal(labor?.mode, "pct");
  const rent = mp.forecast_lines.find((l) => l.legacy_key === "rent");
  assert.equal(rent?.value, 500000);
  assert.equal(rent?.mode, "flat");
});

test("computeMonthlyProjections rolls overhead lines into legacy named fields", () => {
  const mp = defaultMonthlyProjections();
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows.length, 60);
  // Month 12 should have full ramp + 11 months of compounding growth
  const m12 = rows[11];
  assert.ok(m12.revenue_cents > 0);
  assert.ok(m12.labor_cents > 0, "labor rolled up");
  assert.ok(m12.rent_cents > 0, "rent rolled up");
});

test("per-line ramp: line at 50% start_pct over 3 mo doubles by month 3", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    {
      id: "x",
      label: "Salary",
      category: "overhead",
      mode: "flat",
      value: 100000,
      ramp: { enabled: true, start_month: 1, ramp_months: 3, start_pct: 50 },
    },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // m1 ≈ 50% of 100000 = 50000; m3 ≈ 100%; m4+ = 100000
  assert.equal(rows[0].other_misc_cents, 50000);
  assert.equal(rows[2].other_misc_cents, 100000);
  assert.equal(rows[3].other_misc_cents, 100000);
});

test("per-line growth compounds monthly after ramp completes", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    {
      id: "x",
      label: "Subscription",
      category: "overhead",
      mode: "flat",
      value: 10000,
      growth: { enabled: true, monthly_pct: 10 },
    },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].other_misc_cents, 10000); // m1: base
  assert.equal(rows[1].other_misc_cents, 11000); // m2: +10%
  assert.equal(rows[2].other_misc_cents, 12100); // m3: +10% compounded
});

test("pct-mode line: 5% of revenue scales with revenue", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    { id: "x", label: "Royalty", category: "overhead", mode: "pct", value: 5 },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].other_misc_cents, Math.round(rows[0].revenue_cents * 0.05));
});

test("capex line: full charge in start_month only", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    {
      id: "espresso",
      label: "Espresso Machine",
      category: "capex",
      mode: "flat",
      value: 1500000,
      ramp: { enabled: true, start_month: 4, ramp_months: 0, start_pct: 100 },
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[2].capex_cents, 0);
  assert.equal(rows[3].capex_cents, 1500000); // month 4
  assert.equal(rows[4].capex_cents, 0);
});

// ── TIM-1101: currency persistence ────────────────────────────────────────────

test("default model has USD as default currency_code", () => {
  const mp = defaultMonthlyProjections();
  assert.equal(mp.currency_code, "USD");
});

test("normalize accepts a valid ISO 4217 code and uppercases it", () => {
  const mp = normalizeMonthlyProjections({ currency_code: "eur" });
  assert.equal(mp.currency_code, "EUR");
});

test("normalize falls back to USD for unknown / invalid currency code", () => {
  assert.equal(normalizeMonthlyProjections({ currency_code: "ZZZ" }).currency_code, "USD");
  assert.equal(normalizeMonthlyProjections({ currency_code: 42 }).currency_code, "USD");
  assert.equal(normalizeMonthlyProjections({}).currency_code, "USD");
});

// ── TIM-1122: funding_sources ─────────────────────────────────────────────────

test("default model seeds founder equity + a starter loan in funding_sources", () => {
  const mp = defaultMonthlyProjections();
  assert.ok(Array.isArray(mp.funding_sources));
  assert.ok(mp.funding_sources.find((s) => s.kind === "founder_equity"));
  const loan = mp.funding_sources.find((s) => s.kind === "loan");
  assert.ok(loan);
  assert.ok((loan.term_months ?? 0) > 0);
});

test("normalize migrates legacy owner_capital_cents / loan_amount_cents into funding_sources", () => {
  const mp = normalizeMonthlyProjections({
    owner_capital_cents: 12000000,
    loan_amount_cents: 8000000,
    loan_term_months: 36,
    loan_annual_rate_pct: 5,
  });
  const founder = mp.funding_sources.find((s) => s.kind === "founder_equity");
  const loan = mp.funding_sources.find((s) => s.kind === "loan");
  assert.equal(founder?.amount_cents, 12000000);
  assert.equal(loan?.amount_cents, 8000000);
  assert.equal(loan?.term_months, 36);
});

test("funding_sources drive owner_equity + loan balance + amortization", () => {
  const mp = defaultMonthlyProjections();
  mp.funding_sources = [
    { id: "f1", kind: "founder_equity", label: "Founder", amount_cents: 5000000 },
    { id: "i1", kind: "investor_equity", label: "Investor", amount_cents: 2000000, pct_ownership: 20 },
    { id: "g1", kind: "grant", label: "City Grant", amount_cents: 500000 },
    { id: "l1", kind: "loan", label: "Bank", amount_cents: 6000000, term_months: 60, annual_rate_pct: 6 },
  ];
  const slices = computeMonthlySlices(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  const m1 = slices[0];
  // Equity composition
  assert.equal(m1.founder_equity_cents, 5000000);
  assert.equal(m1.investor_equity_cents, 2000000);
  assert.equal(m1.grants_cents, 500000);
  assert.equal(m1.owner_equity_cents, 7500000); // founder + investor + grant
  // Loan: starts at face value, amortizes down each month
  assert.ok(m1.long_term_debt_cents > 0);
  assert.ok(m1.long_term_debt_cents < 6000000, "balance reduced after 1st payment");
  assert.ok(m1.loan_repayment_cents > 0);
});

test("two separate loans amortize independently and sum repayments", () => {
  const mp = defaultMonthlyProjections();
  mp.funding_sources = [
    { id: "f1", kind: "founder_equity", label: "F", amount_cents: 1000000 },
    { id: "l1", kind: "loan", label: "SBA", amount_cents: 4000000, term_months: 60, annual_rate_pct: 6 },
    { id: "l2", kind: "loan", label: "Eq", amount_cents: 1000000, term_months: 24, annual_rate_pct: 9 },
  ];
  const slices = computeMonthlySlices(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  const m1 = slices[0];
  // Combined starting balance is approx 5M (less first month's principal)
  assert.ok(m1.long_term_debt_cents > 4500000 && m1.long_term_debt_cents < 5000000);
  // After 24 months the shorter loan should be fully amortized; the longer one is still outstanding
  const m24 = slices[23];
  assert.ok(m24.long_term_debt_cents > 0 && m24.long_term_debt_cents < 3000000);
  // After 60 months everything should be (nearly) paid off
  const m60 = slices[59];
  assert.ok(m60.long_term_debt_cents < 100000);
});
