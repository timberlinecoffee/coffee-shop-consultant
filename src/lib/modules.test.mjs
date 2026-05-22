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

test("AVAILABLE_MODULES includes all modules with shipped content (1, 2, 3)", () => {
  const available = parseAvailableModules();
  assert.ok(available.has(1), "Module 1 (Concept) must be available");
  assert.ok(available.has(2), "Module 2 must be available");
  assert.ok(available.has(3), "Module 3 (Location & Lease) must be available");
});
