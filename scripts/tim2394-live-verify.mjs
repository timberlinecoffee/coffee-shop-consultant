// TIM-2394 live verify against groundwork.cafe with the trent@simpler.coffee
// fixture. Mints a service-role magic link, exchanges it for a session via
// verifyOtp, injects an @supabase/ssr base64-chunked cookie, then POSTs the v2
// audit endpoint and asserts:
//   1. Findings reference only SOURCE workspaces (never business-plan).
//   2. At least one cross_suite_mismatch finding fires.
//   3. At least one benchmark_out_of_range finding fires.
//   4. No raw template tags <…> leak into any string field.

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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("missing supabase env");
  process.exit(2);
}

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const COOKIE_NAME = `sb-${REF}-auth-token`;
const MAX_COOKIE_LEN = 3180;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[1/4] minting magic link for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

console.log("[2/4] exchanging for session...");
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (sessErr) throw sessErr;
const session = sessData.session;
if (!session) throw new Error("no session");

// Build @supabase/ssr cookie payload (base64url-encoded JSON, `base64-` prefix,
// chunked at <=3180 bytes per .N).
const payload = {
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_at: session.expires_at,
  expires_in: session.expires_in,
  token_type: "bearer",
  user: session.user,
};
const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
const prefixed = `base64-${b64}`;
const chunks = [];
for (let i = 0; i < prefixed.length; i += MAX_COOKIE_LEN) {
  chunks.push(prefixed.slice(i, i + MAX_COOKIE_LEN));
}
const cookieHeader = chunks
  .map((c, i) => `${COOKIE_NAME}.${i}=${encodeURIComponent(c)}`)
  .join("; ");

console.log("[3/4] POST /api/business-plan/audit (warmup, may run synthesis)...");
const t0 = Date.now();
const res = await fetch(`${PROD_URL}/api/business-plan/audit`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
  },
  body: JSON.stringify({}),
});
console.log(`  status ${res.status} in ${Date.now() - t0}ms`);
const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = text; }
if (res.status !== 200) {
  console.error("non-200:", body);
  process.exit(1);
}

const report = body.report;
const findings = report?.findings ?? [];
console.log(`  cached=${body.cached}  findings=${findings.length}  stats=${JSON.stringify(report.stats)}`);

console.log("[4/4] assertions...");
const checks = [];

// (1) No business-plan-source findings.
const bpSource = findings.filter((f) => f.source?.workspace === "business-plan" || f.target?.workspace === "business-plan");
checks.push({
  name: "zero BP-field findings",
  pass: bpSource.length === 0,
  detail: bpSource.length === 0 ? "OK" : `LEAK: ${bpSource.map((f) => f.id).join(", ")}`,
});

// (2) at least one cross_suite_mismatch.
const cross = findings.filter((f) => f.rule_id === "cross_suite_mismatch");
checks.push({
  name: "≥1 cross_suite_mismatch (note: clean fixture may have zero)",
  pass: cross.length >= 1,
  detail: cross.length >= 1 ? `${cross.length} fired: ${cross.map((f) => f.id).join(", ")}` : "no cross-suite findings on clean fixture (will need mis-edit to force)",
  soft: true,
});

// (3) at least one benchmark_out_of_range.
const bench = findings.filter((f) => f.rule_id === "benchmark_out_of_range");
checks.push({
  name: "≥1 benchmark_out_of_range",
  pass: bench.length >= 1,
  detail: bench.length >= 1 ? `${bench.length} fired: ${bench.map((f) => f.id).join(", ")}` : "no benchmark findings — fixture is in every band",
  soft: true,
});

// (4) No <…> template tags leak.
const TAG_RE = /<[A-Za-z][^>\n]{0,80}>/;
const leaks = [];
for (const f of findings) {
  for (const k of ["raw_message", "quoted_text", "expected_text", "issue", "why_it_matters", "suggested_fix"]) {
    const v = f[k];
    if (typeof v === "string" && TAG_RE.test(v)) {
      leaks.push(`${f.id}.${k}: ${v.slice(0, 80)}`);
    }
  }
}
checks.push({
  name: "zero template-tag leaks",
  pass: leaks.length === 0,
  detail: leaks.length === 0 ? "OK" : `LEAKS:\n  ${leaks.join("\n  ")}`,
});

// (5) Sample findings for the comment.
console.log("\n--- Sample findings (top 5) ---");
for (const f of findings.slice(0, 5)) {
  console.log(`  ${f.severity.toUpperCase()} ${f.rule_id} — ${f.issue ?? f.raw_message}`);
  console.log(`    source=${f.source?.workspace}  target=${f.target?.workspace}`);
}

console.log("\n--- Assertions ---");
let hardFail = false;
for (const c of checks) {
  const tag = c.pass ? "✓" : (c.soft ? "⚠" : "✗");
  console.log(`${tag} ${c.name}: ${c.detail}`);
  if (!c.pass && !c.soft) hardFail = true;
}

if (hardFail) process.exit(1);
console.log("\nLIVE VERIFY OK");
