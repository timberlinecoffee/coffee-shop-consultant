// TIM-2921: lock the parseFirstAmountToCents helper against the shapes the AI
// review modal can hand back when the founder edits a price suggestion.
// Inlined (the helper lives in menu-workspace.tsx, a "use client" module that
// imports React) — same source verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";

function parseFirstAmountToCents(text) {
  const m = text.match(/-?\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  const num = parseFloat(m[0].replace(",", "."));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

test("parses bare dollar amount with prefix", () => {
  assert.equal(parseFirstAmountToCents("$5.50"), 550);
});

test("parses bare number with no prefix", () => {
  assert.equal(parseFirstAmountToCents("5.25"), 525);
});

test("parses the first amount from multi-line proposed value", () => {
  const proposed = "$5.50\n\nMarket range: $4.00 – $6.50\nMargin at suggested price: 80.0%\n\nReasonable mid-tier...";
  assert.equal(parseFirstAmountToCents(proposed), 550);
});

test("parses comma decimal (EU format)", () => {
  assert.equal(parseFirstAmountToCents("$5,25"), 525);
});

test("parses whole-dollar amount (no decimal)", () => {
  assert.equal(parseFirstAmountToCents("$5"), 500);
});

test("parses currency-symbol-only prefix variants", () => {
  assert.equal(parseFirstAmountToCents("€7.50 incl. tax"), 750);
  assert.equal(parseFirstAmountToCents("£3.40"), 340);
});

test("returns null for non-numeric strings", () => {
  assert.equal(parseFirstAmountToCents("not a price"), null);
  assert.equal(parseFirstAmountToCents(""), null);
});

test("handles trailing punctuation after first amount", () => {
  assert.equal(parseFirstAmountToCents("$4.99."), 499);
  assert.equal(parseFirstAmountToCents("$4.99 — within market"), 499);
});

test("two-decimal cent inputs round cleanly (no float drift in normal range)", () => {
  // Two-decimal inputs are the only shape the modal hands back; the helper
  // is correct for that domain. IEEE-754 drift on 3+ decimal inputs (e.g.
  // 5.005 * 100 → 500.499...) is acceptable since the server validates and
  // the modal's input field only accepts two decimals.
  assert.equal(parseFirstAmountToCents("5.25"), 525);
  assert.equal(parseFirstAmountToCents("9.99"), 999);
  assert.equal(parseFirstAmountToCents("0.50"), 50);
});
