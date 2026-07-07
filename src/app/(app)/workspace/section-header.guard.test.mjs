// TIM-3688: Guard that every workspace section header goes through the shared
// SectionHeader component instead of rendering an inline
// [title text-sm font-semibold] + [SectionHelp] pattern.
//
// Structural exceptions (direct SectionHelp import allowed):
//   financials-workspace.tsx  — SectionHelp lives OUTSIDE the accordion
//     button that wraps SectionHeader, so passing helpContent would create
//     a nested-interactive accessibility violation.
//   menu-workspace.tsx  — "What To Serve" and "Margin Ranking" use
//     text-lg font-bold + a leading icon, a different visual level than
//     SectionHeader's text-sm font-semibold. Migrating would be a visual
//     regression per the TIM-3688 DoD.
//
// If this test fails, either:
//   (a) a new workspace file added a direct SectionHelp import — migrate it
//       to use <SectionHeader helpContent={...} />, or
//   (b) an exception is genuinely structural — add it to ALLOWED_FILES below
//       with a comment explaining why.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = __dirname;

// Relative paths from WORKSPACE_ROOT that are permitted to import section-help
// directly due to documented structural constraints (see comments above).
const ALLOWED_FILES = new Set([
  "financials/financials-workspace.tsx",
  "menu-pricing/menu-workspace.tsx",
]);

function walk(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip print sub-directories — print pages are exempt from this constraint.
      if (entry !== "print") walk(full, results);
    } else if (entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

test("No workspace page imports section-help directly outside allowed exceptions", () => {
  const files = walk(WORKSPACE_ROOT);
  const violations = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const rel = relative(WORKSPACE_ROOT, file);
    if (
      /from\s+["']@\/components\/ui\/section-help["']/.test(src) &&
      !ALLOWED_FILES.has(rel)
    ) {
      violations.push(rel);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Workspace files with direct section-help import (use <SectionHeader helpContent={...} /> instead):\n${violations.join("\n")}`,
  );
});

test("No workspace page renders inline text-sm font-semibold title + SectionHelp siblings outside allowed exceptions", () => {
  const files = walk(WORKSPACE_ROOT);
  const violations = [];

  // Match: <p|span|div className="...text-sm font-semibold...">, followed within
  // ~300 chars by <SectionHelp — the canonical inline-header smell.
  const INLINE_PATTERN =
    /<(?:p|span|div)\s[^>]*?text-sm font-semibold[^>]*?>[\s\S]{0,300}?<SectionHelp/;

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const rel = relative(WORKSPACE_ROOT, file);
    if (ALLOWED_FILES.has(rel)) continue;
    if (INLINE_PATTERN.test(src)) {
      violations.push(rel);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Workspace files with inline section-header pattern (migrate to <SectionHeader .../>):\n${violations.join("\n")}`,
  );
});
