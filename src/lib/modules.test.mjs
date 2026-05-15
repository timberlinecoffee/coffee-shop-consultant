// Regression test for TIM-543: Module 3 navigation crash.
// Before the fix, /plan/3 rendered ModuleClient with `getSectionsForModule(3)`
// falling back to MODULE_1_SECTIONS — Module 1 content shown under "Module 3"
// label, with autosave writing M1 keys against module_number=3. These tests
// pin the contract: only modules with sections defined are navigable, and the
// dashboard's `unlocked` derivation matches the route guard.

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

// Pull module numbers that getSectionsForModule() explicitly handles before
// the unreachable throw branch.
function parseHandledModuleNumbers() {
  const src = read("src/app/plan/[moduleNumber]/module-client.tsx");
  const block = src.match(
    /function getSectionsForModule\([^)]*\)\s*\{([\s\S]*?)\n\}/
  );
  assert.ok(block, "getSectionsForModule definition not found");
  return new Set(
    [...block[1].matchAll(/moduleNumber\s*===\s*(\d+)/g)].map((m) =>
      parseInt(m[1], 10)
    )
  );
}

test("AVAILABLE_MODULES matches getSectionsForModule's handled branches", () => {
  const available = parseAvailableModules();
  const handled = parseHandledModuleNumbers();
  assert.deepEqual(
    [...available].sort(),
    [...handled].sort(),
    "AVAILABLE_MODULES must mirror the modules with sections defined"
  );
});

test("Module 3 is not navigable until its sections ship", () => {
  const available = parseAvailableModules();
  assert.ok(
    !available.has(3),
    "Module 3 must stay out of AVAILABLE_MODULES until sections are defined"
  );
});

test("page.tsx redirects unavailable modules to /dashboard", () => {
  const src = read("src/app/plan/[moduleNumber]/page.tsx");
  assert.match(
    src,
    /isModuleAvailable\(moduleNum\)/,
    "page.tsx must guard on isModuleAvailable"
  );
  assert.match(
    src,
    /redirect\("\/dashboard"\)/,
    "page.tsx must redirect to /dashboard when module is unavailable"
  );
});

test("getSectionsForModule no longer silently falls back to Module 1", () => {
  const src = read("src/app/plan/[moduleNumber]/module-client.tsx");
  // The throw guarantees a hard failure if the route guard ever lets an
  // unknown module slip through, instead of rendering wrong content.
  assert.match(
    src,
    /function getSectionsForModule[\s\S]*?throw new Error\(`Module \$\{moduleNumber\} has no sections defined`\)/,
    "getSectionsForModule must throw on unknown modules"
  );
});

test("dashboard's unlocked flag is derived from isModuleAvailable", () => {
  const src = read("src/app/dashboard/page.tsx");
  assert.match(
    src,
    /isModuleAvailable\(m\.num\)/,
    "dashboard MODULES.unlocked must come from isModuleAvailable"
  );
});
