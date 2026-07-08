// TIM-3229: thin pinning tests for the currency-aware money helpers.
// The React render layer is covered by the live-surface board confirmation
// (per the TIM-3229 acceptance). Here we pin the *formatter* contracts these
// components delegate to so future refactors don't silently change them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { twMerge } from "tailwind-merge";
import {
  currencySymbol,
  formatCurrencyAmount,
  formatMinorUnits,
  normalizeCurrencyCode,
} from "../../lib/currency.ts";
import { formatMinorExact } from "../../lib/formatters.ts";

// TIM-3559: pin the twMerge order MoneyInput uses so a caller's shared
// `inputCls` (which sets `px-3` for their form-input look) can never clobber
// the symbol clearance. Regression this pins:
//   twMerge("pl-7", "w-full px-3 py-2")  → "w-full px-3 py-2"        (pl-7 dropped → OVERLAP)
//   twMerge("w-full px-3 py-2", "pl-7")  → "w-full px-3 py-2 pl-7"   (pl-7 present + wins in CSS)
// Board flag: TIM-3557 Financial Suite Beverage/Food avg-per-sale showed `$`
// on top of `5` because the prior order let tailwind-merge drop pl-7 in favor
// of the caller's px-3 (12px left-padding → overlap with symbol at left-2.5).
test("TIM-3559 MoneyInput padLeft survives caller px-*/pl-*", () => {
  const callerFormInputCls =
    "w-full text-sm border rounded-lg px-3 py-2 text-foreground";
  const callerGridCellCls =
    "w-full text-xs bg-transparent border rounded-md px-2 py-1.5";
  // Broken order — pl-7 gets stripped.
  const broken = twMerge("pl-7", callerFormInputCls);
  assert.doesNotMatch(broken, /\bpl-7\b/);
  // Fixed order — pl-7 stays and (per Tailwind's single-side-after-shorthand
  // cascade) wins over px-3 for padding-left.
  const fixed = twMerge(callerFormInputCls, "pl-7");
  assert.match(fixed, /\bpl-7\b/);
  const fixedCompact = twMerge(callerGridCellCls, "pl-6");
  assert.match(fixedCompact, /\bpl-6\b/);
});

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

// TIM-3734 (board directive TIM-3732): every financial figure renders at the
// currency's native fraction digits (`$XX,XXX.XX`). Compact K/M shorthand was
// ripped out — under any circumstances.
test("formatCurrencyAmount always renders full precision with the native fraction digits", () => {
  assert.equal(formatCurrencyAmount(1_500_000, "USD"), "$1,500,000.00");
  assert.equal(formatCurrencyAmount(45_000, "USD"), "$45,000.00");
  assert.equal(formatCurrencyAmount(37_700, "USD"), "$37,700.00");
  assert.equal(formatCurrencyAmount(1_249.95, "USD"), "$1,249.95");
  assert.equal(formatCurrencyAmount(250, "USD"), "$250.00");
});

test("formatCurrencyAmount never emits a K or M shorthand suffix", () => {
  for (const value of [1_500, 45_000, 1_500_000, 37_700_000]) {
    const out = formatCurrencyAmount(value, "USD");
    assert.doesNotMatch(out, /K\b/, `expected no K suffix for ${value}: ${out}`);
    assert.doesNotMatch(out, /M\b/, `expected no M suffix for ${value}: ${out}`);
  }
});

test("formatMinorUnits divides by the currency's fraction-digit exponent, full precision", () => {
  // USD: 2dp → 12_345 cents = $123.45
  assert.equal(formatMinorUnits(12_345, "USD"), "$123.45");
  // 37,700 dollars entered = 3,770,000 cents → "$37,700.00"
  assert.equal(formatMinorUnits(3_770_000, "USD"), "$37,700.00");
  // JPY: 0dp → 12_345 minor units = ¥12,345 (locale-specific ¥/￥ tolerated).
  assert.match(formatMinorUnits(12_345, "JPY"), /^[¥￥]12,345$/);
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
