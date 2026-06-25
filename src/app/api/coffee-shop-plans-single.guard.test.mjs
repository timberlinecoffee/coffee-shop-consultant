// TIM-2878 guard: project-wide static check that no API route resolves an
// active plan via `.eq("user_id", ...).single()` on coffee_shop_plans.
//
// The bug (TIM-2860): PostgREST .single() throws when >1 row matches, so any
// route using `.from("coffee_shop_plans")...eq("user_id", uid).single()` will
// silently 404 for every multi-plan Pro user. The canonical fix is
// getActivePlanId() from @/lib/plan-context (TIM-2377).
//
// Safe patterns excluded from this check:
//   - .eq("id", planId).single()         — keyed by specific plan row, not user
//   - .order(...).limit(1).maybeSingle() — won't blow up on >1 row
//   - getActivePlanId()                  — canonical resolver

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = __dirname;

function walkTs(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

// Matches: .from("coffee_shop_plans") ... .eq("user_id", ...) ... .single()
// within a ~400-char window (spanning most realistic query chains).
// Does NOT match chains that first constrain by .eq("id", planId) because
// those key on a specific row — the multi-row blow-up can't occur.
const BUGGY_PATTERN =
  /from\(\s*["']coffee_shop_plans["']\s*\)[\s\S]{0,400}?\.eq\(\s*["']user_id["']\s*,[\s\S]{0,100}?\)[\s\S]{0,100}?\.single\(\s*\)/;

// If the chain also contains .eq("id", ...) before the .single(), it's
// keyed to a specific row and is safe.
const SAFE_BY_ID_PATTERN =
  /from\(\s*["']coffee_shop_plans["']\s*\)[\s\S]{0,400}?\.eq\(\s*["']id["']\s*,[\s\S]{0,200}?\.single\(\s*\)/;

const files = walkTs(apiRoot);
const buggyFiles = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (BUGGY_PATTERN.test(src) && !SAFE_BY_ID_PATTERN.test(src)) {
    buggyFiles.push(file.replace(apiRoot + "/", "src/app/api/"));
  }
}

test("no API route uses .eq('user_id',...).single() on coffee_shop_plans (TIM-2878)", () => {
  assert.deepEqual(
    buggyFiles,
    [],
    `Buggy plan-resolution pattern found in:\n${buggyFiles.map((f) => `  ${f}`).join("\n")}\n\nReplace with getActivePlanId(supabase, user.id) from @/lib/plan-context`,
  );
});
