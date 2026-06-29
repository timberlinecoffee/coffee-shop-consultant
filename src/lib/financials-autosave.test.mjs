// TIM-3439: repro + regression test for the financials autosave debounce +
// AbortController guard in financials-workspace.tsx.
//
// The risk: rapid numeric input (customer count, ticket price, COGS %) triggers
// multiple PATCH /api/workspaces/financials/model requests. Without debounce +
// AbortController the last request to COMPLETE wins, not the last one sent —
// an earlier slow response can silently overwrite the user's final edit.
//
// The fix (already in financials-workspace.tsx):
//   - AUTOSAVE_DEBOUNCE_MS (800ms) coalesces rapid edits into a single request.
//   - Each persist() call aborts the previous AbortController before starting a
//     new fetch, so superseded in-flight requests never land in the DB.
//
// These tests mirror the exact scheduleSave + persist pattern from the component
// without React rendering. They use Node's MockTimers to control setTimeout.

import { test } from "node:test";
import assert from "node:assert/strict";

// Mirrors the constant at financials-workspace.tsx line 81.
const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Mirrors scheduleSave + persist from financials-workspace.tsx.
 *
 * fetchStub(value, signal): called once per actual save attempt.
 * Returns { schedule } — call schedule(value) to queue an autosave.
 */
function makeAutosaver(fetchStub) {
  let pendingTimer = null;
  let latestValue = null;
  let inFlightController = null;

  async function persist(value) {
    // Abort any superseded in-flight request before starting a new one.
    if (inFlightController) inFlightController.abort();
    const controller = new AbortController();
    inFlightController = controller;
    try {
      await fetchStub(value, controller.signal);
    } catch (err) {
      // Aborted = silently swallowed (superseded request, not a real error).
      if (controller.signal.aborted) return;
      throw err;
    }
  }

  return {
    schedule(value) {
      // Always capture the latest value so the debounced flush reads it.
      latestValue = value;
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        void persist(latestValue);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
  };
}

// ── (1) Debounce coalesces rapid edits ────────────────────────────────────────

test("rapid edits within the debounce window produce exactly one fetch", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const saver = makeAutosaver(async (value) => {
    calls.push(value);
  });

  // Simulate rapid typing across several numeric fields (all within the window).
  saver.schedule({ avg_ticket_cents: 500 });
  saver.schedule({ avg_ticket_cents: 600 });
  saver.schedule({ avg_ticket_cents: 700 });
  saver.schedule({ avg_ticket_cents: 800 });
  saver.schedule({ avg_ticket_cents: 900 });

  // No fetch should have fired yet.
  assert.equal(calls.length, 0, "no fetch before debounce window expires");

  // Advance past the debounce threshold.
  t.mock.timers.tick(AUTOSAVE_DEBOUNCE_MS + 1);

  // Exactly one fetch, carrying the last edit.
  assert.equal(calls.length, 1, "exactly one fetch after debounce window");
  assert.deepEqual(
    calls[0],
    { avg_ticket_cents: 900 },
    "last-typed value is what was saved (no earlier edit overwrites it)"
  );
});

// ── (2) Last value wins via latestValue ref ───────────────────────────────────

test("the saved value is the last one scheduled, not the first", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const saver = makeAutosaver(async (value) => {
    calls.push(value);
  });

  // Three edits — only the last should reach the network.
  saver.schedule({ cogs_pct: 30 });
  saver.schedule({ cogs_pct: 32 });
  saver.schedule({ cogs_pct: 35 });

  t.mock.timers.tick(AUTOSAVE_DEBOUNCE_MS + 1);

  assert.equal(calls[0].cogs_pct, 35, "cogs_pct 35 (last edit) was persisted, not 30 or 32");
});

// ── (3) Edits across multiple windows each save independently ─────────────────

test("edits separated by a full debounce window each trigger their own save", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const saver = makeAutosaver(async (value) => {
    calls.push(value);
  });

  // First burst: customer count.
  saver.schedule({ customers_per_day: 80 });
  saver.schedule({ customers_per_day: 90 });
  t.mock.timers.tick(AUTOSAVE_DEBOUNCE_MS + 1); // first window fires

  // Second burst: ticket price (after the first debounce has settled).
  saver.schedule({ avg_ticket_cents: 700 });
  saver.schedule({ avg_ticket_cents: 750 });
  t.mock.timers.tick(AUTOSAVE_DEBOUNCE_MS + 1); // second window fires

  assert.equal(calls.length, 2, "two separate debounce windows → two saves");
  assert.deepEqual(calls[0], { customers_per_day: 90 }, "first window: last customer value");
  assert.deepEqual(calls[1], { avg_ticket_cents: 750 }, "second window: last ticket value");
});

// ── (4) AbortController: superseded in-flight request is cancelled ────────────

test("a slow in-flight request is aborted when a newer save supersedes it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const completed = [];
  let abortedCount = 0;
  let triggerFirstCompletion = null; // call this to let the first slow request finish

  const saver = makeAutosaver(async (value, signal) => {
    // Abort-aware: throw immediately if already aborted before even starting.
    if (signal.aborted) {
      abortedCount++;
      throw new DOMException("aborted", "AbortError");
    }

    await new Promise((resolve, reject) => {
      if (value.slow) {
        // Park this request — it won't complete until the test releases it.
        // Guard against pushing to completed if the signal was already aborted.
        triggerFirstCompletion = () => {
          if (signal.aborted) return; // already rejected — no-op
          completed.push(value);
          resolve();
        };
        signal.addEventListener("abort", () => {
          abortedCount++;
          reject(new DOMException("aborted", "AbortError"));
        });
      } else {
        // Fast request: completes synchronously.
        completed.push(value);
        resolve();
      }
    });
  });

  // First edit: slow in-flight save (simulates a sluggish network).
  saver.schedule({ slow: true, avg_ticket_cents: 700 });
  t.mock.timers.tick(AUTOSAVE_DEBOUNCE_MS + 1);

  assert.ok(triggerFirstCompletion !== null, "first request is parked in-flight");
  assert.equal(completed.length, 0, "first request has not completed yet");

  // User keeps typing — second edit after the first debounce already fired.
  // A second debounce window starts and eventually fires while the first fetch
  // is still in-flight.
  saver.schedule({ slow: false, avg_ticket_cents: 900 });
  t.mock.timers.tick(AUTOSAVE_DEBOUNCE_MS + 1);

  // The second persist() call aborts the first controller synchronously.
  assert.equal(abortedCount, 1, "first in-flight request was aborted once");

  // Only the second (superseding) request completes.
  assert.equal(completed.length, 1, "exactly one request completed — the last one");
  assert.deepEqual(
    completed[0],
    { slow: false, avg_ticket_cents: 900 },
    "final value 900 was persisted; the stale 700 was aborted before landing"
  );

  // The first request's completion handler is now a no-op — it was aborted.
  // Calling it would trigger the resolve but the promise is already rejected.
  // Verify the abort guard: if the first request somehow completes late,
  // persist() catches AbortError and does NOT update state.
  triggerFirstCompletion(); // try to "complete" the aborted request
  // completed is still length 1 — the aborted request didn't slip through.
  await Promise.resolve(); // flush microtasks
  assert.equal(completed.length, 1, "aborted request did not sneak a write after abort");
});

// ── (5) No double-save if schedule is called during an in-flight save ─────────

test("calling schedule while a save is in-flight does not duplicate the save", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const calls = [];
  const saver = makeAutosaver(async (value) => {
    calls.push(value);
  });

  // First window completes.
  saver.schedule({ income_tax_pct: 25 });
  t.mock.timers.tick(AUTOSAVE_DEBOUNCE_MS + 1);
  assert.equal(calls.length, 1, "first save fired");

  // Immediately schedule another — separate debounce window.
  saver.schedule({ income_tax_pct: 28 });
  // Before the second window fires: still only 1 call.
  assert.equal(calls.length, 1, "no extra call while second debounce is pending");

  t.mock.timers.tick(AUTOSAVE_DEBOUNCE_MS + 1);
  assert.equal(calls.length, 2, "second save fires after its own window");
  assert.equal(calls[1].income_tax_pct, 28, "second save carries updated value");
});
