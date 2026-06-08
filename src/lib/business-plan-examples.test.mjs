// TIM-2527: pin appendix placeholder is currency-neutral.
// AC: SUMMIT_STREET_EXAMPLES["appendix-monthly-statements"] contains no literal "USD".

import { test } from "node:test";
import assert from "node:assert/strict";

import { SUMMIT_STREET_EXAMPLES } from "./business-plan-examples.ts";

test("TIM-2527: appendix-monthly-statements example is currency-neutral", () => {
  const appendix = SUMMIT_STREET_EXAMPLES["appendix-monthly-statements"];
  assert.ok(appendix, "appendix-monthly-statements example exists");
  assert.ok(
    !/\bUSD\b/.test(appendix),
    `appendix example must not contain literal "USD"; got: ${appendix}`,
  );
  assert.match(
    appendix,
    /reporting currency/i,
    "appendix example should reference the plan's reporting currency",
  );
});

test("TIM-2527: no other SUMMIT_STREET_EXAMPLES placeholder leaks bare 'USD'", () => {
  for (const [key, value] of Object.entries(SUMMIT_STREET_EXAMPLES)) {
    assert.ok(
      !/\bUSD\b/.test(value),
      `SUMMIT_STREET_EXAMPLES["${key}"] must not contain literal "USD"`,
    );
  }
});
