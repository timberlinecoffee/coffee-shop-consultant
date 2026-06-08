// TIM-2518: minimum-wage resolver + default-bump tests.
// AC: cover at least 3 city overrides + 1 national fallback.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveMinimumWage,
  defaultBaristaWageMinorUnits,
  isBelowMinimumWage,
} from "./minimum-wage.ts";

test("Seattle override beats the US national floor", () => {
  const info = resolveMinimumWage({ city: "Seattle", countryCode: "US" });
  assert.equal(info?.jurisdictionLabel, "Seattle");
  assert.equal(info?.hourlyMinorUnits, 1997);
  assert.equal(info?.currency, "USD");
  assert.equal(info?.source, "city");
});

test("San Francisco override resolves regardless of casing or country signal", () => {
  const info = resolveMinimumWage({ city: "san francisco", countryCode: "US" });
  assert.equal(info?.jurisdictionLabel, "San Francisco");
  assert.equal(info?.hourlyMinorUnits, 1904);
});

test("Toronto override resolves with CAD currency", () => {
  const info = resolveMinimumWage({ city: "Toronto", countryCode: "CA" });
  assert.equal(info?.hourlyMinorUnits, 1720);
  assert.equal(info?.currency, "CAD");
});

test("Melbourne override resolves with AUD currency", () => {
  const info = resolveMinimumWage({ city: "Melbourne", countryCode: "AU" });
  assert.equal(info?.hourlyMinorUnits, 2410);
  assert.equal(info?.currency, "AUD");
});

test("Mexico City override resolves with MXN currency", () => {
  const info = resolveMinimumWage({ city: "CDMX", countryCode: "MX" });
  assert.equal(info?.hourlyMinorUnits, 3485);
  assert.equal(info?.currency, "MXN");
});

test("Unknown city falls back to the US national floor", () => {
  const info = resolveMinimumWage({ city: "Springfield", countryCode: "US" });
  assert.equal(info?.source, "national");
  assert.equal(info?.hourlyMinorUnits, 725);
  assert.equal(info?.jurisdictionLabel, "United States");
});

test("Country-only signal returns the national floor", () => {
  const info = resolveMinimumWage({ city: null, countryCode: "AU" });
  assert.equal(info?.source, "national");
  assert.equal(info?.currency, "AUD");
});

test("Long-form country names still resolve", () => {
  const info = resolveMinimumWage({ city: null, countryCode: "United States" });
  assert.equal(info?.jurisdictionLabel, "United States");
});

test("Unknown country returns null", () => {
  assert.equal(resolveMinimumWage({ city: null, countryCode: "XX" }), null);
});

test("defaultBaristaWageMinorUnits raises a sub-minimum default", () => {
  const seattle = resolveMinimumWage({ city: "Seattle", countryCode: "US" });
  assert.equal(defaultBaristaWageMinorUnits(1700, seattle), 1997);
});

test("defaultBaristaWageMinorUnits keeps a default that already clears the floor", () => {
  const us = resolveMinimumWage({ city: null, countryCode: "US" });
  assert.equal(defaultBaristaWageMinorUnits(1700, us), 1700);
});

test("defaultBaristaWageMinorUnits leaves the default alone when no minimum is known", () => {
  assert.equal(defaultBaristaWageMinorUnits(1700, null), 1700);
});

test("isBelowMinimumWage flags a sub-minimum entry", () => {
  const seattle = resolveMinimumWage({ city: "Seattle", countryCode: "US" });
  assert.equal(isBelowMinimumWage(1700, seattle), true);
});

test("isBelowMinimumWage allows an at-or-above entry", () => {
  const seattle = resolveMinimumWage({ city: "Seattle", countryCode: "US" });
  assert.equal(isBelowMinimumWage(1997, seattle), false);
  assert.equal(isBelowMinimumWage(2200, seattle), false);
});

test("isBelowMinimumWage stays quiet on zero / blank inputs", () => {
  const seattle = resolveMinimumWage({ city: "Seattle", countryCode: "US" });
  assert.equal(isBelowMinimumWage(0, seattle), false);
  assert.equal(isBelowMinimumWage(NaN, seattle), false);
});

test("isBelowMinimumWage is a no-op when no minimum is known", () => {
  assert.equal(isBelowMinimumWage(500, null), false);
});
