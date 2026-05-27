// TIM-1147 pinning tests for the manual 3-state workspace status model.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateStatus,
  planReadinessPctFromStatuses,
  statusPct,
} from "./workspace-status.ts";

test("statusPct maps the 3 statuses to 0/50/100", () => {
  assert.equal(statusPct("not_started"), 0);
  assert.equal(statusPct("in_progress"), 50);
  assert.equal(statusPct("complete"), 100);
});

test("aggregateStatus: empty → not_started", () => {
  assert.equal(aggregateStatus([]), "not_started");
});

test("aggregateStatus: all complete → complete", () => {
  assert.equal(
    aggregateStatus(["complete", "complete", "complete"]),
    "complete"
  );
});

test("aggregateStatus: any non-not_started → in_progress", () => {
  assert.equal(aggregateStatus(["not_started", "in_progress"]), "in_progress");
  assert.equal(aggregateStatus(["not_started", "complete"]), "in_progress");
});

test("aggregateStatus: all not_started → not_started", () => {
  assert.equal(
    aggregateStatus(["not_started", "not_started"]),
    "not_started"
  );
});

test("planReadinessPctFromStatuses: rolls up to integer percent", () => {
  const keys = ["a", "b", "c", "d"];
  const map = new Map([
    ["a", "complete"],
    ["b", "in_progress"],
    ["c", "not_started"],
    // d missing → treated as not_started
  ]);
  // (100 + 50 + 0 + 0) / 4 = 37.5 → 38
  assert.equal(planReadinessPctFromStatuses(keys, map), 38);
});

test("planReadinessPctFromStatuses: empty list → 0", () => {
  assert.equal(planReadinessPctFromStatuses([], new Map()), 0);
});
