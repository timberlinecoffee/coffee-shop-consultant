// TIM-4108 (UX Phase 3): the emphasised button and the progress line are
// derived from the same list of steps, and they must never disagree.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStep, stepsProgress } from "./next-step.ts";
import { progressView } from "./workspace-progress.ts";

const STEPS = [
  { id: "overview", label: "Overview", done: false },
  { id: "channels", label: "Channels", done: false },
  { id: "story", label: "Story And Brand", done: false },
  { id: "pre_launch", label: "Pre-launch Plan", done: false },
];

const withDone = (...ids) =>
  STEPS.map((s) => ({ ...s, done: ids.includes(s.id) }));

test("an untouched workspace invites you in rather than nagging", () => {
  const n = nextStep(STEPS);
  assert.equal(n.label, "Start with Overview");
  assert.equal(n.id, "overview");
});

test("once you are underway the wording resumes instead of restarting", () => {
  const n = nextStep(withDone("overview"));
  assert.equal(n.label, "Continue with Channels");
  assert.equal(n.id, "channels");
});

test("a part-finished step is still the next thing to do", () => {
  // `done` is deliberately binary. Half-written is not finished, and a button
  // that skips past it would strand work the owner started.
  const n = nextStep(withDone("overview", "channels", "pre_launch"));
  assert.equal(n.id, "story");
  assert.equal(n.label, "Continue with Story And Brand");
});

test("a finished workspace goes quiet rather than inventing a task", () => {
  assert.equal(nextStep(withDone("overview", "channels", "story", "pre_launch")), null);
  assert.equal(nextStep([]), null, "a workspace with no steps has no next step");
});

test("skipping ahead does not confuse the button", () => {
  // Owner did the last step first. The button must point at the earliest
  // unfinished one, not the one after the most recently completed.
  const n = nextStep(withDone("pre_launch"));
  assert.equal(n.id, "overview");
  assert.equal(n.label, "Continue with Overview");
});

test("the progress line counts the same steps the button walks", () => {
  const steps = withDone("overview", "channels");
  assert.deepEqual(stepsProgress(steps), { kind: "steps", done: 2, total: 4 });
  const view = progressView(stepsProgress(steps));
  assert.equal(view.label, "2 of 4 steps done");
  assert.equal(view.pct, 50);
});

test("when the button disappears the progress line reads 100%", () => {
  // The pair has to agree at the boundary: no next step means finished, and
  // finished must not render as 75% because the two were counted separately.
  const steps = withDone("overview", "channels", "story", "pre_launch");
  assert.equal(nextStep(steps), null);
  assert.equal(progressView(stepsProgress(steps)).pct, 100);
});
