#!/usr/bin/env node
// TIM-2470: reproduce the /dashboard RSC crash for trent on prod.

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const out = {};
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
      if (!m) continue;
      out[m[1]] = m[3].replace(/\\n$/, "").trim();
    }
  } catch {}
  return out;
}

const env = { ...process.env, ...loadEnv(".env.local") };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL ?? "https://groundwork.cafe";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Look up trent user_id and his plan
const { data: trentUser } = await admin
  .from("users")
  .select("id, email, onboarding_completed, subscription_status, subscription_tier, trial_ends_at, trial_just_converted_to, full_name")
  .eq("email", FIXTURE_EMAIL)
  .single();
console.log("trent user row:", JSON.stringify(trentUser, null, 2));

if (!trentUser) process.exit(1);

const { data: plans } = await admin
  .from("coffee_shop_plans")
  .select("id, updated_at, created_at")
  .eq("user_id", trentUser.id)
  .order("created_at", { ascending: false })
  .limit(3);
console.log("plans:", JSON.stringify(plans, null, 2));

const planId = plans?.[0]?.id;
if (!planId) {
  console.log("NO PLAN for trent");
  process.exit(0);
}

const { data: cacheRows } = await admin
  .from("plan_quality_audit_cache")
  .select("id, state_hash, created_at, report_json")
  .eq("user_id", trentUser.id)
  .eq("plan_id", planId)
  .order("created_at", { ascending: false })
  .limit(1);

console.log("audit cache row count:", cacheRows?.length ?? 0);
if (cacheRows?.[0]) {
  const r = cacheRows[0];
  const report = r.report_json;
  console.log("cache row id:", r.id, "created:", r.created_at);
  console.log("report top-level keys:", Object.keys(report ?? {}));
  console.log("findings is array?", Array.isArray(report?.findings), "count:", report?.findings?.length);
  if (Array.isArray(report?.findings)) {
    for (let i = 0; i < Math.min(3, report.findings.length); i++) {
      const f = report.findings[i];
      console.log(`finding[${i}] keys:`, Object.keys(f ?? {}));
      console.log(`  severity:`, f.severity, "rule_id:", f.rule_id);
      console.log(`  source:`, JSON.stringify(f.source));
      console.log(`  target:`, JSON.stringify(f.target));
    }
    // Look for findings with missing source/target
    const bad = report.findings.filter(f => !f || !f.source || !f.target);
    console.log("findings with missing source/target:", bad.length);
    if (bad.length > 0) {
      console.log("first bad finding:", JSON.stringify(bad[0]));
    }
  }
  writeFileSync("/tmp/trent-audit-cache.json", JSON.stringify(cacheRows[0], null, 2));
}

// Workspace status rows
const { data: statusRows } = await admin
  .from("workspace_status")
  .select("component_key, status, updated_at")
  .eq("plan_id", planId);
console.log("\nworkspace_status rows for trent:", statusRows?.length ?? 0);
console.log(JSON.stringify(statusRows, null, 2));
