// TIM-1958: Unit tests for csvEscape formula-injection neutralization (CWE-1236).

import test from "node:test";
import assert from "node:assert/strict";

// Inline the function under test so this test has no Next.js / Supabase deps.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (FORMULA_TRIGGER.test(s)) {
    s = "'" + s;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

test("csvEscape: neutralizes Excel cmd formula", () => {
  const raw = "=cmd|' /C calc'!A1";
  const out = csvEscape(raw);
  assert.ok(!out.startsWith("="), `must not start with =, got: ${out}`);
  assert.ok(out.startsWith("'="), `must be prefixed with single quote, got: ${out}`);
});

test("csvEscape: neutralizes + prefix", () => {
  const out = csvEscape("+1234");
  assert.ok(out.startsWith("'"), `got: ${out}`);
});

test("csvEscape: neutralizes - prefix", () => {
  const out = csvEscape("-1234");
  assert.ok(out.startsWith("'"), `got: ${out}`);
});

test("csvEscape: neutralizes @ prefix", () => {
  const out = csvEscape("@SUM(A1)");
  assert.ok(out.startsWith("'"), `got: ${out}`);
});

test("csvEscape: neutralizes tab prefix", () => {
  const out = csvEscape("\t=evil");
  assert.ok(out.startsWith("'"), `got: ${out}`);
});

test("csvEscape: neutralizes carriage-return prefix", () => {
  const out = csvEscape("\r=evil");
  assert.ok(out.startsWith("'"), `got: ${out}`);
});

test("csvEscape: safe values pass through unchanged", () => {
  assert.equal(csvEscape("Jane Doe"), "Jane Doe");
  assert.equal(csvEscape("jane@example.com"), "jane@example.com");
  assert.equal(csvEscape(""), "");
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(undefined), "");
  assert.equal(csvEscape(123), "123");
});

test("csvEscape: comma-containing value is quoted", () => {
  const out = csvEscape("Smith, Jane");
  assert.equal(out, '"Smith, Jane"');
});

test("csvEscape: formula prefix + comma is quoted and neutralized", () => {
  // =HYPERLINK("x","y") → prefixed to '=HYPERLINK("x","y") → then CSV-quoted
  // because it now contains quotes. Result: "'=HYPERLINK(""x"",""y"")"
  // The outer wrapper is a double-quote, but the = is NOT the first char overall.
  const out = csvEscape("=HYPERLINK(\"x\",\"y\")");
  assert.ok(!out.startsWith("="), `must not start with =, got: ${out}`);
  assert.ok(out.includes("'="), `must contain neutralized '= sequence, got: ${out}`);
});

test("csvEscape: HYPERLINK formula is neutralized", () => {
  const out = csvEscape("=HYPERLINK(\"https://evil.example\",\"click\")");
  assert.ok(!out.startsWith("="), `must not start with =, got: ${out}`);
});
