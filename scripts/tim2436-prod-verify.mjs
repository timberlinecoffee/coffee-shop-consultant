#!/usr/bin/env node
// TIM-2436: live verify on https://groundwork.cafe after main lands.
//
// Source of chunk graph: /workspace/financials. Per the TIM-2453 memory
// note, /dashboard lazy-loads CoPilotDrawer (16 chunks, no copilot module
// in the initial graph). Workspace pages mount it eagerly, so the chunk
// content there is the authoritative bundle pin.
//
// Pins (12 assertions):
//   1.  /workspace/financials returns 200 with auth.
//   2.  Chunk graph contains the literal "Past chats" trigger label.
//   3.  Chunk graph contains the new `data-testid="past-chats-trigger"`.
//   4.  Chunk graph contains the new `data-testid="past-chats-drawer"`.
//   5.  Chunk graph contains the pinned-pill `data-testid="copilot-review-suggestions"`.
//   6.  Chunk graph contains the pinned-pill `data-testid="copilot-review-conflicts"`.
//   7.  Chunk graph contains the low-water credits row `data-testid="copilot-credits-row"`.
//   8.  Chunk graph does NOT contain the retired `brew-conversations-open` key.
//   9.  Chunk graph does NOT contain the retired hamburger aria-label "Conversations".
//   10. Chunk graph does NOT contain the removed header "free left" trial counter copy.
//   11. /workspace/concept also returns 200 (cross-workspace consistency probe).
//   12. /workspace/menu-pricing chunk graph also exposes the Past chats trigger
//       (proves the shared CoPilotDrawer module is consistent across workspaces).

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

const OUT_DIR = join(repoRoot, "verify-tim2436");
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
      "User-Agent": "tim2436-verify/1.0",
    },
    redirect: "manual",
  });
  const body = await res.text();
  return { status: res.status, body, location: res.headers.get("location") };
}

function chunkUrlsFromHtml(html) {
  // Every Next.js chunk URL: /_next/static/chunks/<anything>.js
  const re = /\/_next\/static\/chunks\/[^"'?\s]+\.js/g;
  return Array.from(new Set(html.match(re) ?? []));
}

async function loadChunkBodies(chunks) {
  const bodies = await Promise.all(
    chunks.map(async (path) => {
      try {
        const res = await fetch(`${BASE}${path}`, {
          headers: { "User-Agent": "tim2436-verify/1.0" },
        });
        if (!res.ok) return "";
        return await res.text();
      } catch {
        return "";
      }
    }),
  );
  return bodies.join("\n");
}

async function main() {
  console.log("=== TIM-2436 prod verify ===");
  console.log(`BASE=${BASE}  FIXTURE=${FIXTURE_EMAIL}`);
  const cookie = await mintSessionCookieHeader();

  // 1. /workspace/financials 200 (eager-loads CoPilotDrawer).
  const fin = await fetchHtml("/workspace/financials", cookie);
  writeFileSync(join(OUT_DIR, "financials.html"), fin.body);
  assert("/workspace/financials returns 200", fin.status === 200, `status=${fin.status}`);

  const finChunks = chunkUrlsFromHtml(fin.body);
  console.log(`(found ${finChunks.length} chunk URLs on /workspace/financials)`);
  const finGraph = await loadChunkBodies(finChunks);
  writeFileSync(join(OUT_DIR, "financials-chunks-concat.txt"), finGraph);

  // 2. "Past chats" trigger label.
  assert("chunks contain \"Past chats\" trigger label", finGraph.includes("Past chats"));
  // 3. past-chats-trigger testid.
  assert(
    "chunks contain data-testid=past-chats-trigger",
    finGraph.includes("past-chats-trigger"),
  );
  // 4. past-chats-drawer testid.
  assert(
    "chunks contain data-testid=past-chats-drawer",
    finGraph.includes("past-chats-drawer"),
  );
  // 5. pinned suggestion pill testid.
  assert(
    "chunks contain data-testid=copilot-review-suggestions",
    finGraph.includes("copilot-review-suggestions"),
  );
  // 6. pinned conflict pill testid.
  assert(
    "chunks contain data-testid=copilot-review-conflicts",
    finGraph.includes("copilot-review-conflicts"),
  );
  // 7. credits low-water row testid.
  assert(
    "chunks contain data-testid=copilot-credits-row",
    finGraph.includes("copilot-credits-row"),
  );
  // 8. retired key gone.
  assert(
    "chunks do NOT contain retired brew-conversations-open key",
    !finGraph.includes("brew-conversations-open"),
  );
  // 9. retired hamburger aria-label gone.
  assert(
    "chunks do NOT contain retired aria-label \"Conversations\"",
    !/aria-label["'\\]*:?\s*["'\\]*Conversations["'\\]/.test(finGraph),
  );
  // 10. removed header "X free" / "X free left" trial counter copy gone.
  assert(
    "chunks do NOT contain retired \"free left\" header counter copy",
    !finGraph.includes("free left"),
  );

  // 11. /workspace/concept 200.
  const concept = await fetchHtml("/workspace/concept", cookie);
  writeFileSync(join(OUT_DIR, "concept.html"), concept.body);
  assert("/workspace/concept returns 200", concept.status === 200, `status=${concept.status}`);

  // 12. /workspace/menu-pricing chunk graph contains Past chats too — proves
  //     cross-workspace consistency (same shared CoPilotDrawer module).
  const menu = await fetchHtml("/workspace/menu-pricing", cookie);
  writeFileSync(join(OUT_DIR, "menu-pricing.html"), menu.body);
  const menuChunks = chunkUrlsFromHtml(menu.body);
  console.log(`(found ${menuChunks.length} chunk URLs on /workspace/menu-pricing)`);
  const menuGraph = await loadChunkBodies(menuChunks);
  writeFileSync(join(OUT_DIR, "menu-pricing-chunks-concat.txt"), menuGraph);
  assert(
    "/workspace/menu-pricing chunks contain \"Past chats\" trigger label",
    menuGraph.includes("Past chats"),
  );

  // Summary
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`\n=== TIM-2436 verify: ${pass}/${results.length} pinned (${fail} failed) ===`);
  writeFileSync(
    join(OUT_DIR, "results.json"),
    JSON.stringify({ base: BASE, fixture: FIXTURE_EMAIL, results }, null, 2),
  );
  if (fail > 0) process.exit(2);
}

main().catch((err) => {
  console.error("verify crashed:", err);
  process.exit(1);
});
