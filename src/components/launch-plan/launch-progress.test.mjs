// TIM-4108 (UX Phase 3): three sub-pages, one header, one vocabulary.

import { test } from "node:test";
import assert from "node:assert/strict";
import { launchProgress } from "./launch-progress.ts";
import { progressView } from "../workspace/workspace-progress.ts";

const view = (section, counts) =>
  progressView(
    launchProgress(section, {
      milestones: 0,
      milestonesDone: 0,
      tasks: 0,
      tasksDone: 0,
      ...counts,
    }),
  );

test("no bar on any sub-page, at any count", () => {
  // D-011, for a reason specific to this screen: the owner adds their own
  // milestones and tasks, so the denominator moves under the bar. Adding three
  // tasks you have not done would send a bar DOWN — losing ground for the
  // crime of planning more carefully.
  for (const section of ["overview", "milestones", "playbook", "all"]) {
    const v = view(section, { milestones: 12, milestonesDone: 5, tasks: 24, tasksDone: 9 });
    assert.equal(v.showBar, false, `bar drawn on ${section}`);
    assert.equal(v.pct, null, `percentage shown on ${section}`);
  }
});

test("each sub-page states its own list", () => {
  const counts = { milestones: 12, milestonesDone: 5, tasks: 24, tasksDone: 9 };
  assert.equal(view("milestones", counts).label, "12 milestones · 5 done");
  assert.equal(view("playbook", counts).label, "24 tasks · 9 done");
});

test("the overview names both lists", () => {
  const v = view("overview", { milestones: 12, milestonesDone: 5, tasks: 24, tasksDone: 9 });
  assert.equal(v.label, "12 milestones · 5 done · 24 tasks · 9 done");
});

test("the overview omits a list that is still empty rather than reporting a zero", () => {
  // A "0 tasks" on the overview is a number the owner cannot act on from that
  // page — the tasks live on another tab.
  const v = view("overview", { milestones: 12, milestonesDone: 5 });
  assert.equal(v.label, "12 milestones · 5 done");
});

test("nothing done yet is stated as a plain count, with no trailing zero", () => {
  assert.equal(view("milestones", { milestones: 7 }).label, "7 milestones");
  assert.doesNotMatch(view("milestones", { milestones: 7 }).label, /0 done/);
});

test("empty sub-pages say so in their own words", () => {
  assert.equal(view("milestones", {}).label, "No milestones yet");
  assert.equal(view("playbook", {}).label, "No tasks yet");
  assert.equal(view("overview", {}).label, "Nothing planned yet");
});

test("singulars", () => {
  assert.equal(view("milestones", { milestones: 1, milestonesDone: 1 }).label, "1 milestone · 1 done");
  assert.equal(view("playbook", { tasks: 1 }).label, "1 task");
});

test("done can never exceed the total", () => {
  assert.equal(view("playbook", { tasks: 4, tasksDone: 99 }).label, "4 tasks · 4 done");
});

test("the line never borrows the steps or sections vocabulary", () => {
  // T1-D: "steps" belongs to workspaces you walk, "sections" to generated
  // documents. These are lists the owner builds.
  for (const section of ["overview", "milestones", "playbook", "all"]) {
    const v = view(section, { milestones: 3, milestonesDone: 1, tasks: 5, tasksDone: 2 });
    assert.doesNotMatch(v.label, /step|section|workspace/i);
  }
});
