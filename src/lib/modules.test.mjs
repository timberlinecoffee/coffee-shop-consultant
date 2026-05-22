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

test("dashboard computes plan readiness through computePlanReadiness", () => {
  // TIM-903: readiness score must go through the shared formula so locked modules
  // are weighted in the denominator, preventing 100% on a near-empty plan.
  const src = read("src/app/dashboard/page.tsx");
  assert.match(
    src,
    /computePlanReadiness/,
    "dashboard must call computePlanReadiness for the overall readiness score"
  );
});

test("AVAILABLE_MODULES includes exactly the modules with shipped content (1, 3) — TIM-916", () => {
  // Module 2 (Financials) removed until TIM-621 ships real section content.
  // totalSections is null in workspace-manifest.ts; keeping it in AVAILABLE_MODULES
  // caused a locked sidebar entry despite the module being listed as available.
  const available = parseAvailableModules();
  assert.ok(available.has(1), "Module 1 (Concept) must be available");
  assert.ok(!available.has(2), "Module 2 (Financials) must NOT be available until TIM-621 ships");
  assert.ok(available.has(3), "Module 3 (Location & Lease) must be available");
});
