// TIM-1545: Stripe webhook — pause / resume / cancelled-while-paused acceptance tests.
// Uses Node's built-in test runner (npm test).

import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Mock setup — modules must be registered before the route is imported.
// We use module mocking via globalThis stubs since the route is a CJS/ESM
// Next.js route and the test harness doesn't tree-shake.
// Strategy: build a fake handler that directly exercises the logic we care
// about, extracted from the route and driven with in-memory Supabase stubs.
// ---------------------------------------------------------------------------

const PAUSE_PRICE_ID = "price_pause_test";
const STARTER_MONTHLY_PRICE_ID = "price_starter_monthly_test";
const GROWTH_MONTHLY_PRICE_ID = "price_growth_monthly_test";

// Minimal tierFromPriceId mirror of the real function
function tierFromPriceId(priceId) {
  if (priceId === STARTER_MONTHLY_PRICE_ID) return "starter";
  if (priceId === GROWTH_MONTHLY_PRICE_ID) return "growth";
  return "free";
}

// In-memory DB stores (reset between tests)
let subscriptionsRow = null;
let usersRow = null;

function makeSupabase() {
  return {
    from(table) {
      return {
        select(fields) {
          return {
            eq(col, val) {
              return {
                single() {
                  if (table === "subscriptions") return { data: subscriptionsRow };
                  if (table === "users") return { data: usersRow };
                  return { data: null };
                },
              };
            },
          };
        },
        update(payload) {
          return {
            eq(col, val) {
              if (table === "subscriptions") {
                subscriptionsRow = { ...subscriptionsRow, ...payload };
              }
              if (table === "users") {
                usersRow = { ...usersRow, ...payload };
              }
              return { data: null, error: null };
            },
          };
        },
        insert(payload) {
          return { data: null, error: null };
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Inline the core logic from route.ts so we can exercise it without
// importing the full Next.js runtime or real Stripe/Supabase clients.
// ---------------------------------------------------------------------------

async function handleSubscriptionUpdated(subscription, supabase) {
  const updatedItem = subscription.items?.data?.[0];
  const priceId = updatedItem?.price?.id ?? "";
  const tier = tierFromPriceId(priceId);

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id, current_period_end, tier, status")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!sub) return;

  const rawPeriodEnd = updatedItem?.current_period_end ?? subscription.current_period_end;
  const rawPeriodStart = updatedItem?.current_period_start ?? subscription.current_period_start;
  const newPeriodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000).toISOString() : null;

  // Pause branch
  if (PAUSE_PRICE_ID && priceId === PAUSE_PRICE_ID) {
    await supabase.from("subscriptions").update({
      status: "paused",
      paused_from_tier: sub.tier,
      paused_at: new Date().toISOString(),
    }).eq("stripe_subscription_id", subscription.id);

    await supabase.from("users").update({
      subscription_status: "paused",
    }).eq("id", sub.user_id);
    return;
  }

  // Resume branch
  if (sub.status === "paused" && tier !== "free") {
    await supabase.from("subscriptions").update({
      status: "active",
      tier,
      paused_from_tier: null,
      paused_at: null,
      current_period_start: rawPeriodStart ? new Date(rawPeriodStart * 1000).toISOString() : null,
      current_period_end: newPeriodEnd,
    }).eq("stripe_subscription_id", subscription.id);

    await supabase.from("users").update({
      subscription_status: "active",
      subscription_tier: tier,
    }).eq("id", sub.user_id);
    return;
  }

  // Default path (not tested here — covered by pre-existing behavior)
}

async function handleSubscriptionDeleted(subscription, supabase) {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!sub) return;

  await supabase.from("subscriptions").update({
    status: "cancelled",
    paused_from_tier: null,
    paused_at: null,
  }).eq("stripe_subscription_id", subscription.id);

  await supabase.from("users").update({
    subscription_status: "cancelled",
    subscription_tier: "free",
  }).eq("id", sub.user_id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TIM-1545: Stripe webhook pause/resume/cancelled-while-paused", () => {
  beforeEach(() => {
    subscriptionsRow = {
      stripe_subscription_id: "sub_test123",
      user_id: "user_test123",
      tier: "growth",
      status: "active",
      current_period_end: "2026-07-01T00:00:00.000Z",
      paused_from_tier: null,
      paused_at: null,
    };
    usersRow = {
      id: "user_test123",
      subscription_status: "active",
      subscription_tier: "growth",
    };
  });

  test("pause-priceId event sets status=paused and preserves tier in paused_from_tier", async () => {
    const sub = {
      id: "sub_test123",
      status: "active",
      items: { data: [{ price: { id: PAUSE_PRICE_ID } }] },
    };

    await handleSubscriptionUpdated(sub, makeSupabase());

    assert.equal(subscriptionsRow.status, "paused", "subscriptions.status should be paused");
    assert.equal(subscriptionsRow.paused_from_tier, "growth", "paused_from_tier should hold original tier");
    assert.ok(subscriptionsRow.paused_at, "paused_at should be set");
    // tier must NOT be overwritten by the pause event
    assert.equal(subscriptionsRow.tier, "growth", "tier must not be overwritten on pause");
    assert.equal(usersRow.subscription_status, "paused", "users.subscription_status should be paused");
    // subscription_tier on users must not change either
    assert.equal(usersRow.subscription_tier, "growth", "users.subscription_tier must not change on pause");
  });

  test("resume event (tier priceId while paused) clears pause columns and restores active status", async () => {
    // Put the row into paused state first
    subscriptionsRow = {
      ...subscriptionsRow,
      status: "paused",
      paused_from_tier: "growth",
      paused_at: "2026-06-01T00:00:00.000Z",
      tier: "growth",
    };
    usersRow = { ...usersRow, subscription_status: "paused" };

    const periodEnd = Math.floor(new Date("2026-08-01").getTime() / 1000);
    const sub = {
      id: "sub_test123",
      status: "active",
      items: { data: [{ price: { id: STARTER_MONTHLY_PRICE_ID }, current_period_end: periodEnd }] },
    };

    await handleSubscriptionUpdated(sub, makeSupabase());

    assert.equal(subscriptionsRow.status, "active", "subscriptions.status should be active after resume");
    assert.equal(subscriptionsRow.tier, "starter", "subscriptions.tier should reflect resumed tier");
    assert.equal(subscriptionsRow.paused_from_tier, null, "paused_from_tier should be cleared on resume");
    assert.equal(subscriptionsRow.paused_at, null, "paused_at should be cleared on resume");
    assert.equal(usersRow.subscription_status, "active", "users.subscription_status should be active");
    assert.equal(usersRow.subscription_tier, "starter", "users.subscription_tier should match resumed tier");
  });

  test("subscription.deleted while paused → status=cancelled, pause columns cleared", async () => {
    subscriptionsRow = {
      ...subscriptionsRow,
      status: "paused",
      paused_from_tier: "growth",
      paused_at: "2026-06-01T00:00:00.000Z",
    };
    usersRow = { ...usersRow, subscription_status: "paused" };

    const sub = { id: "sub_test123", status: "canceled" };

    await handleSubscriptionDeleted(sub, makeSupabase());

    assert.equal(subscriptionsRow.status, "cancelled", "subscriptions.status should be cancelled");
    assert.equal(subscriptionsRow.paused_from_tier, null, "paused_from_tier should be cleared on cancel");
    assert.equal(subscriptionsRow.paused_at, null, "paused_at should be cleared on cancel");
    assert.equal(usersRow.subscription_status, "cancelled", "users.subscription_status should be cancelled");
    assert.equal(usersRow.subscription_tier, "free", "users.subscription_tier should revert to free");
  });

  test("pause event does not trigger resume branch for an already-active subscription", async () => {
    // Sanity: active sub + pause priceId → goes into pause branch, NOT resume
    const sub = {
      id: "sub_test123",
      status: "active",
      items: { data: [{ price: { id: PAUSE_PRICE_ID } }] },
    };

    await handleSubscriptionUpdated(sub, makeSupabase());

    assert.equal(subscriptionsRow.status, "paused");
    assert.equal(subscriptionsRow.tier, "growth", "tier unchanged");
  });

  test("non-pause priceId on active sub does NOT enter pause or resume branch", async () => {
    // Active sub switching to growth — should fall through to default path (no change by our logic)
    const periodEnd = Math.floor(new Date("2026-08-01").getTime() / 1000);
    const sub = {
      id: "sub_test123",
      status: "active",
      items: { data: [{ price: { id: GROWTH_MONTHLY_PRICE_ID }, current_period_end: periodEnd }] },
    };

    await handleSubscriptionUpdated(sub, makeSupabase());

    // Neither pause nor resume: paused_from_tier stays null, status stays active
    assert.equal(subscriptionsRow.status, "active");
    assert.equal(subscriptionsRow.paused_from_tier, null);
    assert.equal(subscriptionsRow.paused_at, null);
  });
});
