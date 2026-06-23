// TIM-2965: Pin the multi-plan resolver on the soft_open_plan_items routes.
// The original handlers used `coffee_shop_plans.eq(user_id).single()` which
// 500s as soon as a user has more than one plan (Supabase `.single()` rejects
// multi-row results). The page loader uses latest-by-created_at, so the page
// renders fine but `GET /api/opening-month-plan/soft-open-plan` errors and
// the workspace toasts "Couldn't load the playbook." The fix swaps in the
// canonical `getActivePlanId` (TIM-2377) which honors `users.current_plan_id`
// and falls back to latest. This test pins both routes against regressing
// back to the bare-`.single()` resolver.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROUTES = [
  join(__dirname, "route.ts"),
  join(__dirname, "[id]", "route.ts"),
];

for (const routePath of ROUTES) {
  const label = routePath.replace(__dirname, ".");
  const src = readFileSync(routePath, "utf8");

  test(`${label}: imports the canonical getActivePlanId resolver`, () => {
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

  test(`${label}: does NOT use the broken .single() coffee_shop_plans resolver`, () => {
    // Positive assertion: the file must contain NO chain of
    // `.from(<quote>coffee_shop_plans<quote>)` followed (within 400 chars) by
    // `.single()` without also having `.limit(1)` or `.maybeSingle()` nearby.
    // Using a regex rather than indexOf so quote style (single/double) can't
    // be used to evade the check (code-review Finding 2 on TIM-2965).
    const FROM_PLANS = /\.from\s*\(\s*['"]coffee_shop_plans['"]\s*\)/g;
    let match;
    while ((match = FROM_PLANS.exec(src)) !== null) {
      const chunk = src.slice(match.index, match.index + 400);
      const hasBareSingle = /\.single\s*\(\s*\)/.test(chunk);
      const hasLimit = /\.limit\s*\(\s*1\s*\)/.test(chunk);
      const hasMaybeSingle = /\.maybeSingle\s*\(\s*\)/.test(chunk);
      assert.ok(
        !hasBareSingle || hasLimit || hasMaybeSingle,
        "route must not call .single() on coffee_shop_plans without .limit(1)/.maybeSingle() — that pattern 500s for users with multiple plans (TIM-2965)",
      );
    }
  });
}
