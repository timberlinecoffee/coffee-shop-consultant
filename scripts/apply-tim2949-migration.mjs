#!/usr/bin/env node
/**
 * TIM-2949: Apply menu_item_photo migration to prod.
 *   1. Connect via Supavisor v2 pooler (TIM-2376 region enumeration).
 *   2. Capture before-state: photo_path column existence, bucket existence,
 *      storage.objects policy count for 'menu-item-photos'.
 *   3. Apply DDL from supabase/migrations/20260623040959_tim2949_menu_item_photo.sql.
 *   4. Stamp schema_migrations row so migration-drift CI passes.
 *   5. Verify after-state: column present, bucket exists & is private, 4 policies.
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
const MIGRATION_FILE = "supabase/migrations/20260623040959_tim2949_menu_item_photo.sql"
const MIGRATION_VERSION = "20260623040959"
const MIGRATION_NAME = "tim2949_menu_item_photo"
const BUCKET = "menu-item-photos"

const AWS1_REGIONS = [
  "us-east-1", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-west-3",
  "eu-central-1", "eu-central-2", "eu-north-1",
  "ap-northeast-1", "ap-northeast-2", "ap-south-1",
  "ap-southeast-1", "ap-southeast-2",
  "sa-east-1", "ca-central-1", "me-central-1",
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

async function snapshot(client) {
  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='menu_items' AND column_name='photo_path'`,
  )
  const { rows: buckets } = await client.query(
    `SELECT id, public, file_size_limit FROM storage.buckets WHERE id=$1`,
    [BUCKET],
  )
  const { rows: pols } = await client.query(
    `SELECT policyname FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'menu_item_photos_%'`,
  )
  return {
    has_photo_path: cols.length > 0,
    bucket: buckets[0] ?? null,
    policies: pols.map((p) => p.policyname).sort(),
  }
}

async function main() {
  const client = await tryConnect()
  try {
    const before = await snapshot(client)
    console.log("\nBefore:", JSON.stringify(before, null, 2))

    const sql = await readFile(MIGRATION_FILE, "utf8")
    console.log(`\n>>> Applying ${MIGRATION_FILE}`)
    await client.query(sql)
    console.log(`<<< ok`)

    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY['-- applied via scripts/apply-tim2949-migration.mjs'])
       ON CONFLICT (version) DO NOTHING;`,
      [MIGRATION_VERSION, MIGRATION_NAME],
    )
    console.log(`schema_migrations row stamped: ${MIGRATION_VERSION} ${MIGRATION_NAME}`)

    const after = await snapshot(client)
    console.log("\nAfter:", JSON.stringify(after, null, 2))

    if (!after.has_photo_path) throw new Error("menu_items.photo_path missing")
    if (!after.bucket) throw new Error(`Bucket ${BUCKET} not created`)
    if (after.bucket.public !== false) throw new Error(`Bucket ${BUCKET} should be private`)
    const expected = [
      "menu_item_photos_delete",
      "menu_item_photos_insert",
      "menu_item_photos_select",
      "menu_item_photos_update",
    ]
    for (const p of expected) {
      if (!after.policies.includes(p)) throw new Error(`Missing policy: ${p}`)
    }

    console.log("\nVerified: photo_path column + private bucket + 4 plan-scoped policies.")
    console.log("SUCCESS — TIM-2949 menu_item_photo applied.")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
