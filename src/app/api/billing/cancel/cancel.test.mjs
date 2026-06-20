// TIM-2802: cancel on a trialing sub must use immediate cancel (no invoice
// generated), not cancel_at_period_end (which generates a first-period invoice
// before canceling, wrongly charging the user $39).

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

let stripeSubs = new Map();
let updateCalls = [];
let cancelCalls = [];
let retrieveCalls = [];

function makeStripeMock() {
  return {
    subscriptions: {
      async retrieve(id) {
        retrieveCalls.push(id);
        const sub = stripeSubs.get(id);
        if (!sub) throw new Error(`No such subscription: '${id}'`);
        return sub;
      },
      async update(id, params) {
        updateCalls.push({ id, params });
        const sub = stripeSubs.get(id);
        if (!sub) throw new Error(`No such subscription: '${id}'`);
        Object.assign(sub, params);
        return sub;
      },
      async cancel(id) {
        cancelCalls.push(id);
        const sub = stripeSubs.get(id);
        if (!sub) throw new Error(`No such subscription: '${id}'`);
        sub.status = "canceled";
        return sub;
      },
    },
  };
}

// Core logic extracted from the route — avoids importing Next.js server modules.
async function cancelSubscription(stripe, stripeSubscriptionId) {
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  if (stripeSub.status === "trialing") {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
  } else {
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }
}

beforeEach(() => {
  stripeSubs = new Map();
  updateCalls = [];
  cancelCalls = [];
  retrieveCalls = [];
});

describe("TIM-2802: billing/cancel trial-vs-active branch", () => {
  test("trialing sub: uses immediate cancel — no update call, no invoice", async () => {
    stripeSubs.set("sub_trial", {
      id: "sub_trial",
      status: "trialing",
      trial_end: Math.floor(Date.now() / 1000) + 7 * 86400,
    });

    const stripe = makeStripeMock();
    await cancelSubscription(stripe, "sub_trial");

    assert.equal(cancelCalls.length, 1, "must call stripe.subscriptions.cancel once");
    assert.equal(cancelCalls[0], "sub_trial");
    assert.equal(updateCalls.length, 0, "must NOT call stripe.subscriptions.update on a trial");
    assert.equal(stripeSubs.get("sub_trial").status, "canceled");
  });

  test("active sub: uses cancel_at_period_end — no immediate cancel", async () => {
    stripeSubs.set("sub_active", {
      id: "sub_active",
      status: "active",
    });

    const stripe = makeStripeMock();
    await cancelSubscription(stripe, "sub_active");

    assert.equal(updateCalls.length, 1, "must call stripe.subscriptions.update once");
    assert.equal(updateCalls[0].params.cancel_at_period_end, true);
    assert.equal(cancelCalls.length, 0, "must NOT immediately cancel an active sub");
  });

  test("past_due sub: uses cancel_at_period_end — no immediate cancel", async () => {
    stripeSubs.set("sub_past_due", {
      id: "sub_past_due",
      status: "past_due",
    });

    const stripe = makeStripeMock();
    await cancelSubscription(stripe, "sub_past_due");

    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].params.cancel_at_period_end, true);
    assert.equal(cancelCalls.length, 0);
  });

  test("missing sub id: retrieve throws and propagates", async () => {
    const stripe = makeStripeMock();
    await assert.rejects(
      () => cancelSubscription(stripe, "sub_nonexistent"),
      /No such subscription/,
    );
    assert.equal(cancelCalls.length, 0);
    assert.equal(updateCalls.length, 0);
  });
});
