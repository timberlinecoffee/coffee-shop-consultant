import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditFindings,
  fromNumericFinding,
  fromQualitativeFinding,
  fromSelfConsistencyContradiction,
  fromEstimatedClaim,
  statsFromFindings,
} from "./audit.ts";

const numericBase = {
  id: "executive-summary:lease.monthly_rent:0",
  section_key: "executive-summary",
  severity: "blocking",
  kind: "numeric_mismatch",
  dimension: "lease.monthly_rent",
  dimension_label: "Monthly rent",
  units: "currency",
  quoted_text: '<num src="user_provided">$4,880</num>',
  claim_value: 488000,
  expected_value: 0,
  expected_text: "$0",
  suggested_replacement: "$0",
  auto_correctable: true,
  message: 'Narrative says "<num src="user_provided">$4,880</num>" but plan_state shows $0.',
};

test("numeric mismatch → critical + tag-stripped strings", () => {
  const out = fromNumericFinding(numericBase);
  assert.equal(out.severity, "critical");
  assert.equal(out.rule_id, "numeric_mismatch");
  assert.equal(out.raw_message, 'Narrative says "$4,880" but plan_state shows $0.');
  assert.equal(out.quoted_text, "$4,880");
  assert.equal(out.expected_text, "$0");
  assert.equal(out.suggested_replacement, "$0");
  assert.equal(out.units, "currency");
  assert.equal(out.source.workspace, "business-plan");
  assert.equal(out.target.workspace, "real-estate");
  assert.equal(out.issue, null);
  assert.equal(out.why_it_matters, null);
});

test("sign mismatch maps to critical + sign_mismatch rule_id", () => {
  const out = fromNumericFinding({
    ...numericBase,
    id: "executive-summary:year_1.net_income:0",
    kind: "sign_mismatch",
    dimension: "year_1.net_income",
    quoted_text: "loss of $59,825",
    message: "Narrative said loss; plan_state shows profit of $31,313.",
  });
  assert.equal(out.severity, "critical");
  assert.equal(out.rule_id, "sign_mismatch");
  assert.equal(out.target.workspace, "financials");
});

test("dimension prefix routing for opex / labor / use_of_funds", () => {
  const cases = [
    ["opex.utilities.monthly", "financials"],
    ["labor.year_1.total_payroll", "labor"],
    ["use_of_funds.total", "financials"],
    ["capital_stack.equity", "financials"],
    ["lease.monthly_rent", "real-estate"],
    ["year_1.revenue", "financials"],
  ];
  for (const [dim, ws] of cases) {
    const out = fromNumericFinding({ ...numericBase, dimension: dim, message: "x" });
    assert.equal(out.target.workspace, ws, `${dim} → expected ${ws}`);
  }
});

test("qualitative findings map category → severity", () => {
  const baseQ = {
    id: "q1",
    section_key: "opportunity-competition",
    severity: "advisory",
    kind: "qualitative",
    quoted_text: null,
    message: "Competitors are generic.",
  };
  const out1 = fromQualitativeFinding({ ...baseQ, category: "credibility" });
  assert.equal(out1.severity, "warning");
  const out2 = fromQualitativeFinding({ ...baseQ, category: "typo" });
  assert.equal(out2.severity, "info");
  const out3 = fromQualitativeFinding({ ...baseQ, category: "fabricated_local_claim" });
  assert.equal(out3.severity, "warning");
  const out4 = fromQualitativeFinding({ ...baseQ, category: "geographic_fabrication" });
  assert.equal(out4.severity, "warning");
});

test("self-consistency: numerical → warning, others → info", () => {
  const baseC = {
    id: "executive-summary:0",
    section_key: "executive-summary",
    claim_a: '<num src="user_provided">five</num> staff',
    claim_b: "three full-time employees",
    explanation: "Headcount differs.",
  };
  const num = fromSelfConsistencyContradiction({ ...baseC, kind: "numerical" });
  assert.equal(num.severity, "warning");
  assert.equal(num.rule_id, "self_consistency");
  // Tag stripped from both quoted fragments and embedded in raw_message.
  assert.equal(num.raw_message.includes("five staff"), true);
  assert.equal(num.raw_message.includes("three full-time employees"), true);
  assert.equal(num.raw_message.includes("<num"), false);

  const cat = fromSelfConsistencyContradiction({ ...baseC, kind: "categorical" });
  assert.equal(cat.severity, "info");
});

test("estimated claim → info, content+hedge stripped", () => {
  const out = fromEstimatedClaim({
    id: "execution-operations:estimate:0",
    section_key: "execution-operations",
    content: '<num src="estimate">$6.80 per pound</num>',
    hedge: "approximately",
    surrounding_sentence: 'Beans cost <num src="estimate">$6.80 per pound</num> from Phil & Sebastian.',
  });
  assert.equal(out.severity, "info");
  assert.equal(out.rule_id, "estimated_claim");
  assert.equal(out.raw_message.includes("<num"), false);
  assert.equal(out.quoted_text.includes("<num"), false);
});

test("buildAuditFindings: sort by severity, then preserve input order", () => {
  const findings = buildAuditFindings({
    report: {
      blocking: true,
      numeric_findings: [numericBase],
      qualitative_findings: [
        { id: "q1", section_key: "x", severity: "advisory", kind: "qualitative", category: "typo", message: "t", quoted_text: null },
        { id: "q2", section_key: "x", severity: "advisory", kind: "qualitative", category: "credibility", message: "c", quoted_text: null },
      ],
      estimated_claims: [],
      stats: { claims_extracted: 0, claims_matched: 0, sections_scanned: 0 },
    },
    selfConsistencyContradictions: [
      { id: "executive-summary:0", section_key: "executive-summary", kind: "numerical", claim_a: "a", claim_b: "b", explanation: "e" },
    ],
  });
  // numeric (critical) → credibility (warning) → self_consistency (warning) → typo (info)
  assert.equal(findings.length, 4);
  assert.equal(findings[0].severity, "critical");
  assert.equal(findings[1].severity, "warning");
  assert.equal(findings[2].severity, "warning");
  assert.equal(findings[3].severity, "info");
});

test("statsFromFindings counts bucket sizes", () => {
  const stats = statsFromFindings([
    { severity: "critical" }, { severity: "critical" },
    { severity: "warning" },
    { severity: "info" }, { severity: "info" }, { severity: "info" },
  ]);
  assert.deepEqual(stats, { critical: 2, warning: 1, info: 3, total: 6 });
});

test("regression: tags from validator never leak into AuditFinding strings", () => {
  // Pile every leak source into a single finding and check the output is clean.
  const out = fromNumericFinding({
    ...numericBase,
    message: 'Narrative <num src="user_provided">$4,880</num> vs <src ref="x"/> plan_state <num src="computed">$0</num>.',
    quoted_text: '<num src="user_provided">$4,880</num>',
    expected_text: '<num src="computed">$0</num>',
    suggested_replacement: '<num src="computed">$0</num>',
  });
  for (const s of [out.raw_message, out.quoted_text, out.expected_text, out.suggested_replacement]) {
    assert.equal(s.includes("<"), false, `tag in: ${s}`);
    assert.equal(s.includes("src="), false);
  }
});
