#!/usr/bin/env node
// TIM-2461: live verify on https://groundwork.cafe after merge.
//
// Pins:
//   1. /dashboard returns 200 with auth (no redirect to login).
//   2. /dashboard HTML contains "Plan Overview" header copy.
//   3. /dashboard HTML contains "Last 7 Days" section copy.
//   4. /dashboard HTML contains the AppSidebar Logo nav (sidebar visible).
//   5. /dashboard HTML contains the new Dashboard nav pin label.
//   6. /workspace/concept also returns 200 and includes the AppSidebar (no
//      remount across the dashboard ↔ workspace transition).

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

const OUT_DIR = join(repoRoot, "verify-tim2461");
mkdirSync(OUT_DIR, { recursive: true });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function assert(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  const tag = cond ? "OK" : "FAIL";
  console.log(`[${tag}] ${name}${detail ? `  — ${detail}` : ""}`);
}

async function mintSessionCookieHeader() {
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({ type: "magiclink", email: FIXTURE_EMAIL });
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
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(otpData.session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const parts = [];
  if (fullValue.length <= MAX) {
    parts.push([storageKey, fullValue]);
  } else {
    let i = 0, pos = 0;
    while (pos < fullValue.length) {
      parts.push([`${storageKey}.${i}`, fullValue.slice(pos, pos + MAX)]);
      pos += MAX;
      i += 1;
    }
  }
  return parts.map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchHtml(path, cookieHeader) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Cookie: cookieHeader,
      Accept: "text/html",
      "User-Agent": "tim2461-verify/1.0",
    },
    redirect: "manual",
  });
  const body = await res.text();
  return { status: res.status, body, location: res.headers.get("location") };
}

async function main() {
  console.log("=== TIM-2461 prod verify ===");
  console.log(`BASE=${BASE}  FIXTURE=${FIXTURE_EMAIL}`);
  const cookie = await mintSessionCookieHeader();

  // 1–5: /dashboard
  const dash = await fetchHtml("/dashboard", cookie);
  writeFileSync(join(OUT_DIR, "dashboard.html"), dash.body);
  assert("/dashboard returns 200", dash.status === 200, `status=${dash.status}`);
  assert(
    "Plan Overview header copy present",
    dash.body.includes("Plan Overview"),
    "marker: Plan Overview"
  );
  assert(
    "See where your plan stands. description present",
    dash.body.includes("See where your plan stands"),
    "marker: description"
  );
  assert(
    "Last 7 Days section header present",
    dash.body.includes("Last 7 Days"),
    "marker: Last 7 Days"
  );
  assert(
    "Sidebar (Workspace navigation aria-label) present",
    dash.body.includes("Workspace navigation"),
    "marker: AppSidebar aside aria-label"
  );
  assert(
    "Dashboard nav pin label present",
    dash.body.includes(">Dashboard<"),
    "marker: Dashboard pin text"
  );
  // RefreshConflictsButton is a "use client" island so the aria-label lives
  // in the page's JS chunks, not the SSR HTML. Iterate the chunks the
  // dashboard pulled in and look for the marker string there.
  const chunkPaths = Array.from(
    new Set(dash.body.match(/_next\/static\/chunks\/[^"?]+\.js/g) ?? [])
  );
  let refreshFound = false;
  for (const c of chunkPaths) {
    const r = await fetch(`${BASE}/${c}`);
    const body = await r.text();
    if (body.includes("Refresh conflict check")) {
      refreshFound = true;
      break;
    }
  }
  assert(
    "Refresh conflict check button present in chunk",
    refreshFound,
    `searched ${chunkPaths.length} chunks`
  );

  // 6: /workspace/concept also has the same sidebar shell
  const concept = await fetchHtml("/workspace/concept", cookie);
  writeFileSync(join(OUT_DIR, "workspace-concept.html"), concept.body);
  assert("/workspace/concept returns 200", concept.status === 200, `status=${concept.status}`);
  assert(
    "Sidebar present on /workspace/concept too",
    concept.body.includes("Workspace navigation"),
    "marker: AppSidebar aside aria-label"
  );
  assert(
    "Dashboard pin still rendered on /workspace/concept",
    concept.body.includes(">Dashboard<"),
    "marker: Dashboard pin text on workspace route"
  );

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    results,
  };
  writeFileSync(
    join(OUT_DIR, "results.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log("---");
  console.log(`Total: ${summary.total}  passed=${summary.passed}  failed=${summary.failed}`);
  process.exit(summary.failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("verify failed", err);
  process.exit(1);
});
