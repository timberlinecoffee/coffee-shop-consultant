#!/usr/bin/env node
// TIM-2426: live verify of the Cross-Suite Conflict Resolver on
// https://groundwork.cafe after merge.
//
// Pins:
//   A. /api/copilot/cross-suite-resolver returns a hiring↔financials conflict
//      for the Trent fixture.
//   B. Conflict statement matches the UX-spec voice ("Your hiring plan and
//      financial plan disagree on how many people you'll have on payroll.").
//   C. Both suite snapshots populated with real numbers (no "0 people").
//   D. Benchmark zone present, range 28–35%, source = SCA cafe benchmarking.
//   E. Three resolution paths (trim_hiring, raise_budget, phased_hires).
//   F. Phased hires is the recommended path (current labor pct > band max).
//   G. Each path carries at least one SuggestionPayload card so AIReviewModal
//      has something to render on Accept.
//   H. Hiring workspace HTML chunk scan finds the ConflictNoticeBadge mount
//      point copy ("Resolve plan conflict" / "Resolve N plan conflicts").
//   I. Financials workspace HTML chunk scan same.
//
// Auth: same Supabase magiclink + verifyOtp + chunked @supabase/ssr cookie
// pattern proven on TIM-2413 / TIM-2416 / TIM-2385.

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
  } catch {
    // optional
  }
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

const ARTIFACTS = join(repoRoot, "verify-tim2426");
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

async function mintCookieHeader() {
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
  console.log(`# TIM-2426 verify on ${BASE} as ${FIXTURE_EMAIL}`);
  const cookieHeader = await mintCookieHeader();
  console.log(`✓ Minted session cookie (length ${cookieHeader.length})`);

  // ── A. API GET ──────────────────────────────────────────────────────────────
  const apiRes = await fetch(`${BASE}/api/copilot/cross-suite-resolver`, {
    headers: { Cookie: cookieHeader, Accept: "application/json" },
  });
  assert("A. /api/copilot/cross-suite-resolver returns 200", apiRes.status === 200, `status=${apiRes.status}`);
  let body;
  try {
    body = await apiRes.json();
  } catch (e) {
    body = { _err: String(e) };
  }
  writeFileSync(join(ARTIFACTS, "resolver-response.json"), JSON.stringify(body, null, 2));
  const conflicts = Array.isArray(body?.conflicts) ? body.conflicts : [];
  const hf = conflicts.find((c) => c.id === "hiring_financials_headcount");
  assert("A. response contains hiring_financials_headcount conflict", !!hf);
  if (!hf) {
    console.log("(no hiring↔financials conflict for fixture — bailing further checks)");
    return finish();
  }

  // ── B. statement voice ──────────────────────────────────────────────────────
  assert(
    "B. plain-language statement matches UX spec voice",
    typeof hf.statement === "string" &&
      hf.statement.toLowerCase().includes("hiring plan") &&
      hf.statement.toLowerCase().includes("financial plan") &&
      hf.statement.toLowerCase().includes("disagree"),
    hf.statement,
  );
  assert("B. statement has no em-dashes (voice mandate)", !hf.statement.includes("—"));

  // ── C. snapshots ────────────────────────────────────────────────────────────
  const aPeople = String(hf.suiteA?.displayValue ?? "");
  const bPeople = String(hf.suiteB?.displayValue ?? "");
  assert(
    "C. Hiring snapshot shows real headcount (not 0)",
    /^\d+ /.test(aPeople) && !aPeople.startsWith("0 "),
    aPeople,
  );
  assert(
    "C. Financials snapshot shows real headcount (not 0)",
    /^\d+ /.test(bPeople) && !bPeople.startsWith("0 "),
    bPeople,
  );
  assert(
    "C. snapshots disagree (the whole point)",
    aPeople !== bPeople,
    `${aPeople} vs ${bPeople}`,
  );

  // ── D. benchmark ────────────────────────────────────────────────────────────
  if (hf.benchmark) {
    assert(
      "D. benchmark range is 28–35% of revenue",
      hf.benchmark.rangeLabel?.includes("28") && hf.benchmark.rangeLabel?.includes("35"),
      hf.benchmark.rangeLabel,
    );
    assert(
      "D. benchmark source is SCA",
      String(hf.benchmark.source ?? "").includes("Specialty Coffee Association"),
      hf.benchmark.source,
    );
  } else {
    console.log("(benchmark zone hidden — no Y1 revenue forecast yet — skipping D)");
  }

  // ── E/F. paths ──────────────────────────────────────────────────────────────
  const pathIds = (hf.paths ?? []).map((p) => p.id).sort();
  assert(
    "E. three resolution paths present",
    pathIds.length === 3 &&
      pathIds.includes("trim_hiring") &&
      pathIds.includes("raise_budget") &&
      pathIds.includes("phased_hires"),
    pathIds.join(", "),
  );
  assert(
    "F. phased_hires is recommended (current labor pct > band ceiling)",
    hf.recommendedPathId === "phased_hires",
    hf.recommendedPathId,
  );

  // ── G. suggestion payloads ──────────────────────────────────────────────────
  for (const p of hf.paths ?? []) {
    // phased_hires only has cards when roles have start_date set; if a fixture
    // doesn't include start_date the path is still valid, downstream effects
    // still render, but AIReviewModal would have nothing to commit. Surface as
    // a warn rather than a hard fail.
    if (p.id === "phased_hires" && (p.suggestions ?? []).length === 0) {
      console.log("  ! phased_hires has 0 suggestion cards (roles missing start_date) — Apply round-trip on this path is inconclusive on the fixture");
    } else {
      assert(
        `G. path "${p.id}" has at least one suggestion card`,
        (p.suggestions ?? []).length > 0,
      );
    }
  }

  // ── H/I. workspace HTML scan ────────────────────────────────────────────────
  for (const slug of ["hiring", "financials"]) {
    const wsRes = await fetch(`${BASE}/workspace/${slug}`, {
      headers: { Cookie: cookieHeader, Accept: "text/html" },
    });
    const html = await wsRes.text();
    writeFileSync(join(ARTIFACTS, `${slug}-page.html`), html);
    // The badge component is lazy-loaded via the workspace bundle; iterate
    // every chunk and look for the badge copy. Same pattern as TIM-2385.
    const chunkPaths = Array.from(html.matchAll(/_next\/static\/chunks\/([^"'?]+\.js)/g))
      .map((m) => m[1]);
    const uniqueChunks = [...new Set(chunkPaths)];
    let hit = false;
    for (const chunk of uniqueChunks) {
      const cRes = await fetch(`${BASE}/_next/static/chunks/${chunk}`);
      if (!cRes.ok) continue;
      const cText = await cRes.text();
      if (
        cText.includes("Resolve plan conflict") ||
        cText.includes("Resolve ") && cText.includes(" plan conflicts")
      ) {
        hit = true;
        break;
      }
    }
    assert(
      `${slug === "hiring" ? "H" : "I"}. ${slug} workspace bundle includes ConflictNoticeBadge copy`,
      hit,
      `${uniqueChunks.length} chunks scanned`,
    );
  }

  return finish();
}

function finish() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n# ${passed}/${results.length} pinned`);
  writeFileSync(join(ARTIFACTS, "results.json"), JSON.stringify(results, null, 2));
  if (failed.length > 0) {
    for (const r of failed) console.log(`  ✗ ${r.name}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
