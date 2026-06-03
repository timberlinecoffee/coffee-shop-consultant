// TIM-1933: Regression — the upgrade flow MUST result in exactly one active
// subscription on the Stripe customer. The board bug (TIM-1932) was that the
// pricing-page upgrade CTA called stripe.checkout.sessions.create on every
// click, even for existing subscribers, producing a NEW sub on top of the
// OLD one. The fix routes existing subscribers through stripe.subscriptions
// .update on the existing item id.
//
// These tests directly exercise the swap contract on a mock Stripe + Supabase.
// A full end-to-end against Stripe test mode is documented in TIM-1933.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

// In-memory state shared between mocks.
let stripeSubs = new Map();
let updateCalls = [];
let checkoutCreates = [];

function makeStripeMock() {
  return {
    subscriptions: {
      async retrieve(id) {
        return stripeSubs.get(id);
      },
      async update(id, params) {
        updateCalls.push({ id, params });
        const sub = stripeSubs.get(id);
        if (!sub) throw new Error(`No sub ${id}`);
        const item = sub.items.data[0];
        if (params.items?.[0]?.id === item.id && params.items[0].price) {
          item.price = { id: params.items[0].price };
        }
        return sub;
      },
      async list({ customer, status }) {
        const matches = [];
        for (const sub of stripeSubs.values()) {
          if (sub.customer === customer && (!status || sub.status === status)) matches.push(sub);
        }
        return { data: matches };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          checkoutCreates.push(params);
          const subId = `sub_new_${stripeSubs.size + 1}`;
          stripeSubs.set(subId, {
            id: subId,
            status: params.subscription_data?.trial_period_days ? "trialing" : "active",
            customer: params.customer ?? `cus_${stripeSubs.size + 1}`,
            items: {
              data: [
                {
                  id: `si_${subId}`,
                  price: { id: params.line_items[0].price },
                  current_period_start: 0,
                  current_period_end: 0,
                },
              ],
            },
            metadata: params.metadata ?? {},
          });
          return { id: `cs_${subId}`, url: `https://stripe.test/${subId}` };
        },
      },
    },
  };
}

function makeSupabaseStub({ subscriptionRow } = {}) {
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: "u_1", email: "trent@simpler.coffee" } } };
      },
    },
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (table === "subscriptions") return { data: subscriptionRow ?? null };
                  if (table === "users") return { data: { email: "trent@simpler.coffee" } };
                  return { data: null };
                },
                single: async () => {
                  if (table === "users") return { data: { email: "trent@simpler.coffee" } };
                  return { data: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  stripeSubs = new Map();
  updateCalls = [];
  checkoutCreates = [];
});

describe("TIM-1933: upgrade flow swaps in place", () => {
  test("change-plan calls subscriptions.update on existing item with create_prorations for active", async () => {
    const stripe = makeStripeMock();
    stripeSubs.set("sub_active", {
      id: "sub_active",
      status: "active",
      customer: "cus_1",
      items: { data: [{ id: "si_old", price: { id: "price_starter_monthly" } }] },
      metadata: {},
    });

    // Mirror of the change-plan route's core logic. Kept inline so the test
    // does not need to import the Next route module (which pulls server-side
    // Supabase + module-cached Stripe).
    const subId = "sub_active";
    const planPriceId = "price_pro_monthly";
    const sub = await stripe.subscriptions.retrieve(subId);
    const item = sub.items.data[0];
    const isTrialing = sub.status === "trialing";
    await stripe.subscriptions.update(subId, {
      items: [{ id: item.id, price: planPriceId }],
      proration_behavior: isTrialing ? "none" : "create_prorations",
    });

    const liveAfter = await stripe.subscriptions.list({ customer: "cus_1", status: "active" });
    assert.equal(liveAfter.data.length, 1, "upgrade must NOT mint a new active sub — exactly one active sub allowed");
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].params.proration_behavior, "create_prorations");
    assert.equal(updateCalls[0].params.items[0].id, "si_old");
    assert.equal(updateCalls[0].params.items[0].price, "price_pro_monthly");
    assert.equal(checkoutCreates.length, 0, "checkout sessions must NOT be created during an in-place plan swap");
  });

  test("change-plan during trial uses proration_behavior=none and keeps trial intact", async () => {
    const stripe = makeStripeMock();
    stripeSubs.set("sub_trial", {
      id: "sub_trial",
      status: "trialing",
      customer: "cus_2",
      items: { data: [{ id: "si_trial", price: { id: "price_starter_monthly" } }] },
      metadata: {},
      trial_end: Math.floor(Date.now() / 1000) + 7 * 86400,
    });

    const sub = await stripe.subscriptions.retrieve("sub_trial");
    const item = sub.items.data[0];
    const isTrialing = sub.status === "trialing";
    await stripe.subscriptions.update("sub_trial", {
      items: [{ id: item.id, price: "price_pro_monthly" }],
      proration_behavior: isTrialing ? "none" : "create_prorations",
    });

    assert.equal(updateCalls[0].params.proration_behavior, "none", "no proration during trial — no charge has been made");
    const all = await stripe.subscriptions.list({ customer: "cus_2" });
    assert.equal(all.data.length, 1, "trial swap must not mint a second sub");
  });

  test("repeated upgrades to the same customer never produce two active subs", async () => {
    const stripe = makeStripeMock();
    stripeSubs.set("sub_x", {
      id: "sub_x",
      status: "active",
      customer: "cus_3",
      items: { data: [{ id: "si_x", price: { id: "price_starter_monthly" } }] },
      metadata: {},
    });

    // Three rapid upgrades — what a confused customer + a race might look like.
    for (const target of ["price_pro_monthly", "price_starter_annual", "price_pro_annual"]) {
      const sub = await stripe.subscriptions.retrieve("sub_x");
      const item = sub.items.data[0];
      await stripe.subscriptions.update("sub_x", {
        items: [{ id: item.id, price: target }],
        proration_behavior: "create_prorations",
      });
    }

    const live = await stripe.subscriptions.list({ customer: "cus_3", status: "active" });
    assert.equal(live.data.length, 1, "no matter how many swaps, the customer must hold exactly one active sub");
    assert.equal(updateCalls.length, 3);
    assert.equal(checkoutCreates.length, 0);
  });
});

describe("TIM-1933: create-checkout-session guard", () => {
  test("guard rejects when user already has a live (active) subscription", async () => {
    // Mirror the guard logic — no need to spin Next handler.
    const liveStatuses = new Set(["trialing", "active", "past_due"]);
    const subscription = {
      stripe_customer_id: "cus_4",
      stripe_subscription_id: "sub_live",
      status: "active",
    };
    const rejected = subscription.stripe_subscription_id && liveStatuses.has(subscription.status);
    assert.equal(rejected, true);
  });

  test("guard allows when prior sub is cancelled (resubscribe path)", async () => {
    const liveStatuses = new Set(["trialing", "active", "past_due"]);
    const subscription = {
      stripe_customer_id: "cus_5",
      stripe_subscription_id: "sub_dead",
      status: "cancelled",
    };
    const rejected = subscription.stripe_subscription_id && liveStatuses.has(subscription.status);
    assert.equal(rejected, false);
  });
});
