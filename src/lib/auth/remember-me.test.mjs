import test from "node:test";
import assert from "node:assert/strict";

import {
  REMEMBER_ME_COOKIE,
  REMEMBER_ME_MAX_AGE_SECONDS,
  parseRememberPreference,
  isSupabaseAuthCookie,
  adjustOptionsForRemember,
} from "./remember-me.ts";

test("cookie name + max-age constants", () => {
  assert.equal(REMEMBER_ME_COOKIE, "gw_remember_me");
  assert.equal(REMEMBER_ME_MAX_AGE_SECONDS, 400 * 24 * 60 * 60);
});

test("parseRememberPreference defaults to true when absent", () => {
  assert.equal(parseRememberPreference(undefined), true);
  assert.equal(parseRememberPreference(null), true);
  assert.equal(parseRememberPreference(""), true);
});

test("parseRememberPreference returns false only for explicit '0'", () => {
  assert.equal(parseRememberPreference("0"), false);
  assert.equal(parseRememberPreference("1"), true);
  // Anything not literally "0" → true (forward-compat for opaque values)
  assert.equal(parseRememberPreference("true"), true);
  assert.equal(parseRememberPreference("false"), true);
});

test("isSupabaseAuthCookie matches chunked auth tokens + verifier", () => {
  assert.equal(isSupabaseAuthCookie("sb-ltmcttjftxzpgynhnrpg-auth-token"), true);
  assert.equal(isSupabaseAuthCookie("sb-ltmcttjftxzpgynhnrpg-auth-token.0"), true);
  assert.equal(isSupabaseAuthCookie("sb-ltmcttjftxzpgynhnrpg-auth-token.1"), true);
  assert.equal(isSupabaseAuthCookie("sb-ltmcttjftxzpgynhnrpg-auth-token-code-verifier"), true);
});

test("isSupabaseAuthCookie ignores unrelated cookies", () => {
  assert.equal(isSupabaseAuthCookie("gw_remember_me"), false);
  assert.equal(isSupabaseAuthCookie("gw_oauth_next"), false);
  assert.equal(isSupabaseAuthCookie("_vercel_jwt"), false);
  assert.equal(isSupabaseAuthCookie("session"), false);
  // Defensive: name that mentions "auth-token" without sb- prefix should NOT match
  assert.equal(isSupabaseAuthCookie("xx-auth-token"), false);
});

test("adjustOptionsForRemember is a no-op when remember=true", () => {
  const opts = { maxAge: 400 * 24 * 60 * 60, path: "/", sameSite: "lax" };
  assert.deepEqual(
    adjustOptionsForRemember("sb-ref-auth-token.0", opts, true),
    opts,
  );
});

test("adjustOptionsForRemember strips maxAge + expires on auth cookies when remember=false", () => {
  const opts = {
    maxAge: 400 * 24 * 60 * 60,
    expires: new Date("2030-01-01T00:00:00Z"),
    path: "/",
    sameSite: "lax",
    secure: true,
  };
  const out = adjustOptionsForRemember("sb-ref-auth-token.0", opts, false);
  assert.equal(out.maxAge, undefined);
  assert.equal(out.expires, undefined);
  assert.equal(out.path, "/");
  assert.equal(out.sameSite, "lax");
  assert.equal(out.secure, true);
});

test("adjustOptionsForRemember leaves non-auth cookies alone even when remember=false", () => {
  const opts = { maxAge: 600, path: "/" };
  assert.deepEqual(
    adjustOptionsForRemember("gw_oauth_next", opts, false),
    opts,
  );
});

test("adjustOptionsForRemember handles undefined options gracefully", () => {
  // When SSR cookie adapter passes no options, we still want to strip — return {}
  const out = adjustOptionsForRemember("sb-ref-auth-token.0", undefined, false);
  assert.deepEqual(out, {});
});
