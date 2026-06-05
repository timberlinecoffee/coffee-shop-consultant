// TIM-2339: tax-profiles unit tests. Pins:
//   - Region resolution from country + city + address
//   - Tax profile rates for the three fixture jurisdictions (Calgary, Seattle,
//     London) per the issue's acceptance criteria
//   - Lender allowlist / forbidden-list per region (no SBA in Canadian plans)
//   - Effective income-tax rate respects tiered regimes
//   - Region prompt block emits the required strings the LLM must quote

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveRegion,
  getTaxProfile,
  getLenderProfile,
  effectiveIncomeTaxPct,
  formatRegionForPrompt,
} from "./tax-profiles.ts";

// ── Region resolution ────────────────────────────────────────────────────────

test("resolveRegion picks province from address text (Calgary)", () => {
  const r = resolveRegion({ country: "CA", city: "Calgary", address: "1402 14 St SW, Calgary, AB T3C 1C9" });
  assert.equal(r.country, "CA");
  assert.equal(r.country_name, "Canada");
  assert.equal(r.state_or_province, "AB");
  assert.equal(r.state_or_province_name, "Alberta");
  assert.equal(r.city, "Calgary");
});

test("resolveRegion picks province from full-name address (Alberta spelled out)", () => {
  const r = resolveRegion({ country: "CA", city: null, address: "Some place, Calgary, Alberta, Canada" });
  assert.equal(r.state_or_province, "AB");
});

test("resolveRegion falls back to city → province lookup", () => {
  const r = resolveRegion({ country: "CA", city: "Edmonton", address: null });
  assert.equal(r.state_or_province, "AB");
});

test("resolveRegion picks state from US address (Seattle)", () => {
  const r = resolveRegion({ country: "US", city: "Seattle", address: "1400 5th Ave, Seattle, WA 98101" });
  assert.equal(r.country, "US");
  assert.equal(r.state_or_province, "WA");
  assert.equal(r.state_or_province_name, "Washington");
});

test("resolveRegion handles UK (no subdivision needed)", () => {
  const r = resolveRegion({ country: "GB", city: "London", address: "10 Carnaby St, London W1F 9PR" });
  assert.equal(r.country, "GB");
  assert.equal(r.country_name, "United Kingdom");
  assert.equal(r.state_or_province, null);
  assert.equal(r.city, "London");
});

test("resolveRegion accepts full-name country variants", () => {
  assert.equal(resolveRegion({ country: "Canada", city: null, address: null }).country, "CA");
  assert.equal(resolveRegion({ country: "United States", city: null, address: null }).country, "US");
  assert.equal(resolveRegion({ country: "United Kingdom", city: null, address: null }).country, "GB");
  assert.equal(resolveRegion({ country: "USA", city: null, address: null }).country, "US");
});

test("resolveRegion returns null when no country", () => {
  assert.equal(resolveRegion({ country: null, city: "Somewhere", address: "123 Main St" }), null);
  assert.equal(resolveRegion({ country: "ZZ", city: null, address: null }), null);
});

// ── Tax profile — Calgary (CCPC Alberta) ─────────────────────────────────────

test("getTaxProfile Calgary returns CCPC Alberta rates (acceptance #1)", () => {
  const region = resolveRegion({ country: "CA", city: "Calgary", address: "Calgary, AB" });
  const p = getTaxProfile(region);
  assert.equal(p.entity_type, "CA-CCPC");
  // Investor critique on TIM-2315: "CCPCs pay ~11% on the first $500K of
  // active business income in Alberta." This is the rate the regenerated
  // plan should now use.
  assert.equal(p.small_business_rate_pct, 11);
  assert.ok(p.general_rate_pct > p.small_business_rate_pct, "general rate must exceed small-business rate");
  // SBD ceiling $500K → 50_000_000 cents.
  assert.equal(p.small_business_threshold_cents, 50_000_000);
  // Alberta has GST only (5%), no PST.
  assert.equal(p.sales_tax_name, "GST");
  assert.equal(p.sales_tax_pct, 5);
  assert.equal(p.region_label, "Alberta CCPC");
  assert.ok(p.notes.some((n) => /Small Business Deduction/i.test(n)));
});

test("getTaxProfile Ontario CCPC uses HST 13%", () => {
  const region = resolveRegion({ country: "CA", city: "Toronto", address: "1 King St W, Toronto, ON" });
  const p = getTaxProfile(region);
  assert.equal(p.entity_type, "CA-CCPC");
  assert.equal(p.sales_tax_name, "HST");
  assert.equal(p.sales_tax_pct, 13);
});

// ── Tax profile — Seattle (US C-corp Washington) ─────────────────────────────

test("getTaxProfile Seattle returns US C-corp rates (acceptance #2)", () => {
  const region = resolveRegion({ country: "US", city: "Seattle", address: "1400 5th Ave, Seattle, WA 98101" });
  const p = getTaxProfile(region);
  assert.equal(p.entity_type, "US-CCorp");
  // Washington has no state corporate income tax → federal 21% only.
  assert.equal(p.small_business_rate_pct, 21);
  assert.equal(p.general_rate_pct, 21); // no tier for US C-corp
  assert.equal(p.small_business_threshold_cents, null);
  // Acceptance criterion implicit: narrative should mention WA B&O tax, not
  // a state corporate income tax.
  assert.ok(p.notes.some((n) => /B&O tax|gross receipts/i.test(n)));
});

test("getTaxProfile US C-corp w/ state corporate tax combines federal + state", () => {
  const region = resolveRegion({ country: "US", city: "Portland", address: "Portland, OR" });
  const p = getTaxProfile(region);
  assert.equal(p.entity_type, "US-CCorp");
  // Oregon 7.6 + federal 21 = 28.6 combined.
  assert.equal(p.small_business_rate_pct, 28.6);
});

// ── Tax profile — London (UK Ltd) ────────────────────────────────────────────

test("getTaxProfile London returns UK Ltd tiered rates (acceptance #3)", () => {
  const region = resolveRegion({ country: "GB", city: "London", address: "10 Carnaby St, London W1F 9PR" });
  const p = getTaxProfile(region);
  assert.equal(p.entity_type, "UK-Ltd");
  assert.equal(p.small_business_rate_pct, 19); // small-profits rate up to £50K
  assert.equal(p.general_rate_pct, 25);        // main rate above £250K
  assert.equal(p.sales_tax_name, "VAT");
  assert.equal(p.sales_tax_pct, 20);
});

// ── Tax profile — EU spot-checks ─────────────────────────────────────────────

test("getTaxProfile Germany returns GmbH ~30% with 19% VAT", () => {
  const region = resolveRegion({ country: "DE", city: "Berlin", address: null });
  const p = getTaxProfile(region);
  assert.equal(p.entity_type, "EU-GmbH");
  assert.ok(p.small_business_rate_pct >= 25 && p.small_business_rate_pct <= 35);
  assert.match(p.sales_tax_name, /VAT/);
  assert.equal(p.sales_tax_pct, 19);
});

// ── Lender profile — investor critique: no SBA in Canadian plans ─────────────

test("getLenderProfile CA forbids SBA references (acceptance #4)", () => {
  const region = resolveRegion({ country: "CA", city: "Calgary", address: "Calgary, AB" });
  const l = getLenderProfile(region);
  // Allowed list must include BDC.
  assert.ok(l.allowed.some((a) => /BDC/i.test(a)), "BDC must be in CA allowed lender list");
  // SBA must be on the forbidden list.
  assert.ok(l.forbidden.some((f) => /SBA/i.test(f)), "SBA must be on the CA forbidden list");
  assert.equal(l.primary_program, "BDC Small Business Loan");
});

test("getLenderProfile US allows SBA, forbids BDC", () => {
  const region = resolveRegion({ country: "US", city: "Seattle", address: "Seattle, WA" });
  const l = getLenderProfile(region);
  assert.ok(l.allowed.some((a) => /SBA/i.test(a)));
  assert.ok(l.forbidden.some((f) => /BDC/i.test(f)));
});

test("getLenderProfile GB forbids SBA + BDC, allows British Business Bank", () => {
  const region = resolveRegion({ country: "GB", city: "London", address: null });
  const l = getLenderProfile(region);
  assert.ok(l.allowed.some((a) => /British Business Bank/i.test(a)));
  assert.ok(l.forbidden.some((f) => /SBA/i.test(f)));
  assert.ok(l.forbidden.some((f) => /BDC/i.test(f)));
});

// ── Effective rate handles tiering ───────────────────────────────────────────

test("effectiveIncomeTaxPct Alberta CCPC uses small-business rate below threshold", () => {
  const p = getTaxProfile(resolveRegion({ country: "CA", city: "Calgary", address: null }));
  const y1Income = 5_000_000; // $50K — well under $500K SBD ceiling
  assert.equal(effectiveIncomeTaxPct(p, y1Income), 11);
});

test("effectiveIncomeTaxPct Alberta CCPC jumps to general rate above SBD ceiling", () => {
  const p = getTaxProfile(resolveRegion({ country: "CA", city: "Calgary", address: null }));
  const y1Income = 100_000_000; // $1M — past $500K SBD ceiling
  assert.equal(effectiveIncomeTaxPct(p, y1Income), p.general_rate_pct);
});

test("effectiveIncomeTaxPct US C-corp single rate regardless of income", () => {
  const p = getTaxProfile(resolveRegion({ country: "US", city: "Seattle", address: null }));
  assert.equal(effectiveIncomeTaxPct(p, 1_000), 21);
  assert.equal(effectiveIncomeTaxPct(p, 100_000_000), 21);
});

// ── Region prompt block ──────────────────────────────────────────────────────

test("formatRegionForPrompt Canada block forbids SBA verbatim", () => {
  const region = resolveRegion({ country: "CA", city: "Calgary", address: "Calgary, AB" });
  const p = getTaxProfile(region);
  const l = getLenderProfile(region);
  const text = formatRegionForPrompt(region, p, l);
  // Critical: the prompt must literally tell the LLM not to reference SBA.
  assert.match(text, /MUST NOT reference/);
  assert.match(text, /SBA/);
  // And must allow BDC.
  assert.match(text, /BDC/);
  // Tax block carries the Alberta CCPC label.
  assert.match(text, /Alberta CCPC/);
  // Small-business rate appears.
  assert.match(text, /11%/);
});

test("formatRegionForPrompt UK block carries British Business Bank + VAT 20%", () => {
  const region = resolveRegion({ country: "GB", city: "London", address: null });
  const p = getTaxProfile(region);
  const l = getLenderProfile(region);
  const text = formatRegionForPrompt(region, p, l);
  assert.match(text, /British Business Bank/);
  assert.match(text, /VAT at 20%/);
  // UK plans must also forbid SBA.
  assert.match(text, /SBA/);
  assert.match(text, /MUST NOT reference/);
});

test("formatRegionForPrompt US block carries SBA primary program", () => {
  const region = resolveRegion({ country: "US", city: "Seattle", address: null });
  const p = getTaxProfile(region);
  const l = getLenderProfile(region);
  const text = formatRegionForPrompt(region, p, l);
  assert.match(text, /SBA 7\(a\)/);
  // Washington-specific narrative note about B&O tax.
  assert.match(text, /B&O tax/);
});
