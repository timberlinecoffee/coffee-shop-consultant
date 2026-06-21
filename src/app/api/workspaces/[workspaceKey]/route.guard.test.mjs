// TIM-2860 guard: the workspace_documents read/write/delete route must use the
// canonical getActivePlanId() resolver instead of a naked `.single()` on
// coffee_shop_plans. The naked .single() silently 404'd every save for users
// with more than one plan once TIM-1953 shipped multi-project for Pro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeSrc = readFileSync(join(__dirname, "route.ts"), "utf8");

test("[workspaceKey] route imports getActivePlanId", () => {
  assert.ok(
    /from\s+["']@\/lib\/plan-context["']/.test(routeSrc),
    "route must import from @/lib/plan-context",
  );
  assert.ok(
    /getActivePlanId/.test(routeSrc),
    "route must reference getActivePlanId",
  );
});

test("[workspaceKey] route never resolves the plan via .single() on coffee_shop_plans", () => {
  // The TIM-2860 regression: a coffee_shop_plans lookup using .single() blows
  // up to 404 the moment a user owns more than one plan. The canonical fix is
  // getActivePlanId(), which handles current_plan_id + multi-row fallback.
  // This regex matches the .from("coffee_shop_plans")...single() chain on
  // user_id (the actual bug), allowing eq("id", planId).maybeSingle() paths
  // elsewhere.
  const buggy =
    /from\(\s*["']coffee_shop_plans["']\s*\)[\s\S]{0,200}?\.eq\(\s*["']user_id["']\s*,[\s\S]{0,80}?\)\s*\.single\(\s*\)/;
  assert.ok(
    !buggy.test(routeSrc),
    "route must not chain .eq('user_id', ...).single() on coffee_shop_plans",
  );
});
