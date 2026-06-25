// TIM-2868 guard: every location-lease route must resolve the active plan
// via getActivePlanId() — never a naked `.eq("user_id", user.id).single()`
// on coffee_shop_plans. The bug class is identical to TIM-2860: the .single()
// chain throws "JSON object requested, multiple (or no) rows returned" the
// moment a user owns more than one plan, and the route's `if (!plan)` arm
// silently 404s. For Location & Lease specifically that 404 surfaced as the
// "Add new location" button doing nothing on click — the POST quietly failed
// and the client's `if (!res.ok) return` swallowed the error.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROUTES = [
  "route.ts",
  "[id]/route.ts",
  "bulk/route.ts",
  "[id]/lease-terms/route.ts",
  "[id]/scorecard-feedback/route.ts",
  "[id]/scores/route.ts",
  "[id]/area-analysis/route.ts",
  "../tradeoff/route.ts",
];

const BUGGY =
  /from\(\s*["']coffee_shop_plans["']\s*\)[\s\S]{0,200}?\.eq\(\s*["']user_id["']\s*,[\s\S]{0,80}?\)\s*\.single\(\s*\)/;

for (const rel of ROUTES) {
  const path = join(__dirname, rel);
  const src = readFileSync(path, "utf8");

  test(`${rel} imports getActivePlanId`, () => {
    assert.ok(
      /from\s+["']@\/lib\/plan-context["']/.test(src),
      `${rel} must import from @/lib/plan-context`,
    );
    assert.ok(/getActivePlanId/.test(src), `${rel} must reference getActivePlanId`);
  });

  test(`${rel} never resolves plan via .eq("user_id", ...).single() on coffee_shop_plans`, () => {
    assert.ok(
      !BUGGY.test(src),
      `${rel} still chains .eq('user_id', ...).single() on coffee_shop_plans — re-run the TIM-2868 sweep`,
    );
  });
}
