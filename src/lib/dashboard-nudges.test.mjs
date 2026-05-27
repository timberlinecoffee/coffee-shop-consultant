// TIM-1063 + TIM-1147: tests for the progress-dashboard helpers.
//
// Covers next-step priority order, opt-out behavior, stale-nudge thresholding,
// recent-activity ordering, and weakest-workspace tie-breaking. Pure helper
// — no Supabase / Next.js wiring. Switched from auto-derived filled/total to
// the manual 3-state status model in TIM-1147.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RECOMMENDATION_ORDER,
  STALE_THRESHOLD_DAYS,
  buildRecentActivity,
  buildStaleNudges,
  buildWorkspaceSnapshots,
  pickNextStep,
  pickWeakestWorkspace,
} from "./dashboard-nudges.ts";

const NOW = new Date("2026-05-25T12:00:00Z");

function isoDaysAgo(n) {
  return new Date(NOW.getTime() - n * 86400000).toISOString();
}

test("RECOMMENDATION_ORDER puts Concept first", () => {
  assert.equal(RECOMMENDATION_ORDER[0], 1);
});

test("buildWorkspaceSnapshots maps status to pct 0/50/100", () => {
  const status = new Map([
    ["concept", "complete"],
    ["financials", "in_progress"],
  ]);
  const touched = new Map([
    ["concept", isoDaysAgo(1)],
    ["financials", isoDaysAgo(2)],
  ]);
  const snaps = buildWorkspaceSnapshots(status, touched);

  const concept = snaps.find((s) => s.moduleNumber === 1);
  assert.ok(concept);
  assert.equal(concept.pct, 100);
  assert.equal(concept.isComplete, true);

  const financials = snaps.find((s) => s.moduleNumber === 2);
  assert.ok(financials);
  assert.equal(financials.pct, 50);
  assert.equal(financials.isComplete, false);

  const menu = snaps.find((s) => s.moduleNumber === 4);
  assert.ok(menu);
  assert.equal(menu.pct, 0);
  assert.equal(menu.status, "not_started");
});

test("buildWorkspaceSnapshots: an edit timestamp alone makes it started", () => {
  const touched = new Map([["menu_pricing", isoDaysAgo(0)]]);
  const snaps = buildWorkspaceSnapshots(new Map(), touched);
  const menu = snaps.find((s) => s.moduleNumber === 4);
  assert.ok(menu);
  assert.equal(menu.isStarted, true);
  // Status itself stays not_started until the user picks In Progress / Complete
  // explicitly or the server auto-promotes via the API.
  assert.equal(menu.status, "not_started");
});

test("pickNextStep returns the first incomplete workspace in priority order", () => {
  const snaps = buildWorkspaceSnapshots(new Map(), new Map());
  const step = pickNextStep(snaps);
  assert.ok(step);
  assert.equal(step.moduleNumber, 1);
  assert.equal(step.ctaLabel, "Start");
  for (const word of ["leverage", "synergy", "passionate", "curated"]) {
    assert.equal(step.headline.toLowerCase().includes(word), false);
    assert.equal(step.body.toLowerCase().includes(word), false);
  }
});

test("pickNextStep skips completed and opted-out workspaces", () => {
  const status = new Map([
    ["concept", "complete"],
    ["financials", "complete"],
  ]);
  const snaps = buildWorkspaceSnapshots(status, new Map());
  const step = pickNextStep(snaps);
  assert.ok(step);
  assert.equal(step.moduleNumber, 3);

  const stepWithOptOut = pickNextStep(snaps, new Set([3]));
  assert.ok(stepWithOptOut);
  assert.equal(stepWithOptOut.moduleNumber, 4);
});

test("pickNextStep returns null when every shipped workspace is complete", () => {
  const status = new Map();
  for (const key of [
    "concept",
    "financials",
    "location_lease",
    "menu_pricing",
    "buildout_equipment",
    "launch_plan",
    "hiring",
    "business_plan",
    "marketing",
    "inventory",
  ]) {
    status.set(key, "complete");
  }
  const snaps = buildWorkspaceSnapshots(status, new Map());
  assert.equal(pickNextStep(snaps), null);
});

test("pickNextStep uses Continue copy for started workspaces", () => {
  const status = new Map([["concept", "in_progress"]]);
  const touched = new Map([["concept", isoDaysAgo(0)]]);
  const snaps = buildWorkspaceSnapshots(status, touched);
  const step = pickNextStep(snaps);
  assert.ok(step);
  assert.equal(step.moduleNumber, 1);
  assert.equal(step.ctaLabel, "Continue");
});

test("buildStaleNudges flags in-progress workspaces past the threshold", () => {
  const status = new Map([["financials", "in_progress"]]);
  const touched = new Map([
    ["concept", isoDaysAgo(STALE_THRESHOLD_DAYS + 2)],
    ["financials", isoDaysAgo(STALE_THRESHOLD_DAYS + 1)],
    ["menu_pricing", isoDaysAgo(1)],
  ]);
  const snaps = buildWorkspaceSnapshots(status, touched);
  const nudges = buildStaleNudges(snaps, { now: NOW });
  const modules = nudges.map((n) => n.moduleNumber).sort();
  assert.deepEqual(modules, [1, 2]);
  for (const nudge of nudges) {
    assert.ok(nudge.message.includes(`${nudge.daysStale} days`));
  }
});

test("buildStaleNudges skips never-touched and complete workspaces", () => {
  const status = new Map([["concept", "complete"]]);
  const touched = new Map([["concept", isoDaysAgo(STALE_THRESHOLD_DAYS + 5)]]);
  const snaps = buildWorkspaceSnapshots(status, touched);
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

test("pickWeakestWorkspace prefers lower status, then RECOMMENDATION_ORDER", () => {
  const status = new Map([
    ["concept", "complete"],
    ["financials", "in_progress"],
  ]);
  const snaps = buildWorkspaceSnapshots(status, new Map());
  const weakest = pickWeakestWorkspace(snaps);
  assert.ok(weakest);
  // Several workspaces sit at not_started (pct 0). RECOMMENDATION_ORDER
  // breaks the tie → module 3 wins.
  assert.equal(weakest.moduleNumber, 3);
});

test("pickWeakestWorkspace returns null when nothing remains", () => {
  const status = new Map();
  for (const key of [
    "concept",
    "financials",
    "location_lease",
    "menu_pricing",
    "buildout_equipment",
    "launch_plan",
    "hiring",
    "business_plan",
    "marketing",
    "inventory",
  ]) {
    status.set(key, "complete");
  }
  const snaps = buildWorkspaceSnapshots(status, new Map());
  assert.equal(pickWeakestWorkspace(snaps), null);
});
