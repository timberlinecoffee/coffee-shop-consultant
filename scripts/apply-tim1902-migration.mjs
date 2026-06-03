#!/usr/bin/env node
/**
 * TIM-1922: Apply TIM-1902 migration + credit backfill for affected trial users.
 *
 * Steps:
 *  1. Apply DDL (idempotent ADD COLUMN IF NOT EXISTS)
 *  2. Verify all 3 columns exist
 *  3. Count affected users (trialing, no credits, not yet granted)
 *  4. Bulk credit grant (idempotent via trial_credits_granted guard)
 *  5. Verify affected users now have correct values
 *
 * Env: SUPABASE_DB_URL  full PostgreSQL connection string
 */

import pg from "pg";
import { setDefaultResultOrder, resolve4, resolve6 } from "dns/promises";

// Force IPv4 — GitHub Actions runners often have IPv6 with no route to Supabase IPv6 endpoints.
setDefaultResultOrder("ipv4first");

const { Client } = pg;

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("FATAL: SUPABASE_DB_URL is not set");
  process.exit(1);
}

const REF = "ltmcttjftxzpgynhnrpg";

// Parse the stored URL to extract credentials using object params (avoids
// re-encoding issues with special chars in the password).
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

// Resolve IPv4 for the direct db host (bypasses IPv6 ENETUNREACH).
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
  // 1. Use SUPABASE_DB_URL as-is
  [{ connectionString: DB_URL, ssl }, "SUPABASE_DB_URL as-is"],
  // 2. Use parsed creds with us-east-1 pooler (object form — no URL encoding issues)
  [{ ...base, user: `postgres.${REF}`, password: parsedPassword, host: "aws-0-us-east-1.pooler.supabase.com", port: 5432 }, "pooler us-east-1 (new username format)"],
  // 3. Use parsed creds with us-east-2 pooler
  [{ ...base, user: `postgres.${REF}`, password: parsedPassword, host: "aws-0-us-east-2.pooler.supabase.com", port: 5432 }, "pooler us-east-2"],
  // 4. Try old-style username in us-east-1
  [{ ...base, user: "postgres", password: parsedPassword, host: "aws-0-us-east-1.pooler.supabase.com", port: 5432 }, "pooler us-east-1 (old username)"],
  // 5. Direct IPv4 connection (bypasses IPv6)
  ...(directIPv4 ? [[{ ...base, user: "postgres", password: parsedPassword, host: directIPv4, port: 5432 }, `direct IPv4 ${directIPv4}`]] : []),
];

let client = null;
for (const [cfg, label] of configs) {
  client = await tryConnect(cfg, label);
  if (client) break;
}

if (!client) {
  console.error("FATAL: All connection attempts failed. The SUPABASE_DB_URL secret likely has an incorrect password or the project is paused.");
  process.exit(1);
}

async function run() {
  // client is already connected from the tryConnect loop above

  // ── Step 1: Apply DDL ────────────────────────────────────────────────────────
  console.log("\n=== Step 1: Applying DDL ===");
  await client.query(`
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS trial_credits_granted boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS past_due_since timestamptz NULL;
  `);
  console.log("DDL applied successfully.");

  // ── Step 2: Verify columns ───────────────────────────────────────────────────
  console.log("\n=== Step 2: Verifying columns ===");
  const colCheck = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name IN ('trial_ends_at', 'trial_credits_granted', 'past_due_since');
  `);
  console.log(`Columns found: ${colCheck.rowCount} (expected 3)`);
  colCheck.rows.forEach(r =>
    console.log(`  ${r.column_name}: ${r.data_type}, nullable=${r.is_nullable}, default=${r.column_default}`)
  );
  if (colCheck.rowCount !== 3) {
    console.error("FATAL: Expected 3 columns, got " + colCheck.rowCount);
    process.exit(1);
  }

  // ── Step 3: Count affected users ─────────────────────────────────────────────
  console.log("\n=== Step 3: Counting affected users ===");
  const countRes = await client.query(`
    SELECT COUNT(*) AS affected_count,
           array_agg(u.email ORDER BY u.email) AS emails
    FROM public.users u
    JOIN public.subscriptions s ON s.user_id = u.id
    WHERE s.status = 'trialing'
      AND u.trial_credits_granted = false
      AND u.ai_credits_remaining = 0;
  `);
  const affectedCount = parseInt(countRes.rows[0].affected_count, 10);
  const affectedEmails = countRes.rows[0].emails || [];
  console.log(`Affected users: ${affectedCount}`);
  if (affectedEmails.length > 0) {
    console.log("Emails:", affectedEmails.join(", "));
  }

  // ── Step 4: Bulk credit grant ────────────────────────────────────────────────
  console.log("\n=== Step 4: Bulk credit grant ===");
  const updateRes = await client.query(`
    UPDATE public.users u
    SET
      ai_credits_remaining = 75,
      subscription_status = 'free_trial',
      trial_ends_at = to_timestamp(s.trial_end),
      trial_credits_granted = true
    FROM public.subscriptions s
    WHERE s.user_id = u.id
      AND s.status = 'trialing'
      AND u.trial_credits_granted = false
      AND u.ai_credits_remaining = 0;
  `);
  console.log(`Rows updated: ${updateRes.rowCount}`);

  // ── Step 5: Verify backfill ──────────────────────────────────────────────────
  console.log("\n=== Step 5: Verifying backfill ===");
  const verifyRes = await client.query(`
    SELECT u.id, u.email, u.ai_credits_remaining, u.subscription_status,
           u.trial_credits_granted, u.trial_ends_at,
           s.status AS stripe_sub_status
    FROM public.users u
    JOIN public.subscriptions s ON s.user_id = u.id
    WHERE s.status = 'trialing'
      AND u.trial_credits_granted = true
      AND u.ai_credits_remaining = 75
    ORDER BY u.email;
  `);
  console.log(`Users with credits correctly set: ${verifyRes.rowCount}`);
  verifyRes.rows.forEach(r =>
    console.log(`  ✓ ${r.email}: credits=${r.ai_credits_remaining}, status=${r.subscription_status}, granted=${r.trial_credits_granted}, trial_ends_at=${r.trial_ends_at}`)
  );

  // ── Final: Residual check (should be 0) ──────────────────────────────────────
  const residualRes = await client.query(`
    SELECT COUNT(*) AS remaining
    FROM public.users u
    JOIN public.subscriptions s ON s.user_id = u.id
    WHERE s.status = 'trialing'
      AND u.trial_credits_granted = false
      AND u.ai_credits_remaining = 0;
  `);
  console.log(`\nResidual affected (should be 0): ${residualRes.rows[0].remaining}`);

  console.log("\n=== SUMMARY ===");
  console.log(`Migration columns: 3/3 verified`);
  console.log(`Users backfilled: ${updateRes.rowCount}`);
  console.log(`Residual unbackfilled: ${residualRes.rows[0].remaining}`);

  if (parseInt(residualRes.rows[0].remaining, 10) !== 0) {
    console.error("WARNING: Residual unbackfilled users remain!");
    process.exit(1);
  }

  console.log("\n✅ Migration + backfill complete.");
}

run()
  .catch(err => { console.error("Script error:", err.message); process.exit(1); })
  .finally(() => { try { client.end(); } catch {} });
