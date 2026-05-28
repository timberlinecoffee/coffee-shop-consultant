// Regression test for TIM-1217: "Create a role" modal opens then instantly closes.
//
// Root cause: every "add" button in the Hiring suite (roles, candidates,
// questions, competencies, staff) inserts a BLANK row optimistically and lets
// the user fill the label field inline. The POST handlers validated the label
// with `if (!body.field || typeof body.field !== "string")`. Because "" is
// falsy, a blank create returned 400 "Missing required field", and the client
// reverted the optimistic row in its `else` branch — so the new row appeared
// for a split second and vanished. This is the contract the routes now share
// via `isProvidedString`: a present-but-empty string is a VALID create.
//
// The earlier TIM-1015/TIM-1041 tests only simulated the client and assumed the
// API succeeded, so they never caught the server rejecting "". This test pins
// the server-side guard directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isProvidedString } from "./hiring.ts";

test("isProvidedString accepts an empty string (the blank optimistic row)", () => {
  assert.equal(isProvidedString(""), true);
});

test("isProvidedString accepts a normal label value", () => {
  assert.equal(isProvidedString("Head Barista"), true);
  assert.equal(isProvidedString("   "), true);
});

test("isProvidedString rejects a missing or non-string value", () => {
  assert.equal(isProvidedString(undefined), false);
  assert.equal(isProvidedString(null), false);
  assert.equal(isProvidedString(123), false);
  assert.equal(isProvidedString({}), false);
});

// The exact bug: the OLD guard `!value || typeof value !== "string"` rejected ""
// while the new guard `!isProvidedString(value)` accepts it. This asserts the
// behavioral difference so a regression to the falsy check fails loudly.
test("blank create is rejected by the old guard but accepted by the new one", () => {
  const oldGuardRejects = (value) => !value || typeof value !== "string";
  const newGuardRejects = (value) => !isProvidedString(value);

  assert.equal(oldGuardRejects(""), true, "old guard wrongly rejected blank rows (the bug)");
  assert.equal(newGuardRejects(""), false, "new guard must accept blank rows");

  // Both guards still reject genuinely missing/invalid input.
  for (const bad of [undefined, null, 0, 42, {}]) {
    assert.equal(newGuardRejects(bad), true, `new guard must reject ${String(bad)}`);
  }
});
