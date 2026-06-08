// TIM-2423: pin the CALLOUT_REGISTRY + key-shape rules so callouts can't
// quietly ship with an ad-hoc key.

import { test } from "node:test";
import assert from "node:assert/strict";

const {
  CALLOUT_REGISTRY,
  DEPRECATED_CALLOUT_KEYS,
  DISMISSED_CALLOUTS_PREF_KEY,
  isKnownCalloutKey,
  isDismissedCalloutsMap,
} = await import("./callouts.ts");

test("DISMISSED_CALLOUTS_PREF_KEY is the single platform-wide pref slot", () => {
  assert.strictEqual(DISMISSED_CALLOUTS_PREF_KEY, "platform.dismissed-callouts");
});

test("every CALLOUT_REGISTRY key follows <workspace>.<feature-or-intent>", () => {
  // Lowercase, hyphen-separated segments, dot between workspace and intent,
  // never starts/ends with a separator. Permits `platform` for cross-workspace.
  const KEY_RE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;
  for (const key of Object.keys(CALLOUT_REGISTRY)) {
    assert.match(key, KEY_RE, `bad key shape: ${key}`);
    assert.doesNotMatch(key, /--/, `double-hyphen: ${key}`);
    assert.doesNotMatch(key, /\.\./, `double-dot: ${key}`);
  }
});

test("every CALLOUT_REGISTRY entry has a non-empty label + workspace", () => {
  for (const [key, entry] of Object.entries(CALLOUT_REGISTRY)) {
    assert.ok(entry.label && entry.label.length > 0, `empty label: ${key}`);
    assert.ok(entry.workspace && entry.workspace.length > 0, `empty workspace: ${key}`);
  }
});

test("DEPRECATED_CALLOUT_KEYS never overlaps with the active registry", () => {
  for (const oldKey of Object.keys(DEPRECATED_CALLOUT_KEYS)) {
    assert.ok(
      !(oldKey in CALLOUT_REGISTRY),
      `${oldKey} is in both DEPRECATED_CALLOUT_KEYS and CALLOUT_REGISTRY`,
    );
  }
});

test("primary Financials guided-setup target IS registered (board-cited)", () => {
  assert.ok(
    "financials.guided-setup-intro" in CALLOUT_REGISTRY,
    "the board-cited TIM-1244 callout must keep this exact key",
  );
});

test("isKnownCalloutKey is a registry membership check", () => {
  assert.strictEqual(isKnownCalloutKey("financials.guided-setup-intro"), true);
  assert.strictEqual(isKnownCalloutKey("nope.not-registered"), false);
  assert.strictEqual(isKnownCalloutKey(""), false);
});

test("isDismissedCalloutsMap accepts Record<string, ISO string>", () => {
  assert.strictEqual(isDismissedCalloutsMap({}), true);
  assert.strictEqual(
    isDismissedCalloutsMap({ "financials.guided-setup-intro": "2026-06-07T00:00:00.000Z" }),
    true,
  );
});

test("isDismissedCalloutsMap rejects non-objects, arrays, and non-string values", () => {
  assert.strictEqual(isDismissedCalloutsMap(null), false);
  assert.strictEqual(isDismissedCalloutsMap(undefined), false);
  assert.strictEqual(isDismissedCalloutsMap("a string"), false);
  assert.strictEqual(isDismissedCalloutsMap(42), false);
  assert.strictEqual(isDismissedCalloutsMap([]), false);
  assert.strictEqual(isDismissedCalloutsMap({ k: 123 }), false);
  assert.strictEqual(isDismissedCalloutsMap({ k: null }), false);
  assert.strictEqual(isDismissedCalloutsMap({ k: { nested: true } }), false);
});
