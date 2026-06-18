#!/usr/bin/env node
// TIM-2721: inspect ui_revamp_v2 + supabase session state for the two Trent
// accounts (trent@simpler.coffee + trentrollings@gmail.com) on prod. No writes
// in this script — read-only diagnostic.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
    if (m) out[m[1]] = m[3].replace(/\\n$/, "").trim();
  }
  return out;
}
const env = { ...process.env, ...loadEnv(".env.local") };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAILS = ["trent@simpler.coffee", "trentrollings@gmail.com"];

for (const email of EMAILS) {
  console.log(`\n=== ${email} ===`);
  // auth.users via admin API
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) { console.error(listErr); continue; }
  const authUser = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!authUser) { console.log("  not found in auth.users"); continue; }
  console.log(`  auth.users.id = ${authUser.id}`);
  console.log(`  email_confirmed_at = ${authUser.email_confirmed_at}`);
  console.log(`  last_sign_in_at = ${authUser.last_sign_in_at}`);

  // public.users row
  const { data: u } = await admin
    .from("users")
    .select("id, email, ui_revamp_v2, subscription_status, subscription_tier, updated_at")
    .eq("id", authUser.id)
    .maybeSingle();
  console.log(`  public.users.ui_revamp_v2 = ${u?.ui_revamp_v2}`);
  console.log(`  public.users.subscription_status = ${u?.subscription_status}`);
  console.log(`  public.users.updated_at = ${u?.updated_at}`);
}
