#!/usr/bin/env node
/**
 * TIM-3018: Apply business_plan_section_drafts table migration.
 *
 * One-shot apply script:
 *   1. Apply DDL from supabase/migrations/PENDING_tim3018_business_plan_section_drafts.sql
 *   2. Insert schema_migrations row so migration-drift CI passes.
 *   3. Read back the exact version Supabase recorded and print it.
 *   4. Verify the table exists with RLS enabled and correct policies (Rule 1).
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
const MIGRATION_NAME = "tim3018_business_plan_section_drafts"
const MIGRATION_FILE = "supabase/migrations/PENDING_tim3018_business_plan_section_drafts.sql"

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
    // Check if already applied
    const { rows: existing } = await client.query(
      `SELECT version, name FROM supabase_migrations.schema_migrations WHERE name = $1`,
      [MIGRATION_NAME],
    )
    if (existing.length > 0) {
      console.log(`Migration already applied: version=${existing[0].version}`)
      console.log(`\nFile should be committed as: supabase/migrations/${existing[0].version}_${MIGRATION_NAME}.sql`)
      return
    }

    const sql = await readFile(MIGRATION_FILE, "utf8")
    console.log(`\n>>> Applying ${MIGRATION_FILE}`)
    await client.query(sql)
    console.log(`<<< ok`)

    // Generate a timestamp-based version (UTC, YYYYMMDDHHmmss)
    const now = new Date()
    const version = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
      String(now.getUTCHours()).padStart(2, "0"),
      String(now.getUTCMinutes()).padStart(2, "0"),
      String(now.getUTCSeconds()).padStart(2, "0"),
    ].join("")

    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY['-- applied via scripts/apply-tim3018-migration.mjs'])
       ON CONFLICT (version) DO NOTHING;`,
      [version, MIGRATION_NAME],
    )
    console.log(`schema_migrations row stamped: ${version} ${MIGRATION_NAME}`)

    // Read back what was actually recorded
    const { rows: recorded } = await client.query(
      `SELECT version, name FROM supabase_migrations.schema_migrations
       WHERE name = $1`,
      [MIGRATION_NAME],
    )
    const recordedVersion = recorded[0]?.version ?? version
    console.log(`\n>>> Server-recorded version: ${recordedVersion}`)
    console.log(`>>> Commit file as: supabase/migrations/${recordedVersion}_${MIGRATION_NAME}.sql`)

    // Verify: table exists, RLS enabled, 4 policies.
    const { rows: tbl } = await client.query(
      `SELECT relname, relrowsecurity
         FROM pg_class
        WHERE relname = 'business_plan_section_drafts'
          AND relnamespace = 'public'::regnamespace`,
    )
    if (tbl.length !== 1) {
      throw new Error("Expected business_plan_section_drafts table to exist")
    }
    if (!tbl[0].relrowsecurity) {
      throw new Error("Rule 1 violation: RLS must be ENABLED on business_plan_section_drafts")
    }
    const { rows: pol } = await client.query(
      `SELECT count(*)::int AS n FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'business_plan_section_drafts'`,
    )
    if (pol[0].n !== 4) {
      throw new Error(`Rule 1: expected 4 RLS policies, got ${pol[0].n}`)
    }
    const { rows: cnt } = await client.query(
      `SELECT count(*)::int AS n FROM public.business_plan_section_drafts`,
    )
    console.log(`\nVerified: table exists, RLS enabled, ${pol[0].n} policies, ${cnt[0].n} rows.`)
    console.log("\nSUCCESS — TIM-3018 business_plan_section_drafts applied.")
    console.log(`\nACTION REQUIRED: rename PENDING file:`)
    console.log(`  mv supabase/migrations/PENDING_tim3018_business_plan_section_drafts.sql \\`)
    console.log(`     supabase/migrations/${recordedVersion}_tim3018_business_plan_section_drafts.sql`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
