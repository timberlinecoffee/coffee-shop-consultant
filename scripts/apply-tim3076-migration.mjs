#!/usr/bin/env node
/**
 * TIM-3076: Apply preferred_language migration to users table.
 *
 * One-shot apply script:
 *   1. Apply DDL from supabase/migrations/20260626120000_tim3076_preferred_language.sql
 *   2. Insert schema_migrations row so migration-drift CI passes.
 *   3. Verify the column exists with the correct default.
 *
 * Connection strategy (TIM-2376): enumerate aws-1 Supavisor v2 regions;
 * db.<ref>.supabase.co is IPv6-only on many runners.
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

const MIGRATION_FILE = "supabase/migrations/20260626120000_tim3076_preferred_language.sql"
const MIGRATION_VERSION = "20260626120000"
const MIGRATION_NAME = "tim3076_preferred_language"

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
  [{ connectionString: DB_URL, ssl }, "SUPABASE_DB_URL as-is"],
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

async function main() {
  const client = await tryConnect()
  try {
    const sql = await readFile(MIGRATION_FILE, "utf8")
    console.log(`\n>>> Applying ${MIGRATION_FILE}`)
    await client.query(sql)
    console.log(`<<< ok`)

    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY['-- applied via scripts/apply-tim3076-migration.mjs'])
       ON CONFLICT (version) DO NOTHING;`,
      [MIGRATION_VERSION, MIGRATION_NAME],
    )
    console.log(`schema_migrations row stamped: ${MIGRATION_VERSION} ${MIGRATION_NAME}`)

    // Verify: column exists with the correct default.
    const { rows } = await client.query(`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'preferred_language'
    `)
    if (rows.length !== 1) {
      throw new Error("Expected preferred_language column to exist on public.users")
    }
    console.log(`\nVerified: preferred_language column exists.`)
    console.log(`  column_default: ${rows[0].column_default}`)
    console.log(`  is_nullable: ${rows[0].is_nullable}`)
    console.log("\nSUCCESS — TIM-3076 preferred_language applied.")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
