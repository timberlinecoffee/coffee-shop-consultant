/**
 * TIM-2256: Regression guard — no production Supabase JWTs in source tree.
 *
 * Scans every git-tracked file for HS256 JWTs and fails if any decoded payload
 * contains ref === 'ltmcttjftxzpgynhnrpg' (the prod project ref) OR
 * role === 'service_role' without a corresponding 'test-ref' ref.
 *
 * Run: node --test tests/no-prod-jwt.test.mjs
 * Must fail against the pre-fix tree, pass after.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROD_REF = "ltmcttjftxzpgynhnrpg";
const JWT_RE = /eyJ[A-Za-z0-9+/=_-]+\.eyJ[A-Za-z0-9+/=_-]+\.[A-Za-z0-9+/=_-]+/g;

function decodePayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

test("no production Supabase JWT in git-tracked source files", () => {
  // Use git to find the repo root from wherever the test is invoked
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

  // List all tracked text files (exclude binary blobs: images, fonts, .ico, lock files, etc.)
  const trackedFiles = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot|svg|lock|map)$/.test(f));

  const violations = [];

  for (const relPath of trackedFiles) {
    let content;
    try {
      content = readFileSync(join(repoRoot, relPath), "utf8");
    } catch {
      continue; // binary file read as utf8 will throw — skip
    }

    const matches = content.match(JWT_RE) ?? [];
    for (const token of matches) {
      const payload = decodePayload(token);
      if (!payload) continue;

      const hasProdRef = payload.ref === PROD_REF;
      const hasServiceRole = payload.role === "service_role";

      if (hasProdRef || hasServiceRole) {
        violations.push({
          file: relPath,
          ref: payload.ref,
          role: payload.role,
        });
      }
    }
  }

  assert.deepStrictEqual(
    violations,
    [],
    `Found ${violations.length} production JWT(s) in source:\n` +
      violations.map((v) => `  ${v.file}  ref=${v.ref}  role=${v.role}`).join("\n") +
      "\nReplace with process.env or mintTestJwt() — see TIM-2256.",
  );
});
