// TIM-3284: pin the parser + cookie shape that the layout-side server read
// (src/app/layout.tsx) depends on. The whole banner-popup fix rests on the
// server seeing the same shape the client wrote and producing a parsed
// ConsentState; assert that explicitly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_COOKIE, CONSENT_VERSION, parseConsentCookie } from "./consent.ts";

test("name + version constants are wire-stable", () => {
  // Changing these requires a coordinated client + server bump; pin them so a
  // rename that breaks SSR-vs-client matching surfaces in CI.
  assert.equal(CONSENT_COOKIE, "gw_consent");
  assert.equal(CONSENT_VERSION, 1);
});

test("parser accepts a freshly-written client value", () => {
  const value = encodeURIComponent(
    JSON.stringify({
      version: 1,
      analytics: true,
      marketing: true,
      decidedAt: "2026-06-27T00:00:00.000Z",
    }),
  );
  const parsed = parseConsentCookie(value);
  assert.ok(parsed);
  assert.equal(parsed.analytics, true);
  assert.equal(parsed.marketing, true);
  assert.equal(parsed.version, 1);
});

test("parser returns null for missing / unparseable / wrong-version values", () => {
  assert.equal(parseConsentCookie(undefined), null);
  assert.equal(parseConsentCookie(null), null);
  assert.equal(parseConsentCookie(""), null);
  assert.equal(parseConsentCookie("not-json"), null);
  const wrongVersion = encodeURIComponent(
    JSON.stringify({ version: 0, analytics: true, marketing: true, decidedAt: "2026-06-27T00:00:00.000Z" }),
  );
  assert.equal(parseConsentCookie(wrongVersion), null);
});

test("parser coerces falsy categories to false (never undefined)", () => {
  const partial = encodeURIComponent(JSON.stringify({ version: 1, decidedAt: "x" }));
  const parsed = parseConsentCookie(partial);
  assert.ok(parsed);
  assert.equal(parsed.analytics, false);
  assert.equal(parsed.marketing, false);
});
