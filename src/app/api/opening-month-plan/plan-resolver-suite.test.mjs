// TIM-2980: Pin the multi-plan resolver across the full opening-month-plan API
// suite and the SSR loader. Every route in this directory previously resolved
// the plan via a bare `.single()` or latest-by-created_at lookup, which
// returns a different plan than `users.current_plan_id` once the project
// switcher is used to pin a non-latest plan. This test ensures no route regresses
// to the broken resolver pattern.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOADER_PATH = resolve(__dirname, "../../(app)/workspace/launch-plan/_loader.ts");

// All routes that must use getActivePlanId
const ROUTES = [
  // Collection routes
  join(__dirname, "milestones", "route.ts"),
  join(__dirname, "milestones", "apply", "route.ts"),
  join(__dirname, "config", "route.ts"),
  join(__dirname, "seed", "route.ts"),
  join(__dirname, "timeline", "route.ts"),
  join(__dirname, "hiring-plan", "route.ts"),
  join(__dirname, "marketing-kickoff", "route.ts"),
  join(__dirname, "soft-open-plan", "route.ts"),
  // Item-level [id] routes
  join(__dirname, "milestones", "[id]", "route.ts"),
  join(__dirname, "timeline", "[id]", "route.ts"),
  join(__dirname, "hiring-plan", "[id]", "route.ts"),
  join(__dirname, "marketing-kickoff", "[id]", "route.ts"),
  join(__dirname, "soft-open-plan", "[id]", "route.ts"),
  // SSR loader
  LOADER_PATH,
];

for (const routePath of ROUTES) {
  const label = routePath.includes("opening-month-plan")
    ? routePath.slice(routePath.indexOf("opening-month-plan"))
    : routePath.slice(routePath.indexOf("workspace"));
  const src = readFileSync(routePath, "utf8");

  test(`${label}: imports getActivePlanId from @/lib/plan-context`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*\bgetActivePlanId\b[^}]*\}\s*from\s*"@\/lib\/plan-context"/,
      "route must import getActivePlanId from @/lib/plan-context",
    );
  });

  test(`${label}: calls getActivePlanId(supabase, user.id)`, () => {
    assert.match(
      src,
      /getActivePlanId\s*\(\s*supabase\s*,\s*user\.id\s*\)/,
      "route must resolve plan id via getActivePlanId(supabase, user.id)",
    );
  });

  test(`${label}: does NOT use a bare .single() on coffee_shop_plans`, () => {
    const FROM_PLANS = /\.from\s*\(\s*['"]coffee_shop_plans['"]\s*\)/g;
    let match;
    while ((match = FROM_PLANS.exec(src)) !== null) {
      const chunk = src.slice(match.index, match.index + 400);
      const hasBareSingle = /\.single\s*\(\s*\)/.test(chunk);
      const hasLimit = /\.limit\s*\(\s*1\s*\)/.test(chunk);
      const hasMaybeSingle = /\.maybeSingle\s*\(\s*\)/.test(chunk);
      assert.ok(
        !hasBareSingle || hasLimit || hasMaybeSingle,
        `${label}: must not call .single() on coffee_shop_plans without .limit(1)/.maybeSingle() — 500s for multi-plan users (TIM-2980)`,
      );
    }
  });

  test(`${label}: does NOT use a latest-by-created_at inline plan lookup`, () => {
    // Reject the old .order("created_at"...).limit(1) pattern directly on coffee_shop_plans
    const FROM_PLANS = /\.from\s*\(\s*['"]coffee_shop_plans['"]\s*\)/g;
    let match;
    while ((match = FROM_PLANS.exec(src)) !== null) {
      const chunk = src.slice(match.index, match.index + 500);
      const hasOrderCreatedAt = /\.order\s*\(\s*['"]created_at['"]/.test(chunk);
      assert.ok(
        !hasOrderCreatedAt,
        `${label}: must not inline a latest-by-created_at plan lookup — use getActivePlanId instead (TIM-2980)`,
      );
    }
  });
}
