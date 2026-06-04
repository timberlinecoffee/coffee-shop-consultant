// TIM-2287: pinning tests for the subscription_status guard.
//
// Run with: node --experimental-strip-types --test src/lib/billing/subscription-status.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  USER_SUBSCRIPTION_STATUSES,
  isUserSubscriptionStatus,
  assertUserSubscriptionStatus,
  BadSubscriptionStatusError,
} from "./subscription-status.ts";

test("USER_SUBSCRIPTION_STATUSES matches DB CHECK constraint set", () => {
  assert.deepEqual(
    [...USER_SUBSCRIPTION_STATUSES].sort(),
    ["active", "cancelled", "expired", "free_trial", "past_due", "paused"],
  );
});

test("isUserSubscriptionStatus accepts every allowed value", () => {
  for (const v of USER_SUBSCRIPTION_STATUSES) {
    assert.equal(isUserSubscriptionStatus(v), true, `expected ${v} valid`);
  }
});

test("isUserSubscriptionStatus rejects Stripe-native and stray values", () => {
  for (const v of [
    "trialing", // Stripe-native, never valid on users (maps to free_trial)
    "canceled", // Stripe-native one-l spelling
    "incomplete",
    "unpaid",
    "",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(isUserSubscriptionStatus(v), false, `expected ${String(v)} invalid`);
  }
});

test("assertUserSubscriptionStatus passes silently for allowed values", () => {
  const ctx = { caller: "test.allowed", userId: "u-1" };
  for (const v of USER_SUBSCRIPTION_STATUSES) {
    assert.doesNotThrow(() => assertUserSubscriptionStatus(v, ctx));
  }
});

test("assertUserSubscriptionStatus throws BadSubscriptionStatusError on invalid + emits structured log", () => {
  const ctx = {
    caller: "test.invalid",
    userId: "u-2",
    stripeEventId: "evt_test_1",
    stripeEventType: "customer.subscription.updated",
    stripeSubscriptionId: "sub_test_1",
  };

  const originalError = console.error;
  let logged = null;
  console.error = (line) => {
    logged = line;
  };

  try {
    assert.throws(
      () => assertUserSubscriptionStatus("trialing", ctx),
      (err) => {
        assert.ok(err instanceof BadSubscriptionStatusError);
        assert.equal(err.attempted, "trialing");
        assert.equal(err.context.caller, "test.invalid");
        return true;
      },
    );
  } finally {
    console.error = originalError;
  }

  assert.ok(logged, "expected console.error to be invoked");
  const parsed = JSON.parse(logged);
  assert.equal(parsed.event, "bad_subscription_status_write");
  assert.equal(parsed.severity, "error");
  assert.equal(parsed.caller, "test.invalid");
  assert.equal(parsed.userId, "u-2");
  assert.equal(parsed.stripeEventId, "evt_test_1");
  assert.equal(parsed.stripeEventType, "customer.subscription.updated");
  assert.equal(parsed.stripeSubscriptionId, "sub_test_1");
  assert.equal(parsed.attempted, "trialing");
  assert.deepEqual(parsed.allowed, [...USER_SUBSCRIPTION_STATUSES]);
});

test("assertUserSubscriptionStatus stringifies non-string attempts safely", () => {
  const originalError = console.error;
  let logged = null;
  console.error = (line) => {
    logged = line;
  };
  try {
    assert.throws(() =>
      assertUserSubscriptionStatus(42, { caller: "test.number", userId: "u-3" }),
    );
  } finally {
    console.error = originalError;
  }
  const parsed = JSON.parse(logged);
  assert.equal(parsed.attempted, "(non-string number)");
});
