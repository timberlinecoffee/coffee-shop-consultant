// TIM-2466: Drift-guard. The /generate and /regenerate-all routes both
// must extract `shop_type` from onboarding_data and pass it to
// buildBpSectionPrompt as `founderShopType` using the same array-or-string
// normalization the rest of the codebase uses (concept/review, copilot).
//
// If a future refactor drops the field or skips the array normalization,
// CQ-06 byte-identical content returns silently. This test reads the route
// source directly to catch that.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const GENERATE_ROUTE = resolve(
  here,
  "../app/api/business-plan/generate/route.ts",
);
const REGEN_ALL_ROUTE = resolve(
  here,
  "../app/api/business-plan/regenerate-all/route.ts",
);

test("/generate route extracts shop_type and passes founderShopType", () => {
  const src = readFileSync(GENERATE_ROUTE, "utf8");
  // The route must call buildBpSectionPrompt with founderShopType: ...
  assert.match(src, /founderShopType:/);
  // It must read onboarding.shop_type via the canonical array-or-string
  // normalization (matches concept/review and copilot patterns).
  assert.match(src, /Array\.isArray\(onboarding\?\.shop_type\)/);
  assert.match(src, /onboarding\.shop_type as string\[\]\)\.join\(", "\)/);
});

test("/regenerate-all route extracts shop_type and passes founderShopType", () => {
  const src = readFileSync(REGEN_ALL_ROUTE, "utf8");
  assert.match(src, /founderShopType/);
  assert.match(src, /Array\.isArray\(onboarding\?\.shop_type\)/);
  assert.match(src, /onboarding\.shop_type as string\[\]\)\.join\(", "\)/);
});

test("BpPromptInputs type declares founderShopType as a required field", () => {
  const src = readFileSync(resolve(here, "./business-plan-prompts.ts"), "utf8");
  // Required field — no `?` between identifier and colon.
  assert.match(src, /\bfounderShopType: string;/);
});
