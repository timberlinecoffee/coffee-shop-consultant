// TIM-2573 (parent TIM-2555): pin test that the three currently
// client-reachable lib modules — benchmarks.ts, benchmark-bands.ts, and
// source-suite-checks.ts — do not import any Node built-in. The ESLint rule
// in eslint.config.mjs covers files actually placed under
// src/app/(app)/workspace/** and src/components/**, but cannot statically
// follow transitive reach into src/lib/**. These three modules are imported
// into client tabs today (TIM-2474 wired benchmark-bands into P&L / Ratios
// client tabs, which transitively pulled benchmarks.ts → node:module and
// took prod down for 6h under TIM-2546). This pin test is the second gate
// that catches regressions even when the lint step is skipped or the
// transitive-reach scope expands without the engineer noticing.
//
// Out of scope (documented follow-ups under TIM-2555):
//   - General transitive-reach detection across all of src/lib.
//   - Vercel prolonged-Error alerting.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(rel) {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

// Client-reachable lib modules that today get pulled into the browser bundle
// via workspace tabs. Add a path here if you intentionally make a new lib
// module client-reachable.
const CLIENT_REACHABLE_LIB_MODULES = [
  "src/lib/business-plan/benchmarks.ts",
  "src/lib/business-plan/benchmark-bands.ts",
  "src/lib/business-plan/source-suite-checks.ts",
];

// Node built-in module specifiers that Turbopack refuses to bundle for client
// chunks. The `node:` URL form and the bare-name form are equivalent at the
// resolver layer — ban both.
const NODE_BUILTINS = [
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
];

// Strip line comments and block comments before scanning. The TIM-2546
// postmortem comment in benchmarks.ts legitimately names `node:module` in
// prose — we only care about actual import statements.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// ── per-file: no `node:*` URL-form import or require ─────────────────────────

for (const rel of CLIENT_REACHABLE_LIB_MODULES) {
  test(`${rel} has no \`from "node:"\` import`, () => {
    const src = stripComments(read(rel));
    assert.ok(
      !/from\s+["']node:/.test(src),
      `${rel} imports a node: URL-form built-in. Turbopack refuses these in client chunks (see TIM-2546).`,
    );
  });

  test(`${rel} has no \`require("node:")\` call`, () => {
    const src = stripComments(read(rel));
    assert.ok(
      !/require\s*\(\s*["']node:/.test(src),
      `${rel} uses require("node:…"). Turbopack refuses these in client chunks (see TIM-2546).`,
    );
  });

  test(`${rel} has no \`createRequire\` shim`, () => {
    const src = stripComments(read(rel));
    assert.ok(
      !/\bcreateRequire\s*\(/.test(src),
      `${rel} uses createRequire(). This is the exact pattern that broke prod under TIM-2474 → TIM-2546. Use a static JSON import with { type: "json" } instead.`,
    );
  });

  test(`${rel} has no bare-name Node built-in import`, () => {
    const src = stripComments(read(rel));
    for (const name of NODE_BUILTINS) {
      const escaped = name.replace(/[/]/g, "\\/");
      const pattern = new RegExp(
        `from\\s+["']${escaped}["']|require\\s*\\(\\s*["']${escaped}["']\\s*\\)`,
      );
      assert.ok(
        !pattern.test(src),
        `${rel} imports the bare-name Node built-in "${name}". Turbopack refuses these in client chunks the same way it refuses node:${name} (see TIM-2546).`,
      );
    }
  });
}

// ── ESLint config wiring drift-guard ─────────────────────────────────────────

test("eslint.config.mjs wires no-restricted-imports for client-reachable trees", () => {
  const cfg = read("eslint.config.mjs");
  // Both client trees must be in the rule's `files` scope.
  assert.match(cfg, /src\/app\/\(app\)\/workspace\/\*\*\/\*\.\{ts,tsx\}/);
  assert.match(cfg, /src\/components\/\*\*\/\*\.\{ts,tsx\}/);
  // The `node:*` pattern guard must be present.
  assert.match(cfg, /"no-restricted-imports"/);
  assert.match(cfg, /group:\s*\[\s*["']node:\*["']\s*\]/);
  // A few representative bare-name builtins must be in the `paths` list.
  for (const name of ["fs", "path", "module", "crypto", "os", "stream"]) {
    assert.ok(
      new RegExp(`["']${name}["']`).test(cfg),
      `eslint.config.mjs is missing bare-name Node built-in "${name}" in the no-restricted-imports paths list.`,
    );
  }
});
