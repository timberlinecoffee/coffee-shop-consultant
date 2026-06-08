// TIM-2453 — pin the audit-finding → cross-suite conflict id mapping.
//
// Verifies the two binding rules:
//   1. The hiring↔financials headcount finding maps to the conflict id the
//      resolver's GET response uses.
//   2. There is NO "default conflict" fallback: unmapped findings return null
//      so the Check-mode card keeps its existing Apply/Go-to-source path.

import test from "node:test";
import assert from "node:assert/strict";
import { crossSuiteConflictIdForAuditFinding } from "./audit-mapping.ts";

test("headcount mismatch maps to hiring_financials_headcount", () => {
  const id = crossSuiteConflictIdForAuditFinding({
    id: "src:headcount_mismatch",
    rule_id: "cross_suite_mismatch",
  });
  assert.equal(id, "hiring_financials_headcount");
});

test("other cross_suite_mismatch findings return null — no default fallback", () => {
  for (const auditId of [
    "src:capex_equipment_mismatch",
    "src:menu_ticket_below_min",
    "src:menu_ticket_above_basket",
    "src:hiring_after_opening",
  ]) {
    const id = crossSuiteConflictIdForAuditFinding({
      id: auditId,
      rule_id: "cross_suite_mismatch",
    });
    assert.equal(id, null, `${auditId} must not map to a default conflict`);
  }
});

test("non cross_suite rules return null even if id happens to collide", () => {
  // Defense against future rename: if some other rule reuses the id, the
  // mapping still refuses to fire unless rule_id is cross_suite_mismatch.
  const id = crossSuiteConflictIdForAuditFinding({
    id: "src:headcount_mismatch",
    rule_id: "numeric_mismatch",
  });
  assert.equal(id, null);
});

test("unknown audit id returns null", () => {
  const id = crossSuiteConflictIdForAuditFinding({
    id: "audit:nothing-registered",
    rule_id: "cross_suite_mismatch",
  });
  assert.equal(id, null);
});
