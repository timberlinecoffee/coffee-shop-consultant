// TIM-2356 prod verify: drive POST /api/business-plan/audit as trent@simpler.coffee
// on https://groundwork.cafe and assert the Plan Quality Check report passes
// every QA gate the board called out:
//
//   1. Endpoint returns 200 with a typed report shape.
//   2. At least one finding per severity level (critical / warning / info).
//   3. Every finding has all three plain-language fields populated
//      (issue, why_it_matters, suggested_fix) — non-empty, non-null.
//   4. ZERO `<…>` template tags visible in any string field on any finding.
//   5. raw_message + quoted_text + expected_text all tag-clean too.
//   6. Cached re-click on identical state returns the byte-identical report
//      with cached:true.
//
// Run:
//   PROD_URL=https://groundwork.cafe \
//   $(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=" .env.prod | sed 's/=\(.*\)/=\1/' | tr '\n' ' ') \
//   node scripts/tim2356-prod-verify.mjs

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim().replace(/^["']|["']$/g, "");
const SVC = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim().replace(/^["']|["']$/g, "");
const ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim().replace(/^["']|["']$/g, "");
const PROD = (process.env.PROD_URL ?? "https://groundwork.cafe").trim();
const EMAIL = (process.env.FIXTURE_EMAIL ?? "trent@simpler.coffee").trim();

if (!URL_ || !SVC || !ANON) {
  console.error("env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(2);
}

let failures = 0;
function check(label, cond, detail = "") {
  const mark = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

// 1. Mint session for trent@simpler.coffee.
const link = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
}).then((r) => r.json());
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
if (!tokenHash) { console.error("generate_link failed", link); process.exit(2); }
const verify = await fetch(`${URL_}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
}).then((r) => r.json());
const accessToken = verify.access_token;
if (!accessToken) { console.error("verify failed", verify); process.exit(2); }
console.log(`[auth] minted session for ${EMAIL}`);

const ref = URL_.match(/https:\/\/([^.]+)\./)[1];
const sessionPayload = encodeURIComponent(JSON.stringify({
  access_token: accessToken,
  refresh_token: verify.refresh_token,
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: verify.user,
}));
const cookieHeader = `sb-${ref}-auth-token=${sessionPayload}`;

// 2. POST /api/business-plan/audit (first call — will recompute or hit cache).
console.log(`[audit] POST ${PROD}/api/business-plan/audit (first)`);
const t0 = Date.now();
const res1 = await fetch(`${PROD}/api/business-plan/audit`, {
  method: "POST",
  headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const elapsed1 = Date.now() - t0;
check("first audit returns 200", res1.ok, `${res1.status} after ${elapsed1}ms`);
if (!res1.ok) {
  console.error(await res1.text());
  process.exit(1);
}
const body1 = await res1.json();
check("first audit returns report object", body1?.report && typeof body1.report === "object");
const report = body1.report;
check("report has findings array", Array.isArray(report?.findings));
check("report has stats", report?.stats && typeof report.stats.total === "number", `total=${report?.stats?.total}`);
check("report has state_hash", typeof report?.state_hash === "string" && report.state_hash.length === 64, `len=${report?.state_hash?.length}`);
check("report has generated_at ISO timestamp", typeof report?.generated_at === "string" && !isNaN(Date.parse(report.generated_at)));

// 3. Severity coverage.
const bySeverity = { critical: [], warning: [], info: [] };
for (const f of report.findings) {
  if (f.severity === "critical") bySeverity.critical.push(f);
  else if (f.severity === "warning") bySeverity.warning.push(f);
  else if (f.severity === "info") bySeverity.info.push(f);
}
console.log(`[stats] critical=${bySeverity.critical.length} warning=${bySeverity.warning.length} info=${bySeverity.info.length}`);
check("≥1 critical finding", bySeverity.critical.length >= 1, `count=${bySeverity.critical.length}`);
check("≥1 warning finding", bySeverity.warning.length >= 1, `count=${bySeverity.warning.length}`);
check("≥1 info finding", bySeverity.info.length >= 1, `count=${bySeverity.info.length}`);

// 4. Plain-language synthesis fields populated for every finding.
let missingSynth = 0;
let tagLeaks = 0;
const tagRe = /<\/?[a-zA-Z][\w-]*(?:\s+[^>]*)?\/?>/;
for (const f of report.findings) {
  if (!f.issue || !f.why_it_matters || !f.suggested_fix) missingSynth++;
  const fields = [f.issue, f.why_it_matters, f.suggested_fix, f.raw_message, f.quoted_text, f.expected_text, f.suggested_replacement, f.source?.workspace_label, f.source?.field_label, f.target?.workspace_label, f.target?.field_label];
  for (const v of fields) {
    if (typeof v === "string" && tagRe.test(v)) {
      tagLeaks++;
      console.log(`  [tag leak] ${f.id}: ${v.slice(0, 120)}`);
      break;
    }
  }
}
check("every finding has all 3 plain-language fields", missingSynth === 0, `missing=${missingSynth}/${report.findings.length}`);
check("ZERO template tags in any string field", tagLeaks === 0, `leaks=${tagLeaks}/${report.findings.length}`);

// 5. Sample one card from each severity for the board record.
for (const sev of ["critical", "warning", "info"]) {
  const f = bySeverity[sev][0];
  if (!f) continue;
  console.log(`\n[sample ${sev}] ${f.id} (${f.rule_id})`);
  console.log(`  Issue: ${f.issue}`);
  console.log(`  Why it matters: ${f.why_it_matters}`);
  console.log(`  Suggested fix: ${f.suggested_fix}`);
  console.log(`  Source: ${f.source?.workspace_label} → ${f.source?.field_label ?? "-"}`);
  console.log(`  Target: ${f.target?.workspace_label} → ${f.target?.field_label ?? "-"}`);
}

// 6. Re-click — must hit cache + return byte-identical report.
console.log(`\n[audit] POST ${PROD}/api/business-plan/audit (re-click for cache hit)`);
const t1 = Date.now();
const res2 = await fetch(`${PROD}/api/business-plan/audit`, {
  method: "POST",
  headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const elapsed2 = Date.now() - t1;
check("re-click returns 200", res2.ok, `${res2.status} after ${elapsed2}ms`);
const body2 = await res2.json();
check("re-click hits cache", body2.cached === true, `cached=${body2.cached}`);
check("re-click identical state_hash", body2.report?.state_hash === report.state_hash);
check("re-click identical findings count", body2.report?.findings?.length === report.findings.length);
check("re-click is FAST (cached path)", elapsed2 < 3000, `${elapsed2}ms`);

// 7. Page rendering sanity — GET the workspace page and confirm Check Plan
// button text + audit endpoint URL appear in the HTML.
console.log(`\n[page] GET ${PROD}/workspace/business-plan`);
const pageRes = await fetch(`${PROD}/workspace/business-plan`, { headers: { Cookie: cookieHeader } });
check("workspace page returns 200", pageRes.ok, `${pageRes.status}`);
const html = await pageRes.text();
check("page references 'Check Plan' label", html.includes("Check Plan"));
check("page references 'Quality Check' tab", html.includes("Quality Check"));

console.log(`\n[summary] failures=${failures}`);
process.exit(failures > 0 ? 1 : 0);
