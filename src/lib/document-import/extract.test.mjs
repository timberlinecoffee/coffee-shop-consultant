// TIM-2434: pin tests for pickTier (pure function).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTier } from "./extract.ts";

test("Short doc routes to Haiku (cheap default)", () => {
  assert.equal(
    pickTier({ fileType: "pdf", text: "short", unitCount: 1 }),
    "haiku",
  );
});

test("Long-page doc routes to Sonnet for deep reasoning", () => {
  assert.equal(
    pickTier({ fileType: "pdf", text: "x", unitCount: 10 }),
    "sonnet",
  );
});

test("Long-text doc routes to Sonnet even with low page count", () => {
  assert.equal(
    pickTier({ fileType: "docx", text: "x".repeat(10_000), unitCount: 1 }),
    "sonnet",
  );
});

test("6-page boundary triggers Sonnet (deep-reasoning threshold)", () => {
  assert.equal(
    pickTier({ fileType: "pdf", text: "x", unitCount: 6 }),
    "sonnet",
  );
  assert.equal(
    pickTier({ fileType: "pdf", text: "x", unitCount: 5 }),
    "haiku",
  );
});
