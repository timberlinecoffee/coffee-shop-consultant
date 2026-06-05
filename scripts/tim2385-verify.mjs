// TIM-2385 prod verify: confirm the two-phase loading UX is live on
// groundwork.cafe. The change is purely client-side, so we (1) mint a
// fixture-user session, (2) fetch /workspace/business-plan authed, (3) pull
// the per-route chunk URL from the rendered HTML, (4) fetch that chunk, and
// (5) grep it for the new copy + component markers.
//
// Markers we assert:
//   • "Generating section " — overlay counter copy (RegenerateAll + per-section)
//   • " section had an error. Continuing." — per-section error line in overlay
//   • "Generating your business plan" — overlay title (M>1)
//   • "Generating section" (header for M===1)
//   • "bp-progress-title" — overlay aria-labelledby (component is in the bundle)
//
// Method mirrors TIM-2384: service-role generateLink + verifyOtp, base64-
// chunked @supabase/ssr cookie, then plain fetch (no Playwright needed for
// a string assertion on the bundle).

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function parseEnvFile(path) {
  const out = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    v = v.replace(/\\n$/, "").replace(/\n$/, "").trim();
    out[m[1]] = v;
  }
  return out;
}
const env = parseEnvFile(new URL("../.env.prod", import.meta.url).pathname);
const BASE = process.env.PROD_URL || "https://groundwork.cafe";
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.FIXTURE_EMAIL || "trent@simpler.coffee";
if (!SUPABASE_URL || !ANON || !SERVICE) {
  console.error("env missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

let failures = 0;
function assert(label, cond, detail = "") {
  console.log(`[${cond ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

// ── 1. Mint session for fixture user ────────────────────────────────────────
const admin = createClient(SUPABASE_URL, SERVICE);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
});
if (linkErr || !linkData?.properties?.hashed_token) {
  console.error("generateLink failed", linkErr); process.exit(2);
}
const anon = createClient(SUPABASE_URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
  type: "magiclink", token_hash: linkData.properties.hashed_token,
});
if (otpErr || !otpData?.session) {
  console.error("verifyOtp failed", otpErr); process.exit(2);
}
console.log(`[auth] session minted for ${EMAIL}`);

const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;
const payload = JSON.stringify(otpData.session);
const b64 = Buffer.from(payload, "utf8")
  .toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fullValue = `base64-${b64}`;
const MAX = 3180;

// Build cookie header (chunked if needed).
const cookieParts = [];
if (fullValue.length <= MAX) {
  cookieParts.push(`${storageKey}=${fullValue}`);
} else {
  let i = 0, pos = 0;
  while (pos < fullValue.length) {
    cookieParts.push(`${storageKey}.${i}=${fullValue.slice(pos, pos + MAX)}`);
    pos += MAX; i += 1;
  }
}
const cookieHeader = cookieParts.join("; ");

// ── 2. Fetch /workspace/business-plan authed ─────────────────────────────────
console.log(`\n=== GET ${BASE}/workspace/business-plan ===`);
const pageRes = await fetch(`${BASE}/workspace/business-plan`, {
  headers: { Cookie: cookieHeader, "User-Agent": "tim2385-verify" },
  redirect: "manual",
});
console.log(`  status: ${pageRes.status}`);
assert("page renders 200 (not 30x redirect to /login)", pageRes.status === 200,
  `status=${pageRes.status} loc=${pageRes.headers.get("location") ?? ""}`);
if (pageRes.status !== 200) {
  console.error("Cannot proceed; aborting.");
  process.exit(failures > 0 ? 1 : 0);
}
const html = await pageRes.text();

// ── 3. Pull the per-route chunk URLs from the HTML ──────────────────────────
// Next 16 emits `_next/static/chunks/app/workspace/business-plan/page-<hash>.js`
// for the route, plus shared chunks. We grep the route chunk + every shared
// chunk for the marker strings since the overlay is in its own component file
// and may end up in either the route chunk or a shared boundary chunk.
const chunkRe = /\/_next\/static\/chunks\/[^"'?]+\.js(\?dpl=[^"']+)?/g;
const chunks = Array.from(new Set(html.match(chunkRe) || []));
console.log(`  HTML references ${chunks.length} JS chunks`);

// Next 16 / Turbopack hashes chunk paths, so route-specific chunks are not
// always prefixed with the route path. We just confirm chunks exist and rely
// on the marker grep below to prove the new code is shipped.
assert("HTML references at least 1 JS chunk", chunks.length > 0);

// ── 4. Fetch every chunk and grep for markers ────────────────────────────────
const markers = [
  "Generating section ",            // counter copy
  " section had an error. Continuing.", // per-section error line
  "Generating your business plan",  // M>1 title
  "bp-progress-title",               // overlay aria id
];
const seen = new Set();

for (const path of chunks) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  let body;
  try {
    const res = await fetch(url);
    if (!res.ok) continue;
    body = await res.text();
  } catch {
    continue;
  }
  for (const m of markers) {
    if (!seen.has(m) && body.includes(m)) {
      seen.add(m);
      console.log(`  ✓ marker "${m}" found in ${path.slice(-60)}`);
    }
  }
  if (markers.every((m) => seen.has(m))) break;
}

for (const m of markers) {
  assert(`shipped bundle contains marker: ${JSON.stringify(m)}`, seen.has(m));
}

// ── 5. Summary ───────────────────────────────────────────────────────────────
console.log("\n=== summary ===");
if (failures > 0) {
  console.log(`FAILURES: ${failures}`);
  process.exit(1);
}
console.log("All checks passed.");
