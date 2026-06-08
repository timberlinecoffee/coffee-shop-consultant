#!/usr/bin/env node
// TIM-2470: mint cookie as trent and hit prod /dashboard, capture HTML/digest.

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

const session = await mintSession();
const cookieHeader = buildCookieHeader(session);
console.log(`✓ Minted session cookie (${cookieHeader.length} chars)`);

const res = await fetch(`${BASE}/dashboard`, {
  headers: { Cookie: cookieHeader, Accept: "text/html" },
  redirect: "manual",
});
console.log(`status: ${res.status}`);
console.log(`location: ${res.headers.get("location") ?? "-"}`);
const html = await res.text();
console.log(`html length: ${html.length}`);

// Look for error markers
for (const needle of ["Something went wrong", "digest", "plan-overview", "Plan Overview", "Plan not started", "Welcome back"]) {
  console.log(`  contains "${needle}": ${html.includes(needle)}`);
}

writeFileSync("/tmp/trent-dashboard.html", html);

// Look for digest
const digestMatch = html.match(/digest&quot;:&quot;([^&]+)&quot;|digest":"([^"]+)"|digest:&#x27;([^&]+)&#x27;/);
if (digestMatch) {
  console.log("DIGEST:", digestMatch[1] ?? digestMatch[2] ?? digestMatch[3]);
}
