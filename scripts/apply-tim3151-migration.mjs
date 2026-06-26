#!/usr/bin/env node
/**
 * TIM-3151: Add onboarding_data jsonb column to coffee_shop_plans.
 *
 * One-shot apply script:
 *   1. Connect via Supavisor v2 pooler.
 *   2. Apply DDL from supabase/migrations/20260626000001_tim3151_per_project_onboarding.sql
 *      (idempotent ADD COLUMN IF NOT EXISTS — safe to re-run).
 *   3. Stamp schema_migrations row so migration-drift CI passes.
 *   4. Verify column exists on coffee_shop_plans.
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

const MIGRATION_FILE = "supabase/migrations/20260626000001_tim3151_per_project_onboarding.sql"
const MIGRATION_VERSION = "20260626000001"
const MIGRATION_NAME = "tim3151_per_project_onboarding"

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

async function columnExists(client) {
  const { rows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'coffee_shop_plans'
        AND column_name  = 'onboarding_data'`,
  )
  return rows.length > 0
}

async function main() {
  const client = await tryConnect()
  try {
    const before = await columnExists(client)
    console.log(`\nBefore: onboarding_data column exists=${before}`)

    const sql = await readFile(MIGRATION_FILE, "utf8")
    console.log(`\n>>> Applying ${MIGRATION_FILE}`)
    await client.query(sql)
    console.log(`<<< ok`)

    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY['-- applied via scripts/apply-tim3151-migration.mjs'])
       ON CONFLICT (version) DO NOTHING;`,
      [MIGRATION_VERSION, MIGRATION_NAME],
    )
    console.log(`schema_migrations row stamped: ${MIGRATION_VERSION} ${MIGRATION_NAME}`)

    const after = await columnExists(client)
    console.log(`\nAfter: onboarding_data column exists=${after}`)

    if (!after) {
      throw new Error("Column onboarding_data not found after migration — something went wrong")
    }

    console.log("\nSUCCESS — TIM-3151 per-project onboarding column applied.")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
