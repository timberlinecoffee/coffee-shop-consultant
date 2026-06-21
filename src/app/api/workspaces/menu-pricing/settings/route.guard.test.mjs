// TIM-2884: Pin that menu-pricing/settings uses getActivePlanId (TIM-2377)
// and does not reintroduce the multi-plan bomb.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "route.ts"), "utf8");

test("menu-pricing/settings: imports getActivePlanId", () => {
  assert.ok(
    /getActivePlanId/.test(src),
    "route.ts must import and use getActivePlanId from @/lib/plan-context",
  );
});

test("menu-pricing/settings: no SELECT-based .eq(user_id).single() on coffee_shop_plans", () => {
  // Tempered greedy token: match from("coffee_shop_plans") only when there is no
  // .update( or .delete( call before the .eq("user_id",...).single() chain.
  // UPDATE ownership checks (.update()...eq("user_id",...).single()) are correct
  // security practice and must not be flagged.
  const hasBomb = /from\s*\(\s*["']coffee_shop_plans["']\s*\)((?!\.update\s*\(|\.delete\s*\()[\s\S]){0,600}\.eq\s*\(\s*["']user_id["'][\s\S]{0,200}\.single\s*\(\s*\)/.test(src);
  assert.ok(
    !hasBomb,
    "route.ts must not resolve plan via SELECT .eq(\"user_id\",...).single() on coffee_shop_plans",
  );
});
