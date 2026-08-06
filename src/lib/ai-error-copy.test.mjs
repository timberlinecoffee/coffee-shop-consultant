// TIM-3445: the test that compares the two sides.
//
// Five defects this session had the same shape: a contract with two sides and
// no test comparing them. The route emits error codes; the callout maps them.
// Nothing checked that the map covered the emissions — so `out_of_credits`
// fell through to a generic "Something went wrong" with an unusable button,
// in production, for months.
//
// Test 1 reads the route source and fails if it emits a code this module does
// not know. The rest pin the two properties the audit found violated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { aiErrorCopy, AI_ERROR_CODES } from "./ai-error-copy.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTE = join(HERE, "..", "app", "api", "copilot", "improve", "route.ts");

/** Codes the route sends to the client, as opposed to codes it merely logs. */
function codesEmittedByRoute() {
  const src = readFileSync(ROUTE, "utf8");
  const codes = new Set();

  // Frames built inline: sse("error", { code: "…" })
  for (const m of src.matchAll(/sse\(\s*"error"\s*,\s*\{[^}]*?code:\s*"([a-z_]+)"/gs)) {
    codes.add(m[1]);
  }
  // Frames built via the closeWithError(code, message) helper.
  for (const m of src.matchAll(/closeWithError\(\s*\n?\s*"([a-z_]+)"/g)) {
    codes.add(m[1]);
  }
  return codes;
}

test("every error code the route emits has copy in this module", () => {
  const emitted = codesEmittedByRoute();

  // Guard the extractor itself: if the regexes stop matching, the test would
  // pass vacuously, which is exactly the failure mode it exists to prevent.
  assert.ok(
    emitted.size >= 6,
    `extracted only ${emitted.size} codes from route.ts — the scan is broken, not the route`,
  );
  assert.ok(emitted.has("out_of_credits"), "scan missed the code that caused this bug");

  const known = new Set(AI_ERROR_CODES);
  const unknown = [...emitted].filter((c) => !known.has(c));
  assert.deepEqual(
    unknown,
    [],
    `route emits code(s) with no copy — they will render the generic fallback: ${unknown.join(", ")}`,
  );
});

test("no state offers a retry that cannot possibly succeed", () => {
  // The original defect in one assertion. Spending an allowance and hitting a
  // paywall are not cleared by pressing a button again.
  for (const code of ["out_of_credits", "paywall", "unauthorized"]) {
    const copy = aiErrorCopy({ code });
    assert.equal(copy.retryable, false, `${code} must not be retryable`);
    assert.notEqual(copy.primaryAction, "retry", `${code} must not offer retry as its action`);
    assert.ok(
      !/try again/i.test(copy.primaryLabel),
      `${code} primary button reads "${copy.primaryLabel}"`,
    );
  }
});

test("expected states are not dressed as system failures", () => {
  for (const code of ["out_of_credits", "paywall", "rate_limited", "unauthorized"]) {
    const copy = aiErrorCopy({ code });
    assert.equal(copy.isFailure, false, `${code} is an expected state, not a failure`);
    assert.ok(
      !/went wrong|error|failed/i.test(copy.heading),
      `${code} heading blames the software: "${copy.heading}"`,
    );
  }
});

test("out of credits offers both ways to actually keep writing", () => {
  const copy = aiErrorCopy({ code: "out_of_credits" });
  assert.equal(copy.primaryAction, "buy_credits");
  assert.equal(copy.primaryLabel, "Top up credits");
  assert.equal(copy.secondaryHref, "/pricing");
});

test("the paywall says the true sentence for each reason", () => {
  const noSub = aiErrorCopy({ code: "paywall", reason: "no_subscription" });
  const paused = aiErrorCopy({ code: "paywall", reason: "paused" });
  const expired = aiErrorCopy({ code: "paywall", reason: "expired" });

  // TIM-3442's finding: never tell someone who never subscribed that their
  // subscription is paused, and never tell them to "reactivate".
  assert.ok(!/paused|reactivat/i.test(noSub.heading + noSub.body));
  assert.ok(/paused/i.test(paused.heading));
  assert.ok(/ended/i.test(expired.heading));

  // Three distinct destinations-or-labels; a paywall that says one thing for
  // three different states is the bug we already fixed once.
  const shapes = new Set([noSub, paused, expired].map((c) => `${c.heading}|${c.primaryHref}`));
  assert.equal(shapes.size, 3);
});

test("every known code produces a heading, a body and a usable action", () => {
  for (const code of AI_ERROR_CODES) {
    const copy = aiErrorCopy({ code });
    assert.ok(copy.heading.length > 0, `${code} has no heading`);
    assert.ok(copy.body.length > 0, `${code} has no body`);
    assert.ok(copy.primaryLabel.length > 0, `${code} has no primary label`);
    assert.ok(
      copy.primaryHref !== null || copy.primaryAction !== null,
      `${code} offers a button that goes nowhere and does nothing`,
    );
  }
});

test("an unknown code falls back without inventing a reason", () => {
  const copy = aiErrorCopy({ code: "something_new_from_the_future" });
  assert.equal(copy.heading, "Something went wrong");
  assert.equal(copy.primaryAction, "retry");
  // No fabricated cause, no purchase suggestion for a state we cannot explain.
  assert.equal(copy.secondaryHref, null);
});
