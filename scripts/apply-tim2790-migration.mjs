#!/usr/bin/env node
/**
 * TIM-2790: Flip users.ui_revamp_v2 DEFAULT from false back to true.
 *
 * One-shot apply script:
 *   1. Connect via Supavisor v2 pooler (TIM-2376 region enumeration).
 *   2. Capture before-state: column default + counts of true/false rows.
 *   3. Apply DDL from supabase/migrations/20260621120000_tim2790_ui_revamp_v2_default_true.sql.
 *      DDL-only — no UPDATE. Explicit opt-outs from TIM-2598 stay false.
 *   4. Stamp schema_migrations row so migration-drift CI passes.
 *   5. Verify after-state: column default == true, existing row counts unchanged.
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

const MIGRATION_FILE = "supabase/migrations/20260621120000_tim2790_ui_revamp_v2_default_true.sql"
const MIGRATION_VERSION = "20260621120000"
const MIGRATION_NAME = "tim2790_ui_revamp_v2_default_true"

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

async function readDefault(client) {
  const { rows } = await client.query(
    `SELECT column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='users' AND column_name='ui_revamp_v2'`,
  )
  return rows[0]?.column_default ?? null
}

async function readCounts(client) {
  const { rows } = await client.query(
    `SELECT
       count(*) FILTER (WHERE ui_revamp_v2 IS TRUE)::int  AS true_count,
       count(*) FILTER (WHERE ui_revamp_v2 IS FALSE)::int AS false_count,
       count(*)::int                                       AS total_count
     FROM public.users`,
  )
  return rows[0]
}

async function main() {
  const client = await tryConnect()
  try {
    const beforeDefault = await readDefault(client)
    const beforeCounts = await readCounts(client)
    console.log(`\nBefore: column_default=${beforeDefault}`)
    console.log(`Before: ${JSON.stringify(beforeCounts)}`)

    const sql = await readFile(MIGRATION_FILE, "utf8")
    console.log(`\n>>> Applying ${MIGRATION_FILE}`)
    await client.query(sql)
    console.log(`<<< ok`)

    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY['-- applied via scripts/apply-tim2790-migration.mjs'])
       ON CONFLICT (version) DO NOTHING;`,
      [MIGRATION_VERSION, MIGRATION_NAME],
    )
    console.log(`schema_migrations row stamped: ${MIGRATION_VERSION} ${MIGRATION_NAME}`)

    const afterDefault = await readDefault(client)
    const afterCounts = await readCounts(client)
    console.log(`\nAfter:  column_default=${afterDefault}`)
    console.log(`After:  ${JSON.stringify(afterCounts)}`)

    if (afterDefault !== "true") {
      throw new Error(`Expected column_default='true', got ${afterDefault}`)
    }
    if (
      afterCounts.true_count !== beforeCounts.true_count ||
      afterCounts.false_count !== beforeCounts.false_count ||
      afterCounts.total_count !== beforeCounts.total_count
    ) {
      throw new Error(
        `Row counts changed — migration should be DDL-only. Before=${JSON.stringify(beforeCounts)} After=${JSON.stringify(afterCounts)}`,
      )
    }
    console.log("\nVerified: DEFAULT=true, no existing rows touched.")
    console.log("SUCCESS — TIM-2790 ui_revamp_v2 default true applied.")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
