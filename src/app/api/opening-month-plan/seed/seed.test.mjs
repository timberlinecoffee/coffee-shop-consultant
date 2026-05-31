// TIM-1518: Smoke test guarding the Opening Month Plan starter playbook
// against day_offset CHECK-constraint drift. TIM-1449 added Pre-Open Weeks
// rows at day_offset=-28 but did not widen the original -7..30 CHECK,
// so every founder Generate/Seed click hit a Postgres constraint violation
// and the workspace stayed empty. This test asserts every seed row is
// within the documented bounds enforced by the SQL migration.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SEED_ROWS,
  DAY_OFFSET_MIN,
  DAY_OFFSET_MAX,
} from "./seed-data.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");
const MIGRATION_PATH = join(
  REPO_ROOT,
  "supabase",
  "migrations",
  "20260531145023_tim1518_widen_soft_open_plan_items_day_offset.sql",
);

test("every seed row's day_offset is inside the documented bounds", () => {
  for (const row of SEED_ROWS) {
    assert.ok(
      row.day_offset >= DAY_OFFSET_MIN && row.day_offset <= DAY_OFFSET_MAX,
      `seed row "${row.task}" has day_offset=${row.day_offset}, outside [${DAY_OFFSET_MIN}, ${DAY_OFFSET_MAX}]`,
    );
  }
});

test("documented bounds match the CHECK constraint shipped in the migration", () => {
  // Guards against the TIM-1518 regression pattern: someone changes the
  // SQL constraint but forgets to update the TS bounds (or vice versa).
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const match = sql.match(
    /check\s*\(\s*day_offset\s+between\s+(-?\d+)\s+and\s+(-?\d+)\s*\)/i,
  );
  assert.ok(match, "could not locate the day_offset CHECK in the migration");
  const sqlMin = Number(match[1]);
  const sqlMax = Number(match[2]);
  assert.equal(
    sqlMin,
    DAY_OFFSET_MIN,
    `migration CHECK lower bound (${sqlMin}) drifted from DAY_OFFSET_MIN (${DAY_OFFSET_MIN})`,
  );
  assert.equal(
    sqlMax,
    DAY_OFFSET_MAX,
    `migration CHECK upper bound (${sqlMax}) drifted from DAY_OFFSET_MAX (${DAY_OFFSET_MAX})`,
  );
});

test("seed range covers both pre-open and post-open content", () => {
  const offsets = SEED_ROWS.map((r) => r.day_offset);
  const min = Math.min(...offsets);
  const max = Math.max(...offsets);
  assert.ok(min < 0, "seed should include pre-open weeks (negative day_offset)");
  assert.ok(max > 0, "seed should include post-open follow-ups (positive day_offset)");
});
