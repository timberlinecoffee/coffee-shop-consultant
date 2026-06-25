// TIM-3070: Pin the multi-plan resolver on /api/workspace-status. The original
// loadPlanId used `coffee_shop_plans` ordered by `created_at desc`, while the
// read paths (WorkspaceStatusBootstrap, dashboard/plan-overview, and the
// /account layout) all resolve via the canonical getActivePlanId, which
// honors `users.current_plan_id` first. For multi-plan users that divergence
// meant POSTs landed on a different plan than the one being read, so marking
// Concept Complete from the top-right tracker silently reverted on reload and
// the dashboard tracker never reflected it. This test pins the route against
// regressing back to the legacy resolver.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTE_PATH = join(__dirname, "route.ts");
const src = readFileSync(ROUTE_PATH, "utf8");

test("workspace-status route: imports the canonical getActivePlanId resolver", () => {
  assert.match(
    src,
    /import\s*\{[^}]*\bgetActivePlanId\b[^}]*\}\s*from\s*"@\/lib\/plan-context"/,
    "route must import getActivePlanId from @/lib/plan-context",
  );
});

test("workspace-status route: calls getActivePlanId(supabase, user.id)", () => {
  assert.match(
    src,
    /getActivePlanId\s*\(\s*supabase\s*,\s*user\.id\s*\)/,
    "route must resolve plan id via getActivePlanId(supabase, user.id)",
  );
});

test("workspace-status route: does not reintroduce the legacy latest-by-created_at coffee_shop_plans resolver", () => {
  // The route still legitimately filters workspace_status by plan_id, but it
  // must not look up the plan itself via `coffee_shop_plans.order(created_at)`
  // — that's the divergence with getActivePlanId that caused TIM-3070.
  const FROM_PLANS = /\.from\s*\(\s*['"]coffee_shop_plans['"]\s*\)/g;
  let match;
  while ((match = FROM_PLANS.exec(src)) !== null) {
    const chunk = src.slice(match.index, match.index + 400);
    const ordersByCreatedAtDesc =
      /\.order\s*\(\s*['"]created_at['"]\s*,\s*\{\s*ascending\s*:\s*false\s*\}\s*\)/.test(chunk);
    assert.ok(
      !ordersByCreatedAtDesc,
      "route must not look up the active plan via coffee_shop_plans.order(created_at,{ascending:false}) — use getActivePlanId(users.current_plan_id) instead (TIM-3070)",
    );
  }
});
