import { test } from "node:test";
import assert from "node:assert/strict";
import { stripFindingTags, sanitizeStrings } from "./sanitize-finding-text.ts";

test("strips <num src=...>inner</num> preserving content", () => {
  const input = 'We open in <num src="user_provided">September 2026</num>.';
  assert.equal(stripFindingTags(input), "We open in September 2026.");
});

test("strips <num src='..'> with single quotes", () => {
  assert.equal(
    stripFindingTags("Headcount of <num src='user_provided'>five</num>."),
    "Headcount of five.",
  );
});

test("strips <num> with hedge attribute and preserves inner", () => {
  const input = 'Margin runs <num src="estimate" hedge="approximately">28 percent</num>.';
  assert.equal(stripFindingTags(input), "Margin runs 28 percent.");
});

test("strips multiple markers in same string", () => {
  const input = 'Open <num src="user_provided">six days</num> with <num src="computed">$334,747</num> Y1.';
  assert.equal(stripFindingTags(input), "Open six days with $334,747 Y1.");
});

test("strips stray <src ...> attribution tags", () => {
  const input = 'We project growth <src ref="benchmark-1"/> based on industry data.';
  // After stripping the self-closing src tag, the leftover double-space collapses.
  assert.equal(stripFindingTags(input), "We project growth based on industry data.");
});

test("strips any stray xml-style tag while keeping inner text", () => {
  assert.equal(
    stripFindingTags('<claim id="x">break-even by month 9</claim>'),
    "break-even by month 9",
  );
});

test("leaves plain prose untouched", () => {
  const input = "Labor costs run 38 cents on the dollar.";
  assert.equal(stripFindingTags(input), input);
});

test("leaves arithmetic and comparison operators alone", () => {
  // "<" not followed by a letter is not a tag opener.
  const input = "We need x < 12% rent.";
  assert.equal(stripFindingTags(input), input);
});

test("null / undefined / non-string returns empty string", () => {
  assert.equal(stripFindingTags(null), "");
  assert.equal(stripFindingTags(undefined), "");
  // @ts-expect-error testing runtime fallback
  assert.equal(stripFindingTags(42), "");
});

test("sanitizeStrings strips every string field, leaves others intact", () => {
  const finding = {
    id: "f1",
    severity: "blocking",
    message: 'Plan says <num src="user_provided">five</num>.',
    claim_value: 5,
    suggested_replacement: null,
    quoted_text: '<num src="computed">$334,747</num>',
  };
  const out = sanitizeStrings(finding);
  assert.equal(out.id, "f1");
  assert.equal(out.severity, "blocking");
  assert.equal(out.message, "Plan says five.");
  assert.equal(out.claim_value, 5);
  assert.equal(out.suggested_replacement, null);
  assert.equal(out.quoted_text, "$334,747");
});

test("regression: board screenshot strings render clean", () => {
  // Verbatim from board's flagged screenshot.
  assert.equal(
    stripFindingTags('<num src="user_provided">September 2026</num>'),
    "September 2026",
  );
  assert.equal(
    stripFindingTags('<num src="user_provided">five</num>'),
    "five",
  );
});
