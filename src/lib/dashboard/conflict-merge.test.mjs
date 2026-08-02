// TIM-4101 (T1-A): Home must never contradict a workspace conflict badge.
//
// These cover the two pure pieces the fix turns on:
//   - crossSuiteToConflict: a live cross-suite conflict becomes a Home-
//     renderable item that names the screen it lives on and links to it.
//   - deriveConflictCheckState: the three-state rule that stops an unchecked
//     plan from rendering the green all-clear.
//
// Run via node:test with --experimental-strip-types so .ts loads directly:
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crossSuiteToConflict,
  deriveConflictCheckState,
} from "./conflict-merge.ts";

// Shaped like the real detector output from
// src/lib/cross-suite/hiring-financials.ts.
function hiringVsFinancials(overrides = {}) {
  return {
    id: "hiring_financials_headcount",
    kind: "numeric",
    statement:
      "Your hiring plan costs more each month than your financial model sets aside for payroll.",
    suiteA: {
      suiteKey: "hiring",
      suiteLabel: "Hiring & Onboarding",
      fieldLabel: "People planned",
      displayValue: "7 people",
      deepLinkHref: "/workspace/hiring",
    },
    suiteB: {
      suiteKey: "financials",
      suiteLabel: "Financials",
      fieldLabel: "Monthly payroll budget",
      displayValue: "$15,600",
      deepLinkHref: "/workspace/financials",
    },
    gapLabel: "Gap: $6,100/month over budget",
    benchmark: null,
    paths: [
      {
        id: "trim_hiring",
        label: "Trim the hiring plan to match your budget",
        summary: "Reduce headcount so payroll lands inside your budget.",
        downstreamEffects: [],
        suggestions: [],
      },
      {
        id: "raise_budget",
        label: "Raise the payroll budget",
        summary: "Increase the payroll line to cover the team you want.",
        downstreamEffects: [],
        suggestions: [],
      },
    ],
    recommendedPathId: "raise_budget",
    ...overrides,
  };
}

test("cross-suite conflict names the workspace and deep-links to it", () => {
  const item = crossSuiteToConflict(hiringVsFinancials());

  assert.equal(item.source, "cross_suite");
  assert.equal(item.workspace, "Hiring & Onboarding");
  assert.equal(item.href, "/workspace/hiring");
  assert.equal(item.sectionLabel, "Hiring & Onboarding vs Financials");
  // The recommended path supplies the fix line, not the first path.
  assert.equal(
    item.suggestion,
    "Increase the payroll line to cover the team you want."
  );
  // The gap is folded into the description so Home states the size of the problem.
  assert.match(item.description, /Gap: \$6,100\/month over budget/);
});

test("cross-suite ids are namespaced so they cannot collide with audit findings", () => {
  const item = crossSuiteToConflict(hiringVsFinancials());
  assert.equal(item.id, "cross_suite:hiring_financials_headcount");
});

test("falls back to the workspace map when the detector omits a deep link", () => {
  const conflict = hiringVsFinancials();
  delete conflict.suiteA.deepLinkHref;
  const item = crossSuiteToConflict(conflict);
  assert.equal(item.href, "/workspace/hiring");
});

test("falls back to the recommended path label when it has no summary", () => {
  const conflict = hiringVsFinancials();
  delete conflict.paths[1].summary;
  const item = crossSuiteToConflict(conflict);
  assert.equal(item.suggestion, "Raise the payroll budget");
});

test("a conflict from either detector forces the conflicts state", () => {
  assert.equal(deriveConflictCheckState(1, true), "conflicts");
  // Even when no check is known to have completed, a found conflict wins.
  assert.equal(deriveConflictCheckState(3, false), "conflicts");
});

test("a plan that has never been checked is not clean", () => {
  assert.equal(deriveConflictCheckState(0, false), "unchecked");
});

test("clean only when a check actually ran and found nothing", () => {
  assert.equal(deriveConflictCheckState(0, true), "clean");
});
