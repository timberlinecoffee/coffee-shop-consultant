// TIM-2336 live verify: drive POST /api/business-plan/validate on prod as the
// fixture user (trent@simpler.coffee → Beaver & Beef demo plan). Asserts:
//
//   1. The validate endpoint returns 200 with a well-formed ValidationReport
//      (numeric_findings array, qualitative_findings array, stats counters).
//   2. Pass 1 is the same engine the unit tests pin — when Trent's current
//      saved narrative is consistent with plan_state, blocking=false.
//   3. The GET /api/pdf/business_plan_full export gate returns either a PDF
//      (when blocking=false) or 422 with the same report shape (when blocking).
//   4. With ?force=1 the gate yields a PDF unconditionally — the soft override
//      acceptance criterion from the issue.
//
// Run:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
//   PROD_URL=https://coffee-shop-consultant.vercel.app \
//   FIXTURE_EMAIL=trent@simpler.coffee \
//   node scripts/tim2336-validate-verify.mjs

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROD = process.env.PROD_URL ?? "https://coffee-shop-consultant.vercel.app";
const EMAIL = process.env.FIXTURE_EMAIL ?? "trent@simpler.coffee";

if (!URL_ || !SVC || !ANON) {
  console.error("env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(2);
}

function assertOk(cond, msg) {
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`);
}

// ── 1. Mint a session for the fixture ──────────────────────────────────────
const link = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
}).then((r) => r.json());
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
if (!tokenHash) {
  console.error("generate_link failed", link);
  process.exit(2);
}
const verify = await fetch(`${URL_}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
}).then((r) => r.json());
const accessToken = verify.access_token;
const refreshToken = verify.refresh_token;
if (!accessToken) {
  console.error("verify failed", verify);
  process.exit(2);
}
const ref = URL_.match(/https:\/\/([^.]+)\./)[1];
const sessionPayload = encodeURIComponent(JSON.stringify({
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: verify.user,
}));
const cookieHeader = `sb-${ref}-auth-token=${sessionPayload}`;
console.log(`[auth] minted access token for ${EMAIL}`);

// ── 2. Hit /api/business-plan/validate ─────────────────────────────────────
console.log(`[validate] POST ${PROD}/api/business-plan/validate`);
const vRes = await fetch(`${PROD}/api/business-plan/validate`, {
  method: "POST",
  headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
  // include_pass2: false for the verify script — Pass 2 is non-determinstic
  // (LLM output) and we don't want a flaky qualitative pass to break CI.
  body: JSON.stringify({ include_pass2: false }),
});

assertOk(vRes.ok, `validate endpoint returns 200 (got ${vRes.status})`);
const report = await vRes.json();
assertOk(typeof report === "object" && report !== null, "report is an object");
assertOk(Array.isArray(report.numeric_findings), "numeric_findings is an array");
assertOk(Array.isArray(report.qualitative_findings), "qualitative_findings is an array");
assertOk(report.stats && typeof report.stats.sections_scanned === "number", "stats.sections_scanned present");
console.log(`[validate] sections=${report.stats.sections_scanned} claims=${report.stats.claims_extracted} matched=${report.stats.claims_matched} blocking=${report.blocking}`);

if (report.numeric_findings.length > 0) {
  console.log(`[validate] ${report.numeric_findings.length} numeric findings:`);
  for (const f of report.numeric_findings.slice(0, 5)) {
    console.log(`  · ${f.dimension} — ${f.message}`);
  }
}

// ── 3. Hit the PDF route with and without ?force=1 ─────────────────────────
// First, default behavior (no force): if blocking → 422 with the report shape;
// otherwise → 200 with application/pdf.
console.log(`[pdf] GET ${PROD}/api/pdf/business_plan_full (no force)`);
const pdfRes = await fetch(`${PROD}/api/pdf/business_plan_full`, {
  headers: { Cookie: cookieHeader },
});
if (report.blocking) {
  assertOk(pdfRes.status === 422, `pdf route returns 422 when blocking (got ${pdfRes.status})`);
  const body = await pdfRes.json();
  assertOk(body.error === "validation_blocked", "422 body carries error=validation_blocked");
  assertOk(typeof body.report === "object" && body.report !== null, "422 body carries report object");
  assertOk(Array.isArray(body.report.numeric_findings), "422 report carries numeric_findings");
} else {
  assertOk(pdfRes.ok, `pdf route returns 200 when no blocking findings (got ${pdfRes.status})`);
  const ct = pdfRes.headers.get("content-type") ?? "";
  assertOk(ct.includes("application/pdf"), `content-type is application/pdf (got ${ct})`);
}

// Force override: must always yield a PDF.
console.log(`[pdf] GET ${PROD}/api/pdf/business_plan_full?force=1`);
const forcedRes = await fetch(`${PROD}/api/pdf/business_plan_full?force=1`, {
  headers: { Cookie: cookieHeader },
});
assertOk(forcedRes.ok, `pdf route returns 200 with ?force=1 (got ${forcedRes.status})`);
const forcedCt = forcedRes.headers.get("content-type") ?? "";
assertOk(forcedCt.includes("application/pdf"), `force=1 content-type is application/pdf (got ${forcedCt})`);
const buf = await forcedRes.arrayBuffer();
assertOk(buf.byteLength > 1000, `force=1 PDF is non-trivial (${buf.byteLength} bytes)`);

console.log("[done] all checks passed");
process.exit(0);
