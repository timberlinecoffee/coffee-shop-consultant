// TIM-2884: Pin that every opening-month-plan route uses getActivePlanId
// (TIM-2377 canonical resolver) and does NOT reintroduce the
// .eq("user_id",...).single() bomb on coffee_shop_plans.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const ROUTES = [
  "marketing-kickoff/route.ts",
  "marketing-kickoff/[id]/route.ts",
  "timeline/route.ts",
  "timeline/[id]/route.ts",
  "soft-open-plan/route.ts",
  "soft-open-plan/[id]/route.ts",
  "hiring-plan/route.ts",
  "hiring-plan/[id]/route.ts",
];

for (const rel of ROUTES) {
  const src = readFileSync(resolve(here, rel), "utf8");

  test(`${rel}: imports getActivePlanId`, () => {
    assert.ok(
      /getActivePlanId/.test(src),
      `${rel}: must import and use getActivePlanId from @/lib/plan-context`,
    );
  });

  test(`${rel}: no bare .single() on coffee_shop_plans`, () => {
    // Allow .single() on other tables (e.g. insert result), but disallow
    // the .from("coffee_shop_plans")...eq("user_id",...).single() pattern.
    const hasBomb = /from\s*\(\s*["']coffee_shop_plans["']\s*\)[\s\S]{0,400}\.eq\s*\(\s*["']user_id["'][\s\S]{0,200}\.single\s*\(\s*\)/.test(src);
    assert.ok(
      !hasBomb,
      `${rel}: must not resolve plan via .eq("user_id",...).single() on coffee_shop_plans`,
    );
  });
}
