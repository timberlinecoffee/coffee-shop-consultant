// TIM-3495: Stream-event extension tests for the Scout adapter.
//
// The adapter's existing scout-adapter.test.mjs covers non-streaming runScoutTurn
// + failover. This file covers the new streaming events that copilot/stream
// depends on: `thinking_delta`, `tool_use_stop`, `server_tool_use_start`,
// `server_tool_use_result`, and the extended `decision` event carrying
// fallbackUsed + routeReason. Also covers server-tool pass-through
// (web_search_20250305) and the new optional toolChoice input on
// streamScoutTurn.
//
// We use the injectable `transport` seam to assert the route-facing event
// stream without booting the SDK.

import { test } from "node:test"
import assert from "node:assert/strict"
import { streamScoutTurn } from "./scout-adapter.ts"

function emptyUsage() {
  return {
    inputTokensUncached: 10,
    inputTokensCachedRead: 0,
    inputTokensCacheCreate: 0,
    outputTokens: 5,
    webSearchRequests: 0,
    toolCalls: 0,
  }
}

async function collectStream(stream) {
  const events = []
  for await (const e of stream) events.push(e)
  return events
}

test("streamScoutTurn emits decision event with fallbackUsed=false on default route", async () => {
  const transport = {
    async call() {
      throw new Error("not used")
    },
    async *stream() {
      yield { kind: "text_delta", text: "hi" }
      yield { kind: "stop", reason: "end_turn" }
      yield { kind: "usage", usage: emptyUsage() }
    },
  }
  const events = await collectStream(
    streamScoutTurn({
      lane: "generate_business_plan_section",
      systemBlocks: [{ text: "sys" }],
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      userId: "u1",
      routeTag: "/api/test",
      transport,
    }),
  )

  const decision = events.find((e) => e.kind === "decision")
  assert.ok(decision, "decision event must be emitted first")
  assert.equal(decision.provider, "anthropic")
  assert.equal(decision.fallbackUsed, false)
  assert.equal(typeof decision.routeReason, "string")
  assert.equal(events[0].kind, "decision", "decision must be the FIRST event")
})

test("streamScoutTurn surfaces thinking_delta from the transport untouched", async () => {
  const transport = {
    async call() {
      throw new Error("not used")
    },
    async *stream() {
      yield { kind: "thinking_delta", text: "let me think..." }
      yield { kind: "text_delta", text: "ok" }
      yield { kind: "stop", reason: "end_turn" }
      yield { kind: "usage", usage: emptyUsage() }
    },
  }
  const events = await collectStream(
    streamScoutTurn({
      lane: "chat_general",
      systemBlocks: [{ text: "sys" }],
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      userId: "u1",
      routeTag: "/api/copilot/stream",
      transport,
      forceProvider: "anthropic",
    }),
  )
  const thinking = events.find((e) => e.kind === "thinking_delta")
  assert.ok(thinking, "thinking_delta must reach the caller")
  assert.equal(thinking.text, "let me think...")
})

test("streamScoutTurn surfaces tool_use_stop with id+name from the transport", async () => {
  const transport = {
    async call() {
      throw new Error("not used")
    },
    async *stream() {
      yield {
        kind: "tool_use_start",
        id: "tool_abc",
        name: "propose_item",
        input: {},
      }
      yield { kind: "tool_use_delta", id: "tool_abc", jsonDelta: "{\"x\":1}" }
      yield { kind: "tool_use_stop", id: "tool_abc", name: "propose_item" }
      yield { kind: "stop", reason: "tool_use" }
      yield { kind: "usage", usage: emptyUsage() }
    },
  }
  const events = await collectStream(
    streamScoutTurn({
      lane: "chat_general",
      systemBlocks: [{ text: "sys" }],
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      userId: "u1",
      routeTag: "/api/copilot/stream",
      transport,
      forceProvider: "anthropic",
    }),
  )
  const stop = events.find((e) => e.kind === "tool_use_stop")
  assert.ok(stop, "tool_use_stop must be emitted on content_block_stop for a tool")
  assert.equal(stop.id, "tool_abc")
  assert.equal(stop.name, "propose_item")
})

test("streamScoutTurn surfaces server_tool_use_start and server_tool_use_result for web_search", async () => {
  const transport = {
    async call() {
      throw new Error("not used")
    },
    async *stream() {
      yield { kind: "server_tool_use_start", name: "web_search" }
      yield { kind: "server_tool_use_result" }
      yield { kind: "text_delta", text: "results synthesized" }
      yield { kind: "stop", reason: "end_turn" }
      yield { kind: "usage", usage: emptyUsage() }
    },
  }
  const events = await collectStream(
    streamScoutTurn({
      lane: "chat_general",
      systemBlocks: [{ text: "sys" }],
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      userId: "u1",
      routeTag: "/api/copilot/stream",
      transport,
      forceProvider: "anthropic",
    }),
  )
  const start = events.find((e) => e.kind === "server_tool_use_start")
  const result = events.find((e) => e.kind === "server_tool_use_result")
  assert.ok(start, "server_tool_use_start required for status:searching")
  assert.equal(start.name, "web_search")
  assert.ok(result, "server_tool_use_result required to keep watchdog fed")
})

test("streamScoutTurn passes server tools and toolChoice through to the transport input", async () => {
  let captured = null
  const transport = {
    async call() {
      throw new Error("not used")
    },
    async *stream(input) {
      captured = input
      yield { kind: "text_delta", text: "ok" }
      yield { kind: "stop", reason: "end_turn" }
      yield { kind: "usage", usage: emptyUsage() }
    },
  }
  await collectStream(
    streamScoutTurn({
      lane: "chat_general",
      systemBlocks: [{ text: "sys" }],
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      userId: "u1",
      routeTag: "/api/copilot/stream",
      transport,
      forceProvider: "anthropic",
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 8 },
        {
          name: "propose_item",
          description: "Propose a new menu item.",
          input_schema: { type: "object", properties: {} },
        },
      ],
      toolChoice: { type: "tool", name: "propose_item" },
    }),
  )

  assert.ok(captured, "transport.stream must have been called")
  assert.equal(captured.tools.length, 2, "both tools should reach transport")
  // Discriminator: server tool has `type`, client tool doesn't.
  const serverTool = captured.tools.find((t) => "type" in t)
  const clientTool = captured.tools.find((t) => "input_schema" in t)
  assert.ok(serverTool, "server tool web_search_20250305 should pass through")
  assert.equal(serverTool.name, "web_search")
  assert.equal(serverTool.max_uses, 8)
  assert.ok(clientTool, "client tool propose_item should pass through")
  assert.equal(clientTool.name, "propose_item")
  assert.deepEqual(captured.toolChoice, { type: "tool", name: "propose_item" })
})

test("streamScoutTurn default toolChoice is undefined when caller omits it (transport handles default)", async () => {
  let captured = null
  const transport = {
    async call() {
      throw new Error("not used")
    },
    async *stream(input) {
      captured = input
      yield { kind: "text_delta", text: "ok" }
      yield { kind: "stop", reason: "end_turn" }
      yield { kind: "usage", usage: emptyUsage() }
    },
  }
  await collectStream(
    streamScoutTurn({
      lane: "chat_general",
      systemBlocks: [{ text: "sys" }],
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      userId: "u1",
      routeTag: "/api/copilot/stream",
      transport,
      forceProvider: "anthropic",
      tools: [
        {
          name: "propose_item",
          description: "Propose a new menu item.",
          input_schema: { type: "object", properties: {} },
        },
      ],
    }),
  )
  assert.equal(captured.toolChoice, undefined, "no toolChoice → undefined → transport falls back to {type:auto}")
})
