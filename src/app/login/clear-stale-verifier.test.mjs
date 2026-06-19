// TIM-2327: regression test for the stale-verifier pre-deletion. A regression
// here lets a sibling verifier cookie at a different Domain attribute shadow
// the fresh write supabase-js makes, and the next OAuth exchange fails with
// code_challenge_does_not_match_previously_saved_code_verifier. Trent hit this
// 2026-06-08; reproduced live via scripts/tim2327-repro.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findStaleVerifierNames,
  pathDomainVariantsForDeletion,
  deleteAllVerifierVariants,
  verifierPresentInDocumentCookie,
} from "./clear-stale-verifier.ts";

test("findStaleVerifierNames picks up the canonical verifier", () => {
  const names = findStaleVerifierNames(
    "sb-abc123-auth-token-code-verifier=base64-xyz; gw_remember_me=1"
  );
  assert.deepEqual(names, ["sb-abc123-auth-token-code-verifier"]);
});

test("findStaleVerifierNames picks up chunked variants", () => {
  const names = findStaleVerifierNames(
    "sb-abc-auth-token-code-verifier.0=part0; sb-abc-auth-token-code-verifier.1=part1; other=1"
  );
  assert.deepEqual(names, [
    "sb-abc-auth-token-code-verifier.0",
    "sb-abc-auth-token-code-verifier.1",
  ]);
});

test("findStaleVerifierNames ignores unrelated cookies", () => {
  const names = findStaleVerifierNames(
    "sb-abc-auth-token=full_token; sb-abc-auth-token.0=chunk; gw_oauth_signup_source=direct"
  );
  assert.deepEqual(names, []);
});

test("findStaleVerifierNames returns empty for empty cookie string", () => {
  assert.deepEqual(findStaleVerifierNames(""), []);
});

test("pathDomainVariantsForDeletion covers host-only + leading-dot + eTLD+1", () => {
  const variants = pathDomainVariantsForDeletion("groundwork.cafe");
  assert.ok(variants.includes("Path=/"));
  assert.ok(variants.includes("Path=/; Domain=groundwork.cafe"));
  assert.ok(variants.includes("Path=/; Domain=.groundwork.cafe"));
  // groundwork.cafe -> "cafe" eTLD+1. We blast that too as a safety net.
  assert.ok(variants.includes("Path=/; Domain=cafe"));
  assert.ok(variants.includes("Path=/; Domain=.cafe"));
});

test("pathDomainVariantsForDeletion on a subdomain includes parent", () => {
  const variants = pathDomainVariantsForDeletion("app.groundwork.cafe");
  assert.ok(variants.includes("Path=/; Domain=app.groundwork.cafe"));
  assert.ok(variants.includes("Path=/; Domain=.app.groundwork.cafe"));
  assert.ok(variants.includes("Path=/; Domain=groundwork.cafe"));
  assert.ok(variants.includes("Path=/; Domain=.groundwork.cafe"));
});

test("pathDomainVariantsForDeletion on localhost only emits host-only", () => {
  const variants = pathDomainVariantsForDeletion("localhost");
  assert.deepEqual(variants, ["Path=/", "Path=/; Domain=localhost", "Path=/; Domain=.localhost"]);
});

test("deleteAllVerifierVariants writes one delete line per (name × variant)", () => {
  const writes = [];
  const count = deleteAllVerifierVariants({
    getDocumentCookie: () => "sb-abc-auth-token-code-verifier=base64-xyz; gw_remember_me=1",
    setDocumentCookie: (line) => writes.push(line),
    hostname: "groundwork.cafe",
  });
  assert.equal(count, 1);
  // 5 variants × 1 name = 5 delete lines.
  assert.equal(writes.length, 5);
  for (const line of writes) {
    assert.match(line, /^sb-abc-auth-token-code-verifier=;\s+Path=\/.*Max-Age=0$/);
  }
});

test("deleteAllVerifierVariants handles chunked + canonical together", () => {
  const writes = [];
  const count = deleteAllVerifierVariants({
    getDocumentCookie: () =>
      "sb-abc-auth-token-code-verifier=a; sb-abc-auth-token-code-verifier.0=b; sb-abc-auth-token-code-verifier.1=c",
    setDocumentCookie: (line) => writes.push(line),
    hostname: "groundwork.cafe",
  });
  assert.equal(count, 3);
  // 5 variants × 3 names = 15 delete lines.
  assert.equal(writes.length, 15);
});

test("deleteAllVerifierVariants no-ops when no verifier present", () => {
  const writes = [];
  const count = deleteAllVerifierVariants({
    getDocumentCookie: () => "gw_remember_me=1; gw_oauth_signup_source=direct",
    setDocumentCookie: (line) => writes.push(line),
    hostname: "groundwork.cafe",
  });
  assert.equal(count, 0);
  assert.equal(writes.length, 0);
});

test("deleteAllVerifierVariants no-ops on empty cookie string", () => {
  const writes = [];
  const count = deleteAllVerifierVariants({
    getDocumentCookie: () => "",
    setDocumentCookie: (line) => writes.push(line),
    hostname: "groundwork.cafe",
  });
  assert.equal(count, 0);
  assert.equal(writes.length, 0);
});

// TIM-2750
test("verifierPresentInDocumentCookie true when canonical verifier has a value", () => {
  assert.equal(
    verifierPresentInDocumentCookie("sb-abc-auth-token-code-verifier=base64-xyz; other=1"),
    true,
  );
});

test("verifierPresentInDocumentCookie true when a chunked variant has a value", () => {
  assert.equal(
    verifierPresentInDocumentCookie("sb-abc-auth-token-code-verifier.0=base64-aaa"),
    true,
  );
});

test("verifierPresentInDocumentCookie false when verifier value is empty", () => {
  // An empty value can appear when a prior clearHandoffCookies / setItem
  // delete left the row in the jar before the browser garbage-collected it.
  // We must report "0" (no verifier) in that case, not "1".
  assert.equal(verifierPresentInDocumentCookie("sb-abc-auth-token-code-verifier="), false);
});

test("verifierPresentInDocumentCookie false when verifier cookie is absent", () => {
  assert.equal(
    verifierPresentInDocumentCookie("sb-abc-auth-token.0=foo; gw_remember_me=1"),
    false,
  );
});

test("verifierPresentInDocumentCookie false on empty string", () => {
  assert.equal(verifierPresentInDocumentCookie(""), false);
});
