// TIM-1373 pinning tests for the dashboard Launch Readiness view model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLaunchReadiness, readinessCopy } from "./launch-readiness.ts";
import { WORKSPACE_MANIFEST } from "./workspace-manifest.ts";
import { AVAILABLE_MODULES } from "./modules.ts";

const unlockedKeys = WORKSPACE_MANIFEST.filter((i) =>
  AVAILABLE_MODULES.has(i.moduleNumber)
).map((i) => i.workspaceKey);

test("readinessCopy: 0% is the inviting empty-state nudge", () => {
  const { headline, subline } = readinessCopy(0);
  assert.match(headline, /Get Your Plan Started/);
  assert.match(subline, /climb/);
});

test("readinessCopy: mid range reads 'You're X% Ready To Open'", () => {
  assert.equal(readinessCopy(60).headline, "You're 60% Ready To Open");
  assert.equal(readinessCopy(20).headline, "You're 20% Ready To Open");
});

test("readinessCopy: 100% is the complete line", () => {
  assert.equal(readinessCopy(100).headline, "You're 100% Ready To Open");
  assert.match(readinessCopy(100).subline, /complete/);
});

test("readinessCopy: sublines shift by tier", () => {
  assert.match(readinessCopy(10).subline, /good start/i);
  assert.match(readinessCopy(50).subline, /real progress/i);
  assert.match(readinessCopy(80).subline, /finish line/i);
});

test("copy carries no emojis or em dashes (Voice Mandate)", () => {
  for (const pct of [0, 10, 50, 80, 100]) {
    const { headline, subline } = readinessCopy(pct);
    const text = `${headline} ${subline}`;
    assert.ok(!/—/.test(text), `em dash in copy for ${pct}`);
    // No emoji (rough non-ASCII guard for pictographs).
    assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), `emoji in copy for ${pct}`);
  }
});

test("buildLaunchReadiness: empty map → 0%, isEmpty, all not_started", () => {
  const r = buildLaunchReadiness(new Map());
  assert.equal(r.pct, 0);
  assert.equal(r.isEmpty, true);
  assert.equal(r.workspaces.length, unlockedKeys.length);
  assert.ok(r.workspaces.every((w) => w.status === "not_started" && w.pct === 0));
});

test("buildLaunchReadiness: all complete → 100%, not empty", () => {
  const map = new Map(unlockedKeys.map((k) => [k, "complete"]));
  const r = buildLaunchReadiness(map);
  assert.equal(r.pct, 100);
  assert.equal(r.isEmpty, false);
  assert.ok(r.workspaces.every((w) => w.pct === 100));
});

test("buildLaunchReadiness: half complete rolls up correctly", () => {
  // Mark every workspace in_progress (50) → overall 50.
  const map = new Map(unlockedKeys.map((k) => [k, "in_progress"]));
  const r = buildLaunchReadiness(map);
  assert.equal(r.pct, 50);
  assert.equal(r.isEmpty, false);
});

test("buildLaunchReadiness: one in_progress is not empty", () => {
  const map = new Map([[unlockedKeys[0], "in_progress"]]);
  const r = buildLaunchReadiness(map);
  assert.equal(r.isEmpty, false);
  assert.ok(r.pct > 0);
});

test("buildLaunchReadiness: every workspace carries href + label", () => {
  const r = buildLaunchReadiness(new Map());
  for (const w of r.workspaces) {
    assert.ok(w.href.startsWith("/workspace/"));
    assert.ok(w.label.length > 0);
  }
});
