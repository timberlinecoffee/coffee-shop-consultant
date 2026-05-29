// Regression test for TIM-543 / TIM-701: Module availability contract.
// The /plan/[moduleNumber] route was retired in TIM-701 in favour of the
// /workspace/* shells. These tests now pin the AVAILABLE_MODULES contract
// that dashboard navigation and isModuleAvailable() depend on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

function read(rel) {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

function parseAvailableModules() {
  const src = read("src/lib/modules.ts");
  const match = src.match(/AVAILABLE_MODULES[^=]*=\s*new Set\(\[([^\]]+)\]\)/);
  assert.ok(match, "AVAILABLE_MODULES Set literal not found in modules.ts");
  return new Set(
    match[1]
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => parseInt(n, 10))
  );
}

test("Module 3 (Location & Lease) is navigable — sections shipped in TIM-908", () => {
  const available = parseAvailableModules();
  assert.ok(
    available.has(3),
    "Module 3 must be in AVAILABLE_MODULES now that CandidateListCard/RubricGrid/LeaseTerms are shipped"
  );
});

test("computePlanReadiness rolls readiness up through the shared formula", async () => {
  // TIM-903 invariant: readiness must go through the shared formula so unset /
  // locked workspaces sit in the denominator and a near-empty plan can never
  // report 100%. TIM-1329: this was a source-string grep of dashboard/page.tsx,
  // which broke when the dashboard was refactored (TIM-1063 / TIM-1286) to read
  // the precomputed `readiness_score` instead of calling the formula inline.
  // Pin the formula's behavior directly so it survives UI refactors.
  const { computePlanReadiness, WORKSPACE_MANIFEST } = await import(
    "./workspace-manifest.ts"
  );
  const { AVAILABLE_MODULES } = await import("./modules.ts");

  // Near-empty plan → 0%, never 100%.
  assert.equal(computePlanReadiness(new Map()).pct, 0);

  // Every unlocked workspace complete → 100%.
  const allComplete = new Map(
    WORKSPACE_MANIFEST.filter((item) => AVAILABLE_MODULES.has(item.moduleNumber)).map(
      (item) => [item.workspaceKey, "complete"]
    )
  );
  assert.equal(computePlanReadiness(allComplete).pct, 100);
});

test("AVAILABLE_MODULES includes all modules with shipped content (1, 2, 3)", () => {
  const available = parseAvailableModules();
  assert.ok(available.has(1), "Module 1 (Concept) must be available");
  assert.ok(available.has(2), "Module 2 must be available");
  assert.ok(available.has(3), "Module 3 (Location & Lease) must be available");
});
