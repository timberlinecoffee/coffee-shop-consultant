// TIM-2361: pin the ai_turn_metrics row builder + plan_tier resolution so the
// CEO weekly query keeps its meaning: model_used + plan_tier + cost_usd_estimate
// stay stable inputs to the COGS lens.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTurnMetricRecord,
  recordTurnMetric,
  resolvePlanTier,
} from "./turn-metrics.ts";
import { RESEARCH_AI_MODEL, PLATFORM_AI_MODEL } from "./models.ts";

test("Sonnet route charges ~2x credits vs Haiku for identical output", () => {
  const usage = { input_tokens: 500, output_tokens: 1400 };
  const haiku = buildTurnMetricRecord({
    route: "/api/test",
    model: PLATFORM_AI_MODEL,
    usage,
    userId: "u1",
    planTier: "pro",
  });
  const sonnet = buildTurnMetricRecord({
    route: "/api/test",
    model: RESEARCH_AI_MODEL,
    usage,
    userId: "u1",
    planTier: "pro",
  });
  // 1400/700 = 2 credits on Haiku; 1400/350 = 4 credits on Sonnet (2x).
  assert.equal(haiku.record.credits_charged, 2);
  assert.equal(sonnet.record.credits_charged, 4);
  assert.equal(sonnet.record.credits_charged, haiku.record.credits_charged * 2);
});

test("record carries the right model + token splits + plan tier", () => {
  const built = buildTurnMetricRecord({
    route: "/api/workspaces/menu-pricing/benchmark-price",
    model: RESEARCH_AI_MODEL,
    usage: {
      input_tokens: 600,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 100,
      output_tokens: 350,
    },
    webSearchRequests: 2,
    toolCalls: 1,
    userId: "00000000-0000-0000-0000-000000000001",
    planTier: "pro",
  });
  assert.equal(built.record.model_used, RESEARCH_AI_MODEL);
  assert.equal(built.record.route, "/api/workspaces/menu-pricing/benchmark-price");
  assert.equal(built.record.input_tokens_uncached, 600);
  assert.equal(built.record.input_tokens_cached_read, 200);
  assert.equal(built.record.input_tokens_cache_create, 100);
  assert.equal(built.record.output_tokens, 350);
  assert.equal(built.record.web_search_requests, 2);
  assert.equal(built.record.tool_calls, 1);
  assert.equal(built.record.plan_tier, "pro");
  assert.equal(built.record.user_id, "00000000-0000-0000-0000-000000000001");
  // cost_usd_estimate is finite and > 0 for a Sonnet turn with real output.
  assert.ok(Number.isFinite(built.record.cost_usd_estimate));
  assert.ok(built.record.cost_usd_estimate > 0);
});

test("missing usage fields default to 0, never NaN", () => {
  const built = buildTurnMetricRecord({
    route: "/api/test",
    model: PLATFORM_AI_MODEL,
    usage: null,
    userId: null,
    planTier: "unknown",
  });
  assert.equal(built.record.input_tokens_uncached, 0);
  assert.equal(built.record.input_tokens_cached_read, 0);
  assert.equal(built.record.output_tokens, 0);
  // Min credit floor of 1 still applies.
  assert.equal(built.record.credits_charged, 1);
  assert.equal(built.record.cost_usd_estimate, 0);
});

test("recordTurnMetric inserts the same row buildTurnMetricRecord computes", async () => {
  let inserted = null;
  const fakeInserter = {
    async insert(row) {
      inserted = row;
      return { error: null };
    },
  };
  const { record } = await recordTurnMetric(fakeInserter, {
    route: "/api/x",
    model: RESEARCH_AI_MODEL,
    usage: { input_tokens: 100, output_tokens: 700 },
    userId: "u",
    planTier: "starter",
  });
  assert.deepEqual(inserted, record);
  assert.equal(inserted.model_used, RESEARCH_AI_MODEL);
  // 700/350 = 2 credits on Sonnet.
  assert.equal(inserted.credits_charged, 2);
});

test("recordTurnMetric swallows insert errors (logging must not break turns)", async () => {
  const fakeInserter = {
    async insert() {
      return { error: { message: "table missing" } };
    },
  };
  await recordTurnMetric(fakeInserter, {
    route: "/api/x",
    model: PLATFORM_AI_MODEL,
    usage: { input_tokens: 10, output_tokens: 50 },
    userId: "u",
    planTier: "pro",
  });
  // No assertion — passing without throw is the contract.
});

test("recordTurnMetric swallows thrown errors too", async () => {
  const fakeInserter = {
    async insert() {
      throw new Error("network down");
    },
  };
  await recordTurnMetric(fakeInserter, {
    route: "/api/x",
    model: PLATFORM_AI_MODEL,
    usage: { input_tokens: 0, output_tokens: 0 },
    userId: null,
    planTier: "unknown",
  });
});

test("resolvePlanTier maps Pro/Starter/free_trial/beta_waived/free/unknown", () => {
  assert.equal(
    resolvePlanTier({ subscription_tier: "pro", subscription_status: "active" }),
    "pro",
  );
  assert.equal(
    resolvePlanTier({ subscription_tier: "starter", subscription_status: "active" }),
    "starter",
  );
  assert.equal(
    resolvePlanTier({ subscription_tier: "pro", subscription_status: "free_trial" }),
    "free_trial",
  );
  // Beta-waived wins over everything when the waiver is still in the future.
  const future = new Date(Date.now() + 86400_000).toISOString();
  assert.equal(
    resolvePlanTier({
      subscription_tier: "pro",
      subscription_status: "active",
      beta_waiver_until: future,
    }),
    "beta_waived",
  );
  // Expired waiver does not count.
  assert.equal(
    resolvePlanTier({
      subscription_tier: "pro",
      subscription_status: "active",
      beta_waiver_until: new Date(Date.now() - 86400_000).toISOString(),
    }),
    "pro",
  );
  assert.equal(resolvePlanTier({}), "unknown");
});
