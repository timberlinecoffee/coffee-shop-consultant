// TIM-3876: pin that isBpPlaceholderContent() treats HEREHEREHERE tokens as
// placeholder content so legacy stale rows don't surface in the modal textarea.
//
// Source-string approach (no JSX runtime needed): reads the .tsx file as text,
// verifies the (HERE){3,} pattern is present, then runs the regex directly
// against the documented garbage tokens to confirm detection logic is correct.
//
// Note on regex: EM spec said HERE{4,} but that matches "HEREEEEE", not the
// actual token "HEREHEREHERE". Correct form is (HERE){3,} — 3+ repetitions of
// the word "HERE". Test pinned at TIM-3876 to prevent accidental reversion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "./BPWriteWithAIModal.tsx"), "utf8");

test("isBpPlaceholderContent: source contains (HERE){3,} pattern (TIM-3876)", () => {
  const fnStart = src.indexOf("export function isBpPlaceholderContent(");
  assert.notEqual(fnStart, -1, "isBpPlaceholderContent must be exported from this file");
  const fnBody = src.slice(fnStart, src.indexOf("\n}", fnStart) + 2);
  assert.match(
    fnBody,
    /\(HERE\)\{3,\}/,
    "isBpPlaceholderContent must include /(HERE){3,}/ regex to catch HEREHEREHERE tokens",
  );
});

test("(HERE){3,}/i regex matches HEREHEREHERE and variants", () => {
  const pattern = /(HERE){3,}/i;
  assert.ok(pattern.test("HEREHEREHERE"), "must match HEREHEREHERE (3x HERE)");
  assert.ok(pattern.test("HEREHEREHEREHERE"), "must match HEREHEREHEREHERE (4x HERE)");
  assert.ok(pattern.test("hereherehere"), "must match lowercase");
  assert.ok(pattern.test("some prefix HEREHEREHERE suffix"), "must match mid-string");
  assert.ok(!pattern.test("HERE"), "must NOT match bare HERE");
  assert.ok(!pattern.test("HEREHERE"), "must NOT match HEREHERE (only 2 repetitions)");
});
