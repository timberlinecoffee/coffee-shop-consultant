#!/usr/bin/env node
/**
 * TIM-2434: Apply Document Import pipeline migration.
 *
 * One-shot apply script:
 *   1. Check schema_migrations — short-circuit success if already applied.
 *   2. Apply DDL from supabase/migrations/20260607230000_tim2434_document_imports.sql
 *      inside a single transaction.
 *   3. Stamp schema_migrations row so migration-drift CI passes.
 *   4. Verify: tables exist, RLS enabled, storage bucket present, policies attached.
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

const MIGRATION_FILE = "supabase/migrations/20260607230000_tim2434_document_imports.sql"
const MIGRATION_VERSION = "20260607230000"
const MIGRATION_NAME = "tim2434_document_imports"

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

async function alreadyApplied(client) {
  const { rows } = await client.query(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1`,
    [MIGRATION_VERSION],
  )
  return rows.length > 0
}

async function applyMigration(client) {
  const sql = await readFile(MIGRATION_FILE, "utf8")
  console.log(`\n>>> Apply DDL (${MIGRATION_FILE})`)
  await client.query("BEGIN")
  try {
    await client.query(sql)
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY['-- applied via scripts/apply-tim2434-migration.mjs'])
       ON CONFLICT (version) DO NOTHING`,
      [MIGRATION_VERSION, MIGRATION_NAME],
    )
    await client.query("COMMIT")
    console.log("<<< ok (committed)")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  }
}

async function verify(client) {
  console.log("\n=== Verify ===")
  const tables = ["document_imports", "document_import_files"]
  for (const t of tables) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM public.${t}`,
    )
    console.log(`  public.${t}: ${rows[0].n} row(s)`)
  }
  // RLS sanity check — both tables must have rowsecurity=true.
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
  console.log(`  RLS enabled on ${rls.length}/${tables.length} tables.`)
  // Storage bucket present.
  const { rows: buckets } = await client.query(
    `SELECT id, file_size_limit, public FROM storage.buckets WHERE id = 'document-imports'`,
  )
  if (!buckets.length) {
    throw new Error("storage.buckets row 'document-imports' missing")
  }
  if (buckets[0].public) {
    throw new Error("'document-imports' bucket is public — should be private")
  }
  console.log(`  storage.buckets 'document-imports': private, ${buckets[0].file_size_limit} bytes/file`)
  // Policy count sanity — table policies (4 each) + storage policies (4) = 12.
  const { rows: policyRows } = await client.query(
    `SELECT count(*)::int AS n
       FROM pg_policies
      WHERE (schemaname = 'public' AND tablename IN ('document_imports','document_import_files'))
         OR (schemaname = 'storage' AND policyname LIKE 'document_imports_storage_%')`,
  )
  const policyCount = policyRows[0].n
  if (policyCount < 12) {
    throw new Error(`Expected >= 12 policies, found ${policyCount}`)
  }
  console.log(`  pg_policies: ${policyCount} policies attached.`)
}

async function main() {
  const client = await tryConnect()
  try {
    if (await alreadyApplied(client)) {
      console.log(`\nSKIP — ${MIGRATION_VERSION} already in schema_migrations`)
      await verify(client)
      console.log("\nSUCCESS (no-op) — TIM-2434 schema already applied.")
      return
    }
    await applyMigration(client)
    await verify(client)
    console.log("\nSUCCESS — TIM-2434 schema applied.")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
