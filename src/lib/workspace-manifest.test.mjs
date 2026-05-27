// TIM-1147: Pin the manual 3-state readiness formula. Replaces the
// auto-derived filled/total assertions that lived here under TIM-903.

import { test } from "node:test";
import assert from "node:assert/strict";
import { planReadinessPctFromStatuses } from "./workspace-status.ts";

const KEYS = ["concept", "financials", "menu", "buildout", "launch", "hiring"];

test("empty status set reads 0%", () => {
  assert.equal(planReadinessPctFromStatuses(KEYS, new Map()), 0);
});

test("one Complete out of six rolls up to ~17%", () => {
  const m = new Map([["concept", "complete"]]);
  const pct = planReadinessPctFromStatuses(KEYS, m);
  assert.ok(pct > 0 && pct < 25, `expected <25%, got ${pct}%`);
});

test("one In Progress out of six rolls up to ~8%", () => {
  const m = new Map([["concept", "in_progress"]]);
  const pct = planReadinessPctFromStatuses(KEYS, m);
  assert.ok(pct > 0 && pct < 15, `expected <15%, got ${pct}%`);
});

test("all Complete reads exactly 100%", () => {
  const m = new Map(KEYS.map((k) => [k, "complete"]));
  assert.equal(planReadinessPctFromStatuses(KEYS, m), 100);
});

test("all In Progress reads exactly 50%", () => {
  const m = new Map(KEYS.map((k) => [k, "in_progress"]));
  assert.equal(planReadinessPctFromStatuses(KEYS, m), 50);
});
