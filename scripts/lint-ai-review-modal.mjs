#!/usr/bin/env node
/**
 * TIM-2926: AST-style lint — every onApply: async callback that calls a
 * mutating fetch endpoint must:
 *   (a) reference accepted[0] or .finalValue
 *   (b) check res.ok (or patchRes.ok / applyRes.ok — any form of *.ok)
 *   (c) throw on failure
 *
 * This guards against the TIM-2921 bug class where the Accept handler
 * silently swallowed server errors because it neither read the accepted
 * value nor verified the response status.
 *
 * Scans all .ts / .tsx files under src/.
 * Usage:  node scripts/lint-ai-review-modal.mjs
 * Exit:   0 = all good, 1 = violation found
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

// Files that define the modal infrastructure itself — don't lint them.
const EXCLUDED = new Set([
  join(SRC, "hooks", "useAIReviewModal.ts"),
  join(SRC, "components", "ai-assist", "AIReviewModal.tsx"),
]);

function walk(dir, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, results);
    } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract the body of an arrow-function block starting at `openBrace`.
 * Handles string literals, template literals, and comments so braces inside
 * them don't confuse the counter.
 */
function extractBody(src, openBrace) {
  let i = openBrace;
  let depth = 0;

  while (i < src.length) {
    const ch = src[i];

    // Line comment
    if (ch === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    // Block comment
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // Single / double-quoted string
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    // Template literal (handles one level of ${...} nesting)
    if (ch === "`") {
      i++;
      let tDepth = 0;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "`" && tDepth === 0) { i++; break; }
        if (src[i] === "$" && src[i + 1] === "{") { tDepth++; i += 2; continue; }
        if (src[i] === "}" && tDepth > 0) { tDepth--; i++; continue; }
        i++;
      }
      continue;
    }
    if (ch === "{") { depth++; i++; continue; }
    if (ch === "}") {
      depth--;
      i++;
      if (depth === 0) return src.slice(openBrace, i);
      continue;
    }
    i++;
  }
  return null; // unclosed — shouldn't happen on valid TS
}

/**
 * Given source and the index just past "onApply: async", find the opening
 * brace of the arrow-function body.  Skips the parameter list "(...)".
 */
function findBodyOpen(src, afterAsync) {
  let i = afterAsync;
  // Find opening paren
  while (i < src.length && src[i] !== "(") i++;
  if (i >= src.length) return -1;
  // Skip the parameter list using paren counting
  let depth = 0;
  while (i < src.length) {
    if (src[i] === "(") { depth++; i++; continue; }
    if (src[i] === ")") { depth--; i++; if (depth === 0) break; continue; }
    i++;
  }
  // Skip whitespace and =>
  while (i < src.length && (src[i] === " " || src[i] === "\t" || src[i] === "\r" || src[i] === "\n")) i++;
  if (src[i] === "=" && src[i + 1] === ">") i += 2;
  while (i < src.length && (src[i] === " " || src[i] === "\t" || src[i] === "\r" || src[i] === "\n")) i++;
  return src[i] === "{" ? i : -1;
}

// Pattern to find onApply: async callbacks (including type annotations).
const ONAPPLY_RE = /\bonApply\s*:\s*async\s*(?:<[^>]*>)?\s*\(/g;

// Patterns for the three requirements (checked against the extracted body).
const HAS_MUTATING_FETCH =
  /\bfetch\s*\(/ ;
const HAS_MUTATING_METHOD =
  /\bmethod\s*:\s*["'](POST|PATCH|DELETE|PUT)["']/;
const HAS_ACCEPTED_REF =
  /accepted\[0\]|accepted\[i\]|\.finalValue\b/;
const HAS_OK_CHECK =
  /\bif\s*\(.*\.ok\b|!.*\.ok\b/;
const HAS_THROW =
  /\bthrow\b/;

const violations = [];

for (const file of walk(SRC)) {
  if (EXCLUDED.has(file)) continue;

  const src = readFileSync(file, "utf8");
  ONAPPLY_RE.lastIndex = 0;
  let m;

  while ((m = ONAPPLY_RE.exec(src)) !== null) {
    const bodyOpen = findBodyOpen(src, m.index + m[0].length - 1); // -1 to include the (
    if (bodyOpen === -1) continue;

    const body = extractBody(src, bodyOpen);
    if (!body) continue;

    // Only flag callbacks that make a mutating fetch call.
    if (!HAS_MUTATING_FETCH.test(body) || !HAS_MUTATING_METHOD.test(body)) continue;

    const line = src.slice(0, m.index).split("\n").length;
    const relFile = file.replace(ROOT + "/", "");

    const missing = [];
    if (!HAS_ACCEPTED_REF.test(body))
      missing.push("(a) must reference accepted[0] or .finalValue");
    if (!HAS_OK_CHECK.test(body))
      missing.push("(b) must check res.ok / patchRes.ok / applyRes.ok");
    if (!HAS_THROW.test(body))
      missing.push("(c) must throw on failure");

    if (missing.length > 0) {
      violations.push({ file: relFile, line, missing });
    }
  }
}

if (violations.length === 0) {
  console.log("✓ lint-ai-review-modal [TIM-2926]: all onApply fetch handlers conform.");
  process.exit(0);
}

console.error(
  `\n✗ lint-ai-review-modal [TIM-2926]: ${violations.length} onApply callback(s) violate the Accept-handler contract\n`
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  for (const msg of v.missing) console.error(`    ✗ ${msg}`);
  console.error();
}
console.error("Rule [TIM-2926]: onApply callbacks that call a mutating endpoint must:");
console.error("  (a) read accepted[0] or .finalValue — don't ignore what the user approved");
console.error("  (b) check res.ok — don't swallow server errors");
console.error("  (c) throw on failure — surface errors to the modal error state\n");
process.exit(1);
