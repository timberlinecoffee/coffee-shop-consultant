// TIM-3463: scout-errors normalization tests.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ScoutAdapterError,
  SCOUT_USER_FALLBACK_COPY,
  classifyHttpStatus,
  classifyTransportError,
  isFailoverEligible,
} from "./scout-errors.ts"

test("classifyHttpStatus maps the documented HTTP buckets", () => {
  assert.equal(classifyHttpStatus(401), "auth")
  assert.equal(classifyHttpStatus(403), "auth")
  assert.equal(classifyHttpStatus(429), "rate_limit")
  assert.equal(classifyHttpStatus(500), "server")
  assert.equal(classifyHttpStatus(502), "server")
  assert.equal(classifyHttpStatus(503), "server")
  assert.equal(classifyHttpStatus(599), "server")
  assert.equal(classifyHttpStatus(400), "unknown")
  assert.equal(classifyHttpStatus(404), "unknown")
})

test("content-policy hint overrides the status bucket", () => {
  assert.equal(classifyHttpStatus(400, { contentPolicy: true }), "content_policy")
})

test("classifyTransportError detects timeouts + network", () => {
  const ab = new Error("aborted")
  ab.name = "AbortError"
  assert.equal(classifyTransportError(ab), "timeout")

  const to = new Error("request timed out after 60000ms")
  assert.equal(classifyTransportError(to), "timeout")

  const net = new Error("fetch failed: ECONNRESET")
  assert.equal(classifyTransportError(net), "server")

  assert.equal(classifyTransportError(new Error("???")), "unknown")
})

test("isFailoverEligible — rate_limit, server, timeout YES; auth, content_policy, unknown NO", () => {
  assert.equal(isFailoverEligible("rate_limit"), true)
  assert.equal(isFailoverEligible("server"), true)
  assert.equal(isFailoverEligible("timeout"), true)
  assert.equal(isFailoverEligible("auth"), false)
  assert.equal(isFailoverEligible("content_policy"), false)
  assert.equal(isFailoverEligible("unknown"), false)
})

test("ScoutAdapterError carries class + provider + status without leaking raw body", () => {
  const provider = "deepseek"
  const e = new ScoutAdapterError({
    errorClass: "server",
    provider,
    status: 503,
    message: "upstream is sad",
    cause: { secretToken: "leak-me-not" },
  })
  assert.equal(e.errorClass, "server")
  assert.equal(e.provider, provider)
  assert.equal(e.status, 503)
  assert.equal(e.name, "ScoutAdapterError")
  // The raw cause is attached for server-side logging but the message string
  // does not include it — the route boundary only surfaces e.message.
  assert.equal(e.message, "upstream is sad")
})

test("SCOUT_USER_FALLBACK_COPY is the single source of user-facing copy", () => {
  assert.match(SCOUT_USER_FALLBACK_COPY, /temporarily unavailable/i)
})
