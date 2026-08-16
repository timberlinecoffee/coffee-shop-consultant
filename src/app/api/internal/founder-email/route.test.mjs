// TIM-3096: pinning tests for sendFounderEmail.
//
// Lives next to the route handler so we exercise the same module the route
// imports. The route itself (auth, zod, allowlist, rate-limit) uses Next's
// `@/` path alias and only resolves under the Next build; behavioral coverage
// for those gates lives in the acceptance smoke (TIM-3096 acceptance: CSM
// sends a test message to a board inbox).
//
// Locked in here:
//   1. Skip with no_api_key when RESEND_API_KEY is unset.
//   2. Happy path forwards From / Reply-To / To / subject / text to Resend.
//   3. html is forwarded only when the caller passes it (plain-text default).
//   4. Non-OK Resend response surfaces sanitized status + error to the caller.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendFounderEmail } from "../../../../lib/email/send-founder-email.ts";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.FOUNDER_FROM_EMAIL;
  delete process.env.FOUNDER_REPLY_TO;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("skips with no_api_key when RESEND_API_KEY is unset", async () => {
  delete process.env.RESEND_API_KEY;
  const result = await sendFounderEmail({
    to: "ops@example.com",
    subject: "hi",
    text: "hi",
  });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "no_api_key");
});

test("happy path forwards From, Reply-To, To, subject, text to Resend", async () => {
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ id: "resend_abc123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await sendFounderEmail({
    to: "ops@example.com",
    subject: "Welcome to Timberline",
    text: "Hi there,\n\nThanks for joining.",
  });
  assert.equal(result.ok, true);
  assert.equal(result.id, "resend_abc123");
  assert.equal(captured.url, "https://api.resend.com/emails");
  assert.equal(captured.body.from, "Trent (Timberline) <hello@timberline.coffee>");
  assert.equal(captured.body.reply_to, "hello@timberline.coffee");
  assert.deepEqual(captured.body.to, ["ops@example.com"]);
  assert.equal(captured.body.subject, "Welcome to Timberline");
  assert.equal(captured.body.text, "Hi there,\n\nThanks for joining.");
  assert.equal(captured.body.html, undefined);
});

test("html is forwarded only when the caller passes it", async () => {
  let captured = null;
  globalThis.fetch = async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: "id_html" }), { status: 200 });
  };
  await sendFounderEmail({
    to: "ops@example.com",
    subject: "hi",
    text: "hi",
    html: "<p>hi</p>",
  });
  assert.equal(captured.html, "<p>hi</p>");
});

test("non-OK Resend response surfaces sanitized status + error", async () => {
  globalThis.fetch = async () =>
    new Response("rate limited", { status: 429 });
  const result = await sendFounderEmail({
    to: "ops@example.com",
    subject: "hi",
    text: "hi",
  });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.equal(result.status, 429);
  assert.equal(result.error, "rate limited");
});

test("FOUNDER_FROM_EMAIL / FOUNDER_REPLY_TO env overrides are respected", async () => {
  process.env.FOUNDER_FROM_EMAIL = "Test Founder <founder@example.com>";
  process.env.FOUNDER_REPLY_TO = "inbox@example.com";
  let captured = null;
  globalThis.fetch = async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: "id_env" }), { status: 200 });
  };
  await sendFounderEmail({
    to: "ops@example.com",
    subject: "hi",
    text: "hi",
  });
  assert.equal(captured.from, "Test Founder <founder@example.com>");
  assert.equal(captured.reply_to, "inbox@example.com");
});
