#!/usr/bin/env node
/**
 * TIM-2993: Backfill users.ui_revamp_v2 = true on every remaining false row.
 *
 * One-shot apply script:
 *   1. Connect via Supavisor v2 pooler (TIM-2376 region enumeration, same as
 *      apply-tim2790-migration.mjs).
 *   2. Capture before-state: true_count / false_count.
 *   3. Apply UPDATE from
 *      supabase/migrations/20260624031500_tim2993_ui_revamp_v2_backfill_true.sql.
 *   4. Stamp schema_migrations row so migration-drift CI passes.
 *   5. Verify after-state: false_count == 0, total_count unchanged, every
 *      previously-false row is now true.
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

const MIGRATION_FILE = "supabase/migrations/20260624031500_tim2993_ui_revamp_v2_backfill_true.sql"
const MIGRATION_VERSION = "20260624031500"
const MIGRATION_NAME = "tim2993_ui_revamp_v2_backfill_true"

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

async function readCounts(client) {
  const { rows } = await client.query(
    `SELECT
       count(*) FILTER (WHERE ui_revamp_v2 IS TRUE)::int  AS true_count,
       count(*) FILTER (WHERE ui_revamp_v2 IS FALSE)::int AS false_count,
       count(*) FILTER (WHERE ui_revamp_v2 IS NULL)::int  AS null_count,
       count(*)::int                                       AS total_count
     FROM public.users`,
  )
  return rows[0]
}

async function main() {
  const client = await tryConnect()
  try {
    const beforeCounts = await readCounts(client)
    console.log(`\nBefore: ${JSON.stringify(beforeCounts)}`)

    const sql = await readFile(MIGRATION_FILE, "utf8")
    console.log(`\n>>> Applying ${MIGRATION_FILE}`)
    await client.query(sql)
    console.log(`<<< ok`)

    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY['-- applied via scripts/apply-tim2993-migration.mjs'])
       ON CONFLICT (version) DO NOTHING;`,
      [MIGRATION_VERSION, MIGRATION_NAME],
    )
    console.log(`schema_migrations row stamped: ${MIGRATION_VERSION} ${MIGRATION_NAME}`)

    const afterCounts = await readCounts(client)
    console.log(`\nAfter:  ${JSON.stringify(afterCounts)}`)

    if (afterCounts.false_count !== 0) {
      throw new Error(`Expected false_count=0 post-backfill, got ${afterCounts.false_count}`)
    }
    if (afterCounts.total_count !== beforeCounts.total_count) {
      throw new Error(
        `Row count changed — backfill should NOT add or drop rows. Before=${beforeCounts.total_count} After=${afterCounts.total_count}`,
      )
    }
    if (afterCounts.true_count !== beforeCounts.true_count + beforeCounts.false_count) {
      throw new Error(
        `true_count delta mismatch — expected before.true(${beforeCounts.true_count}) + before.false(${beforeCounts.false_count}) = ${beforeCounts.true_count + beforeCounts.false_count}, got ${afterCounts.true_count}`,
      )
    }
    console.log(
      `\nVerified: ${beforeCounts.false_count} rows flipped false→true, ${beforeCounts.true_count} already-true rows untouched, total ${afterCounts.total_count}.`,
    )
    console.log("SUCCESS — TIM-2993 ui_revamp_v2 backfill applied.")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
