// TIM-2589: Unit tests for resolveUiRevamp() — the pure flag-resolution logic.
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveUiRevamp } from "./ui-revamp.ts";

test("default: returns DB value when no cookies present", () => {
  assert.equal(
    resolveUiRevamp({ dbValue: true, overrideCookie: undefined, mirrorCookie: undefined }),
    true
  );
  assert.equal(
    resolveUiRevamp({ dbValue: false, overrideCookie: undefined, mirrorCookie: undefined }),
    false
  );
});

test("mirror cookie overrides DB value", () => {
  assert.equal(
    resolveUiRevamp({ dbValue: true, overrideCookie: undefined, mirrorCookie: "0" }),
    false
  );
  assert.equal(
    resolveUiRevamp({ dbValue: false, overrideCookie: undefined, mirrorCookie: "1" }),
    true
  );
});

test("override cookie wins over mirror cookie and DB", () => {
  // ?ui=v1 forces v1 even if DB + mirror say v2
  assert.equal(
    resolveUiRevamp({ dbValue: true, overrideCookie: "v1", mirrorCookie: "1" }),
    false
  );
  // ?ui=v2 forces v2 even if DB + mirror say v1
  assert.equal(
    resolveUiRevamp({ dbValue: false, overrideCookie: "v2", mirrorCookie: "0" }),
    true
  );
});

test("unknown cookie values fall through to DB", () => {
  assert.equal(
    resolveUiRevamp({ dbValue: true, overrideCookie: "v3", mirrorCookie: "maybe" }),
    true
  );
  assert.equal(
    resolveUiRevamp({ dbValue: false, overrideCookie: "v3", mirrorCookie: "maybe" }),
    false
  );
});
