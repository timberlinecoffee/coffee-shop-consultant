// TIM-2327: pin apex OAuth-forward behavior. A regression here would either
// drop the user back on coming-soon with no auth (broken silent flow) OR
// forward unrelated marketing-page query params to /auth/callback (which
// would 500 or swallow the params).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthForwardUrl, AUTH_FORWARD_KEYS } from "./apex-auth-forward.ts";

test("forwards PKCE ?code=...", () => {
  assert.equal(
    buildAuthForwardUrl({ code: "abc123" }),
    "/auth/callback?code=abc123"
  );
});

test("forwards code + state together", () => {
  const url = buildAuthForwardUrl({ code: "abc", state: "xyz" });
  assert.equal(url, "/auth/callback?code=abc&state=xyz");
});

test("forwards ?error= and error_description", () => {
  const url = buildAuthForwardUrl({
    error: "access_denied",
    error_description: "User cancelled",
  });
  assert.equal(
    url,
    "/auth/callback?error=access_denied&error_description=User+cancelled"
  );
});

test("returns null when no auth signal", () => {
  assert.equal(buildAuthForwardUrl({}), null);
  assert.equal(buildAuthForwardUrl({ utm_source: "google" }), null);
  assert.equal(buildAuthForwardUrl({ ref: "waitlist" }), null);
});

test("returns null when only auxiliary keys present (state without code)", () => {
  // state alone is not an auth signal — it could be any leftover param.
  assert.equal(buildAuthForwardUrl({ state: "xyz" }), null);
});

test("ignores non-string array params", () => {
  assert.equal(buildAuthForwardUrl({ code: ["a", "b"] }), null);
});

test("ignores empty-string code", () => {
  assert.equal(buildAuthForwardUrl({ code: "" }), null);
});

test("URL-encodes special chars in code", () => {
  const url = buildAuthForwardUrl({ code: "abc/+=" });
  assert.equal(url, "/auth/callback?code=abc%2F%2B%3D");
});

test("doesn't pass through unrelated marketing params", () => {
  const url = buildAuthForwardUrl({ code: "abc", utm_source: "google", ref: "x" });
  assert.equal(url, "/auth/callback?code=abc");
});

test("AUTH_FORWARD_KEYS pinned", () => {
  assert.deepEqual(
    [...AUTH_FORWARD_KEYS],
    ["code", "state", "error", "error_code", "error_description"]
  );
});
