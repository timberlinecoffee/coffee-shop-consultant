// TIM-1912: Tax engine unit tests — place-of-supply matrix coverage.
// Node built-in test runner: npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import via dynamic import to allow strip-types to handle .ts source.
// The test runner uses --experimental-strip-types so .ts files load directly.
const { computeTax, taxAmountCents, taxLabel } = await import("./tax.ts");

describe("computeTax — small-supplier mode (gstRegistered=false)", () => {
  test("always returns taxLineSuppressed=true regardless of province", () => {
    const result = computeTax({ province: "AB", country: "CA", gstRegistered: false, subtotalCents: 10000 });
    assert.equal(result.taxLineSuppressed, true);
    assert.equal(result.rateBps, 0);
    assert.equal(result.jurisdiction, null);
  });

  test("ON province also suppressed when not registered", () => {
    const result = computeTax({ province: "ON", country: "CA", gstRegistered: false, subtotalCents: 5000 });
    assert.equal(result.taxLineSuppressed, true);
  });
});

describe("computeTax — registered, Canadian provinces", () => {
  test("AB → 5% GST (500 bps)", () => {
    const result = computeTax({ province: "AB", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 500);
    assert.equal(result.jurisdiction, "AB");
    assert.equal(result.taxLineSuppressed, false);
  });

  test("BC → 5% GST (500 bps)", () => {
    const result = computeTax({ province: "BC", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 500);
  });

  test("ON → 13% HST (1300 bps)", () => {
    const result = computeTax({ province: "ON", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 1300);
    assert.equal(result.jurisdiction, "ON");
  });

  test("NS → 15% HST (1500 bps)", () => {
    const result = computeTax({ province: "NS", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 1500);
  });

  test("NB → 15% HST (1500 bps)", () => {
    const result = computeTax({ province: "NB", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 1500);
  });

  test("NL → 15% HST (1500 bps)", () => {
    const result = computeTax({ province: "NL", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 1500);
  });

  test("PE → 15% HST (1500 bps)", () => {
    const result = computeTax({ province: "PE", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 1500);
  });

  test("QC → 5% GST only (QST deferred, phase 2)", () => {
    const result = computeTax({ province: "QC", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 500);
    assert.equal(result.jurisdiction, "QC");
  });

  test("province code is case-insensitive", () => {
    const lower = computeTax({ province: "ab", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    const upper = computeTax({ province: "AB", country: "CA", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(lower.rateBps, upper.rateBps);
  });
});

describe("computeTax — non-CA / zero-rated", () => {
  test("US customer → zero-rated, no tax line", () => {
    const result = computeTax({ province: "CA", country: "US", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 0);
    assert.equal(result.taxLineSuppressed, false);
    assert.equal(result.jurisdiction, null);
  });

  test("GB customer → zero-rated", () => {
    const result = computeTax({ province: null, country: "GB", gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 0);
  });

  test("null country + province → zero-rated with warning (fallback)", () => {
    const result = computeTax({ province: null, country: null, gstRegistered: true, subtotalCents: 10000 });
    assert.equal(result.rateBps, 0);
  });
});

describe("taxAmountCents", () => {
  test("5% of $100.00 = $5.00", () => {
    assert.equal(taxAmountCents(10000, 500), 500);
  });

  test("13% of $100.00 = $13.00", () => {
    assert.equal(taxAmountCents(10000, 1300), 1300);
  });

  test("15% of $100.00 = $15.00", () => {
    assert.equal(taxAmountCents(10000, 1500), 1500);
  });

  test("0% → $0", () => {
    assert.equal(taxAmountCents(10000, 0), 0);
  });

  test("rounds half-cent correctly", () => {
    // 5% of $10.01 = 50.05¢ → rounds to 50¢
    assert.equal(taxAmountCents(1001, 500), 50);
  });
});

describe("taxLabel", () => {
  test("AB → GST (5%)", () => {
    assert.equal(taxLabel("AB", 500), "GST (5%)");
  });

  test("ON → HST (13%)", () => {
    assert.equal(taxLabel("ON", 1300), "HST (13%)");
  });

  test("NS → HST (15%)", () => {
    assert.equal(taxLabel("NS", 1500), "HST (15%)");
  });

  test("null jurisdiction → Tax", () => {
    assert.equal(taxLabel(null, 0), "Tax");
  });
});
