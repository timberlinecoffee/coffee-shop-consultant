// TIM-2361: pin the model-tier mapping and the per-turn USD cost formula so a
// constant change in src/lib/ai/models.ts is deliberate (and so the Anthropic
// price table here stays in lock-step with the ai_turn_metrics insert).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORM_AI_MODEL,
  RESEARCH_AI_MODEL,
  MODEL_PRICING_PER_M,
  COST_USD_PER_WEB_SEARCH,
  creditTierForModel,
  computeTurnCostUsd,
} from "./models.ts";

test("RESEARCH_AI_MODEL pins Sonnet 4.6 (board-accepted, TIM-2306)", () => {
  assert.equal(RESEARCH_AI_MODEL, "claude-sonnet-4-6");
  assert.notEqual(RESEARCH_AI_MODEL, PLATFORM_AI_MODEL);
});

test("creditTierForModel routes Sonnet → complex, everything else → default", () => {
  assert.equal(creditTierForModel(RESEARCH_AI_MODEL), "complex");
  assert.equal(creditTierForModel(PLATFORM_AI_MODEL), "default");
  assert.equal(creditTierForModel("claude-opus-4-7"), "default");
  assert.equal(creditTierForModel(""), "default");
});

test("Sonnet output costs ~5x Haiku output per million tokens (pricing table)", () => {
  const haiku = MODEL_PRICING_PER_M[PLATFORM_AI_MODEL];
  const sonnet = MODEL_PRICING_PER_M[RESEARCH_AI_MODEL];
  assert.equal(haiku.inputPerM, 0.8);
  assert.equal(haiku.outputPerM, 4);
  assert.equal(sonnet.inputPerM, 3);
  assert.equal(sonnet.outputPerM, 15);
});

test("computeTurnCostUsd folds in cache reads (0.1x) and writes (1.25x)", () => {
  // Sonnet 4.6 turn: 500 fresh input + 1000 cache-read + 200 cache-create + 800 output
  // = (500*3 + 1000*3*0.1 + 200*3*1.25 + 800*15) / 1e6
  // = (1500 + 300 + 750 + 12000) / 1e6 = 0.01455 USD
  const cost = computeTurnCostUsd({
    model: RESEARCH_AI_MODEL,
    inputTokens: 500,
    cacheReadTokens: 1000,
    cacheCreateTokens: 200,
    outputTokens: 800,
  });
  assert.ok(Math.abs(cost - 0.01455) < 1e-9, `unexpected cost ${cost}`);
});

test("computeTurnCostUsd bills web search at $0.01/request", () => {
  const cost = computeTurnCostUsd({
    model: PLATFORM_AI_MODEL,
    inputTokens: 0,
    outputTokens: 0,
    webSearchRequests: 5,
  });
  assert.equal(cost, 5 * COST_USD_PER_WEB_SEARCH);
});

test("computeTurnCostUsd returns 0 for unknown model (never NaN)", () => {
  const cost = computeTurnCostUsd({
    model: "claude-not-a-real-model",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  assert.equal(cost, 0);
});
