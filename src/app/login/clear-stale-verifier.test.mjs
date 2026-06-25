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
  findAllSupabaseCookieNames,
  broadPathDomainVariants,
  purgeAllSupabaseCookiesDom,
  purgeAllSupabaseCookies,
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

// ─────────────────────────────────────────────────────────────────────────────
// TIM-2327 (2026-06-25): zombie-cookie purge regression pins. Trent's
// screenshot captured `stale_verifiers=400` — 400 verifier-named zombies the
// previous deletion code could not clear because their Path/Domain attrs did
// not match any variant in pathDomainVariantsForDeletion (which only emits
// Path=/). These pins make sure the new purge: (1) finds ALL sb-* names not
// just verifier, (2) deduplicates, (3) blasts a much wider Path × Domain
// matrix, and (4) prefers the Cookie Store API when injected (so the
// production path will delete at exact attributes, no guessing).

test("findAllSupabaseCookieNames covers verifier + auth-token + arbitrary sb-*", () => {
  const names = findAllSupabaseCookieNames(
    "sb-abc-auth-token-code-verifier=xyz; sb-abc-auth-token.0=chunk0; sb-abc-auth-token.1=chunk1; sb-abc-anything=foo; gw_remember_me=1"
  );
  assert.deepEqual(names, [
    "sb-abc-auth-token-code-verifier",
    "sb-abc-auth-token.0",
    "sb-abc-auth-token.1",
    "sb-abc-anything",
  ]);
});

test("findAllSupabaseCookieNames deduplicates same-name entries", () => {
  // document.cookie surfaces the same name twice when two cookies live under
  // different (Domain, Path) attrs both visible to the page. We dedupe so
  // the purge writes one deletion per name × variant rather than scaling
  // linearly with the duplicate count.
  const names = findAllSupabaseCookieNames(
    "sb-abc-auth-token-code-verifier=a; sb-abc-auth-token-code-verifier=b; sb-abc-auth-token-code-verifier=c"
  );
  assert.deepEqual(names, ["sb-abc-auth-token-code-verifier"]);
});

test("findAllSupabaseCookieNames ignores non-sb cookies", () => {
  const names = findAllSupabaseCookieNames(
    "gw_oauth_signup_source=direct; gw_remember_me=1; other_session=xyz"
  );
  assert.deepEqual(names, []);
});

test("findAllSupabaseCookieNames empty on empty input", () => {
  assert.deepEqual(findAllSupabaseCookieNames(""), []);
});

test("broadPathDomainVariants covers app paths × host + .host on apex", () => {
  const variants = broadPathDomainVariants("groundwork.cafe");
  // Apex (2 parts) — no eTLD+1 split, so only host-only + Domain=host +
  // Domain=.host across paths.
  assert.ok(variants.includes("Path=/"));
  assert.ok(variants.includes("Path=/; Domain=groundwork.cafe"));
  assert.ok(variants.includes("Path=/; Domain=.groundwork.cafe"));
  assert.ok(variants.includes("Path=/auth"));
  assert.ok(variants.includes("Path=/auth/callback"));
  assert.ok(variants.includes("Path=/auth/callback; Domain=.groundwork.cafe"));
  assert.ok(variants.includes("Path=/login"));
  assert.ok(variants.includes("Path=/dashboard"));
  assert.ok(variants.includes("Path=/onboarding"));
  assert.ok(variants.includes("Path=/workspace"));
  // No Domain=cafe / Domain=.cafe on apex (browsers reject public suffix).
  for (const v of variants) {
    assert.ok(!/Domain=\.?cafe(;|$)/.test(v), `should not emit ${v}`);
  }
});

test("broadPathDomainVariants on a subdomain also clears the parent zone", () => {
  const variants = broadPathDomainVariants("app.groundwork.cafe");
  assert.ok(variants.includes("Path=/; Domain=app.groundwork.cafe"));
  assert.ok(variants.includes("Path=/; Domain=.app.groundwork.cafe"));
  assert.ok(variants.includes("Path=/; Domain=groundwork.cafe"));
  assert.ok(variants.includes("Path=/; Domain=.groundwork.cafe"));
  assert.ok(variants.includes("Path=/auth/callback; Domain=.groundwork.cafe"));
});

test("broadPathDomainVariants on localhost emits only host-only and Domain=localhost", () => {
  const variants = broadPathDomainVariants("localhost");
  // 7 paths × 3 domain variants = 21.
  assert.equal(variants.length, 7 * 3);
  assert.ok(variants.includes("Path=/"));
  assert.ok(variants.includes("Path=/; Domain=localhost"));
  assert.ok(variants.includes("Path=/; Domain=.localhost"));
});

test("purgeAllSupabaseCookiesDom blasts every (sb-name × variant) combo", () => {
  const writes = [];
  const count = purgeAllSupabaseCookiesDom({
    getDocumentCookie: () =>
      "sb-abc-auth-token-code-verifier=v; sb-abc-auth-token.0=a; sb-abc-auth-token.1=b",
    setDocumentCookie: (line) => writes.push(line),
    hostname: "groundwork.cafe",
  });
  assert.equal(count, 3);
  // 7 paths × 3 domain variants × 3 names = 63 lines.
  assert.equal(writes.length, 7 * 3 * 3);
  for (const line of writes) {
    assert.match(line, /^sb-abc-(auth-token-code-verifier|auth-token\.\d)=;\s+Path=\/[^;]*(?:;\s+Domain=[^;]*)?;\s+Max-Age=0$/);
  }
});

test("purgeAllSupabaseCookiesDom no-ops when no sb-* cookies present", () => {
  const writes = [];
  const count = purgeAllSupabaseCookiesDom({
    getDocumentCookie: () => "gw_remember_me=1; other=foo",
    setDocumentCookie: (line) => writes.push(line),
    hostname: "groundwork.cafe",
  });
  assert.equal(count, 0);
  assert.equal(writes.length, 0);
});

test("purgeAllSupabaseCookies prefers Cookie Store API when present", async () => {
  // Simulate 3 sb-* cookies with distinct (Path, Domain) attrs the legacy
  // pathDomainVariantsForDeletion would NOT match. The new purge should
  // delete each by its EXACT attributes (no guessing).
  const stored = [
    { name: "sb-abc-auth-token-code-verifier", value: "v", path: "/auth", domain: ".groundwork.cafe" },
    { name: "sb-abc-auth-token.0", value: "a", path: "/dashboard", domain: "groundwork.cafe" },
    { name: "sb-abc-auth-token.1", value: "b", path: "/login", domain: null },
    { name: "gw_remember_me", value: "1", path: "/", domain: null },
  ];
  const deletions = [];
  const cookieStore = {
    getAll: async () => stored,
    delete: async (opts) => { deletions.push(opts); },
  };
  const result = await purgeAllSupabaseCookies({
    hostname: "groundwork.cafe",
    getDocumentCookie: () => "",
    setDocumentCookie: () => {},
    cookieStore,
  });
  assert.equal(result.method, "cookie-store-api");
  // Each sb-* cookie deleted ONCE at its exact attrs — non-sb gw_remember_me skipped.
  assert.equal(deletions.length, 3);
  assert.deepEqual(deletions[0], { name: "sb-abc-auth-token-code-verifier", path: "/auth", domain: ".groundwork.cafe" });
  assert.deepEqual(deletions[1], { name: "sb-abc-auth-token.0", path: "/dashboard", domain: "groundwork.cafe" });
  // null domain is OMITTED (Cookie Store API rejects null/undefined domain
  // unless the cookie is host-only without an explicit Domain attr).
  assert.deepEqual(deletions[2], { name: "sb-abc-auth-token.1", path: "/login" });
});

test("purgeAllSupabaseCookies falls back to DOM blast when no Cookie Store API", async () => {
  const writes = [];
  const result = await purgeAllSupabaseCookies({
    hostname: "groundwork.cafe",
    getDocumentCookie: () => "sb-abc-auth-token-code-verifier=v",
    setDocumentCookie: (line) => writes.push(line),
    cookieStore: null,
  });
  assert.equal(result.method, "dom-fallback");
  assert.equal(result.deleted, 1);
  // 7 × 3 deletion lines from broadPathDomainVariants.
  assert.equal(writes.length, 7 * 3);
});

test("purgeAllSupabaseCookies recovers via DOM blast when Cookie Store API throws", async () => {
  const writes = [];
  const cookieStore = {
    getAll: async () => { throw new Error("permission denied"); },
    delete: async () => {},
  };
  const result = await purgeAllSupabaseCookies({
    hostname: "groundwork.cafe",
    getDocumentCookie: () => "sb-abc-auth-token-code-verifier=v",
    setDocumentCookie: (line) => writes.push(line),
    cookieStore,
  });
  assert.equal(result.method, "dom-fallback");
  assert.equal(result.deleted, 1);
});

test("purgeAllSupabaseCookies runs DOM belt-and-braces sweep AFTER Cookie Store API path", async () => {
  // Simulate the rare-but-observed case where Cookie Store API getAll() does
  // NOT surface every cookie document.cookie exposes (e.g. cross-origin
  // iframe contexts). The belt-and-braces DOM sweep catches the missed ones.
  const stored = [
    { name: "sb-abc-auth-token-code-verifier", value: "v", path: "/", domain: ".groundwork.cafe" },
  ];
  const writes = [];
  const cookieStore = {
    getAll: async () => stored,
    delete: async () => {},
  };
  const result = await purgeAllSupabaseCookies({
    hostname: "groundwork.cafe",
    // document.cookie reveals a SECOND cookie the Cookie Store API missed.
    getDocumentCookie: () =>
      "sb-abc-auth-token-code-verifier=v; sb-abc-auth-token.0=a",
    setDocumentCookie: (line) => writes.push(line),
    cookieStore,
  });
  assert.equal(result.method, "cookie-store-api+dom-fallback");
  // 2 names × 7 × 3 variants from DOM sweep.
  assert.equal(writes.length, 2 * 7 * 3);
  // deleted = 1 (api) + 2 (dom).
  assert.equal(result.deleted, 3);
});

test("purgeAllSupabaseCookies reports cookie-store-api when DOM sweep finds nothing extra", async () => {
  const cookieStore = {
    getAll: async () => [{ name: "sb-abc-auth-token-code-verifier", value: "v", path: "/", domain: null }],
    delete: async () => {},
  };
  const result = await purgeAllSupabaseCookies({
    hostname: "groundwork.cafe",
    getDocumentCookie: () => "", // DOM sees nothing to clean up
    setDocumentCookie: () => {},
    cookieStore,
  });
  assert.equal(result.method, "cookie-store-api");
});
