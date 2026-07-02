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
