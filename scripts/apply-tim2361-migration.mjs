#!/usr/bin/env node
/**
 * TIM-2361: Apply ai_turn_metrics migration to production Supabase.
 *
 *   1. Read the canonical SQL from
 *      supabase/migrations/20260605215000_tim2361_ai_turn_metrics.sql
 *   2. Enumerate Supavisor v2 pooler regions (aws-1-*) — TIM-2376 confirmed
 *      ltmcttjftxzpgynhnrpg lives in aws-1-us-east-1; the other regions are
 *      defense-in-depth in case the project moves.
 *   3. Wrap DDL + INSERT into supabase_migrations.schema_migrations in one
 *      transaction so migration-drift CI passes (TIM-2376 GOTCHA:
 *      schema_migrations row must be inserted manually when bypassing MCP).
 *   4. Verify the table + RLS + policy + indexes exist before exiting 0.
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
  "20260605215000_tim2361_ai_turn_metrics.sql"
);
const VERSION = "20260605215000";
const NAME = "tim2361_ai_turn_metrics";

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

client = await tryConnect({ connectionString: DB_URL, ssl }, "SUPABASE_DB_URL as-is");

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

  console.log("\n── Step 1: Apply DDL ────────────────────────────────────────");
  await client.query(migrationSql);
  console.log("  ✓ DDL applied");

  console.log("\n── Step 2: Record in schema_migrations ──────────────────────");
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
  console.log("── Step 3: Verify table + RLS + indexes ─────────────────────");

  const table = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ai_turn_metrics'`
  );
  if (table.rowCount !== 1) throw new Error("ai_turn_metrics table missing");
  console.log("  ✓ ai_turn_metrics exists");

  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ai_turn_metrics'
      ORDER BY ordinal_position`
  );
  console.log("  Columns:");
  for (const c of cols.rows) {
    console.log(`    - ${c.column_name} ${c.data_type} ${c.is_nullable === "NO" ? "NOT NULL" : "NULL"}`);
  }

  const rls = await client.query(
    `SELECT relrowsecurity FROM pg_class
      WHERE oid = 'public.ai_turn_metrics'::regclass`
  );
  if (!rls.rows[0]?.relrowsecurity) throw new Error("RLS not enabled");
  console.log("  ✓ RLS enabled");

  // TIM-2369 GOTCHA: pg_policy column is `polcmd` NOT `cmd`.
  const policies = await client.query(
    `SELECT polname, polcmd FROM pg_policy
       JOIN pg_class c ON c.oid = pg_policy.polrelid
      WHERE c.relname = 'ai_turn_metrics'`
  );
  if (policies.rowCount === 0) throw new Error("no policies on ai_turn_metrics");
  console.log(`  ✓ ${policies.rowCount} polic${policies.rowCount === 1 ? "y" : "ies"}:`);
  for (const p of policies.rows) console.log(`    - ${p.polname} (polcmd=${p.polcmd})`);

  const indexes = await client.query(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'ai_turn_metrics'
      ORDER BY indexname`
  );
  console.log(`  ✓ ${indexes.rowCount} indexes:`);
  for (const i of indexes.rows) console.log(`    - ${i.indexname}`);

  const drift = await client.query(
    `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = $1`,
    [VERSION]
  );
  if (drift.rowCount !== 1 || drift.rows[0].name !== NAME) {
    throw new Error(`schema_migrations row missing/mismatched (got ${JSON.stringify(drift.rows[0])})`);
  }
  console.log(`  ✓ schema_migrations row: version=${drift.rows[0].version} name=${drift.rows[0].name}\n`);

  console.log("✓ TIM-2361 migration applied & verified.\n");
} finally {
  await client.end();
}
