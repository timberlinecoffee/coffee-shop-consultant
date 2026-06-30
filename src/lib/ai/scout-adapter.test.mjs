// TIM-3463: Adapter + failover integration tests. Plan §9 acceptance items 1 + 4.
//
// We use the injectable `transport` seam (ScoutTransport) instead of mocking
// the Anthropic SDK. The transport is the contract boundary — equivalence on
// both providers means the same input produces the same `ScoutTransportCallOutput`
// shape, and failover means a 503 on the primary triggers exactly one secondary
// call with fallback_used=true on the resulting envelope.

import { test } from "node:test"
import assert from "node:assert/strict"
import { runScoutTurn } from "./scout-adapter.ts"
import { ScoutAdapterError } from "./scout-errors.ts"
import {
  DEEPSEEK_CHAT_MODEL,
  PLATFORM_AI_MODEL,
} from "./models.ts"
import { buildTurnMetricRecord } from "./turn-metrics.ts"

function makeOk(text, provider) {
  return {
    text,
    toolUses: [],
    usage: {
      inputTokensUncached: 100,
      inputTokensCachedRead: 0,
      inputTokensCacheCreate: 0,
      outputTokens: 50,
      webSearchRequests: 0,
      toolCalls: 0,
    },
    stopReason: "end_turn",
    provider,
  }
}

function makeError(errorClass, provider, status) {
  return new ScoutAdapterError({
    errorClass,
    provider,
    status,
    message: `forced ${errorClass} ${status ?? ""}`.trim(),
  })
}

// ── Plan §9 item 1 — semantically equivalent shapes across providers ─────────

test("adapter — both providers produce the same envelope shape", async () => {
  const calls = []
  const transport = {
    async call(input) {
      calls.push(input)
      return makeOk(`hello from ${input.provider}`, input.provider)
    },
    // unused
    async *stream() {},
  }

  const anth = await runScoutTurn({
    lane: "generate_business_plan_section",
    systemBlocks: [{ text: "sys" }],
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 100,
    userId: "u1",
    routeTag: "/api/test",
    transport,
  })
  const dpsk = await runScoutTurn({
    lane: "chat_general",
    systemBlocks: [{ text: "sys" }],
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 100,
    userId: "u1",
    routeTag: "/api/test",
    transport,
    forceProvider: "deepseek",
  })

  assert.equal(anth.provider, "anthropic")
  assert.equal(anth.modelId, PLATFORM_AI_MODEL)
  assert.equal(anth.fallbackUsed, false)
  assert.equal(dpsk.provider, "deepseek")
  assert.equal(dpsk.modelId, DEEPSEEK_CHAT_MODEL)
  assert.equal(dpsk.fallbackUsed, false)
  // Same shape on both — every top-level field is present and typed.
  for (const env of [anth, dpsk]) {
    assert.equal(typeof env.text, "string")
    assert.ok(Array.isArray(env.toolUses))
    assert.equal(typeof env.usage.inputTokensUncached, "number")
    assert.equal(typeof env.usage.outputTokens, "number")
    assert.equal(typeof env.latencyMs, "number")
    assert.equal(typeof env.fallbackUsed, "boolean")
  }
})

// ── Plan §9 item 4 — failover semantics ──────────────────────────────────────

test("failover: HTTP-503 on primary → single same-provider retry → cross-provider failover; fallback_used=true", async () => {
  const calls = []
  let primaryAttempt = 0
  const transport = {
    async call(input) {
      calls.push({ provider: input.provider, modelId: input.modelId })
      if (input.provider === "deepseek") {
        primaryAttempt += 1
        // Both attempts on primary fail with 503 — server class is failover-eligible.
        throw makeError("server", "deepseek", 503)
      }
      // Secondary (anthropic) succeeds.
      return makeOk("hello from secondary", "anthropic")
    },
    async *stream() {},
  }

  const out = await runScoutTurn({
    lane: "chat_general",
    systemBlocks: [{ text: "sys" }],
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 100,
    userId: "u1",
    routeTag: "/api/copilot/stream",
    transport,
    forceProvider: "deepseek",
  })

  // Plan §7: primary fires twice (initial + 1 retry), then secondary fires once.
  assert.equal(primaryAttempt, 2, "primary should attempt 2x (initial + retry)")
  assert.equal(calls.length, 3, "exactly 3 calls (initial + retry + failover)")
  assert.equal(calls[0].provider, "deepseek")
  assert.equal(calls[1].provider, "deepseek")
  assert.equal(calls[2].provider, "anthropic")
  // Envelope reports the successful (secondary) provider with fallback_used=true.
  assert.equal(out.provider, "anthropic")
  assert.equal(out.modelId, PLATFORM_AI_MODEL)
  assert.equal(out.fallbackUsed, true)
  assert.equal(out.text, "hello from secondary")

  // Plan §9 acceptance: the row landed by recordTurnMetric carries fallback_used=true
  // and the sanitized envelope copy is reachable from scout-errors.
  const { record } = buildTurnMetricRecord({
    route: "/api/copilot/stream",
    model: out.modelId,
    usage: {
      input_tokens: out.usage.inputTokensUncached,
      cache_read_input_tokens: out.usage.inputTokensCachedRead,
      cache_creation_input_tokens: out.usage.inputTokensCacheCreate,
      output_tokens: out.usage.outputTokens,
    },
    userId: "u1",
    planTier: "pro",
    provider: out.provider,
    lane: "chat_general",
    latencyMs: out.latencyMs,
    fallbackUsed: out.fallbackUsed,
  })
  assert.equal(record.provider, "anthropic")
  assert.equal(record.lane, "chat_general")
  assert.equal(record.fallback_used, true)
})

test("failover: non-eligible class (auth) does NOT retry; surfaces to caller", async () => {
  let calls = 0
  const transport = {
    async call(input) {
      calls += 1
      throw makeError("auth", input.provider, 401)
    },
    async *stream() {},
  }
  await assert.rejects(
    runScoutTurn({
      lane: "chat_general",
      systemBlocks: [{ text: "sys" }],
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      userId: "u1",
      routeTag: "/api/test",
      transport,
      forceProvider: "deepseek",
    }),
    /auth/,
  )
  assert.equal(calls, 1, "auth error should NOT retry or failover")
})

test("failover: content_policy on primary does NOT failover (would just refuse again)", async () => {
  let calls = 0
  const transport = {
    async call(input) {
      calls += 1
      throw makeError("content_policy", input.provider, 400)
    },
    async *stream() {},
  }
  await assert.rejects(
    runScoutTurn({
      lane: "chat_general",
      systemBlocks: [{ text: "sys" }],
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      userId: "u1",
      routeTag: "/api/test",
      transport,
      forceProvider: "deepseek",
    }),
    /content_policy/,
  )
  assert.equal(calls, 1)
})

test("failover: 429 with same-provider retry succeeding → fallback_used=false", async () => {
  let attempt = 0
  const transport = {
    async call(input) {
      attempt += 1
      if (attempt === 1) throw makeError("rate_limit", input.provider, 429)
      return makeOk("hello after retry", input.provider)
    },
    async *stream() {},
  }
  const out = await runScoutTurn({
    lane: "chat_general",
    systemBlocks: [{ text: "sys" }],
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 100,
    userId: "u1",
    routeTag: "/api/test",
    transport,
    forceProvider: "deepseek",
  })
  assert.equal(attempt, 2)
  assert.equal(out.provider, "deepseek")
  assert.equal(out.fallbackUsed, false)
  assert.equal(out.text, "hello after retry")
})

test("failover: pinned Anthropic lane primary, with 503s and failover to DeepSeek", async () => {
  const calls = []
  const transport = {
    async call(input) {
      calls.push(input.provider)
      if (input.provider === "anthropic") throw makeError("server", input.provider, 503)
      return makeOk("from deepseek", input.provider)
    },
    async *stream() {},
  }
  const out = await runScoutTurn({
    // generate_business_plan_section is force-anthropic → primary anthropic.
    // 503 storms exhaust the retry then failover to deepseek per §7.
    lane: "generate_business_plan_section",
    systemBlocks: [{ text: "sys" }],
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 100,
    userId: "u1",
    routeTag: "/api/business-plan/generate",
    transport,
  })
  assert.equal(calls.length, 3)
  assert.equal(calls[0], "anthropic")
  assert.equal(calls[1], "anthropic")
  assert.equal(calls[2], "deepseek")
  assert.equal(out.provider, "deepseek")
  assert.equal(out.fallbackUsed, true)
})

test("metric row default carries provider=anthropic, lane=unknown for un-migrated callsites", () => {
  const { record } = buildTurnMetricRecord({
    route: "/api/legacy",
    model: PLATFORM_AI_MODEL,
    usage: { input_tokens: 1, output_tokens: 1 },
    userId: "u",
    planTier: "pro",
  })
  assert.equal(record.provider, "anthropic")
  assert.equal(record.lane, "unknown")
  assert.equal(record.latency_ms, 0)
  assert.equal(record.error_class, null)
  assert.equal(record.fallback_used, false)
})
