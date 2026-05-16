// TIM-635 / TIM-618-F: banner copy mapping for the 3 error classes.
// Source spec: TIM-606 error-states design spec + TIM-635 scope.

import test from "node:test";
import assert from "node:assert/strict";

import { errorCopy } from "./errors.ts";

test("upstream_error: TIM-606 hiccup copy with Retry CTA", () => {
  const copy = errorCopy({
    code: "upstream_error",
    message: "AI service hiccup — your message wasn't sent.",
  });
  assert.match(copy.title, /AI service hiccup/);
  assert.equal(copy.cta, "Retry");
  assert.equal(copy.href, null);
  assert.equal(copy.retryable, true);
  assert.equal(copy.showSmallerQuestion, false);
});

test("timeout: 'Took too long.' with Retry + Smaller question", () => {
  const copy = errorCopy({
    code: "timeout",
    message: "stalled",
  });
  assert.match(copy.title, /Took too long/);
  assert.equal(copy.cta, "Retry");
  assert.equal(copy.retryable, true);
  assert.equal(copy.showSmallerQuestion, true);
});

test("quota: server message + Upgrade link, no retry", () => {
  const copy = errorCopy({
    code: "quota",
    message: "You've used all your AI credits for this month.",
  });
  assert.equal(copy.title, "You've used all your AI credits for this month.");
  assert.equal(copy.cta, "Upgrade");
  assert.equal(copy.href, "/pricing");
  assert.equal(copy.retryable, false);
  assert.equal(copy.showSmallerQuestion, false);
});

test("paywall: free-tier path lands in same Upgrade visual as quota", () => {
  const copy = errorCopy({
    code: "paywall",
    message: "AI co-pilot requires a paid plan.",
    details: { tier_required: "starter" },
  });
  assert.equal(copy.cta, "Upgrade");
  assert.equal(copy.href, "/pricing");
  assert.equal(copy.retryable, false);
});

test("network: retryable banner, no upgrade link", () => {
  const copy = errorCopy({
    code: "network",
    message: "lost",
  });
  assert.equal(copy.cta, "Retry");
  assert.equal(copy.retryable, true);
  assert.equal(copy.href, null);
});

test("unauthorized: routes to /login, not retryable", () => {
  const copy = errorCopy({
    code: "unauthorized",
    message: "expired",
  });
  assert.equal(copy.href, "/login");
  assert.equal(copy.retryable, false);
});
