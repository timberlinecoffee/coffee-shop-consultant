// TIM-3453: the marker has to survive the trip from database to detector.
//
// The suppression logic is unit-tested next door. This checks the plumbing:
// the column is selected, it reaches the detector, the financials provenance
// is read from the stored blob, and the committed migration matches what was
// actually applied. Any one missing and the phantom conflict returns while
// every unit test still passes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const DETECT = join(HERE, "detect.ts");
const MIGRATIONS = join(REPO, "supabase", "migrations");

/** Source with comments stripped, so prose about the bug cannot trip a guard. */
function code(path) {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

test("the query asks for the source column", () => {
  assert.match(
    code(DETECT),
    /\.select\("id, role_title, headcount, start_date, monthly_cost_cents, source"\)/,
    "hiring roles are fetched without their provenance — every row reads as the owner's",
  );
});

test("both provenances reach the detector", () => {
  const src = code(DETECT);
  assert.match(src, /source: r\.source \?\? null/, "the row's source is dropped on the way in");
  assert.match(
    src,
    /financialsStaffingIsSeed:\s*\n?\s*stepProvenance\("staffing", args\.forecastInputs \?\? null\) === "seeded"/,
    "the financials side no longer reports whether its staffing is still seed",
  );
});

test("the financials blob is passed unnormalized", () => {
  // normalizeMonthlyProjections rebuilds from a whitelist and would strip the
  // seed fingerprints, so the staffing step would always read "unknown" and
  // the suppression would never fire.
  const src = code(DETECT);
  assert.match(src, /forecastInputs: \(\(financialModel as any\)\?\.forecast_inputs \?\? null\)/);
  assert.doesNotMatch(
    src,
    /forecastInputs: normalizeMonthlyProjections/,
    "the blob is being normalized before the provenance check — fingerprints will be stripped",
  );
});

test("the applied migration is committed under its server-assigned version", () => {
  // AGENTS.md: apply_migration assigns the version server-side; the committed
  // filename must match `schema_migrations` exactly or the migration-drift CI
  // check hard-fails. TIM-1231 was 15 files renamed after inventing versions.
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  const mine = files.filter((f) => f.includes("tim3453_hiring_roles_source_marker"));
  assert.equal(mine.length, 1, `expected exactly one TIM-3453 migration, found ${mine.length}`);

  // Read back from the production DB on 2026-08-10:
  //   version 20260810011643, name tim3453_hiring_roles_source_marker
  assert.equal(mine[0], "20260810011643_tim3453_hiring_roles_source_marker.sql");
  assert.match(mine[0], /^\d{14}_/, "version is not a 14-digit server timestamp");
});

test("the migration is additive and cannot lose owner data", () => {
  const sql = readFileSync(
    join(MIGRATIONS, "20260810011643_tim3453_hiring_roles_source_marker.sql"),
    "utf8",
  );

  assert.match(sql, /add column if not exists source text not null default 'user'/);
  assert.match(sql, /check \(source in \('seed', 'user'\)\)/);

  // The whole point: nothing is destroyed. A DELETE or DROP TABLE here would
  // be removing plans owners built.
  assert.doesNotMatch(sql, /\bdelete\s+from\b/i, "the migration deletes rows");
  assert.doesNotMatch(sql, /\bdrop\s+table\b/i, "the migration drops a table");
  assert.doesNotMatch(sql, /\btruncate\b/i, "the migration truncates");

  // The backfill must be conservative: only plans matching the seed exactly,
  // with nothing owner-entered on any row.
  assert.match(sql, /having count\(\*\) = 4/);
  assert.match(sql, /and sum\(headcount\) = 7/);
  assert.match(
    sql,
    /bool_and\(start_date is null and monthly_cost_cents is null and notes is null\)/,
    "the backfill would mark plans where the owner has entered dates or costs",
  );
});

test("the trigger stamps future seeds, and stays SECURITY DEFINER with a pinned path", () => {
  const sql = readFileSync(
    join(MIGRATIONS, "20260810011643_tim3453_hiring_roles_source_marker.sql"),
    "utf8",
  );
  assert.match(sql, /order_index, source\) values/, "new plans no longer stamp their seeded rows");
  assert.equal((sql.match(/'seed'\)/g) ?? []).length, 4, "expected all four seeded roles stamped");

  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path to 'public'/i);
  // AGENTS.md: current_user inside SECURITY DEFINER returns the owner, not the
  // caller. This function does not branch on the caller at all, and must not
  // start doing so. Scanned with `--` comment lines stripped, because the
  // migration's own note explains that rule and would otherwise trip it — the
  // third time a guard in this codebase has caught its own documentation.
  const sqlCode = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlCode, /\bcurrent_user\b/, "SECURITY DEFINER function reads current_user");
});
