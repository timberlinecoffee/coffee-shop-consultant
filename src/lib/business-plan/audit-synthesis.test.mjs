import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSynthesisUserMessage,
  parseSynthesisResponse,
  voiceGuideHash,
} from "./audit-synthesis.ts";

const fixture = {
  id: "audit:executive-summary:lease.monthly_rent:0",
  rule_id: "numeric_mismatch",
  severity: "critical",
  raw_message: 'Narrative says "$4,880" but plan_state shows $0.',
  quoted_text: "$4,880",
  units: "currency",
  expected_text: "$0",
  suggested_replacement: "$0",
  source: { workspace: "business-plan", workspace_label: "Business Plan", field: "executive-summary", field_label: "Executive Summary" },
  target: { workspace: "real-estate", workspace_label: "Location", field: null, field_label: null },
  issue: null,
  why_it_matters: null,
  suggested_fix: null,
};

test("buildSynthesisUserMessage embeds finding payload as JSON", () => {
  const msg = buildSynthesisUserMessage(fixture);
  assert.equal(msg.includes("Rewrite this validator finding"), true);
  assert.equal(msg.includes('"rule_id": "numeric_mismatch"'), true);
  assert.equal(msg.includes('"source_workspace": "Business Plan"'), true);
  assert.equal(msg.includes('"target_workspace": "Location"'), true);
  // Tag-stripping at the prompt boundary — even if raw_message somehow held
  // a stray tag, the message should not echo it.
  const dirty = { ...fixture, raw_message: 'See <num src="x">five</num>.' };
  const msg2 = buildSynthesisUserMessage(dirty);
  assert.equal(msg2.includes("<num"), false);
});

test("parseSynthesisResponse: clean JSON", () => {
  const raw = `{
    "issue": "Your monthly rent is $4,880 in the narrative but $0 in the plan.",
    "why_it_matters": "Lenders cross-check these. A mismatch erodes trust.",
    "suggested_fix": "Open the Location workspace and confirm the asking rent."
  }`;
  const out = parseSynthesisResponse(raw);
  assert.equal(out.issue.startsWith("Your monthly rent"), true);
  assert.equal(out.why_it_matters.includes("trust"), true);
  assert.equal(out.suggested_fix.includes("Location"), true);
});

test("parseSynthesisResponse: tolerates surrounding prose", () => {
  const raw = 'Here is the JSON:\n```json\n{"issue":"a","why_it_matters":"b","suggested_fix":"c"}\n```\nDone.';
  const out = parseSynthesisResponse(raw);
  assert.deepEqual(out, { issue: "a", why_it_matters: "b", suggested_fix: "c" });
});

test("parseSynthesisResponse: returns null when any field is missing", () => {
  assert.equal(parseSynthesisResponse('{"issue":"x","why_it_matters":"y"}'), null);
  assert.equal(parseSynthesisResponse('{"issue":"","why_it_matters":"y","suggested_fix":"z"}'), null);
  assert.equal(parseSynthesisResponse("not json"), null);
  assert.equal(parseSynthesisResponse(""), null);
});

test("parseSynthesisResponse: strips any tags the model echoed", () => {
  const raw = '{"issue":"Rent <num src=\\"x\\">$4,880</num> mismatch","why_it_matters":"y","suggested_fix":"z"}';
  const out = parseSynthesisResponse(raw);
  assert.equal(out.issue, "Rent $4,880 mismatch");
});

test("voiceGuideHash is deterministic", () => {
  const a = voiceGuideHash("hello world");
  const b = voiceGuideHash("hello world");
  const c = voiceGuideHash("hello world!");
  assert.equal(a, b);
  assert.notEqual(a, c);
});
