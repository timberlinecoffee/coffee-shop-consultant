#!/usr/bin/env node
/**
 * Sitewide internal-link checker — TIM-909.
 *
 * Scans every .tsx/.ts file under src/ for static href values, then
 * verifies each internal path has a corresponding page.tsx/route.ts in
 * the Next.js app/ directory.
 *
 * Usage:  node scripts/check-links.mjs
 * Exit:   0 = all good, 1 = dead links found
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");

// ── 1. Collect all .ts/.tsx source files ──────────────────────────────────
function walk(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip node_modules and .next
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, results);
    } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

const sourceFiles = walk(SRC);

// ── 2. Extract static internal hrefs ──────────────────────────────────────
// Matches: href="/...", href='/...', href={"/..."}  (no template literals)
const HREF_RE = /href[=:{]\s*["'`](\/)([^"'`}>\s]*)/g;

function extractHrefs(file) {
  const src = readFileSync(file, "utf8");
  const hrefs = new Set();
  let m;
  while ((m = HREF_RE.exec(src)) !== null) {
    const path = "/" + m[2].replace(/[?#].*$/, ""); // strip query/hash
    // Skip API routes — they are checked separately
    if (path.startsWith("/api/")) continue;
    hrefs.add(path);
  }
  return hrefs;
}

const allHrefs = new Map(); // path → [files that reference it]
for (const file of sourceFiles) {
  for (const href of extractHrefs(file)) {
    if (!allHrefs.has(href)) allHrefs.set(href, []);
    allHrefs.get(href).push(file.replace(ROOT + "/", ""));
  }
}

// ── 3. Resolve hrefs to Next.js app-router pages ──────────────────────────
// A path is "routable" if its app/ directory contains page.tsx or route.ts,
// or if it is served by a [dynamic] segment.

function appDirForPath(pathname) {
  // Strip trailing slash
  const clean = pathname === "/" ? "" : pathname.replace(/\/$/, "");
  return join(APP, clean);
}

function isRoutable(pathname) {
  if (pathname === "/") {
    return existsSync(join(APP, "page.tsx")) || existsSync(join(APP, "page.jsx"));
  }

  const dir = appDirForPath(pathname);

  // Direct match
  if (
    existsSync(join(dir, "page.tsx")) ||
    existsSync(join(dir, "page.jsx")) ||
    existsSync(join(dir, "route.ts")) ||
    existsSync(join(dir, "route.js"))
  ) {
    return true;
  }

  // Walk up segment-by-segment looking for [dynamic] segments that could match
  const segments = pathname.replace(/^\//, "").split("/");
  return couldMatchDynamic(APP, segments);
}

function couldMatchDynamic(dir, segments) {
  if (segments.length === 0) {
    return (
      existsSync(join(dir, "page.tsx")) ||
      existsSync(join(dir, "page.jsx")) ||
      existsSync(join(dir, "route.ts"))
    );
  }
  const [head, ...tail] = segments;
  // Try literal segment
  const literal = join(dir, head);
  if (existsSync(literal) && statSync(literal).isDirectory()) {
    if (couldMatchDynamic(literal, tail)) return true;
  }
  // Try [dynamic] segments
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith("[") && entry.endsWith("]")) {
      const dynDir = join(dir, entry);
      if (statSync(dynDir).isDirectory()) {
        if (couldMatchDynamic(dynDir, tail)) return true;
      }
    }
  }
  return false;
}

// ── 4. Report ────────────────────────────────────────────────────────────
const dead = [];
for (const [href, files] of [...allHrefs].sort(([a], [b]) => a.localeCompare(b))) {
  if (!isRoutable(href)) {
    dead.push({ href, files });
  }
}

const ok = allHrefs.size - dead.length;
console.log(`\nLink check: ${allHrefs.size} unique internal hrefs scanned`);
console.log(`  ✓ ${ok} routable`);

if (dead.length === 0) {
  console.log("  All links are valid.\n");
  process.exit(0);
} else {
  console.log(`  ✗ ${dead.length} dead link(s):\n`);
  for (const { href, files } of dead) {
    console.log(`  DEAD  ${href}`);
    for (const f of files) console.log(`        referenced in ${f}`);
  }
  console.log();
  process.exit(1);
}
