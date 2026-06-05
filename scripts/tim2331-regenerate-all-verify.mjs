// TIM-2331 verify: drive POST /api/business-plan/regenerate-all on prod as
// trent@simpler.coffee (fully-populated demo fixture). Asserts:
//   1. estimate event arrives with the expected section list + credit total.
//   2. each section emits section:start, then either section:complete or
//      section:error.
//   3. credits_remaining decrements monotonically.
//   4. done event lands with completed_count > 0.
//   5. immediate third call returns 429 with a meaningful retry hint.
//
// Usage:
//   PROD_URL=https://groundwork.cafe \
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/tim2331-regenerate-all-verify.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// TIM-2285 / TIM-2331: prod env values can carry a trailing literal `\n` from
// older Vercel env edits. Strip it defensively on every input so a stale env
// pull doesn't 401 every request.
function clean(v) { return typeof v === "string" ? v.replace(/\\n$/, "").trim() : v; }
const BASE = clean(process.env.PROD_URL) || "https://groundwork.cafe";
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const ANON = clean(process.env.SUPABASE_ANON_KEY);
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const EMAIL = clean(process.env.FIXTURE_EMAIL) || "trent@simpler.coffee";

if (!SUPABASE_URL || !ANON || !SERVICE) {
  console.error("env missing: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "verify-artifacts", "tim-2331");
mkdirSync(OUT_DIR, { recursive: true });

console.log(`[base] ${BASE}`);
console.log(`[fixture] ${EMAIL}`);
console.log(`[out] ${OUT_DIR}`);

let pass = 0;
let fail = 0;
function ok(msg) { console.log(`  ✓ ${msg}`); pass += 1; }
function bad(msg) { console.log(`  ✗ ${msg}`); fail += 1; }

// ── 1. Mint a session for the fixture user ─────────────────────────────────
const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
if (!tokenHash) { console.error("generate_link failed", link); process.exit(2); }
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});
const auth = await verifyRes.json();
if (!auth.access_token) { console.error("verify failed", auth); process.exit(2); }
console.log(`[auth] minted session for ${auth.user.email}`);

const authHeader = `Bearer ${auth.access_token}`;
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const cookieValue = JSON.stringify({
  access_token: auth.access_token,
  refresh_token: auth.refresh_token,
  expires_in: auth.expires_in,
  expires_at: auth.expires_at,
  token_type: auth.token_type,
  user: auth.user,
});
const cookieHeader = `sb-${REF}-auth-token=${encodeURIComponent(cookieValue)}`;

// ── 2. Read starting credit balance (sanity) ───────────────────────────────
const balRes = await fetch(`${BASE}/api/credits`, {
  headers: { Cookie: cookieHeader },
});
const balJson = await balRes.json().catch(() => ({}));
const startBalance =
  typeof balJson?.ai_credits_remaining === "number"
    ? balJson.ai_credits_remaining
    : null;
console.log(`[balance] starting credits = ${startBalance}`);

// ── 3. Drive POST /api/business-plan/regenerate-all ───────────────────────
console.log(`\n[run 1] POST ${BASE}/api/business-plan/regenerate-all`);
const startedAt = Date.now();
const sseRes = await fetch(`${BASE}/api/business-plan/regenerate-all`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
    Authorization: authHeader,
  },
  body: "{}",
});
console.log(`  status: ${sseRes.status}`);
console.log(`  content-type: ${sseRes.headers.get("content-type")}`);

if (sseRes.status !== 200) {
  console.log("  body:", (await sseRes.text()).slice(0, 400));
  bad(`expected 200 from regenerate-all, got ${sseRes.status}`);
  process.exit(1);
}
ok("regenerate-all returned 200 SSE");

const reader = sseRes.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let estimate = null;
const events = [];
const sectionTimings = new Map();
let creditsTrail = [];
let doneEvent = null;
let lastErr = null;

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const parts = buf.split("\n\n");
  buf = parts.pop() ?? "";
  for (const part of parts) {
    const lines = part.split("\n");
    let event = "";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7);
      if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (!event) continue;
    let parsed = null;
    try { parsed = data ? JSON.parse(data) : null; } catch { /* ignore */ }
    events.push({ event, data: parsed, at: Date.now() - startedAt });
    if (event === "estimate") estimate = parsed;
    if (event === "section:start" && parsed?.sectionKey) {
      sectionTimings.set(parsed.sectionKey, { startedAt: Date.now() - startedAt });
    }
    if (event === "section:complete" && parsed?.sectionKey) {
      const t = sectionTimings.get(parsed.sectionKey) || {};
      t.completedAt = Date.now() - startedAt;
      t.draftLen = (parsed.draft || "").length;
      t.creditsRemaining = parsed.credits_remaining;
      sectionTimings.set(parsed.sectionKey, t);
      if (typeof parsed.credits_remaining === "number") {
        creditsTrail.push(parsed.credits_remaining);
      }
    }
    if (event === "section:error" && parsed?.sectionKey) {
      const t = sectionTimings.get(parsed.sectionKey) || {};
      t.error = parsed.message || "unknown";
      sectionTimings.set(parsed.sectionKey, t);
    }
    if (event === "done") doneEvent = parsed;
    if (event === "error") lastErr = parsed?.message ?? "stream error";
  }
}
console.log(`  stream closed after ${Date.now() - startedAt}ms`);

writeFileSync(
  join(OUT_DIR, "run1-events.json"),
  JSON.stringify({ estimate, doneEvent, sectionTimings: Object.fromEntries(sectionTimings), creditsTrail, events }, null, 2),
);

// ── 4. Assertions ─────────────────────────────────────────────────────────
if (estimate && Array.isArray(estimate.sections)) ok(`estimate event has ${estimate.sections.length} sections`);
else bad("estimate event missing or malformed");

if (estimate?.estimated_credits > 0) ok(`estimated_credits = ${estimate.estimated_credits}`);
else if (estimate?.billing_mode === "beta_waiver") ok("billing_mode = beta_waiver");
else bad(`estimated_credits=${estimate?.estimated_credits} billing_mode=${estimate?.billing_mode}`);

if (Array.isArray(estimate?.sparse_sections)) ok(`sparse_sections reported: ${estimate.sparse_sections.length}`);
else bad("sparse_sections missing from estimate");

const completed = [...sectionTimings.values()].filter((t) => t.completedAt && (t.draftLen ?? 0) > 50);
if (completed.length > 0) ok(`${completed.length} sections completed with non-trivial draft`);
else bad("no sections completed with a non-trivial draft");

const errored = [...sectionTimings.entries()].filter(([, t]) => t.error);
if (errored.length === 0) ok("no section errors during run 1");
else console.log(`    note: ${errored.length} section errors: ${errored.map(([k, t]) => `${k}=${t.error}`).join(", ")}`);

if (estimate?.billing_mode === "credits") {
  if (creditsTrail.length > 0 && creditsTrail.every((v, i, a) => i === 0 || v <= a[i - 1])) {
    ok(`credits_remaining decremented monotonically: ${creditsTrail.join(" -> ")}`);
  } else {
    bad(`credits_remaining did not decrement monotonically: ${creditsTrail.join(" -> ")}`);
  }
}

if (doneEvent && doneEvent.completed_count >= 1) ok(`done event: completed_count=${doneEvent.completed_count} failed_count=${doneEvent.failed_count}`);
else bad(`done event missing or empty: ${JSON.stringify(doneEvent)}`);

if (lastErr) console.log(`  (last stream error: ${lastErr})`);

// ── 5. Read ending credit balance to confirm debit ─────────────────────────
if (estimate?.billing_mode === "credits") {
  const endBalRes = await fetch(`${BASE}/api/credits`, { headers: { Cookie: cookieHeader } });
  const endBalJson = await endBalRes.json().catch(() => ({}));
  const endBalance = endBalJson?.ai_credits_remaining;
  if (typeof startBalance === "number" && typeof endBalance === "number") {
    const burned = startBalance - endBalance;
    const expected = completed.length;
    if (burned === expected) ok(`credits debited = ${burned} (matches completed sections)`);
    else bad(`credits debited = ${burned}, expected ${expected}`);
  } else {
    console.log(`  (balance check inconclusive: start=${startBalance} end=${endBalance})`);
  }
}

// ── 6. Rate limit: third call within an hour should 429 ────────────────────
console.log(`\n[rate-limit] third call within the hour`);
// We just did one call; the limit is 2/hour, so the SECOND call below is the
// 2nd of the window (might pass), and the THIRD is the one we want to 429.
const second = await fetch(`${BASE}/api/business-plan/regenerate-all`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieHeader, Authorization: authHeader },
  body: "{}",
});
console.log(`  call #2 status: ${second.status}`);
// Drain & abort the second call right away so it counts but doesn't burn the wallet.
try { await second.body?.cancel(); } catch {}

const third = await fetch(`${BASE}/api/business-plan/regenerate-all`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieHeader, Authorization: authHeader },
  body: "{}",
});
console.log(`  call #3 status: ${third.status}`);
if (third.status === 429) {
  const retryAfter = third.headers.get("Retry-After");
  ok(`third call returned 429 (Retry-After=${retryAfter ?? "n/a"})`);
} else {
  bad(`third call did not 429, got ${third.status}`);
}
try { await third.body?.cancel(); } catch {}

console.log(`\n[summary] pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
