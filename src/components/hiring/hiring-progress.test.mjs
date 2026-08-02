// TIM-4108 (UX Phase 3): Hiring states what exists and never invents a target
// headcount to measure the owner against.

import { test } from "node:test";
import assert from "node:assert/strict";
import { hiringProgress } from "./hiring-progress.ts";
import { progressView } from "../workspace/workspace-progress.ts";

const view = (counts) => progressView(hiringProgress({ roles: 0, candidates: 0, ...counts }));

test("never a bar, because there is no correct number of people to hire", () => {
  // The clearest D-011 case in the batch. A three-person shop that has hired
  // three people is finished; a bar putting them at 40% of some imagined
  // headcount would be worse than saying nothing at all.
  for (const counts of [
    { roles: 1 },
    { roles: 6, candidates: 3 },
    { roles: 20, candidates: 50 },
  ]) {
    const v = view(counts);
    assert.equal(v.showBar, false);
    assert.equal(v.pct, null);
  }
});

test("an empty workspace points at roles, because roles come first", () => {
  assert.equal(view({}).label, "No roles yet");
});

test("candidates only appear once there are some", () => {
  // An owner still writing job descriptions should not be shown a nag about
  // interviews they have not booked.
  assert.equal(view({ roles: 4 }).label, "4 roles");
  assert.doesNotMatch(view({ roles: 4 }).label, /candidate/);
});

test("both are named once both exist", () => {
  assert.equal(view({ roles: 6, candidates: 3 }).label, "6 roles · 3 candidates");
});

test("candidates without roles still read sensibly", () => {
  // Possible if someone deletes a role after interviewing for it.
  assert.equal(view({ candidates: 2 }).label, "2 candidates");
});

test("singulars", () => {
  assert.equal(view({ roles: 1, candidates: 1 }).label, "1 role · 1 candidate");
});

test("the line never borrows the steps or sections vocabulary", () => {
  assert.doesNotMatch(view({ roles: 3, candidates: 2 }).label, /step|section|workspace/i);
});
