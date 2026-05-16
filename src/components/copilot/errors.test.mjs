// TIM-635 / TIM-618-F: error classification + analytics tagging tests.
// Covers all three error classes (upstream_error / timeout / quota) plus the
// paywall alias and the auto-retry policy.

import test from "node:test";
import assert from "node:assert/strict";
import {
  GAP_MS,
  TTFT_MS,
  fromHttpError,
  parseErrorFrame,
  shouldAutoRetry,
  timeoutError,
  trackVisibleError,
} from "./errors.ts";

test("parseErrorFrame: upstream_error frame from server", () => {
  const err = parseErrorFrame(
    JSON.stringify({ code: "upstream_error", message: "AI service down." }),
  );
  assert.equal(err.code, "upstream_error");
  assert.equal(err.message, "AI service down.");
});

test("parseErrorFrame: timeout frame from server", () => {
  const err = parseErrorFrame(
    JSON.stringify({ code: "timeout", message: "stalled" }),
  );
  assert.equal(err.code, "timeout");
  assert.equal(err.message, "stalled");
});

test("parseErrorFrame: quota frame from server", () => {
  const err = parseErrorFrame(
    JSON.stringify({
      code: "quota",
      message: "You've used all your AI credits for this month.",
    }),
  );
  assert.equal(err.code, "quota");
  assert.match(err.message, /AI credits/);
});

test("parseErrorFrame: paywall frame keeps tier_required detail", () => {
  const err = parseErrorFrame(
    JSON.stringify({
      code: "paywall",
      reason: "paywall",
      tier_required: "starter",
    }),
  );
  assert.equal(err.code, "paywall");
  assert.equal(err.details?.tier_required, "starter");
  assert.equal(err.details?.reason, "paywall");
});

test("parseErrorFrame: unknown code falls back to upstream_error", () => {
  const err = parseErrorFrame(JSON.stringify({ code: "wat", message: "huh" }));
  assert.equal(err.code, "upstream_error");
  assert.equal(err.message, "huh");
});

test("parseErrorFrame: malformed JSON yields a safe default", () => {
  const err = parseErrorFrame("not-json");
  assert.equal(err.code, "upstream_error");
  assert.match(err.message, /unknown error/);
});

test("fromHttpError: 402 maps to quota", () => {
  const err = fromHttpError(402, { error: "Out of credits." });
  assert.equal(err.code, "quota");
  assert.equal(err.message, "Out of credits.");
});

test("fromHttpError: 401 maps to unauthorized", () => {
  const err = fromHttpError(401, null);
  assert.equal(err.code, "unauthorized");
});

test("fromHttpError: 5xx maps to upstream_error", () => {
  const err = fromHttpError(503, { error: "down" });
  assert.equal(err.code, "upstream_error");
  assert.equal(err.message, "down");
});

test("timeoutError: ttft and gap variants both classify as timeout", () => {
  assert.equal(timeoutError("ttft").code, "timeout");
  assert.equal(timeoutError("gap").code, "timeout");
  // Different copy so QA can tell which watchdog tripped in logs.
  assert.notEqual(timeoutError("ttft").message, timeoutError("gap").message);
});

test("shouldAutoRetry: only timeout auto-retries silently", () => {
  assert.equal(shouldAutoRetry("timeout"), true);
  assert.equal(shouldAutoRetry("upstream_error"), false);
  assert.equal(shouldAutoRetry("quota"), false);
  assert.equal(shouldAutoRetry("paywall"), false);
  assert.equal(shouldAutoRetry("unauthorized"), false);
  assert.equal(shouldAutoRetry("network"), false);
});

test("trackVisibleError: emits copilot_error_<code> with workspace context", () => {
  const calls = [];
  const track = (event, props) => calls.push({ event, props });
  trackVisibleError(
    { code: "upstream_error", message: "x" },
    { workspaceKey: "financials", modelUsed: "claude-sonnet-4-6" },
    track,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].event, "copilot_error_upstream_error");
  assert.equal(calls[0].props.workspaceKey, "financials");
  assert.equal(calls[0].props.modelUsed, "claude-sonnet-4-6");
});

test("trackVisibleError: each of the 3 spec error classes fires a distinct event", () => {
  const events = [];
  const track = (event) => events.push(event);
  for (const code of ["upstream_error", "timeout", "quota"]) {
    trackVisibleError({ code, message: "x" }, { workspaceKey: "concept" }, track);
  }
  assert.deepEqual(events, [
    "copilot_error_upstream_error",
    "copilot_error_timeout",
    "copilot_error_quota",
  ]);
});

test("watchdog timeouts match the TIM-618 plan §3.5 budgets", () => {
  // 8s no first chunk, 20s no chunk mid-stream — see TIM-618 plan.
  assert.equal(TTFT_MS, 8_000);
  assert.equal(GAP_MS, 20_000);
});
