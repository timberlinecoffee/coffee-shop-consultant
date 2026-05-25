// TIM-1063: tests for the progress-dashboard helpers.
//
// Covers next-step priority order, opt-out behavior, stale-nudge thresholding,
// recent-activity ordering, and weakest-workspace tie-breaking. Pure helper
// — no Supabase / Next.js wiring.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RECOMMENDATION_ORDER,
  STALE_THRESHOLD_DAYS,
  buildRecentActivity,
  buildStaleNudges,
  buildWorkspaceSnapshots,
  moduleForWorkspaceKey,
  pickNextStep,
  pickWeakestWorkspace,
  workspaceKeyForModule,
} from "./dashboard-nudges.ts";

const NOW = new Date("2026-05-25T12:00:00Z");

function isoDaysAgo(n) {
  return new Date(NOW.getTime() - n * 86400000).toISOString();
}

test("RECOMMENDATION_ORDER puts Concept first", () => {
  assert.equal(RECOMMENDATION_ORDER[0], 1);
});

test("buildWorkspaceSnapshots returns shipped workspaces with computed pct", () => {
  const completed = new Map([
    [1, 5], // concept fully filled (5/5)
    [2, 1], // financials half-done (1/2)
  ]);
  const touched = new Map([
    ["concept", isoDaysAgo(1)],
    ["financials", isoDaysAgo(2)],
  ]);
  const snaps = buildWorkspaceSnapshots(completed, touched);
  const concept = snaps.find((s) => s.moduleNumber === 1);
  assert.ok(concept);
  assert.equal(concept.pct, 100);
  assert.equal(concept.isComplete, true);
  assert.equal(concept.isStarted, true);

  const financials = snaps.find((s) => s.moduleNumber === 2);
  assert.ok(financials);
  assert.equal(financials.pct, 50);
  assert.equal(financials.isComplete, false);

  // Workspaces without section-based progress (totalSections === null) report null pct.
  const menu = snaps.find((s) => s.moduleNumber === 4);
  assert.ok(menu);
  assert.equal(menu.pct, null);
});

test("buildWorkspaceSnapshots caps filledSections at totalSections", () => {
  // Defensive: if module_responses ever has more completed rows than the
  // manifest expects, the strip should still show 100% not 120%.
  const completed = new Map([[2, 99]]);
  const snaps = buildWorkspaceSnapshots(completed, new Map());
  const financials = snaps.find((s) => s.moduleNumber === 2);
  assert.ok(financials);
  assert.equal(financials.filledSections, 2);
  assert.equal(financials.pct, 100);
});

test("pickNextStep returns the first incomplete workspace in priority order", () => {
  const snaps = buildWorkspaceSnapshots(new Map(), new Map());
  const step = pickNextStep(snaps);
  assert.ok(step);
  assert.equal(step.moduleNumber, 1);
  assert.equal(step.ctaLabel, "Start");
  // No emojis, no banned founder-voice words.
  for (const word of ["leverage", "synergy", "passionate", "curated"]) {
    assert.equal(step.headline.toLowerCase().includes(word), false);
    assert.equal(step.body.toLowerCase().includes(word), false);
  }
});

test("pickNextStep skips completed and opted-out workspaces", () => {
  const completed = new Map([
    [1, 5], // concept complete
    [2, 2], // financials complete
  ]);
  const snaps = buildWorkspaceSnapshots(completed, new Map());
  // Module 3 (location_lease) is next in RECOMMENDATION_ORDER for non-complete
  // unlocked workspaces.
  const step = pickNextStep(snaps);
  assert.ok(step);
  assert.equal(step.moduleNumber, 3);

  const stepWithOptOut = pickNextStep(snaps, new Set([3]));
  assert.ok(stepWithOptOut);
  assert.equal(stepWithOptOut.moduleNumber, 4);
});

test("pickNextStep returns null when every shipped workspace is complete", () => {
  // Fill every workspace with enough completed sections to mark it done.
  const completed = new Map([
    [1, 5],
    [2, 2],
    [3, 3],
    [7, 4],
  ]);
  const snaps = buildWorkspaceSnapshots(completed, new Map());
  const optedOut = new Set(
    snaps
      .filter((s) => !s.isComplete && s.isUnlocked)
      .map((s) => s.moduleNumber)
  );
  assert.equal(pickNextStep(snaps, optedOut), null);
});

test("pickNextStep marks started workspaces with Continue copy", () => {
  const completed = new Map([[1, 1]]); // partially started
  const touched = new Map([["concept", isoDaysAgo(0)]]);
  const snaps = buildWorkspaceSnapshots(completed, touched);
  const step = pickNextStep(snaps);
  assert.ok(step);
  assert.equal(step.moduleNumber, 1);
  assert.equal(step.ctaLabel, "Continue");
});

test("buildStaleNudges flags workspaces past the threshold with gaps", () => {
  const completed = new Map([[2, 1]]); // financials half-done
  const touched = new Map([
    ["concept", isoDaysAgo(STALE_THRESHOLD_DAYS + 2)],
    ["financials", isoDaysAgo(STALE_THRESHOLD_DAYS + 1)],
    ["menu_pricing", isoDaysAgo(1)], // fresh — skipped
  ]);
  const snaps = buildWorkspaceSnapshots(completed, touched);
  const nudges = buildStaleNudges(snaps, { now: NOW });
  const modules = nudges.map((n) => n.moduleNumber).sort();
  assert.deepEqual(modules, [1, 2]);
  for (const nudge of nudges) {
    assert.ok(nudge.message.includes(`${nudge.daysStale} days`));
  }
});

test("buildStaleNudges skips never-touched and complete workspaces", () => {
  const completed = new Map([[1, 5]]); // concept complete
  const touched = new Map([["concept", isoDaysAgo(STALE_THRESHOLD_DAYS + 5)]]);
  const snaps = buildWorkspaceSnapshots(completed, touched);
  const nudges = buildStaleNudges(snaps, { now: NOW });
  assert.equal(nudges.length, 0);
});

test("buildStaleNudges caps at the requested limit", () => {
  const touched = new Map();
  for (const key of ["concept", "financials", "location_lease", "menu_pricing", "buildout_equipment"]) {
    touched.set(key, isoDaysAgo(STALE_THRESHOLD_DAYS + 10));
  }
  const snaps = buildWorkspaceSnapshots(new Map(), touched);
  const nudges = buildStaleNudges(snaps, { now: NOW, limit: 2 });
  assert.equal(nudges.length, 2);
});

test("buildRecentActivity orders entries newest-first and respects limit", () => {
  const touched = new Map([
    ["concept", isoDaysAgo(5)],
    ["financials", isoDaysAgo(1)],
    ["menu_pricing", isoDaysAgo(2)],
    ["buildout_equipment", isoDaysAgo(3)],
    ["launch_plan", isoDaysAgo(4)],
    ["hiring", isoDaysAgo(0)],
  ]);
  const activity = buildRecentActivity(touched, 5);
  assert.equal(activity.length, 5);
  const order = activity.map((a) => a.moduleNumber);
  // Most-recent first: hiring(7), financials(2), menu(4), buildout(5), launch(6).
  assert.deepEqual(order, [7, 2, 4, 5, 6]);
});

test("buildRecentActivity ignores unknown workspace_keys", () => {
  const touched = new Map([
    ["concept", isoDaysAgo(0)],
    ["nonexistent_key", isoDaysAgo(0)],
  ]);
  const activity = buildRecentActivity(touched);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].moduleNumber, 1);
});

test("pickWeakestWorkspace prefers the lowest pct then RECOMMENDATION_ORDER", () => {
  const completed = new Map([
    [1, 4], // concept 80%
    [2, 1], // financials 50%
  ]);
  const snaps = buildWorkspaceSnapshots(completed, new Map());
  const weakest = pickWeakestWorkspace(snaps);
  assert.ok(weakest);
  // Workspaces without section-based progress (totalSections === null) and
  // never touched fall back to pctSafe=0, so they tie with module 3 etc. at
  // 0%. The tie-breaker uses RECOMMENDATION_ORDER → module 3 wins.
  assert.equal(weakest.moduleNumber, 3);
});

test("pickWeakestWorkspace returns null when nothing remains", () => {
  const completed = new Map([
    [1, 5],
    [2, 2],
    [3, 3],
    [7, 4],
  ]);
  const snaps = buildWorkspaceSnapshots(completed, new Map());
  const optedOut = new Set(
    snaps
      .filter((s) => !s.isComplete && s.isUnlocked)
      .map((s) => s.moduleNumber)
  );
  assert.equal(pickWeakestWorkspace(snaps, optedOut), null);
});

test("workspace_key <-> module number mapping is symmetric for shipped modules", () => {
  for (const moduleNumber of RECOMMENDATION_ORDER) {
    const key = workspaceKeyForModule(moduleNumber);
    assert.ok(key, `module ${moduleNumber} should map to a workspace_key`);
    assert.equal(moduleForWorkspaceKey(key), moduleNumber);
  }
});
