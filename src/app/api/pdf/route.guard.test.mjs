// TIM-2884: Pin that pdf/[templateId]/route.ts uses getActivePlanId
// (TIM-2377 canonical resolver) and does not reintroduce the multi-plan bomb.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "[templateId]/route.ts"), "utf8");

test("pdf/[templateId]/route.ts: imports getActivePlanId", () => {
  assert.ok(
    /getActivePlanId/.test(src),
    "route.ts must import and use getActivePlanId from @/lib/plan-context",
  );
});

test("pdf/[templateId]/route.ts: no bare .eq(user_id).single() on coffee_shop_plans", () => {
  const hasBomb = /from\s*\(\s*["']coffee_shop_plans["']\s*\)[\s\S]{0,400}\.eq\s*\(\s*["']user_id["'][\s\S]{0,200}\.single\s*\(\s*\)/.test(src);
  assert.ok(
    !hasBomb,
    "route.ts must not resolve plan via .eq(\"user_id\",...).single() on coffee_shop_plans",
  );
});
