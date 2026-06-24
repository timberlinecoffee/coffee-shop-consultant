// TIM-2980: Pin the multi-plan resolver across the whole opening-month-plan
// suite. TIM-2965 fixed `soft-open-plan` after multi-plan users hit a 500 on
// playbook load — the inline `coffee_shop_plans.eq(user_id).single()` resolver
// rejects multi-row results. The sibling routes here were either the same 500
// bomb (`timeline`, `hiring-plan`, `marketing-kickoff` used bare `.single()`)
// or the silent-split case (`milestones`, `config`, `seed` used latest-by-
// created with `.maybeSingle()` while `milestones/apply` already honored the
// canonical resolver — workspace would split between the active plan and the
// latest plan for users whose `users.current_plan_id` is non-latest).
//
// Every route in this suite that resolves the active plan must do so via the
// canonical `getActivePlanId` from `@/lib/plan-context` (TIM-2377). Routes
// that take `planId` from the request body (e.g. `generate`) are exempt —
// they don't resolve the plan themselves and rely on the caller having gone
// through the SSR loader (which we also pin here).
//
// Comment-strip note: explanatory comments in source files may quote the
// patterns this test forbids (e.g. "used to call .single()"). Strip
// /* */ and // comments before matching so docstrings don't false-positive.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Routes that resolve the active plan id from the authenticated user.
// (Excludes `generate/route.ts` and `milestones/apply/route.ts` — both take
// `planId` from the request body. `milestones/apply` happens to also call
// getActivePlanId as its fallback, which is fine but not required.)
const PLAN_RESOLVING_ROUTES = [
  // soft-open-plan was the original fix in TIM-2965; re-pin here so the
  // suite-wide invariant is enforced in one place going forward.
  "soft-open-plan/route.ts",
  "soft-open-plan/[id]/route.ts",
  "milestones/route.ts",
  "milestones/[id]/route.ts",
  "config/route.ts",
  "seed/route.ts",
  "timeline/route.ts",
  "timeline/[id]/route.ts",
  "hiring-plan/route.ts",
  "hiring-plan/[id]/route.ts",
  "marketing-kickoff/route.ts",
  "marketing-kickoff/[id]/route.ts",
];

// The SSR loader that primes the workspace. Must agree with the API routes.
const SSR_LOADER = join(
  __dirname,
  "..",
  "..",
  "(app)",
  "workspace",
  "launch-plan",
  "_loader.ts",
);

function stripComments(src) {
  // Strip /* ... */ block comments first, then // line comments.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

for (const relPath of PLAN_RESOLVING_ROUTES) {
  const routePath = join(__dirname, relPath);
  const label = relPath;
  const rawSrc = readFileSync(routePath, "utf8");
  const src = stripComments(rawSrc);

  test(`${label}: imports the canonical getActivePlanId resolver`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*\bgetActivePlanId\b[^}]*\}\s*from\s*["']@\/lib\/plan-context["']/,
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

  test(`${label}: does NOT inline-resolve coffee_shop_plans by user_id`, () => {
    // Forbid the pre-TIM-2980 inline shape: `.from("coffee_shop_plans")`
    // followed (within ~300 chars) by `.eq("user_id", ...)`. Quote-agnostic
    // so callers can't evade with single/double quote swap (TIM-2965 lesson).
    const FROM_PLANS = /\.from\s*\(\s*['"]coffee_shop_plans['"]\s*\)/g;
    let match;
    while ((match = FROM_PLANS.exec(src)) !== null) {
      const chunk = src.slice(match.index, match.index + 300);
      const eqUserId = /\.eq\s*\(\s*['"]user_id['"]\s*,/.test(chunk);
      assert.ok(
        !eqUserId,
        `${label}: route must not inline-resolve coffee_shop_plans.eq(user_id) — use getActivePlanId from @/lib/plan-context (TIM-2980)`,
      );
    }
  });

  test(`${label}: does NOT call bare .single() on coffee_shop_plans`, () => {
    // The original TIM-2965 500 bomb: `.from("coffee_shop_plans").eq(user_id).single()`.
    // Allow `.single()` to coexist with `.limit(1).maybeSingle()` patterns elsewhere
    // in the file — the assertion only fails when a coffee_shop_plans chain
    // contains bare `.single()` without `.limit(1)`/`.maybeSingle()` nearby.
    const FROM_PLANS = /\.from\s*\(\s*['"]coffee_shop_plans['"]\s*\)/g;
    let match;
    while ((match = FROM_PLANS.exec(src)) !== null) {
      const chunk = src.slice(match.index, match.index + 400);
      const hasBareSingle = /\.single\s*\(\s*\)/.test(chunk);
      const hasLimit = /\.limit\s*\(\s*1\s*\)/.test(chunk);
      const hasMaybeSingle = /\.maybeSingle\s*\(\s*\)/.test(chunk);
      assert.ok(
        !hasBareSingle || hasLimit || hasMaybeSingle,
        `${label}: bare .single() on coffee_shop_plans 500s for multi-plan users (TIM-2965)`,
      );
    }
  });
}

// SSR loader pinning — must use the same resolver as the API routes.
{
  const rawSrc = readFileSync(SSR_LOADER, "utf8");
  const src = stripComments(rawSrc);
  const label = "launch-plan/_loader.ts";

  test(`${label}: imports getActivePlanId`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*\bgetActivePlanId\b[^}]*\}\s*from\s*["']@\/lib\/plan-context["']/,
      "loader must import getActivePlanId from @/lib/plan-context",
    );
  });

  test(`${label}: calls getActivePlanId(supabase, user.id)`, () => {
    assert.match(
      src,
      /getActivePlanId\s*\(\s*supabase\s*,\s*user\.id\s*\)/,
      "loader must resolve plan id via getActivePlanId(supabase, user.id) so the SSR-rendered page agrees with the API routes (TIM-2980)",
    );
  });

  test(`${label}: does NOT inline-resolve coffee_shop_plans by user_id`, () => {
    const FROM_PLANS = /\.from\s*\(\s*['"]coffee_shop_plans['"]\s*\)/g;
    let match;
    while ((match = FROM_PLANS.exec(src)) !== null) {
      const chunk = src.slice(match.index, match.index + 300);
      const eqUserId = /\.eq\s*\(\s*['"]user_id['"]\s*,/.test(chunk);
      assert.ok(
        !eqUserId,
        "loader must not inline-resolve coffee_shop_plans.eq(user_id) — use getActivePlanId (TIM-2980)",
      );
    }
  });
}
