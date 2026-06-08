#!/usr/bin/env node
// TIM-2470: live verify on https://groundwork.cafe after merge to main.
//
// Pins:
//   A. /dashboard renders 200 for the trent fixture (no redirect to /login).
//   B. The RSC stream does NOT contain `28:E{...digest...}` style boundary
//      errors that previously routed the page to dashboard/error.tsx.
//   C. The page does NOT render the dashboard error UI ("Something went
//      wrong" / "We hit a snag loading your dashboard.").
//   D. The page DOES render the canonical chrome ("Plan Overview" h1,
//      "Welcome back" greeting, "Last 7 Days" section header).
//
// Auth: chunked @supabase/ssr cookie pattern from TIM-2413/2416/2426/2455.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

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

const env = { ...process.env, ...loadEnv(join(repoRoot, ".env.local")) };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL ?? "https://groundwork.cafe";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const ARTIFACTS = join(repoRoot, "verify-tim2470");
mkdirSync(ARTIFACTS, { recursive: true });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function assert(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  const tag = cond ? "✓" : "✗";
  console.log(`${tag} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function mintSession() {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: FIXTURE_EMAIL,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkError?.message}`);
  }
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpError || !otpData?.session) {
    throw new Error(`verifyOtp failed: ${otpError?.message}`);
  }
  return otpData.session;
}

function buildCookieHeader(session) {
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const parts = [];
  if (fullValue.length <= MAX) {
    parts.push(`${storageKey}=${fullValue}`);
  } else {
    let i = 0;
    let pos = 0;
    while (pos < fullValue.length) {
      parts.push(`${storageKey}.${i}=${fullValue.slice(pos, pos + MAX)}`);
      pos += MAX;
      i += 1;
    }
  }
  return parts.join("; ");
}

async function run() {
  console.log(`# TIM-2470 verify on ${BASE} as ${FIXTURE_EMAIL}`);
  const session = await mintSession();
  const cookieHeader = buildCookieHeader(session);
  console.log(`✓ Minted session cookie (length ${cookieHeader.length})`);

  // Fetch /dashboard with the cookie.
  const res = await fetch(`${BASE}/dashboard`, {
    headers: { Cookie: cookieHeader, Accept: "text/html" },
    redirect: "manual",
  });
  const html = await res.text();
  writeFileSync(join(ARTIFACTS, "dashboard.html"), html);
  const dplMatch = html.match(/dpl_[A-Za-z0-9]+/);
  if (dplMatch) console.log(`✓ Deployment: ${dplMatch[0]}`);

  // A. 200, no redirect
  assert(
    "A. /dashboard returns 200 for trent (no auth redirect)",
    res.status === 200,
    `status=${res.status} location=${res.headers.get("location") ?? "-"}`,
  );

  // B. No RSC error rows
  const errorRowMatch = html.match(/(\d+):E\{"digest":"\d+"\}/);
  assert(
    "B. RSC stream has no boundary-error rows",
    !errorRowMatch,
    errorRowMatch ? `found: ${errorRowMatch[0]}` : "clean",
  );
  // Also no RX activation
  assert(
    "B. RSC stream does not activate any error boundary ($RX)",
    !/\$RX\(/.test(html),
    /\$RX\(/.test(html) ? "found $RX(" : "clean",
  );

  // C. No dashboard error UI
  assert(
    "C. dashboard error UI is NOT rendered",
    !html.includes("Something went wrong") &&
      !html.includes("We hit a snag loading your dashboard"),
    "no error-UI strings present",
  );

  // D. Canonical chrome
  assert("D. h1 'Plan Overview' renders", html.includes("Plan Overview"));
  assert("D. 'Welcome back' greeting renders", html.includes("Welcome back"));
  assert("D. 'Last 7 Days' section header renders", html.includes("Last 7 Days"));
  assert(
    "D. 'Refresh conflict check' button is present",
    html.includes("Refresh conflict check"),
  );

  // E. Deployment confirmation — main is at 67747f3 / TIM-2470 fix
  const summary = `${results.filter((r) => r.pass).length}/${results.length} PASS`;
  console.log(`\n${summary}`);
  writeFileSync(
    join(ARTIFACTS, "results.json"),
    JSON.stringify({ base: BASE, email: FIXTURE_EMAIL, results }, null, 2),
  );
  if (results.some((r) => !r.pass)) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
