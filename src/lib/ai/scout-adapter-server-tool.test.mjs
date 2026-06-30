// TIM-3496: Adapter server-tool (web_search_20250305) wiring tests.
//
// computeLocalCafeRange (menu-pricing/benchmark-price) goes through runScoutTurn
// under lane `menu_benchmark_price`. The adapter needs to:
//   1. forward the ScoutServerToolDefinition (type/name/max_uses/user_location/
//      allowed_domains/blocked_domains) verbatim to the transport — the SDK
//      shape is Anthropic-specific and must not be normalized through
//      input_schema (that's the client-tool discriminator).
//   2. block cross-provider failover for menu_benchmark_price (DeepSeek does
//      not accept hosted server tools — a 5xx retry must not silently route to
//      a provider that 400s on the tool).

import { test } from "node:test"
import assert from "node:assert/strict"
import { runScoutTurn } from "./scout-adapter.ts"
import { ScoutAdapterError } from "./scout-errors.ts"

function emptyOk(provider) {
  return {
    text: "{}",
    toolUses: [],
    usage: {
      inputTokensUncached: 200,
      inputTokensCachedRead: 0,
      inputTokensCacheCreate: 0,
      outputTokens: 80,
      webSearchRequests: 3,
      toolCalls: 0,
    },
    stopReason: "end_turn",
    provider,
  }
}

test("server tool web_search_20250305 passes through transport.call unchanged", async () => {
  let seenTools
  const transport = {
    async call(input) {
      seenTools = input.tools
      return emptyOk(input.provider)
    },
    async *stream() {},
  }

  const webSearchTool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 10,
    user_location: { type: "approximate", country: "CA", city: "Calgary" },
  }

  const out = await runScoutTurn({
    lane: "menu_benchmark_price",
    systemBlocks: [],
    messages: [{ role: "user", content: "test" }],
    tools: [webSearchTool],
    maxTokens: 1024,
    userId: "u1",
    routeTag: "/api/workspaces/menu-pricing/benchmark-price",
    transport,
  })

  // Lane is in REQUIRES_RESEARCH_MODEL_LANES → router pins Anthropic.
  assert.equal(out.provider, "anthropic")

  // Transport sees the server-tool shape verbatim. The discriminator is
  // presence of `input_schema` (client tools have it, server tools don't).
  assert.ok(seenTools, "transport.call should receive tools array")
  assert.equal(seenTools.length, 1)
  assert.equal(seenTools[0].type, "web_search_20250305")
  assert.equal(seenTools[0].name, "web_search")
  assert.equal(seenTools[0].max_uses, 10)
  assert.deepEqual(seenTools[0].user_location, {
    type: "approximate",
    country: "CA",
    city: "Calgary",
  })
  assert.ok(
    !("input_schema" in seenTools[0]),
    "server tool must NOT carry input_schema (that's the client-tool discriminator)",
  )

  // Usage surfaces the webSearchRequests the transport reported (sourced from
  // message.usage.server_tool_use.web_search_requests in liveTransport).
  assert.equal(out.usage.webSearchRequests, 3)
})

test("menu_benchmark_price lane blocks cross-provider failover on 503 storm", async () => {
  // The lane is in REQUIRES_RESEARCH_MODEL_LANES so the router picks Anthropic.
  // BLOCK_CROSS_PROVIDER_FAILOVER_LANES blocks the secondary attempt — Anthropic
  // 5xx must rethrow upstream, NOT route to DeepSeek (which would 400 on the
  // server tool anyway).
  let calls = 0
  const providers = []
  const transport = {
    async call(input) {
      calls += 1
      providers.push(input.provider)
      throw new ScoutAdapterError({
        errorClass: "server",
        provider: input.provider,
        status: 503,
        message: "forced 503",
      })
    },
    async *stream() {},
  }

  await assert.rejects(
    runScoutTurn({
      lane: "menu_benchmark_price",
      systemBlocks: [],
      messages: [{ role: "user", content: "test" }],
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 10 },
      ],
      maxTokens: 1024,
      userId: "u1",
      routeTag: "/api/workspaces/menu-pricing/benchmark-price",
      transport,
    }),
    (err) => err instanceof ScoutAdapterError && err.errorClass === "server",
  )

  // Initial + retry on Anthropic only — no cross-provider failover.
  assert.equal(calls, 2, "expected initial + 1 retry, no cross-provider failover")
  assert.equal(providers[0], "anthropic")
  assert.equal(providers[1], "anthropic")
})
