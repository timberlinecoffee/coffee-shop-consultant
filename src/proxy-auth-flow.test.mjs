// TIM-2352: pin which paths bypass proxy.ts's getUser() call. Misclassifying
// any of these breaks the in-flight PKCE handshake (verifier wiped).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthFlowPath } from "./proxy-auth-flow.ts";

test("/auth/callback bypasses regardless of query", () => {
  assert.equal(isAuthFlowPath("/auth/callback", []), true);
  assert.equal(isAuthFlowPath("/auth/callback", ["code"]), true);
  assert.equal(isAuthFlowPath("/auth/callback", ["error"]), true);
  assert.equal(isAuthFlowPath("/auth/callback", ["foo"]), true);
});

test("/auth/signout bypasses regardless of query", () => {
  assert.equal(isAuthFlowPath("/auth/signout", []), true);
  assert.equal(isAuthFlowPath("/auth/signout", ["foo"]), true);
});

test("apex / bypasses ONLY when ?code or ?error is present (Site URL fallback)", () => {
  assert.equal(isAuthFlowPath("/", ["code"]), true);
  assert.equal(isAuthFlowPath("/", ["error"]), true);
  assert.equal(isAuthFlowPath("/", ["code", "state"]), true);
  assert.equal(isAuthFlowPath("/", ["state", "error_description"]), false);
});

test("apex / does NOT bypass on plain visits", () => {
  assert.equal(isAuthFlowPath("/", []), false);
  assert.equal(isAuthFlowPath("/", ["utm_source", "ref"]), false);
});

test("other paths never bypass even with ?code= or ?error=", () => {
  // The bypass is only for routes that participate in the OAuth handshake.
  // Random pages with stray ?code= must still go through normal auth.
  assert.equal(isAuthFlowPath("/dashboard", ["code"]), false);
  assert.equal(isAuthFlowPath("/login", ["error"]), false);
  assert.equal(isAuthFlowPath("/onboarding", ["code"]), false);
  assert.equal(isAuthFlowPath("/account", ["code"]), false);
});

test("protected paths under /auth/* other than callback/signout fall through to normal auth", () => {
  assert.equal(isAuthFlowPath("/auth", []), false);
  assert.equal(isAuthFlowPath("/auth/", []), false);
  assert.equal(isAuthFlowPath("/auth/callbacks", []), false);
  assert.equal(isAuthFlowPath("/auth/callback/extra", []), false);
});
