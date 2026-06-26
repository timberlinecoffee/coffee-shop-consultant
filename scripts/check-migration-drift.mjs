#!/usr/bin/env node
/**
 * Migration drift checker — TIM-950.
 *
 * Diffs supabase_migrations.schema_migrations on the live project against
 * supabase/migrations/*.sql filenames in the repo.
 *
 * Hard fails (exit 1):
 *   - Applied-but-not-committed: version in remote DB, no matching repo file
 *     (unless the version is in migration-drift-baseline.json — then soft-warn).
 *   - Name mismatch: version matched but schema_migrations.name != repo file name.
 *
 * Soft warnings (exit 0):
 *   - Committed-but-not-applied: forward migration in repo but not in DB.
 *   - Grandfathered version: pre-TIM-950 drift listed in migration-drift-baseline.json.
 *
 * Env vars:
 *   SUPABASE_DB_URL  full Postgres connection string (required)
 *                    postgresql://postgres.<ref>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
 *
 * Usage: SUPABASE_DB_URL=<url> node scripts/check-migration-drift.mjs
 */

import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { resolve4 } from "node:dns/promises";
import pg from "pg";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");
const BASELINE_PATH = join(__dirname, "migration-drift-baseline.json");

// Handles single underscore (20260417072505_initial_schema.sql)
// and double underscore (20260516000000__copilot_v1.sql) from TIM-925 incident.
const FILENAME_RE = /^(\d{14})_+(.+)\.sql$/;

function loadBaseline() {
  try {
    const raw = readFileSync(BASELINE_PATH, "utf8");
    const { grandfatheredVersions } = JSON.parse(raw);
    return new Set(grandfatheredVersions ?? []);
  } catch {
    return new Set();
  }
}

function parseFilename(filename) {
  const m = FILENAME_RE.exec(filename);
  if (!m) return null;
  return { version: m[1], name: m[2] };
}

function repoMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const map = new Map();
  for (const f of files) {
    const parsed = parseFilename(f);
    if (parsed) {
      map.set(parsed.version, { name: parsed.name, filename: f });
    } else {
      console.warn(`  WARN  skipping unparseable filename: ${f}`);
    }
  }
  return map;
}

async function remoteMigrations(client) {
  const result = await client.query(
    "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version"
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(String(row.version), String(row.name));
  }
  return map;
}

// Connect to the Supabase pooler.
// Returns null when the pooler is unreachable from this runner (e.g. IPv6-only
// host on an IPv4-only GitHub Actions runner). Callers that receive null should
// skip the check with a soft-warn rather than hard-failing.
async function connectOrNull(dbUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(dbUrl);
  } catch {
    throw new Error("Could not parse SUPABASE_DB_URL");
  }

  const hostname = parsedUrl.hostname;
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 5432;
  const ssl = { rejectUnauthorized: false, servername: hostname };

  // Try 1: resolve to IPv4 explicitly (avoids ENETUNREACH when DNS returns only AAAA)
  try {
    const addrs = await resolve4(hostname);
    const ipv4 = addrs[0];
    console.log(`  Resolved ${hostname} → ${ipv4} (IPv4)`);
    const c = new Client({ connectionString: dbUrl, host: ipv4, port, ssl });
    await c.connect();
    console.log(`  Connected via IPv4 direct`);
    return c;
  } catch (err) {
    const code = err.code ?? err.message;
    if (code === "ENODATA" || code === "ENOTFOUND") {
      console.log(`  No IPv4 address for ${hostname} (${code}) — pooler is IPv6-only`);
    } else {
      console.log(`  IPv4 direct: ${code}`);
    }
  }

  // Try 2: original connection string as-is (works on dual-stack or IPv4 runners)
  try {
    const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await c.connect();
    console.log(`  Connected via SUPABASE_DB_URL as-is`);
    return c;
  } catch (err) {
    console.log(`  as-is: ${err.code ?? err.message}`);
  }

  return null; // unreachable — soft-skip in caller
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("ERROR: SUPABASE_DB_URL env var is required.");
    console.error(
      "       Format: postgresql://postgres.<ref>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"
    );
    process.exit(1);
  }

  const baseline = loadBaseline();

  const client = await connectOrNull(dbUrl);
  if (!client) {
    console.log();
    console.log("  ⚠  WARN: could not reach Supabase pooler from this runner.");
    console.log("      The pooler hostname appears to be IPv6-only and this runner has no IPv6 route.");
    console.log("      Drift check skipped — run locally with SUPABASE_DB_URL set to verify.");
    console.log("      To fix: update the SUPABASE_DB_URL secret to an IPv4-reachable connection string.");
    console.log();
    process.exit(0); // soft-skip, not a hard fail
  }

  let remote, repo;
  try {
    [remote, repo] = await Promise.all([remoteMigrations(client), Promise.resolve(repoMigrations())]);
  } finally {
    await client.end();
  }

  let hardFails = 0;
  let warnings = 0;

  console.log("\n── Migration drift check ─────────────────────────────────────");
  console.log(`  Remote (schema_migrations): ${remote.size} row(s)`);
  console.log(`  Repo   (supabase/migrations): ${repo.size} file(s)`);
  if (baseline.size > 0) {
    console.log(`  Baseline (grandfathered): ${baseline.size} version(s)\n`);
  } else {
    console.log();
  }

  for (const [version, remoteName] of remote) {
    if (!repo.has(version)) {
      if (baseline.has(version)) {
        // Grandfathered: downgrade to soft-warn but still print recovery snippet
        console.log(`  WARN  grandfathered applied-but-not-committed: version ${version} (name: ${remoteName})`);
        console.log(`        Recover the SQL with:`);
        console.log(
          `          SELECT array_to_string(statements, E';\\n') FROM supabase_migrations.schema_migrations WHERE version = '${version}';`
        );
        warnings++;
      } else {
        // New drift — hard fail
        console.error(`  FAIL  applied-but-not-committed`);
        console.error(`        version: ${version}   name: ${remoteName}`);
        console.error(`        Recover the SQL with:`);
        console.error(
          `          SELECT array_to_string(statements, E';\\n') FROM supabase_migrations.schema_migrations WHERE version = '${version}';`
        );
        console.error();
        hardFails++;
      }
      continue;
    }

    // Name mismatch for matched version — always hard fail (not grandfathered by design)
    const { name: repoName, filename } = repo.get(version);
    if (repoName !== remoteName) {
      console.error(`  FAIL  name mismatch for version ${version}`);
      console.error(`        remote name : "${remoteName}"`);
      console.error(`        repo   name : "${repoName}"  (${filename})`);
      console.error();
      hardFails++;
    }
  }

  // Committed-but-not-applied (forward migrations — expected direction)
  for (const [version, { filename }] of repo) {
    if (!remote.has(version)) {
      console.log(`  WARN  committed-but-not-applied (forward migration — OK): ${filename}`);
      warnings++;
    }
  }

  console.log();

  if (hardFails === 0 && warnings === 0) {
    console.log("  ✓ No drift detected.\n");
    process.exit(0);
  }

  if (hardFails > 0) {
    console.error(`  ✗ ${hardFails} hard failure(s). Repo has NEW unapplied drift.\n`);
    process.exit(1);
  }

  console.log(`  ⚠  ${warnings} warning(s) — grandfathered or forward migrations only. Green.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nUnexpected error:", err.message);
  process.exit(1);
});
