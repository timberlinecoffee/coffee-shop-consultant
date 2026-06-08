// TIM-2342: source-marker round-trip + hedge handling.
//
// Acceptance #4 lives here: emit + parse + render, no markers leak past
// renderForExport(). Pins the four source classes, the hedge defaulting,
// and the surrounding-sentence extraction the export-gate modal uses.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseSourceMarkers,
  renderForExport,
  extractEstimatedClaims,
  stripMarkersRaw,
  stripSourceMarkers,
} from "./source-markers.ts";

test("strips user_provided + computed + benchmark markers verbatim", () => {
  const input = [
    'We are raising <num src="user_provided">$250,000</num> in total capital.',
    'Year 1 revenue lands at <num src="computed">$334,747</num>.',
    'Specialty coffee blended COGS averages <num src="benchmark">30 percent</num> of revenue.',
  ].join("\n");

  const out = renderForExport(input);
  assert.ok(!out.includes("<num"), "no opening marker leaks");
  assert.ok(!out.includes("</num>"), "no closing marker leaks");
  assert.ok(out.includes("$250,000"), "user_provided content preserved verbatim");
  assert.ok(out.includes("$334,747"), "computed content preserved verbatim");
  assert.ok(out.includes("30 percent"), "benchmark content preserved verbatim");
});

test("prepends default hedge to estimate-class claim with no existing hedge", () => {
  const input = 'Phil & Sebastian house blend at <num src="estimate">$6.80 per pound</num> across our menu.';
  const out = renderForExport(input);
  assert.ok(!out.includes("<num"), "marker stripped");
  assert.match(out, /approximately \$6\.80 per pound/, "default hedge prepended");
});

test("uses LLM-provided hedge attribute when present", () => {
  const input = 'Beef costs run <num src="estimate" hedge="roughly">$1.80 to $2.40 per ounce</num>.';
  const out = renderForExport(input);
  assert.match(out, /roughly \$1\.80 to \$2\.40 per ounce/, "uses hedge attribute");
});

test("does not double-prefix when content already opens with a hedge", () => {
  const input = '<num src="estimate">approximately 120 transactions per day</num>';
  const out = renderForExport(input);
  assert.equal(out, "approximately 120 transactions per day", "no double-hedge");
  assert.ok(!/approximately approximately/.test(out));
});

test("treats unknown source as estimate (safer than passing through)", () => {
  const input = 'foo <num src="literally_made_up">$99</num> bar';
  const parsed = parseSourceMarkers(input);
  assert.equal(parsed.markers.length, 1);
  assert.equal(parsed.markers[0].source, "estimate");
  assert.match(parsed.rendered, /approximately \$99/);
});

test("parses multiple markers in document order and counts by source", () => {
  const input = [
    '<num src="user_provided">$250K</num>',
    '<num src="computed">$334,747</num>',
    '<num src="benchmark">30%</num>',
    '<num src="estimate">$6.80/lb</num>',
    '<num src="estimate" hedge="roughly">5 staff</num>',
  ].join(" ");
  const parsed = parseSourceMarkers(input);
  assert.equal(parsed.markers.length, 5);
  assert.equal(parsed.counts.user_provided, 1);
  assert.equal(parsed.counts.computed, 1);
  assert.equal(parsed.counts.benchmark, 1);
  assert.equal(parsed.counts.estimate, 2);
});

test("round-trip: emit + parse + render leaves no marker syntax", () => {
  const sources = [
    'We raise <num src="user_provided">$280,000</num>.',
    'Year 1 net income of <num src="computed">$31,313</num>.',
    'Industry-standard COGS of <num src="benchmark">28-32 percent</num>.',
    'House blend at <num src="estimate" hedge="approximately">$6.80 per pound</num>.',
    'Beef at <num src="estimate">$1.80 to $2.40 per ounce</num>.',
    'Foot traffic of <num src="estimate" hedge="roughly">120 transactions per day</num>.',
  ];
  for (const text of sources) {
    const rendered = renderForExport(text);
    assert.ok(!rendered.includes("<num"), `no opening marker in render of: ${text}`);
    assert.ok(!rendered.includes("</num>"), `no closing marker in render of: ${text}`);
  }
});

test("extractEstimatedClaims surfaces only estimate-class claims with stable ids", () => {
  const text = [
    'Total raise is <num src="user_provided">$250,000</num>, with debt of <num src="computed">$150,000</num>.',
    'Wholesale beans run <num src="estimate" hedge="approximately">$6.80 per pound</num>.',
    'Daily transactions are <num src="estimate">120 to 150</num> at steady state.',
  ].join("\n");

  const claims = extractEstimatedClaims("financial-plan-forecast", text);
  assert.equal(claims.length, 2, "only estimate-class markers extracted");
  assert.equal(claims[0].section_key, "financial-plan-forecast");
  assert.equal(claims[0].content, "$6.80 per pound");
  assert.equal(claims[0].hedge, "approximately");
  assert.ok(claims[0].surrounding_sentence.includes("$6.80 per pound"));
  assert.ok(!claims[0].surrounding_sentence.includes("<num"), "rendered sentence has no markers");
  assert.equal(claims[1].content, "120 to 150");
  assert.equal(claims[1].hedge, "approximately", "default hedge applied when LLM omits");
  assert.ok(claims[0].id !== claims[1].id, "ids are unique");
});

test("ignores text with no markers (no-op)", () => {
  const text = "Year 1 revenue lands at $334,747 with COGS of 30 percent.";
  const parsed = parseSourceMarkers(text);
  assert.equal(parsed.rendered, text);
  assert.equal(parsed.markers.length, 0);
});

test("stripMarkersRaw strips markers without adding hedge prefixes", () => {
  const input = 'foo <num src="estimate">$99</num> bar';
  assert.equal(stripMarkersRaw(input), "foo $99 bar");
});

// TIM-2358: stripSourceMarkers — canonical lightweight stripper for every UI
// render boundary that takes narrative text and pushes it into a React DOM.
// Acceptance #4: simple value, multi-marker line, malformed marker still
// renders the inner value, nested-like inputs.

test("stripSourceMarkers: simple value", () => {
  assert.equal(
    stripSourceMarkers('We are raising <num src="user_provided">$250,000</num> in total capital.'),
    "We are raising $250,000 in total capital.",
  );
});

test("stripSourceMarkers: multi-marker line", () => {
  const input = [
    'Proceeds are allocated as follows: <num src="user_provided">$150,000</num> for build-out,',
    '<num src="user_provided">$210,323</num> for equipment,',
    '<num src="user_provided">$9,760</num> for lease deposit,',
    '<num src="user_provided">$3,000</num> for licenses and permits.',
  ].join(" ");
  const out = stripSourceMarkers(input);
  assert.ok(!out.includes("<num"), "no opening marker leaks");
  assert.ok(!out.includes("</num>"), "no closing marker leaks");
  assert.ok(out.includes("$150,000 for build-out"));
  assert.ok(out.includes("$210,323 for equipment"));
  assert.ok(out.includes("$9,760 for lease deposit"));
  assert.ok(out.includes("$3,000 for licenses and permits"));
});

test("stripSourceMarkers: malformed marker still renders inner value", () => {
  // Missing closing tag — leave the text alone rather than chew up the rest of
  // the prose. The regex requires a matching </num> so this should be a no-op.
  const lonelyOpen = 'We are raising <num src="user_provided">$250,000 in total capital.';
  assert.equal(stripSourceMarkers(lonelyOpen), lonelyOpen);

  // Marker with hedge but missing src — `[^>]*` is permissive on attribute
  // shape, so the inner value is still extracted.
  const noSrc = 'roughly <num hedge="approximately">$5</num> a cup';
  assert.equal(stripSourceMarkers(noSrc), "roughly $5 a cup");

  // Single-quoted attribute values must still strip.
  const singleQuote = "the rent is <num src='user_provided'>$4,880/mo</num>";
  assert.equal(stripSourceMarkers(singleQuote), "the rent is $4,880/mo");
});

test("stripSourceMarkers: nested-like inputs", () => {
  // Non-greedy match means an inner `<num` opener inside content shouldn't eat
  // the closer of the outer pair. The first `</num>` closes the outer marker;
  // the dangling inner pair leaks through (and stripSourceMarkers strips that
  // too on the next match in the same regex sweep).
  const nested = '<num src="estimate">$10 <num src="estimate">$20</num></num>';
  const out = stripSourceMarkers(nested);
  assert.ok(!out.includes("<num"), "no marker survives");
  assert.ok(!out.includes("</num>"), "no closing tag survives");
  assert.ok(out.includes("$10"));
  assert.ok(out.includes("$20"));
});

test("stripSourceMarkers: null / undefined / non-string returns empty string", () => {
  assert.equal(stripSourceMarkers(null), "");
  assert.equal(stripSourceMarkers(undefined), "");
  assert.equal(stripSourceMarkers(42), "");
});

test("stripSourceMarkers: idempotent on already-stripped content", () => {
  const clean = "We are raising $250,000 in total capital.";
  assert.equal(stripSourceMarkers(clean), clean);
  assert.equal(stripSourceMarkers(stripSourceMarkers(clean)), clean);
});

// TIM-2358 acceptance #1 + #5: render-side regression on the exact board-
// screenshot string (TIM-2315 attachment 58d00508). The Internal Contradictions
// Flagged panel must never put `<num src=` into the DOM, regardless of which
// stripper path the consumer uses (stripSourceMarkers OR the wider
// stripFindingTags sanitizer that composes it).

test("regression: TIM-2315 board-screenshot contradiction renders clean", async () => {
  const { stripFindingTags } = await import("./sanitize-finding-text.ts");
  const claimA = 'We are raising <num src="user_provided">$250,000</num> in total capital';
  const claimB = [
    'Proceeds are allocated as follows: <num src="user_provided">$150,000</num> for build-out,',
    '<num src="user_provided">$210,323</num> for equipment,',
    '<num src="user_provided">$9,760</num> for lease deposit,',
    '<num src="user_provided">$3,000</num> for licenses and permits',
  ].join(" ");

  for (const claim of [claimA, claimB]) {
    for (const stripper of [stripSourceMarkers, stripFindingTags]) {
      const out = stripper(claim);
      assert.ok(!out.includes("<num"), `no opening marker in: ${out}`);
      assert.ok(!out.includes("</num>"), `no closing marker in: ${out}`);
      assert.ok(!out.includes('src="'), `no src attribute in: ${out}`);
    }
  }
});

test("handles single-quoted attribute values", () => {
  const input = "the rent is <num src='user_provided'>$4,880/mo</num>";
  const parsed = parseSourceMarkers(input);
  assert.equal(parsed.markers.length, 1);
  assert.equal(parsed.markers[0].source, "user_provided");
  assert.equal(parsed.markers[0].content, "$4,880/mo");
});

test("acceptance #4: Beaver-and-Beef investor-flagged numbers now carry source", () => {
  // The three claims the investor called out on TIM-2315: $6.80/lb beans,
  // $1.80-$2.40/oz beef, 120-150 transactions/day. After source-tagging,
  // all three render with hedge prefixes and surface to the modal.
  const flagged = [
    '<num src="estimate">$6.80 per pound</num>',
    '<num src="estimate">$1.80 to $2.40 per ounce</num>',
    '<num src="estimate" hedge="roughly">120 to 150 transactions per day</num>',
  ].join("\n");

  const rendered = renderForExport(flagged);
  // (a) no markers leak
  assert.ok(!rendered.includes("<num"));
  // (b) every claim renders with a hedge
  assert.match(rendered, /approximately \$6\.80 per pound/);
  assert.match(rendered, /approximately \$1\.80 to \$2\.40 per ounce/);
  assert.match(rendered, /roughly 120 to 150 transactions per day/);

  // (c) every claim surfaces to the modal
  const claims = extractEstimatedClaims("financial-plan-statements", flagged);
  assert.equal(claims.length, 3);
});
