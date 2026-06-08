// TIM-2483 / TIM-2454 F8: pin the Launch Plan Gantt window so the strip is
// derived from milestone offsets (with sensible defaults) rather than the
// legacy hardcoded T-90 → Day+30 / 120-day span. The drift guards at the
// bottom keep the consumer wired to the helpers — re-inlining the old
// `((offset + 90) / 120) * 100` is rejected by CI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  DEFAULT_WINDOW_MIN,
  DEFAULT_WINDOW_MAX,
  computeGanttWindow,
  ganttAnchorsForWindow,
  ganttPositionFromOffset,
} from "./gantt-window.ts";

const here = dirname(fileURLToPath(import.meta.url));

// ── computeGanttWindow ─────────────────────────────────────────────────────

test("computeGanttWindow returns defaults when no milestones", () => {
  assert.deepEqual(computeGanttWindow([]), { min: -90, max: 30 });
  assert.equal(DEFAULT_WINDOW_MIN, -90);
  assert.equal(DEFAULT_WINDOW_MAX, 30);
});

test("computeGanttWindow keeps defaults when offsets fit inside them", () => {
  assert.deepEqual(computeGanttWindow([-60, -30, 0, 14]), { min: -90, max: 30 });
});

test("computeGanttWindow expands min when a milestone is earlier than -90", () => {
  // F8 founder scenario: 180-day pre-opening runway — the T-180 milestone
  // would have been off-canvas under the legacy hardcoded window.
  assert.deepEqual(computeGanttWindow([-180, -60, 0, 14]), { min: -180, max: 30 });
});

test("computeGanttWindow expands max when a milestone is later than +30", () => {
  assert.deepEqual(computeGanttWindow([-30, 0, 60]), { min: -90, max: 60 });
});

test("computeGanttWindow honors caller-supplied defaults", () => {
  assert.deepEqual(
    computeGanttWindow([], { defaultMin: -120, defaultMax: 60 }),
    { min: -120, max: 60 },
  );
  // and still expands past those when offsets demand it
  assert.deepEqual(
    computeGanttWindow([-200, 90], { defaultMin: -120, defaultMax: 60 }),
    { min: -200, max: 90 },
  );
});

test("computeGanttWindow filters non-finite offsets", () => {
  assert.deepEqual(computeGanttWindow([NaN, -45, Infinity, 10]), { min: -90, max: 30 });
});

// ── ganttAnchorsForWindow ──────────────────────────────────────────────────

test("ganttAnchorsForWindow yields the legacy 6 anchors for the default window", () => {
  const labels = ganttAnchorsForWindow(-90, 30).map((a) => a.label);
  // Day 0 is the launch marker and must always show within a default window.
  assert.deepEqual(labels, ["T-90", "T-60", "T-30", "T-14", "T-7", "Day 0", "Day+7", "Day+30"]);
  assert.ok(labels.includes("Day 0"));
});

test("ganttAnchorsForWindow adds wider anchors when the window expands", () => {
  const labels = ganttAnchorsForWindow(-180, 90).map((a) => a.label);
  assert.ok(labels.includes("T-180"));
  assert.ok(labels.includes("Day+90"));
  assert.ok(labels.includes("Day 0"));
  // legacy anchors must still be there
  assert.ok(labels.includes("T-90"));
  assert.ok(labels.includes("Day+30"));
});

test("ganttAnchorsForWindow excludes anchors outside the active window", () => {
  const labels = ganttAnchorsForWindow(-30, 7).map((a) => a.label);
  assert.ok(!labels.includes("T-90"), "T-90 must not show in a narrowed window");
  assert.ok(!labels.includes("Day+30"), "Day+30 must not show in a narrowed window");
  assert.ok(labels.includes("Day 0"));
});

// ── ganttPositionFromOffset ────────────────────────────────────────────────

test("ganttPositionFromOffset interpolates linearly across the window", () => {
  // default window -90 .. 30 spans 120 days; Day 0 sits 90/120 = 75%
  assert.equal(ganttPositionFromOffset(0, -90, 30), 75);
  // T-90 pins to 0%, Day+30 pins to 100%
  assert.equal(ganttPositionFromOffset(-90, -90, 30), 0);
  assert.equal(ganttPositionFromOffset(30, -90, 30), 100);
});

test("ganttPositionFromOffset clamps out-of-window values to [0, 100]", () => {
  assert.equal(ganttPositionFromOffset(-200, -90, 30), 0);
  assert.equal(ganttPositionFromOffset(200, -90, 30), 100);
});

test("ganttPositionFromOffset handles a degenerate same-min-max window without dividing by zero", () => {
  const pct = ganttPositionFromOffset(0, 0, 0);
  assert.ok(Number.isFinite(pct));
  assert.ok(pct >= 0 && pct <= 100);
});

test("ganttPositionFromOffset re-positions when the window widens (F8 regression)", () => {
  // The same milestone at T-150 lands off-canvas under the hardcoded window
  // (clamped to 0%) but at 16.6...% under a window expanded to -180.
  const clamped = ganttPositionFromOffset(-150, -90, 30);
  const expanded = ganttPositionFromOffset(-150, -180, 30);
  assert.equal(clamped, 0);
  assert.ok(expanded > 0 && expanded < 50, `expected 0<x<50, got ${expanded}`);
});

// ── Drift guards on the consumer ───────────────────────────────────────────

test("LaunchTimelineCard imports from the gantt-window helper", () => {
  const src = readFileSync(join(here, "LaunchTimelineCard.tsx"), "utf8");
  assert.match(src, /computeGanttWindow/, "consumer must use computeGanttWindow");
  assert.match(src, /ganttPositionFromOffset/, "consumer must use ganttPositionFromOffset");
  assert.match(src, /ganttAnchorsForWindow/, "consumer must use ganttAnchorsForWindow");
});

test("LaunchTimelineCard does not re-inline the legacy 120-day window math", () => {
  const src = readFileSync(join(here, "LaunchTimelineCard.tsx"), "utf8");
  // The hardcoded `((offset + 90) / 120) * 100` shape (or its bare components)
  // must not reappear.
  assert.ok(
    !/\(\s*offset\s*\+\s*90\s*\)\s*\/\s*120/.test(src),
    "must not re-inline (offset + 90) / 120 — derive the window instead",
  );
  assert.ok(
    !/\/\s*120\s*\)\s*\*\s*100/.test(src),
    "must not re-inline / 120 ) * 100 — derive the window instead",
  );
  // No standalone GANTT_ANCHORS array of literal {label,offset} pairs.
  assert.ok(
    !/const\s+GANTT_ANCHORS\s*=\s*\[/.test(src),
    "must not re-introduce a hardcoded GANTT_ANCHORS constant",
  );
});

test("LaunchTimelineCard exposes windowMin/windowMax props with helper defaults", () => {
  const src = readFileSync(join(here, "LaunchTimelineCard.tsx"), "utf8");
  assert.match(src, /windowMin\?:\s*number/);
  assert.match(src, /windowMax\?:\s*number/);
  assert.match(src, /DEFAULT_WINDOW_MIN/);
  assert.match(src, /DEFAULT_WINDOW_MAX/);
});
