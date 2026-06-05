#!/usr/bin/env node
/**
 * TIM-2376: Apply multi-project schema migration to production.
 *
 * Steps:
 *  1. Read supabase/migrations/20260605152347_multi_project_capability.sql verbatim
 *  2. Connect to production Postgres (SUPABASE_DB_URL)
 *  3. BEGIN, run SQL, register row in supabase_migrations.schema_migrations, COMMIT
 *  4. Verify columns exist, index exists, backfill count = 0
 *
 * Env: SUPABASE_DB_URL  full PostgreSQL connection string (GitHub Actions secret)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { setDefaultResultOrder, resolve4 } from "dns/promises";

setDefaultResultOrder("ipv4first");

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_VERSION = "20260605152347";
const MIGRATION_NAME = "multi_project_capability";
const MIGRATION_FILE = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  `${MIGRATION_VERSION}_${MIGRATION_NAME}.sql`,
);

const REF = "ltmcttjftxzpgynhnrpg";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("FATAL: SUPABASE_DB_URL is not set");
  process.exit(1);
}

const sqlBody = readFileSync(MIGRATION_FILE, "utf8");
console.log(`Loaded ${MIGRATION_FILE} (${sqlBody.length} bytes)`);

let parsedUser = "postgres", parsedPassword = "", parsedHost = "";
try {
  const url = new URL(DB_URL);
  parsedUser = url.username || "postgres";
  parsedPassword = url.password;
  parsedHost = url.hostname;
  console.log(`Parsed: user=${parsedUser} host=${parsedHost}`);
} catch (e) {
  console.log(`URL parse failed: ${e.message}`);
}

let directIPv4 = null;
try {
  const addrs = await resolve4(`db.${REF}.supabase.co`);
  directIPv4 = addrs[0];
  console.log(`db.${REF}.supabase.co → IPv4: ${directIPv4}`);
} catch (e) {
  console.log(`IPv4 lookup failed: ${e.message}`);
}

async function tryConnect(config, label) {
  const c = new Client(config);
  try {
    await c.connect();
    console.log(`Connected via ${label}`);
    return c;
  } catch (err) {
    console.log(`${label} failed: ${err.message}`);
    try { await c.end(); } catch {}
    return null;
  }
}

const ssl = { rejectUnauthorized: false };
const base = { database: "postgres", ssl };

const configs = [
  [{ connectionString: DB_URL, ssl }, "SUPABASE_DB_URL as-is"],
  [{ ...base, user: `postgres.${REF}`, password: parsedPassword, host: "aws-0-us-east-1.pooler.supabase.com", port: 5432 }, "pooler us-east-1 (new username format)"],
  [{ ...base, user: `postgres.${REF}`, password: parsedPassword, host: "aws-0-us-east-2.pooler.supabase.com", port: 5432 }, "pooler us-east-2"],
  [{ ...base, user: "postgres", password: parsedPassword, host: "aws-0-us-east-1.pooler.supabase.com", port: 5432 }, "pooler us-east-1 (old username)"],
  ...(directIPv4 ? [[{ ...base, user: "postgres", password: parsedPassword, host: directIPv4, port: 5432 }, `direct IPv4 ${directIPv4}`]] : []),
];

let client = null;
for (const [cfg, label] of configs) {
  client = await tryConnect(cfg, label);
  if (client) break;
}

if (!client) {
  console.error("FATAL: All connection attempts failed.");
  process.exit(1);
}

async function run() {
  console.log("\n=== Pre-apply: state of target columns ===");
  const preCheck = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'users' AND column_name = 'current_plan_id')
        OR (table_name = 'coffee_shop_plans' AND column_name = 'location_label')
      )
    ORDER BY table_name, column_name;
  `);
  console.log(`Found ${preCheck.rowCount}/2 target columns before apply:`);
  preCheck.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name}`));

  console.log("\n=== Step 1: Apply migration (idempotent) ===");
  await client.query("BEGIN");
  try {
    await client.query(sqlBody);
    console.log("DDL + backfill executed.");

    // Register in supabase_migrations.schema_migrations so migration-drift CI passes.
    const reg = await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY[$3])
       ON CONFLICT (version) DO NOTHING
       RETURNING version, name;`,
      [MIGRATION_VERSION, MIGRATION_NAME, sqlBody],
    );
    if (reg.rowCount > 0) {
      console.log(`Registered schema_migrations row: ${reg.rows[0].version} / ${reg.rows[0].name}`);
    } else {
      console.log(`schema_migrations already has version ${MIGRATION_VERSION} — no-op.`);
    }

    await client.query("COMMIT");
    console.log("Transaction committed.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  console.log("\n=== Step 2: Verify columns exist ===");
  const colCheck = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'users' AND column_name = 'current_plan_id')
        OR (table_name = 'coffee_shop_plans' AND column_name = 'location_label')
      )
    ORDER BY table_name, column_name;
  `);
  console.log(`Columns found: ${colCheck.rowCount} (expected 2)`);
  colCheck.rows.forEach(r =>
    console.log(`  ${r.table_name}.${r.column_name}: ${r.data_type}, nullable=${r.is_nullable}`),
  );
  if (colCheck.rowCount !== 2) {
    console.error("FATAL: Expected 2 columns, got " + colCheck.rowCount);
    process.exit(1);
  }

  console.log("\n=== Step 3: Verify FK on users.current_plan_id ===");
  const fkCheck = await client.query(`
    SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column,
           rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
     AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
     AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'users'
      AND kcu.column_name = 'current_plan_id'
      AND tc.constraint_type = 'FOREIGN KEY';
  `);
  console.log(`FKs on users.current_plan_id: ${fkCheck.rowCount}`);
  fkCheck.rows.forEach(r =>
    console.log(`  ${r.constraint_name}: → ${r.foreign_table}.${r.foreign_column} (ON DELETE ${r.delete_rule})`),
  );

  console.log("\n=== Step 4: Verify index ===");
  const idxCheck = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_coffee_shop_plans_user_created';
  `);
  console.log(`Index found: ${idxCheck.rowCount}/1`);
  idxCheck.rows.forEach(r => console.log(`  ${r.indexname}: ${r.indexdef}`));
  if (idxCheck.rowCount !== 1) {
    console.error("FATAL: Expected 1 index, got " + idxCheck.rowCount);
    process.exit(1);
  }

  console.log("\n=== Step 5: Verify backfill ===");
  const backfill = await client.query(`
    SELECT count(*)::int AS users_without_plan_missing_current_plan_id
    FROM public.users
    WHERE current_plan_id IS NULL
      AND id IN (SELECT DISTINCT user_id FROM public.coffee_shop_plans);
  `);
  console.log(`Users with ≥1 plan but NULL current_plan_id: ${backfill.rows[0].users_without_plan_missing_current_plan_id} (expected 0)`);

  const planCounts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.users) AS total_users,
      (SELECT count(*)::int FROM public.users WHERE current_plan_id IS NOT NULL) AS users_with_current_plan,
      (SELECT count(DISTINCT user_id)::int FROM public.coffee_shop_plans) AS users_with_at_least_one_plan,
      (SELECT count(*)::int FROM public.coffee_shop_plans) AS total_plans
  `);
  const p = planCounts.rows[0];
  console.log(`Population: total_users=${p.total_users} users_with_current_plan=${p.users_with_current_plan} users_with_at_least_one_plan=${p.users_with_at_least_one_plan} total_plans=${p.total_plans}`);

  if (backfill.rows[0].users_without_plan_missing_current_plan_id !== 0) {
    console.error("FATAL: Backfill incomplete — some users with plans still have NULL current_plan_id");
    process.exit(1);
  }

  console.log("\n=== Step 6: Top schema_migrations rows ===");
  const topRows = await client.query(`
    SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
  `);
  topRows.rows.forEach(r => console.log(`  ${r.version}  ${r.name}`));

  console.log("\n✅ TIM-2376 migration applied + verified.");
}

run()
  .catch(err => {
    console.error("Script error:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  })
  .finally(() => { try { client.end(); } catch {} });
