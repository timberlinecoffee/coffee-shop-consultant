// TIM-4105: a screen may only claim "Saved" if a server accepted the write.
//
// These pin the specific ways the Hiring workspace used to lie:
//   - it said "Saved · <time>" where the time was page-load, not a save
//   - a rejected write looked identical to an accepted one
//   - a thrown request was swallowed, so nothing ever said anything
//   - the retry affordance was wired to a function that did nothing

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_SAVE_STATE,
  SAVE_FAILED_MESSAGE,
  saveStateReducer,
  toIndicatorView,
  hasUnsavedWork,
} from "./save-state.ts";

const run = (events, from = IDLE_SAVE_STATE) =>
  events.reduce(saveStateReducer, from);

test("a fresh screen has never saved and says so", () => {
  // The original froze a timestamp at mount, so the header claimed a save
  // that had not happened before the owner typed anything at all.
  assert.equal(IDLE_SAVE_STATE.savedAt, null);
  assert.equal(toIndicatorView(IDLE_SAVE_STATE).savedAt, null);
  assert.equal(toIndicatorView(IDLE_SAVE_STATE).saving, false);
});

test("only an accepted write produces a saved timestamp", () => {
  const s = run([{ type: "start" }, { type: "success", at: "2026-08-02T10:00:00Z" }]);
  assert.equal(s.kind, "saved");
  assert.equal(s.savedAt, "2026-08-02T10:00:00Z");
  assert.equal(toIndicatorView(s).savedAt, "2026-08-02T10:00:00Z");
});

test("a failed write is reported, not swallowed", () => {
  const s = run([{ type: "start" }, { type: "failure" }]);
  assert.equal(s.kind, "failed");
  assert.equal(s.message, SAVE_FAILED_MESSAGE);
  assert.equal(toIndicatorView(s).error, SAVE_FAILED_MESSAGE);
});

test("a failure hides any earlier saved timestamp", () => {
  // "Saved · 9:14am" sitting next to work that never left the browser is the
  // most misleading thing the old screen did. The timestamp is still tracked
  // internally, but it must not be shown while a failure is outstanding.
  const s = run([
    { type: "start" },
    { type: "success", at: "2026-08-02T09:14:00Z" },
    { type: "start" },
    { type: "failure" },
  ]);
  assert.equal(s.savedAt, "2026-08-02T09:14:00Z");
  assert.equal(toIndicatorView(s).savedAt, null);
  assert.equal(toIndicatorView(s).error, SAVE_FAILED_MESSAGE);
});

test("a later success does not paper over an outstanding failure", () => {
  // The subtle one. Edits fire per-keystroke-ish, so a failed edit can easily
  // be followed by a successful one. Flipping back to "Saved" would silently
  // abandon the earlier change — the original bug wearing a new costume.
  const s = run([
    { type: "start" },
    { type: "failure" },
    { type: "start" },
    { type: "success", at: "2026-08-02T10:05:00Z" },
  ]);
  assert.equal(s.kind, "failed");
  assert.equal(toIndicatorView(s).error, SAVE_FAILED_MESSAGE);
  assert.equal(toIndicatorView(s).savedAt, null);
});

test("overlapping writes do not flip to Saved while one is still going", () => {
  const s = run([
    { type: "start" },
    { type: "start" },
    { type: "success", at: "2026-08-02T10:00:00Z" },
  ]);
  assert.equal(s.kind, "saving");
  assert.equal(s.inFlight, 1);
  assert.equal(toIndicatorView(s).saving, true);
});

test("the last of several overlapping writes settles to saved", () => {
  const s = run([
    { type: "start" },
    { type: "start" },
    { type: "success", at: "2026-08-02T10:00:00Z" },
    { type: "success", at: "2026-08-02T10:00:01Z" },
  ]);
  assert.equal(s.kind, "saved");
  assert.equal(s.inFlight, 0);
  assert.equal(s.savedAt, "2026-08-02T10:00:01Z");
});

test("in-flight count never goes negative", () => {
  // Defensive: a stray success without a matching start must not leave the
  // counter below zero, which would wedge the indicator on "saving" forever.
  const s = run([{ type: "success", at: "2026-08-02T10:00:00Z" }]);
  assert.equal(s.inFlight, 0);
});

test("a custom failure message is preserved", () => {
  const s = run([{ type: "start" }, { type: "failure", message: "Your session expired. Sign in again." }]);
  assert.equal(toIndicatorView(s).error, "Your session expired. Sign in again.");
});

test("retrying after a failure clears it once the write lands", () => {
  // The recovery path has to actually recover, or the message is just nagging.
  // Retry re-runs the failed write from a clean state.
  const failed = run([{ type: "start" }, { type: "failure" }]);
  const recovered = run(
    [{ type: "start" }, { type: "success", at: "2026-08-02T10:10:00Z" }],
    { ...failed, kind: "saving", message: null }
  );
  assert.equal(recovered.kind, "saved");
  assert.equal(toIndicatorView(recovered).error, null);
  assert.equal(toIndicatorView(recovered).savedAt, "2026-08-02T10:10:00Z");
});

test("unsaved work is detectable for a leave-the-page warning", () => {
  assert.equal(hasUnsavedWork(IDLE_SAVE_STATE), false);
  assert.equal(
    hasUnsavedWork(run([{ type: "start" }, { type: "success", at: "2026-08-02T10:00:00Z" }])),
    false
  );
  assert.equal(hasUnsavedWork(run([{ type: "start" }, { type: "failure" }])), true);
});

test("the failure message names the next action and does not blame the owner", () => {
  assert.match(SAVE_FAILED_MESSAGE, /press Save to try again/);
  assert.doesNotMatch(SAVE_FAILED_MESSAGE, /you (failed|forgot|did)/i);
});
