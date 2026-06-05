#!/usr/bin/env node
/**
 * TIM-2369: Apply office_hours_sessions migration to production Supabase.
 *
 *   1. Read the canonical SQL from supabase/migrations/20260605212620_tim2369_office_hours_sessions.sql
 *   2. Enumerate Supavisor v2 pooler regions (aws-1-*) — TIM-2376 confirmed
 *      `ltmcttjftxzpgynhnrpg` lives in aws-1-us-east-1; the other regions are
 *      defense-in-depth in case the project moves.
 *   3. Wrap DDL + seed + INSERT into supabase_migrations.schema_migrations in
 *      one transaction so the migration-drift CI passes (TIM-2376 GOTCHA:
 *      schema_migrations row must be inserted manually when bypassing MCP).
 *   4. Verify the table + seed row exist before exiting 0.
 *
 * Env: SUPABASE_DB_URL  full PostgreSQL connection string (Supavisor v2 pooler)
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { setDefaultResultOrder } from "dns/promises";

setDefaultResultOrder("ipv4first");

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260605212620_tim2369_office_hours_sessions.sql"
);
const VERSION = "20260605212620";
const NAME = "tim2369_office_hours_sessions";

const REF = "ltmcttjftxzpgynhnrpg";
const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ca-central-1", "sa-east-1", "eu-west-1", "eu-west-2",
  "eu-west-3", "eu-central-1", "eu-central-2", "eu-north-1",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
];

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("FATAL: SUPABASE_DB_URL is not set");
  process.exit(1);
}

let parsedPassword = "";
try {
  parsedPassword = new URL(DB_URL).password;
} catch (e) {
  console.error(`SUPABASE_DB_URL parse failed: ${e.message}`);
  process.exit(1);
}

const ssl = { rejectUnauthorized: false };

async function tryConnect(config, label) {
  const c = new Client(config);
  try {
    await c.connect();
    console.log(`✓ Connected via ${label}`);
    return c;
  } catch (err) {
    console.log(`  ${label} failed: ${err.message}`);
    try { await c.end(); } catch {}
    return null;
  }
}

let client = null;

// 1. Try the user-supplied URL as-is first.
client = await tryConnect({ connectionString: DB_URL, ssl }, "SUPABASE_DB_URL as-is");

// 2. Fall back to enumerating aws-1 Supavisor v2 endpoints.
if (!client) {
  for (const region of REGIONS) {
    const cfg = {
      user: `postgres.${REF}`,
      password: parsedPassword,
      host: `aws-1-${region}.pooler.supabase.com`,
      port: 5432,
      database: "postgres",
      ssl,
    };
    client = await tryConnect(cfg, `Supavisor v2 aws-1-${region}`);
    if (client) break;
  }
}

if (!client) {
  console.error("FATAL: all connection attempts failed.");
  process.exit(1);
}

const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

try {
  await client.query("BEGIN");

  console.log("\n── Step 1: Apply DDL + seed ─────────────────────────────────");
  await client.query(migrationSql);
  console.log("  ✓ DDL + seed applied");

  console.log("\n── Step 2: Record in schema_migrations ──────────────────────");
  // statements column on schema_migrations is text[]; one element is fine.
  // INSERT ... ON CONFLICT DO NOTHING keeps the script idempotent.
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ($1, $2, ARRAY[$3]::text[])
     ON CONFLICT (version) DO NOTHING`,
    [VERSION, NAME, migrationSql]
  );
  console.log(`  ✓ schema_migrations row inserted (version=${VERSION})`);

  await client.query("COMMIT");
  console.log("\n  ✓ Transaction committed.\n");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Apply failed — transaction rolled back.");
  console.error(err.message);
  process.exit(1);
}

try {
  console.log("── Step 3: Verify table + RLS + seed row ────────────────────");

  const table = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'office_hours_sessions'`
  );
  if (table.rowCount !== 1) throw new Error("office_hours_sessions table missing");
  console.log("  ✓ office_hours_sessions exists");

  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'office_hours_sessions'
      ORDER BY ordinal_position`
  );
  console.log("  Columns:");
  for (const c of cols.rows) {
    console.log(`    - ${c.column_name} ${c.data_type} ${c.is_nullable === "NO" ? "NOT NULL" : "NULL"}`);
  }

  const rls = await client.query(
    `SELECT relrowsecurity FROM pg_class
      WHERE oid = 'public.office_hours_sessions'::regclass`
  );
  if (!rls.rows[0]?.relrowsecurity) throw new Error("RLS not enabled");
  console.log("  ✓ RLS enabled");

  const policies = await client.query(
    `SELECT polname, cmd FROM pg_policy
       JOIN pg_class c ON c.oid = pg_policy.polrelid
      WHERE c.relname = 'office_hours_sessions'`
  );
  if (policies.rowCount === 0) throw new Error("no policies on office_hours_sessions");
  console.log(`  ✓ ${policies.rowCount} polic${policies.rowCount === 1 ? "y" : "ies"}:`);
  for (const p of policies.rows) console.log(`    - ${p.polname} (cmd=${p.cmd})`);

  const isPro = await client.query(
    `SELECT 1 FROM pg_proc WHERE proname = 'is_pro' AND pronamespace = 'public'::regnamespace`
  );
  if (isPro.rowCount !== 1) throw new Error("public.is_pro(uuid) missing");
  console.log("  ✓ public.is_pro(uuid) created");

  const seed = await client.query(
    `SELECT id, title, scheduled_at, meet_link
       FROM public.office_hours_sessions
      WHERE scheduled_at = '2026-06-09T16:00:00Z'::timestamptz`
  );
  if (seed.rowCount !== 1) throw new Error("seed row missing");
  console.log("  ✓ seed row:");
  console.log(`    id=${seed.rows[0].id}`);
  console.log(`    title="${seed.rows[0].title}"`);
  console.log(`    scheduled_at=${seed.rows[0].scheduled_at.toISOString()}`);
  console.log(`    meet_link=${seed.rows[0].meet_link}`);

  const drift = await client.query(
    `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = $1`,
    [VERSION]
  );
  if (drift.rowCount !== 1 || drift.rows[0].name !== NAME) {
    throw new Error(`schema_migrations row missing/mismatched (got ${JSON.stringify(drift.rows[0])})`);
  }
  console.log(`  ✓ schema_migrations row: version=${drift.rows[0].version} name=${drift.rows[0].name}\n`);

  console.log("✓ TIM-2369 migration applied & verified.\n");
} finally {
  await client.end();
}
