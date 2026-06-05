// TIM-2352: pin resolveAccountChip — drives the apex header swap from
// "Coming Soon" to a one-click /dashboard handoff for logged-in visitors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAccountChip } from "./account-chip.ts";

test("returns none when neither full_name nor email present", () => {
  assert.deepEqual(resolveAccountChip(null, null), { kind: "none" });
  assert.deepEqual(resolveAccountChip("", ""), { kind: "none" });
  assert.deepEqual(resolveAccountChip("   ", "   "), { kind: "none" });
  assert.deepEqual(resolveAccountChip(undefined, undefined), { kind: "none" });
});

test("uses first word of full_name for initial + name", () => {
  assert.deepEqual(resolveAccountChip("Trent Rollings", "trent@x.co"), {
    kind: "account",
    initial: "T",
    firstName: "Trent",
  });
});

test("Title-cases an all-lowercase first name", () => {
  assert.deepEqual(resolveAccountChip("trent rollings", null), {
    kind: "account",
    initial: "T",
    firstName: "Trent",
  });
});

test("Title-cases an all-uppercase first name", () => {
  assert.deepEqual(resolveAccountChip("TRENT ROLLINGS", null), {
    kind: "account",
    initial: "T",
    firstName: "Trent",
  });
});

test("falls back to email local-part when full_name is empty", () => {
  assert.deepEqual(resolveAccountChip(null, "trent@simpler.coffee"), {
    kind: "account",
    initial: "T",
    firstName: "Trent",
  });
});

test("normalises dot/underscore/hyphen in email local-part to first segment", () => {
  assert.deepEqual(resolveAccountChip(null, "trent.rollings@x.co"), {
    kind: "account",
    initial: "T",
    firstName: "Trent",
  });
  assert.deepEqual(resolveAccountChip(null, "trent_rollings@x.co"), {
    kind: "account",
    initial: "T",
    firstName: "Trent",
  });
  assert.deepEqual(resolveAccountChip(null, "trent-rollings@x.co"), {
    kind: "account",
    initial: "T",
    firstName: "Trent",
  });
});

test("full_name beats email even when both are present", () => {
  assert.deepEqual(resolveAccountChip("Jordan", "trent@simpler.coffee"), {
    kind: "account",
    initial: "J",
    firstName: "Jordan",
  });
});

test("multibyte first character produces a single-grapheme initial", () => {
  const out = resolveAccountChip("Émilie Dupont", null);
  assert.equal(out.kind, "account");
  if (out.kind === "account") {
    assert.equal(out.firstName, "Émilie");
    // charAt + toUpperCase preserves accented capital; the chip renders it as-is.
    assert.equal(out.initial, "É");
  }
});
