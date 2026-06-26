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
import { setDefaultResultOrder } from "node:dns/promises";
import pg from "pg";

// Force IPv4 resolution to avoid ENETUNREACH on IPv6-first CI runners.
setDefaultResultOrder("ipv4first");

const { Client } = pg;

const REF = "ltmcttjftxzpgynhnrpg";
const AWS1_REGIONS = [
  "us-east-1", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2", "eu-north-1",
  "ap-northeast-1", "ap-northeast-2", "ap-south-1", "ap-southeast-1", "ap-southeast-2",
  "sa-east-1", "ca-central-1", "me-central-1",
];

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

async function connectWithFallback(dbUrl) {
  let password = "";
  try {
    password = new URL(dbUrl).password;
  } catch {
    throw new Error("Could not parse SUPABASE_DB_URL");
  }
  const ssl = { rejectUnauthorized: false };
  const base = { database: "postgres", ssl, user: `postgres.${REF}`, password };
  const configs = [
    [{ connectionString: dbUrl, ssl }, "SUPABASE_DB_URL as-is"],
    ...AWS1_REGIONS.map((r) => [
      { ...base, host: `aws-1-${r}.pooler.supabase.com`, port: 5432 },
      `Supavisor v2 ${r}`,
    ]),
  ];
  for (const [config, label] of configs) {
    const c = new Client(config);
    try {
      await c.connect();
      console.log(`  Connected via ${label}`);
      return c;
    } catch (err) {
      console.log(`  ${label}: ${err.code ?? err.message}`);
      try { await c.end(); } catch {}
    }
  }
  throw new Error("Could not connect via any pooler region");
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

  const client = await connectWithFallback(dbUrl);

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
