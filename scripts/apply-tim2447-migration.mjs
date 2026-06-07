#!/usr/bin/env node
/**
 * TIM-2447: Apply Benchmarking Phase 0 schema migration + static seeds.
 *
 * One-shot apply script:
 *   1. Apply DDL from supabase/migrations/20260607193721_tim2447_benchmarks_reference.sql (idempotent CREATE IF NOT EXISTS).
 *   2. Apply benchmark_metrics seed (idempotent ON CONFLICT).
 *   3. Apply benchmark_cohorts seed.
 *   4. Apply benchmark_best_practices seed.
 *   5. Insert schema_migrations row so migration-drift CI passes (TIM-2376 GOTCHA).
 *   6. Verify counts.
 *
 * Connection strategy (TIM-2376): the project ref ltmcttjftxzpgynhnrpg is in
 * aws-1-us-east-1. Supavisor v2 is the only IPv4-reachable path from GH
 * runners; aws-0-* (Supavisor v1) returns tenant-not-found, db.<ref>.supabase.co
 * is IPv6-only. We enumerate aws-1 regions in case the project ever moves.
 *
 * Env: SUPABASE_DB_URL — full connection string for the prod database.
 */

import pg from "pg"
import { readFile } from "node:fs/promises"
import { setDefaultResultOrder } from "node:dns/promises"

setDefaultResultOrder("ipv4first")

const { Client } = pg

const DB_URL = process.env.SUPABASE_DB_URL
if (!DB_URL) {
  console.error("FATAL: SUPABASE_DB_URL is not set")
  process.exit(1)
}

const REF = "ltmcttjftxzpgynhnrpg"

const MIGRATION_FILE = "supabase/migrations/20260607193721_tim2447_benchmarks_reference.sql"
const MIGRATION_VERSION = "20260607193721"
const MIGRATION_NAME = "tim2447_benchmarks_reference"

const SEED_FILES = [
  "supabase/seeds/tim2447_benchmark_metrics_seed.sql",
  "supabase/seeds/tim2447_benchmark_cohorts_seed.sql",
  "supabase/seeds/tim2447_best_practices_seed.sql",
]

const AWS1_REGIONS = [
  "us-east-1",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "sa-east-1",
  "ca-central-1",
  "me-central-1",
]

let password = ""
try {
  password = new URL(DB_URL).password
} catch (e) {
  console.error("FATAL: could not parse SUPABASE_DB_URL:", e.message)
  process.exit(1)
}

const ssl = { rejectUnauthorized: false }
const base = { database: "postgres", ssl, user: `postgres.${REF}`, password }

const configs = [
  // Try the supplied URL first; honor whatever the secret holds.
  [{ connectionString: DB_URL, ssl }, "SUPABASE_DB_URL as-is"],
  // Then enumerate Supavisor v2 (aws-1) regions.
  ...AWS1_REGIONS.map((r) => [
    { ...base, host: `aws-1-${r}.pooler.supabase.com`, port: 5432 },
    `Supavisor v2 ${r}`,
  ]),
]

async function tryConnect() {
  for (const [config, label] of configs) {
    const c = new Client(config)
    try {
      await c.connect()
      console.log(`Connected via ${label}`)
      return c
    } catch (err) {
      console.log(`  ${label}: ${err.code ?? err.message}`)
      try { await c.end() } catch {}
    }
  }
  throw new Error("Could not connect via any pooler region")
}

async function execFile(client, path, label) {
  const sql = await readFile(path, "utf8")
  console.log(`\n>>> ${label} (${path})`)
  await client.query(sql)
  console.log(`<<< ok`)
}

async function recordMigration(client) {
  // Mirror the pattern from TIM-2369: write the schema_migrations row in the
  // same transaction or as a separate idempotent statement so the
  // migration-drift CI check stays green.
  const sql = `
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES ($1, $2, ARRAY['-- applied via scripts/apply-tim2447-migration.mjs'])
    ON CONFLICT (version) DO NOTHING;
  `
  await client.query(sql, [MIGRATION_VERSION, MIGRATION_NAME])
  console.log(`schema_migrations row stamped: ${MIGRATION_VERSION} ${MIGRATION_NAME}`)
}

async function verify(client) {
  console.log("\n=== Verify ===")
  const tables = [
    "benchmark_metrics",
    "benchmark_cohorts",
    "benchmark_reference_values",
    "benchmark_best_practices",
    "benchmark_extraction_runs",
  ]
  for (const t of tables) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM public.${t}`,
    )
    console.log(`  public.${t}: ${rows[0].n} row(s)`)
  }
  // RLS sanity check — every table should have rowsecurity=true.
  const { rows: rls } = await client.query(
    `SELECT relname, relrowsecurity
       FROM pg_class
      WHERE relname = ANY($1::text[])
      ORDER BY relname`,
    [tables],
  )
  for (const r of rls) {
    if (!r.relrowsecurity) {
      throw new Error(`RLS not enabled on public.${r.relname}`)
    }
  }
  console.log("  RLS enabled on all 5 tables.")
}

async function main() {
  const client = await tryConnect()
  try {
    await execFile(client, MIGRATION_FILE, "Apply DDL")
    for (const seed of SEED_FILES) {
      await execFile(client, seed, "Apply seed")
    }
    await recordMigration(client)
    await verify(client)
    console.log("\nSUCCESS — TIM-2447 schema + seeds applied.")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
