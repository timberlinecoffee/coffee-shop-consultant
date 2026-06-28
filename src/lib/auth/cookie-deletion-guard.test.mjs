import test from "node:test";
import assert from "node:assert/strict";

import {
  isAuthTokenDeletionBatch,
  requestCarriesValidAuthToken,
  shouldSuppressSetAll,
} from "./cookie-deletion-guard.ts";

const REF = "abcdef";
const AUTH = `sb-${REF}-auth-token`;
const AUTH_CHUNK = `sb-${REF}-auth-token.0`;
const VERIFIER = `sb-${REF}-auth-token-code-verifier`;
const OTHER = "gw_remember_me";

function deletionEntry(name) {
  return { name, value: "", options: { maxAge: 0, path: "/" } };
}

function jar(pairs) {
  return { getAll: () => pairs };
}

test("isAuthTokenDeletionBatch — empty batch is not a deletion", () => {
  assert.equal(isAuthTokenDeletionBatch([]), false);
});

test("isAuthTokenDeletionBatch — pure auth-token wipe matches", () => {
  assert.equal(isAuthTokenDeletionBatch([deletionEntry(AUTH), deletionEntry(AUTH_CHUNK)]), true);
});

test("isAuthTokenDeletionBatch — mixed wipe (auth + non-auth) still matches", () => {
  // _removeSession wipes auth cookies; non-auth deletions in the same batch are
  // fine — we still want to suppress as long as at least one auth cookie is in
  // the wipe.
  assert.equal(
    isAuthTokenDeletionBatch([deletionEntry(AUTH), deletionEntry(OTHER)]),
    true,
  );
});

test("isAuthTokenDeletionBatch — non-empty value disqualifies", () => {
  // Refresh write: new tokens land via setAll with non-empty values.
  const refresh = [
    { name: AUTH, value: "eyJfresh", options: { maxAge: 3600, path: "/" } },
  ];
  assert.equal(isAuthTokenDeletionBatch(refresh), false);
});

test("isAuthTokenDeletionBatch — maxAge!==0 disqualifies", () => {
  const notADeletion = [{ name: AUTH, value: "", options: { maxAge: 60, path: "/" } }];
  assert.equal(isAuthTokenDeletionBatch(notADeletion), false);
});

test("isAuthTokenDeletionBatch — non-auth-only deletion does not match", () => {
  // Generic preference deletion shouldn't engage the auth guard.
  assert.equal(isAuthTokenDeletionBatch([deletionEntry(OTHER)]), false);
});

test("requestCarriesValidAuthToken — present and non-empty", () => {
  assert.equal(requestCarriesValidAuthToken(jar([{ name: AUTH, value: "eyJabc" }])), true);
  assert.equal(
    requestCarriesValidAuthToken(jar([{ name: AUTH_CHUNK, value: "chunk-1-payload" }])),
    true,
  );
});

test("requestCarriesValidAuthToken — empty value does not count", () => {
  assert.equal(requestCarriesValidAuthToken(jar([{ name: AUTH, value: "" }])), false);
});

test("requestCarriesValidAuthToken — PKCE verifier alone does not count", () => {
  assert.equal(
    requestCarriesValidAuthToken(jar([{ name: VERIFIER, value: "pkce-v" }])),
    false,
  );
});

test("requestCarriesValidAuthToken — no auth cookies at all", () => {
  assert.equal(requestCarriesValidAuthToken(jar([{ name: OTHER, value: "1" }])), false);
  assert.equal(requestCarriesValidAuthToken(jar([])), false);
});

test("shouldSuppressSetAll — race shape (wipe + still-valid auth in request) suppresses + logs", () => {
  const events = [];
  const result = shouldSuppressSetAll(
    [deletionEntry(AUTH), deletionEntry(AUTH_CHUNK)],
    jar([{ name: AUTH, value: "eyJstillvalid" }]),
    { path: "/dashboard" },
    (e) => events.push(e),
  );
  assert.equal(result, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].tag, "tim3330_setall_deletion_suppressed");
  assert.deepEqual(events[0].cookieNames, [AUTH, AUTH_CHUNK]);
  assert.equal(events[0].ctx.path, "/dashboard");
});

test("shouldSuppressSetAll — real signOut (wipe, no valid auth in request) propagates", () => {
  // User-initiated signOut: by the time the server fires _removeSession, the
  // request already lacks a valid auth-token cookie (e.g. server signOut after
  // client cleared, or expired-and-revoked token already absent).
  const events = [];
  const result = shouldSuppressSetAll(
    [deletionEntry(AUTH), deletionEntry(AUTH_CHUNK)],
    jar([]),
    {},
    (e) => events.push(e),
  );
  assert.equal(result, false);
  assert.equal(events.length, 0);
});

test("shouldSuppressSetAll — real refresh write (non-deletion batch) propagates", () => {
  const events = [];
  const result = shouldSuppressSetAll(
    [{ name: AUTH, value: "eyJnewtoken", options: { maxAge: 3600 } }],
    jar([{ name: AUTH, value: "eyJoldtoken" }]),
    {},
    (e) => events.push(e),
  );
  assert.equal(result, false);
  assert.equal(events.length, 0);
});

test("shouldSuppressSetAll — generic non-auth deletion propagates", () => {
  const events = [];
  const result = shouldSuppressSetAll(
    [deletionEntry(OTHER)],
    jar([{ name: AUTH, value: "eyJstillvalid" }]),
    {},
    (e) => events.push(e),
  );
  assert.equal(result, false);
  assert.equal(events.length, 0);
});

test("shouldSuppressSetAll — only PKCE verifier in jar does NOT suppress wipe", () => {
  // PKCE verifier alone is pre-auth handshake state, not a session bearer;
  // suppression on this would be wrong.
  const events = [];
  const result = shouldSuppressSetAll(
    [deletionEntry(AUTH)],
    jar([{ name: VERIFIER, value: "pkce-v" }]),
    {},
    (e) => events.push(e),
  );
  assert.equal(result, false);
  assert.equal(events.length, 0);
});
