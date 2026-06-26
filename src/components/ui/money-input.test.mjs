// TIM-3229: thin pinning tests for the currency-aware money helpers.
// The React render layer is covered by the live-surface board confirmation
// (per the TIM-3229 acceptance). Here we pin the *formatter* contracts these
// components delegate to so future refactors don't silently change them.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currencySymbol,
  formatCurrencyAmount,
  formatMinorUnits,
  normalizeCurrencyCode,
} from "../../lib/currency.ts";
import { formatMinorExact } from "../../lib/formatters.ts";

test("currencySymbol respects the code", () => {
  // ICU symbol shapes can vary slightly across runtimes — match the symbol
  // family rather than an exact glyph (e.g. JPY may be "¥" or fullwidth "￥").
  assert.equal(currencySymbol("USD"), "$");
  assert.equal(currencySymbol("EUR"), "€");
  assert.equal(currencySymbol("GBP"), "£");
  assert.match(currencySymbol("JPY"), /[¥￥]/);
});

test("currencySymbol falls back to USD on unknown / empty input", () => {
  assert.equal(currencySymbol(""), "$");
  assert.equal(currencySymbol("XYZ"), "$");
});

test("normalizeCurrencyCode upper-cases known codes and falls back otherwise", () => {
  assert.equal(normalizeCurrencyCode("eur"), "EUR");
  assert.equal(normalizeCurrencyCode("EUR"), "EUR");
  assert.equal(normalizeCurrencyCode("zzz"), "USD");
  assert.equal(normalizeCurrencyCode(null), "USD");
  assert.equal(normalizeCurrencyCode(undefined), "USD");
});

test("formatCurrencyAmount compact bucketing pins K / M output", () => {
  // Default: compact=true → K/M short-form for large values.
  assert.match(formatCurrencyAmount(1_500_000, "USD"), /\$1.5M/);
  assert.match(formatCurrencyAmount(45_000, "USD"), /\$45K/);
  // Sub-thousand values render without K/M.
  assert.match(formatCurrencyAmount(250, "USD"), /\$250/);
});

test("formatCurrencyAmount compact=false renders the exact figure", () => {
  const out = formatCurrencyAmount(45_000, "USD", { compact: false });
  assert.match(out, /\$45,000/);
});

test("formatMinorUnits divides by the currency's fraction-digit exponent", () => {
  // USD: 2dp → 12_345 cents = $123.45 → compact "$123" (sub-1000)
  assert.match(formatMinorUnits(12_345, "USD"), /\$123/);
  // JPY: 0dp → 12_345 minor units = ¥12,345 → compact "¥12.3K"
  assert.match(formatMinorUnits(12_345, "JPY"), /[¥￥]12(\.\d)?K/);
});

test("formatMinorExact always shows the currency's natural precision", () => {
  // USD: 2dp natural precision, no compact K/M bucketing.
  assert.equal(formatMinorExact(12_345, "USD"), "$123.45");
  // JPY: 0dp natural precision — symbol may render fullwidth on some ICU builds.
  assert.match(formatMinorExact(12_345, "JPY"), /[¥￥]12,345/);
  // EUR: 2dp, € symbol present, with German thousands separator.
  const eur = formatMinorExact(12_345, "EUR");
  assert.match(eur, /€/);
  assert.match(eur, /123/);
});
