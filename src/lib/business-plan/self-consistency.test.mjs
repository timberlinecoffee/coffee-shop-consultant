// TIM-2343: Self-consistency parser + regen-directive unit tests.
//
// The detector itself is an LLM call (a small Haiku messages.stream invocation
// the route makes). These tests exercise the deterministic surface — parser
// defensiveness against malformed model output and the regen-directive shape
// — so that even if the upstream model changes the route can keep flagging
// real contradictions and ignoring noise. Live-fire LLM behavior is checked
// against the Beaver & Beef fixture in scripts/tim2343-self-consistency-verify.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseSelfConsistencyResponse,
  buildConsistencyFixDirective,
  buildSelfConsistencyUserMessage,
  SELF_CONSISTENCY_SYSTEM_PROMPT,
} from "./self-consistency.ts";

// ── Parser: well-formed model response ───────────────────────────────────────

test("parses a clean owner-draws contradiction pair", () => {
  const raw = JSON.stringify({
    contradictions: [
      {
        kind: "numerical",
        claim_a: "Owner draws $3,000 per month from month five",
        claim_b: "Year 1 assumes no owner draw",
        explanation: "The plan claims both a $3K monthly owner draw and zero owner draw in Y1.",
      },
    ],
  });
  const out = parseSelfConsistencyResponse(raw, "financial-plan-statements");
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "numerical");
  assert.equal(out[0].section_key, "financial-plan-statements");
  assert.equal(out[0].id, "financial-plan-statements:0");
  assert.match(out[0].claim_a, /Owner draws \$3,000/);
  assert.match(out[0].claim_b, /no owner draw/);
});

test("parses a categorical contradiction", () => {
  const raw = JSON.stringify({
    contradictions: [
      {
        kind: "categorical",
        claim_a: "We will not offer delivery.",
        claim_b: "Delivery drives Y2 growth.",
        explanation: "Promising delivery growth after ruling delivery out.",
      },
    ],
  });
  const out = parseSelfConsistencyResponse(raw, "execution-marketing-sales");
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "categorical");
});

test("parses a temporal contradiction", () => {
  const raw = JSON.stringify({
    contradictions: [
      {
        kind: "temporal",
        claim_a: "Opening month 6.",
        claim_b: "Ramp begins month 4.",
        explanation: "Ramp cannot precede opening.",
      },
    ],
  });
  const out = parseSelfConsistencyResponse(raw, "execution-milestones-metrics");
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "temporal");
});

test("empty contradictions array yields zero findings", () => {
  const out = parseSelfConsistencyResponse(JSON.stringify({ contradictions: [] }), "x");
  assert.deepEqual(out, []);
});

// ── Parser: defensive against malformed model output ─────────────────────────

test("returns [] for non-JSON garbage", () => {
  assert.deepEqual(parseSelfConsistencyResponse("not json at all", "x"), []);
});

test("returns [] for empty string", () => {
  assert.deepEqual(parseSelfConsistencyResponse("", "x"), []);
});

test("returns [] for missing contradictions key", () => {
  assert.deepEqual(parseSelfConsistencyResponse(JSON.stringify({ foo: "bar" }), "x"), []);
});

test("strips ```json fences a chatty model might wrap output with", () => {
  const raw = "```json\n" + JSON.stringify({
    contradictions: [{
      kind: "numerical",
      claim_a: "a",
      claim_b: "b",
      explanation: "e",
    }],
  }) + "\n```";
  const out = parseSelfConsistencyResponse(raw, "x");
  assert.equal(out.length, 1);
});

test("unknown kind values normalize to 'other'", () => {
  const raw = JSON.stringify({
    contradictions: [{
      kind: "what-even-is-this",
      claim_a: "a",
      claim_b: "b",
      explanation: "e",
    }],
  });
  const out = parseSelfConsistencyResponse(raw, "x");
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "other");
});

test("drops pairs where either side is empty (model noise)", () => {
  const raw = JSON.stringify({
    contradictions: [
      { kind: "numerical", claim_a: "a", claim_b: "", explanation: "e" },
      { kind: "numerical", claim_a: "", claim_b: "b", explanation: "e" },
      { kind: "numerical", claim_a: "  ", claim_b: "  ", explanation: "e" },
    ],
  });
  assert.deepEqual(parseSelfConsistencyResponse(raw, "x"), []);
});

test("drops pairs where both sides are identical text", () => {
  const raw = JSON.stringify({
    contradictions: [
      { kind: "numerical", claim_a: "same text", claim_b: "same text", explanation: "e" },
    ],
  });
  assert.deepEqual(parseSelfConsistencyResponse(raw, "x"), []);
});

test("clips long claim text to 500 chars + provides default explanation", () => {
  const long = "x".repeat(800);
  const raw = JSON.stringify({
    contradictions: [{
      kind: "numerical",
      claim_a: long,
      claim_b: "short",
      explanation: "",  // model omitted it
    }],
  });
  const out = parseSelfConsistencyResponse(raw, "x");
  assert.equal(out[0].claim_a.length, 500);
  assert.equal(out[0].explanation, "These statements cannot both be true.");
});

test("caps at 10 contradictions regardless of model output length", () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    kind: "numerical",
    claim_a: `a${i}`,
    claim_b: `b${i}`,
    explanation: "e",
  }));
  const out = parseSelfConsistencyResponse(JSON.stringify({ contradictions: many }), "x");
  assert.equal(out.length, 10);
});

test("a non-array contradictions value yields []", () => {
  assert.deepEqual(
    parseSelfConsistencyResponse(JSON.stringify({ contradictions: "oops" }), "x"),
    [],
  );
});

// ── Regen directive ──────────────────────────────────────────────────────────

test("empty contradictions produces empty directive (no regen needed)", () => {
  assert.equal(buildConsistencyFixDirective([]), "");
});

test("directive lists every pair with kind tag and resolution rule", () => {
  const c = [
    {
      id: "x:0",
      section_key: "x",
      kind: "numerical",
      claim_a: "$3,000/mo owner draw",
      claim_b: "no owner draw in Y1",
      explanation: "Two values for the same line item.",
    },
    {
      id: "x:1",
      section_key: "x",
      kind: "categorical",
      claim_a: "no delivery",
      claim_b: "delivery drives growth",
      explanation: "Contradictory delivery decision.",
    },
  ];
  const out = buildConsistencyFixDirective(c);
  assert.match(out, /REVISION REQUEST/);
  assert.match(out, /Keep the voice, structure, paragraph count/);
  assert.match(out, /\[numerical\]/);
  assert.match(out, /\[categorical\]/);
  assert.match(out, /\$3,000\/mo owner draw/);
  assert.match(out, /delivery drives growth/);
  assert.match(out, /Ground Truth Numbers block/);
  assert.match(out, /Return the full revised section/);
});

// ── User message builder ─────────────────────────────────────────────────────

test("user message embeds title and full section text verbatim", () => {
  const msg = buildSelfConsistencyUserMessage(
    "Financial Plan: Statements",
    "Para 1. Para 2 with $3,000 owner draw and no owner draw.",
  );
  assert.match(msg, /Section: Financial Plan: Statements/);
  assert.match(msg, /Para 2 with \$3,000 owner draw and no owner draw\./);
  assert.match(msg, /Return the JSON described in your instructions\./);
});

// ── System prompt sanity ─────────────────────────────────────────────────────

test("system prompt names the three contradiction categories and the JSON shape", () => {
  assert.match(SELF_CONSISTENCY_SYSTEM_PROMPT, /NUMERICAL/);
  assert.match(SELF_CONSISTENCY_SYSTEM_PROMPT, /CATEGORICAL/);
  assert.match(SELF_CONSISTENCY_SYSTEM_PROMPT, /TEMPORAL/);
  assert.match(SELF_CONSISTENCY_SYSTEM_PROMPT, /"contradictions"/);
  assert.match(SELF_CONSISTENCY_SYSTEM_PROMPT, /at most 5 contradictions/);
  // Acceptance-relevant negatives — the prompt has to TELL the LLM what NOT
  // to flag so it doesn't surface routine year-over-year deltas as conflicts.
  assert.match(SELF_CONSISTENCY_SYSTEM_PROMPT, /Y1 revenue ≠ Y2 revenue is not a contradiction/);
  assert.match(SELF_CONSISTENCY_SYSTEM_PROMPT, /typo/);
});
