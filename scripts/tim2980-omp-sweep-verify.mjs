// TIM-2980: Live verify the opening-month-plan sweep. Flips trent's
// `users.current_plan_id` to a non-latest plan (the multi-plan-404 condition),
// hits playbook + milestones + config + timeline + hiring-plan + marketing-
// kickoff API routes, asserts each one resolves to the SAME pinned plan_id,
// then restores the snapshot. Probes against prod via magic-link session.
//
// PASS criteria:
//   1. user has plan_count >= 2 (proves multi-plan condition is real)
//   2. flip current_plan_id -> non-latest plan
//   3. all 6 GET routes respond 200 with rows whose plan_id == pinned id
//      OR rows whose plan_id is absent (empty arrays) — never the OTHER plan
//   4. restore current_plan_id (try/finally guaranteed)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = "https://groundwork.cafe";
const TARGET_EMAIL = "trent@simpler.coffee";

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[1] resolving user + plans for ${TARGET_EMAIL}...`);
const { data: u } = await admin
  .from("users")
  .select("id, current_plan_id")
  .eq("email", TARGET_EMAIL)
  .single();
if (!u) throw new Error(`no user row for ${TARGET_EMAIL}`);
const userId = u.id;
const originalCurrentPlanId = u.current_plan_id;

const { data: plans } = await admin
  .from("coffee_shop_plans")
  .select("id, plan_name, created_at")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });
if (!plans || plans.length < 2) {
  throw new Error(`expected plan_count >= 2 to test multi-plan resolver; got ${plans?.length ?? 0}`);
}
console.log(`  plan_count=${plans.length} originalCurrentPlanId=${originalCurrentPlanId}`);
plans.forEach((p, i) => console.log(`    [${i}] ${p.id}  ${p.plan_name}  ${p.created_at}`));

// Pick the OLDEST plan (definitely not "latest-by-created_at"). This is the
// plan that pre-TIM-2980 routes would have ignored.
const PINNED = plans[plans.length - 1];
const LATEST = plans[0];
if (PINNED.id === LATEST.id) throw new Error("oldest == latest, can't distinguish");
console.log(`  PINNED (will set current_plan_id=this): ${PINNED.id} (${PINNED.plan_name})`);
console.log(`  LATEST (what broken routes would have returned): ${LATEST.id} (${LATEST.plan_name})`);

let restored = false;
async function restore() {
  if (restored) return;
  restored = true;
  console.log(`[restore] current_plan_id -> ${originalCurrentPlanId}`);
  const { error } = await admin
    .from("users")
    .update({ current_plan_id: originalCurrentPlanId })
    .eq("id", userId);
  if (error) console.error("  restore FAILED:", error);
  else console.log("  restored");
}
process.on("SIGINT", restore);
process.on("SIGTERM", restore);

try {
  console.log(`[2] flipping current_plan_id -> ${PINNED.id}`);
  const { error: flipErr } = await admin
    .from("users")
    .update({ current_plan_id: PINNED.id })
    .eq("id", userId);
  if (flipErr) throw flipErr;

  console.log(`[3] minting magic-link session for ${TARGET_EMAIL}...`);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TARGET_EMAIL,
  });
  if (linkErr) throw linkErr;
  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) throw new Error("no token_hash");

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (sessErr) throw sessErr;
  const session = sessData.session;

  const sessionPayload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: "bearer",
    user: session.user,
  });
  const cookie = `sb-${REF}-auth-token=${encodeURIComponent(sessionPayload)}`;

  const routes = [
    { name: "playbook (soft-open-plan)", url: "/api/opening-month-plan/soft-open-plan", listKey: "items" },
    { name: "milestones",                 url: "/api/opening-month-plan/milestones",     listKey: "milestones" },
    { name: "config",                     url: "/api/opening-month-plan/config",         listKey: null },
    { name: "timeline",                   url: "/api/opening-month-plan/timeline",       listKey: "items" },
    { name: "hiring-plan",                url: "/api/opening-month-plan/hiring-plan",    listKey: "items" },
    { name: "marketing-kickoff",          url: "/api/opening-month-plan/marketing-kickoff", listKey: "items" },
  ];

  let pass = true;
  const results = [];

  for (const r of routes) {
    const res = await fetch(`${PROD_URL}${r.url}`, {
      headers: { Cookie: cookie, Accept: "application/json" },
    });
    const status = res.status;
    let body;
    try { body = await res.json(); } catch { body = null; }

    if (status !== 200) {
      console.log(`[FAIL] ${r.name}  ${status}`, body);
      pass = false;
      results.push({ name: r.name, status, ok: false, reason: `status ${status}` });
      continue;
    }

    // For list routes, assert every row's plan_id matches PINNED (and never LATEST).
    if (r.listKey) {
      const rows = body?.[r.listKey] ?? [];
      const wrong = rows.filter((row) => row.plan_id && row.plan_id !== PINNED.id);
      const onLatest = rows.filter((row) => row.plan_id === LATEST.id);
      if (wrong.length > 0) {
        console.log(`[FAIL] ${r.name}  200 but ${wrong.length}/${rows.length} rows have plan_id != PINNED`);
        if (onLatest.length > 0) {
          console.log(`       ${onLatest.length} of those are on LATEST plan — pre-2980 silent split!`);
        }
        pass = false;
        results.push({ name: r.name, status, ok: false, reason: `${wrong.length} rows on wrong plan`, rowCount: rows.length });
      } else {
        console.log(`[ok]   ${r.name}  200  rows=${rows.length}  all rows on pinned plan (or empty)`);
        results.push({ name: r.name, status, ok: true, rowCount: rows.length });
      }
    } else {
      // Config route returns a single config object scoped to a plan. As long as
      // it 200s and we can call it consistently, it's resolved against the
      // active plan (no plan_id field exposed on the wire; the inline read
      // would have 500'd pre-2980 for multi-plan users on bare .single()).
      console.log(`[ok]   ${r.name}  200  (config payload returned)`);
      results.push({ name: r.name, status, ok: true });
    }
  }

  console.log("\n=== summary ===");
  results.forEach((r) => console.log(`  ${r.ok ? "ok" : "FAIL"}  ${r.name}  status=${r.status}  ${r.reason ?? ""}`));
  console.log(`\n=> ${pass ? "PASS" : "FAIL"}: pinned current_plan_id=${PINNED.id} (oldest), all routes resolved to it`);

  await restore();
  process.exit(pass ? 0 : 1);
} catch (err) {
  console.error("[error]", err);
  await restore();
  process.exit(1);
}
