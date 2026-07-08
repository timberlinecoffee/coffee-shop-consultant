// TIM-3688 (D.1): guard test — new inline SectionHeader clones fail here.
//
// Rule: workspace pages must render sub-section headers through the shared
// `SectionHeader` component (canonical structure locked at TIM-3300 / TIM-3304).
// Direct-render of `Sparkles` + "Write with AI" siblings, or a hand-rolled
// [title][help(?)][Write with AI] triplet, is a regression — SectionHeader is
// the single source of truth.
//
// This test scans src/app/(app)/workspace/**/*.tsx for those signatures and
// enforces an allowlist. If you legitimately need a divergent shape (BP's
// text-xl top-level section header per TIM-3491, for example), add the file
// to the allowlist below with the TIM-issue justification.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WORKSPACE_ROOT = join(REPO_ROOT, "src", "app", "(app)", "workspace");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!full.endsWith(".tsx")) continue;
    out.push(full);
  }
  return out;
}

// Files with an intentionally divergent header pattern — every entry requires
// a TIM-issue reason so the deviation stays discoverable.
const ALLOWLIST = new Map([
  // TIM-3491 / TIM-3501 / TIM-3672: BP top-level expandable section headers
  // use text-xl (not SectionHeader's text-sm) because they are page-level
  // sections, not sub-section headers. StatusChip / kebab / persistent WWA
  // button are all part of this documented board-ratified divergence.
  [
    "src/app/(app)/workspace/business-plan/business-plan-workspace.tsx",
    "TIM-3491 board-ratified text-xl BP section header divergence",
  ],
]);

const WWA_LABEL = /aria-label=\{?['"`]Write [^'"`]*with AI['"`]\}?/;
const SPARKLES_INLINE = /<Sparkles\s+size=\{12\}/;

function normalizeRel(abs) {
  return relative(REPO_ROOT, abs).split("\\").join("/");
}

test("D.1: no inline SectionHeader shape outside the shared component", () => {
  const files = walk(WORKSPACE_ROOT);
  const violations = [];
  for (const abs of files) {
    const rel = normalizeRel(abs);
    if (ALLOWLIST.has(rel)) continue;
    const src = readFileSync(abs, "utf8");
    // A hand-rolled "Write with AI" button is the strongest signal — the
    // SectionHeader owns the label + Sparkles(12) combo, so any file that
    // ships that shape without importing SectionHeader is a regression.
    if (WWA_LABEL.test(src) && SPARKLES_INLINE.test(src)) {
      if (!/from ['"]@\/components\/section-header['"]/.test(src) &&
          !/from ['"]@\/components\/section-header\/SectionHeader['"]/.test(src)) {
        violations.push(
          `${rel} — renders 'Write with AI' + Sparkles(12) inline but does not import SectionHeader`,
        );
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Inline SectionHeader clones found — refactor to use ` +
      `\`@/components/section-header\` or add a justified entry to the allowlist:\n` +
      violations.map((v) => `  - ${v}`).join("\n"),
  );
});

// D.2 guard: the three inline AccordionSection copies (Marketing / Ops
// Playbook / Opening Month) exist today and will be migrated in Child C
// (TIM-3689). Until then, this test just asserts the shared source file
// exports the canonical contract so the migration target stays wired up.
// (Direct .tsx import isn't safe under node --test's strip-types loader —
// JSX isn't stripped — so we source-scan instead.)
test("D.2: shared AccordionSection source exports the canonical contract", () => {
  const src = readFileSync(
    join(REPO_ROOT, "src/components/ui/AccordionSection.tsx"),
    "utf8",
  );
  assert.match(src, /export function AccordionSection\b/, "AccordionSection export missing");
  assert.match(src, /export type SectionStatus =\s*['"]complete['"]/, "SectionStatus union missing 'complete'");
  assert.match(src, /['"]in_progress['"]/, "SectionStatus union missing 'in_progress'");
  assert.match(src, /['"]empty['"]/, "SectionStatus union missing 'empty'");
  assert.match(
    src,
    /status\?:\s*SectionStatus/,
    "status prop must be optional so non-playbook consumers get a bare accordion",
  );
});
