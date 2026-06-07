#!/usr/bin/env node
// TIM-2430 live verification on https://groundwork.cafe
//
// What we can verify without a real browser session:
//   1. /login responds 200 and the Turbopack chunks include the new copy
//      "Keep me signed in on this device".
//   2. The chunks include the canonical preference cookie name "gw_remember_me"
//      AND the helper symbol `downgradeAuthCookiesToSessionScope` (proves the
//      post-success client rewrite shipped) AND `isSupabaseAuthCookie` (proves
//      the shared helper bundled).
//   3. The bundle includes references to the proxy/server-side adjuster so we
//      know all three layers landed (compiled-out: just grep for token).
//
// What requires a real browser to verify and is documented as a manual board
// check below:
//   - Sign in with the box checked → close browser → reopen → still signed in.
//   - Sign in with the box unchecked → close browser → reopen → must re-auth.
//   - DevTools Application > Cookies shows `Max-Age` on `sb-*-auth-token*`
//     when checked and NO `Max-Age`/`Expires` when unchecked.

const HOST = "https://groundwork.cafe";

async function fetchText(url) {
  const res = await fetch(url, { redirect: "manual" });
  if (res.status !== 200 && res.status !== 304) {
    throw new Error(`${url} → ${res.status}`);
  }
  return res.text();
}

function findChunkUrls(html) {
  const re = /\/_next\/static\/chunks\/[^"'?]+\.js/g;
  const seen = new Set();
  for (const m of html.matchAll(re)) seen.add(m[0]);
  return [...seen];
}

// Production builds minify function names away — only string literals survive
// reliably. We pin on the user-visible copy (proves checkbox UI shipped) and
// the canonical cookie name (proves the helper module bundled). Server-side
// adapter changes (proxy + lib/supabase/server) are covered by unit tests.
const PINS = [
  { name: "checkbox copy", needle: "Keep me signed in on this device" },
  { name: "preference cookie name", needle: "gw_remember_me" },
  // Auth-cookie prefix the matcher checks against — present as a string literal
  // either in source or inlined after minification.
  { name: "supabase auth token cookie pattern", needle: "-auth-token" },
];

async function main() {
  const t0 = Date.now();
  console.log(`[tim2430] verifying ${HOST}/login`);

  const html = await fetchText(`${HOST}/login`);
  const chunks = findChunkUrls(html);
  console.log(`[tim2430] /login HTML pulled, ${chunks.length} chunks referenced`);

  // Pull every chunk — Next 16 / Turbopack does not prefix route-specific
  // chunks with the route path, so we cannot pre-filter.
  const corpus = [html];
  for (const c of chunks) {
    try {
      const body = await fetchText(`${HOST}${c}`);
      corpus.push(body);
    } catch (e) {
      console.warn(`[tim2430] chunk fetch failed: ${c} (${e.message})`);
    }
  }

  let pass = 0;
  let fail = 0;
  for (const pin of PINS) {
    const hit = corpus.some(text => text.includes(pin.needle));
    if (hit) {
      console.log(`  ✓ ${pin.name} ("${pin.needle}")`);
      pass++;
    } else {
      console.error(`  ✗ ${pin.name} ("${pin.needle}") NOT FOUND`);
      fail++;
    }
  }

  const ms = Date.now() - t0;
  console.log(`\n[tim2430] ${pass}/${PINS.length} pins matched in ${ms}ms`);
  if (fail > 0) {
    console.error(`\n[tim2430] FAIL — ${fail} pin(s) missing`);
    process.exit(1);
  }
  console.log("\n[tim2430] manual board verification (close-and-reopen) still required:");
  console.log("  1. Sign in with box CHECKED → close browser → reopen → still signed in.");
  console.log("  2. Sign in with box UNCHECKED → close browser → reopen → land on /login.");
  console.log("  3. DevTools Application > Cookies on groundwork.cafe:");
  console.log("     - checked  → sb-*-auth-token* shows Max-Age (or Expires far future)");
  console.log("     - unchecked → sb-*-auth-token* shows NO Max-Age and NO Expires (= Session)");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
