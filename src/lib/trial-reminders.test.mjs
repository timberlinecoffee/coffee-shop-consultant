// TIM-1903: pinning tests for the trial-reminder selector. The cron logic
// dispatches three emails — day5, day7, day8 — based on time-to-trial-end
// and conversion state. These tests pin the windows so a future refactor
// cannot silently shift them.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { selectDueReminders } from "./trial-reminders.ts";

function row(overrides) {
  return {
    userId: "u1",
    email: "a@example.com",
    firstName: "Alex",
    subscriptionStatus: "free_trial",
    subscriptionTier: "starter",
    trialEndsAt: null,
    trialJustConvertedTo: null,
    remindersSent: {},
    ...overrides,
  };
}

const now = new Date("2026-06-10T12:00:00Z");

test("day5: fires when ~2 days remain in trial", () => {
  const trialEndsAt = new Date(now.getTime() + 48 * 3600_000).toISOString();
  const due = selectDueReminders([row({ trialEndsAt })], now);
  assert.equal(due.length, 1);
  assert.equal(due[0].day, "day5");
  assert.equal(due[0].planName, "Starter");
});

test("day5: idempotent — does not re-fire when already stamped", () => {
  const trialEndsAt = new Date(now.getTime() + 48 * 3600_000).toISOString();
  const due = selectDueReminders(
    [row({ trialEndsAt, remindersSent: { day5: "earlier" } })],
    now,
  );
  assert.equal(due.length, 0);
});

test("day7: fires on the final day (under 24h remaining)", () => {
  const trialEndsAt = new Date(now.getTime() + 12 * 3600_000).toISOString();
  const due = selectDueReminders([row({ trialEndsAt })], now);
  assert.equal(due.length, 1);
  assert.equal(due[0].day, "day7");
});

test("day7: does not fire when trial is more than 24h out", () => {
  const trialEndsAt = new Date(now.getTime() + 36 * 3600_000).toISOString();
  const due = selectDueReminders([row({ trialEndsAt })], now);
  assert.equal(due.length, 1);
  assert.equal(due[0].day, "day5"); // 36h → day5 window
});

test("day8: fires post-conversion when trial_just_converted_to is set", () => {
  const due = selectDueReminders(
    [
      row({
        subscriptionStatus: "active",
        trialEndsAt: null,
        trialJustConvertedTo: "pro",
      }),
    ],
    now,
  );
  assert.equal(due.length, 1);
  assert.equal(due[0].day, "day8");
  assert.equal(due[0].planName, "Pro");
  assert.equal(due[0].planKey, "pro");
});

test("day8: idempotent — does not re-fire when already stamped", () => {
  const due = selectDueReminders(
    [
      row({
        subscriptionStatus: "active",
        trialEndsAt: null,
        trialJustConvertedTo: "pro",
        remindersSent: { day8: "earlier" },
      }),
    ],
    now,
  );
  assert.equal(due.length, 0);
});

test("never two reminders in one run for a single user", () => {
  // Edge case: a user could in theory match both day5 and day7 windows during
  // a slow cron — the selector prefers day5 and exits.
  const trialEndsAt = new Date(now.getTime() + 23 * 3600_000).toISOString();
  const due = selectDueReminders([row({ trialEndsAt })], now);
  assert.equal(due.length, 1);
  assert.equal(due[0].day, "day7");
});

test("expired trial without remaining hours does not fire day5 or day7", () => {
  const trialEndsAt = new Date(now.getTime() - 1000).toISOString();
  const due = selectDueReminders([row({ trialEndsAt })], now);
  assert.equal(due.length, 0);
});

test("user with no email is skipped", () => {
  const trialEndsAt = new Date(now.getTime() + 48 * 3600_000).toISOString();
  const due = selectDueReminders([row({ trialEndsAt, email: "" })], now);
  assert.equal(due.length, 0);
});
