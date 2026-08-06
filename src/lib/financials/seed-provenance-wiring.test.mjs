// TIM-3448: the mechanism has to actually be plugged in.
//
// A correct provenance module is worth nothing if the workspace goes around
// it, or if the fingerprints are stamped in the wrong place, or if normalize
// drops them on the first read. Each of those would restore "7 of 7 · 100%"
// on a fresh account while every unit test in seed-provenance.test.mjs kept
// passing. Source scans, because these files need React and Supabase to run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

const V2 = join(SRC, "app", "(app)", "workspace", "financials", "financials-v2.tsx");
const PAGE = join(SRC, "app", "(app)", "workspace", "financials", "page.tsx");
const ROUTE = join(SRC, "app", "api", "workspaces", "financials", "model", "route.ts");
const PROJECTION = join(SRC, "lib", "financial-projection.ts");

/** Source with comments stripped, so prose about the bug cannot trip a guard. */
function code(path) {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

test("all seven Financials steps are checked for provenance", () => {
  const src = code(V2);
  const steps = [
    "daily_traffic",
    "revenue",
    "running_costs",
    "staffing",
    "startup",
    "funding",
    "growth",
  ];
  for (const step of steps) {
    assert.match(
      src,
      new RegExp(`untouched\\(\\s*\\n?\\s*"${step}"`),
      `step "${step}" still counts seeded numbers as the owner's work`,
    );
  }
  // Exactly seven — an eighth step added later without a provenance check
  // would silently reintroduce the bug for that step alone.
  const calls = src.match(/untouched\(\s*\n?\s*"/g) ?? [];
  assert.equal(calls.length, steps.length, `expected 7 provenance checks, found ${calls.length}`);
});

test("a seeded step cannot be counted as done", () => {
  const src = code(V2);
  // The progress line and the "next step" button both read `done`.
  assert.match(src, /done:\s*s1 === "complete"/);
  assert.doesNotMatch(
    src,
    /done:\s*s\d\s*!==\s*"empty"/,
    'progress is counting anything-but-empty again, which counts "seeded"',
  );
});

test("fingerprints are stamped after calibration, not before", () => {
  // Stamping before the city and shop-type calibrators run would fingerprint
  // the pre-calibration template, so every calibrated step would compare as
  // already edited and the workspace would open at 7 of 7 again.
  for (const path of [PAGE, ROUTE]) {
    const src = code(path);
    const stamp = src.indexOf("buildSeedFingerprints(forecastInputs)");
    assert.ok(stamp !== -1, `${path} never stamps the seed fingerprints`);

    for (const calibrator of [
      "calibrateStartupCosts(",
      "calibrateRevenue(",
      "calibrateRent(",
      "calibrateFundingSources(",
    ]) {
      const at = src.indexOf(calibrator);
      assert.ok(at !== -1, `${path} lost ${calibrator}`);
      assert.ok(at < stamp, `${path} stamps fingerprints before ${calibrator} has run`);
    }

    // And before the row is written, or nothing is persisted. Match the
    // insert specifically — page.tsx reads financial_models first, so keying
    // off the table name alone finds the SELECT and passes for the wrong
    // reason.
    const insert = src.search(/\.from\("financial_models"\)\s*\n\s*\.insert\(/);
    assert.ok(insert !== -1, `${path} no longer inserts a financial_models row`);
    assert.ok(stamp < insert, `${path} stamps fingerprints after the insert`);
  }
});

test("normalize does not drop the fingerprints", () => {
  // normalizeMonthlyProjections rebuilds the model from a whitelist. A field
  // missing from that whitelist is dropped on EVERY read, so the fingerprints
  // would survive exactly until the first page load.
  assert.match(
    code(PROJECTION),
    /seed_fingerprints:\s*\n?\s*r\.seed_fingerprints/,
    "normalize no longer passes seed_fingerprints through — they will vanish on first read",
  );
});

test("the seeded state explains itself where the owner is looking", () => {
  const src = code(V2);
  assert.match(src, /status === "seeded"/, "nothing renders differently for a seeded step");
  assert.match(src, /seededStepNotice\(/, "the seeded step shows no explanation");
});
