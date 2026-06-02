// TIM-1663: eligibility selection for the renewal-reminder dispatch job.

import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDateEligible, DEFAULT_REMINDER_DAYS } from "./renewal-reminder.ts";

const NOW = new Date("2026-06-02T00:00:00.000Z");

function isoInDays(days) {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString();
}

const optedIn = (email = "a@example.com", extra = {}) => ({
  optedIn: true,
  email,
  optedInAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

test("selects an opted-in active subscriber renewing within the window", () => {
  const periodEnd = isoInDays(5);
  const due = selectDateEligible(
    [{ userId: "u1", prefData: optedIn() }],
    [{ userId: "u1", status: "active", currentPeriodEnd: periodEnd }],
    NOW,
  );
  assert.equal(due.length, 1);
  assert.deepEqual(due[0], { userId: "u1", email: "a@example.com", currentPeriodEnd: periodEnd });
});

test("excludes renewals beyond the window", () => {
  const due = selectDateEligible(
    [{ userId: "u1", prefData: optedIn() }],
    [{ userId: "u1", status: "active", currentPeriodEnd: isoInDays(DEFAULT_REMINDER_DAYS + 3) }],
    NOW,
  );
  assert.equal(due.length, 0);
});

test("includes the exact window boundary", () => {
  const due = selectDateEligible(
    [{ userId: "u1", prefData: optedIn() }],
    [{ userId: "u1", status: "active", currentPeriodEnd: isoInDays(DEFAULT_REMINDER_DAYS) }],
    NOW,
  );
  assert.equal(due.length, 1);
});

test("excludes past renewal dates", () => {
  const due = selectDateEligible(
    [{ userId: "u1", prefData: optedIn() }],
    [{ userId: "u1", status: "active", currentPeriodEnd: isoInDays(-1) }],
    NOW,
  );
  assert.equal(due.length, 0);
});

test("excludes subscribers who did not opt in", () => {
  const due = selectDateEligible(
    [{ userId: "u1", prefData: { optedIn: false, email: "a@example.com", optedInAt: "x" } }],
    [{ userId: "u1", status: "active", currentPeriodEnd: isoInDays(3) }],
    NOW,
  );
  assert.equal(due.length, 0);
});

test("excludes cancelled / paused / past_due subscribers", () => {
  for (const status of ["cancelled", "paused", "past_due"]) {
    const due = selectDateEligible(
      [{ userId: "u1", prefData: optedIn() }],
      [{ userId: "u1", status, currentPeriodEnd: isoInDays(3) }],
      NOW,
    );
    assert.equal(due.length, 0, `status ${status} should be excluded`);
  }
});

test("is idempotent: skips when already reminded for this period end", () => {
  const periodEnd = isoInDays(4);
  const due = selectDateEligible(
    [{ userId: "u1", prefData: optedIn("a@example.com", { remindedForPeriodEnd: periodEnd }) }],
    [{ userId: "u1", status: "active", currentPeriodEnd: periodEnd }],
    NOW,
  );
  assert.equal(due.length, 0);
});

test("re-arms for a new period: prior remindedForPeriodEnd does not block next cycle", () => {
  const lastPeriod = isoInDays(-360);
  const nextPeriod = isoInDays(5);
  const due = selectDateEligible(
    [{ userId: "u1", prefData: optedIn("a@example.com", { remindedForPeriodEnd: lastPeriod }) }],
    [{ userId: "u1", status: "active", currentPeriodEnd: nextPeriod }],
    NOW,
  );
  assert.equal(due.length, 1);
});

test("skips when there is no subscription row, no email, or no period end", () => {
  assert.equal(
    selectDateEligible([{ userId: "u1", prefData: optedIn() }], [], NOW).length,
    0,
  );
  assert.equal(
    selectDateEligible(
      [{ userId: "u1", prefData: optedIn("") }],
      [{ userId: "u1", status: "active", currentPeriodEnd: isoInDays(3) }],
      NOW,
    ).length,
    0,
  );
  assert.equal(
    selectDateEligible(
      [{ userId: "u1", prefData: optedIn() }],
      [{ userId: "u1", status: "active", currentPeriodEnd: null }],
      NOW,
    ).length,
    0,
  );
});
