#!/usr/bin/env node
/**
 * TIM-2926: Static guard — forbid fetch(`/api/workspaces/.../items/${id}`, PATCH|DELETE)
 * without a matching src/app/api/.../items/[id]/route.ts on disk.
 *
 * If a caller uses a dynamic-segment URL (`items/${someId}`) with a mutating
 * method, there must be a Next.js [id]/route.ts file to handle it. Without
 * one the request 404s silently — the class of bug TIM-2921 introduced.
 *
 * Scans src/app/(app) and src/components.
 * Usage:  node scripts/lint-onapply-urls.mjs
 * Exit:   0 = all good, 1 = violation found
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SEARCH_DIRS = [
  join(ROOT, "src", "app", "(app)"),
  join(ROOT, "src", "components"),
];

function walk(dir, exts = [".ts", ".tsx"], results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, exts, results);
    } else if (exts.some((e) => full.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// Matches: fetch(`/api/workspaces/<segment>/items/${<expr>}`
// Captures the workspace segment so we can derive the expected route path.
const URL_RE = /fetch\s*\(\s*`\/api\/workspaces\/([^/`$\s]+)\/items\/\$\{[^}]+\}`/g;
// A mutating method in the options object that follows the URL.
const MUTATING_RE = /\bmethod\s*:\s*["'](PATCH|DELETE|PUT)["']/;
// Window size (chars) to search for the method after the URL match.
const WINDOW = 600;

const violations = [];

for (const dir of SEARCH_DIRS) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, "utf8");
    let m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(src)) !== null) {
      const workspace = m[1];
      const window = src.slice(m.index, m.index + WINDOW);
      if (!MUTATING_RE.test(window)) continue; // GET or unspecified — skip

      const relFile = file.replace(ROOT + "/", "");
      const routePath = join(
        ROOT, "src", "app", "api", "workspaces", workspace, "items", "[id]", "route.ts"
      );
      if (!existsSync(routePath)) {
        violations.push({ file: relFile, workspace, routePath: routePath.replace(ROOT + "/", "") });
      }
    }
  }
}

if (violations.length === 0) {
  console.log("✓ lint-onapply-urls [TIM-2926]: no missing [id]/route.ts files.");
  process.exit(0);
}

console.error(`\n✗ lint-onapply-urls [TIM-2926]: ${violations.length} violation(s)\n`);
for (const v of violations) {
  console.error(`  MISSING ROUTE  ${v.routePath}`);
  console.error(`  referenced in: ${v.file}`);
  console.error(`  Pattern:       fetch(\`/api/workspaces/${v.workspace}/items/\${id}\`, { method: PATCH|DELETE })`);
  console.error(`  Fix:           Create ${v.routePath} with the PATCH/DELETE handlers,`);
  console.error(`                 OR rewrite the fetch to use the collection endpoint`);
  console.error(`                 (/api/workspaces/${v.workspace}/items) with the id in the body.\n`);
}
console.error("Rule [TIM-2926]: Every PATCH/DELETE to a dynamic-segment items URL must");
console.error("have a matching src/app/api/.../items/[id]/route.ts.\n");
process.exit(1);
