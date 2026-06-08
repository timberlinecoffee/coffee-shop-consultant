// TIM-2517: opening-cash runway helper.

import test from "node:test";
import assert from "node:assert/strict";
import { computeOpeningRunway } from "./opening-runway.ts";

test("none band when ramp produces no loss months", () => {
  const r = computeOpeningRunway({
    openingCashCents: 2_500_000,
    rampMonthlyNetIncomeCents: [100_000, 200_000, 300_000],
  });
  assert.equal(r.band, "none");
  assert.equal(r.runwayMonths, null);
  assert.equal(r.avgMonthlyLossCents, 0);
});

test("red band when opening cash is zero but losses exist", () => {
  const r = computeOpeningRunway({
    openingCashCents: 0,
    rampMonthlyNetIncomeCents: [-500_000, -300_000, -100_000],
  });
  assert.equal(r.band, "red");
  assert.equal(r.runwayMonths, 0);
});

test("red band when runway is under 1 month", () => {
  const r = computeOpeningRunway({
    openingCashCents: 500_000, // $5k
    rampMonthlyNetIncomeCents: [-1_000_000, -1_000_000, -1_000_000], // avg loss $10k/mo
  });
  assert.equal(r.band, "red");
  assert.ok(r.runwayMonths !== null && r.runwayMonths < 1);
});

test("yellow band when runway is between 1 and 3 months", () => {
  const r = computeOpeningRunway({
    openingCashCents: 2_000_000, // $20k
    rampMonthlyNetIncomeCents: [-1_000_000, -1_000_000, -1_000_000], // avg loss $10k/mo → 2.0
  });
  assert.equal(r.band, "yellow");
  assert.equal(r.runwayMonths, 2);
});

test("green band when runway covers 3+ months of losses", () => {
  const r = computeOpeningRunway({
    openingCashCents: 6_500_000, // TIM-2517 defaults = $45k + $20k
    rampMonthlyNetIncomeCents: [-1_500_000, -1_500_000, -1_500_000], // avg loss $15k/mo → ~4.3
  });
  assert.equal(r.band, "green");
  assert.ok(r.runwayMonths !== null && r.runwayMonths >= 3);
});

test("only counts loss months in the average — profitable months are ignored", () => {
  const r = computeOpeningRunway({
    openingCashCents: 1_000_000,
    rampMonthlyNetIncomeCents: [-1_000_000, -500_000, 500_000], // 2 loss months
  });
  // avg loss = (1_000_000 + 500_000) / 2 = 750_000
  assert.equal(r.avgMonthlyLossCents, 750_000);
  assert.equal(r.lossMonths, 2);
});

test("empty ramp window returns none band", () => {
  const r = computeOpeningRunway({
    openingCashCents: 6_500_000,
    rampMonthlyNetIncomeCents: [],
  });
  assert.equal(r.band, "none");
});
