// TIM-2750 — comprehensive PKCE OAuth repro.
// Goal: confirm whether the verifier cookie supabase-js writes BEFORE nav
// (a) actually lands in document.cookie, and (b) whose hash matches the
// challenge supabase-js sends to /authorize.
//
// Two scenarios:
//   A) vanilla — no stale planted
//   B) stale planted with different Path/Domain attrs
//
// Output: per-attempt JSON to stdout + crypto verification of hash match.

import { chromium } from "playwright";
import crypto from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3740";
const SUPABASE_REF = "ltmcttjftxzpgynhnrpg";
const VERIFIER_NAME = `sb-${SUPABASE_REF}-auth-token-code-verifier`;

function decodeVerifierCookieValue(raw) {
  // @supabase/auth-js does JSON.stringify(verifier) → "\"verifier\""
  // @supabase/ssr then base64url-encodes the whole JSON string with "base64-" prefix.
  let stripped = raw.startsWith("base64-") ? raw.slice("base64-".length) : raw;
  let decoded;
  try {
    decoded = Buffer.from(stripped, "base64url").toString("utf8");
  } catch {
    decoded = stripped;
  }
  // The decoded value is a JSON-stringified verifier (with quotes)
  try {
    return JSON.parse(decoded);
  } catch {
    return decoded;
  }
}

function challengeFromVerifier(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function runScenario(name, plantStale) {
  console.log(`\n========== SCENARIO ${name} ==========`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  if (plantStale) {
    for (const variant of [
      { domain: "localhost", path: "/" },
      { domain: "localhost", path: "/login" },
    ]) {
      try {
        await ctx.addCookies([
          {
            name: VERIFIER_NAME,
            value: "base64-PLANTED_STALE_VARIANT_AT_" + variant.path.replace(/\W/g, "_"),
            domain: variant.domain,
            path: variant.path,
            secure: false,
            sameSite: "Lax",
            expires: Math.floor(Date.now() / 1000) + 3600,
          },
        ]);
      } catch (e) {
        console.log("  plant skip:", variant, e.message);
      }
    }
  }

  console.log("--- cookies BEFORE /login ---");
  for (const c of await ctx.cookies()) {
    if (c.name.includes("verifier") || c.name.startsWith("sb-")) {
      console.log("  ", c.name, "Path=" + c.path, "Domain=" + c.domain, "len=" + c.value.length);
    }
  }

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

  console.log("--- cookies AFTER /login load (before click) ---");
  for (const c of await ctx.cookies()) {
    if (c.name.includes("verifier") || c.name.startsWith("sb-") || c.name.startsWith("gw_oauth_")) {
      console.log("  ", c.name, "Path=" + c.path, "Domain=" + c.domain, "len=" + c.value.length);
    }
  }

  let supabaseChallenge = null;
  let supabaseAuthorizeUrl = null;
  await page.route("https://accounts.google.com/**", r => r.abort());
  await page.route(`https://${SUPABASE_REF}.supabase.co/auth/v1/authorize**`, r => {
    supabaseAuthorizeUrl = r.request().url();
    supabaseChallenge = new URL(supabaseAuthorizeUrl).searchParams.get("code_challenge");
    console.log("\n  intercepted Supabase /authorize, code_challenge =", supabaseChallenge);
    r.abort();
  });

  await page.getByRole("button", { name: /Continue with Google/i }).click().catch(() => {});
  await page.waitForTimeout(2500);

  console.log("\n--- cookies AFTER click ---");
  const allCookies = await ctx.cookies();
  const verifierCookies = [];
  for (const c of allCookies) {
    if (c.name === VERIFIER_NAME || c.name.startsWith(`${VERIFIER_NAME}.`)) {
      verifierCookies.push(c);
      console.log("  VERIFIER", c.name, "Path=" + c.path, "Domain=" + c.domain, "len=" + c.value.length, "Secure=" + c.secure, "SameSite=" + c.sameSite, "preview=", c.value.slice(0, 40));
    } else if (c.name.startsWith("gw_oauth_")) {
      console.log("  HANDOFF", c.name, "Path=" + c.path, "Domain=" + c.domain, "value=" + c.value.slice(0, 60));
    } else if (c.name.startsWith("sb-")) {
      console.log("  SB     ", c.name, "Path=" + c.path, "Domain=" + c.domain, "len=" + c.value.length);
    }
  }

  // Check the gw_oauth_stale_verifiers sentinel (b11873e)
  const staleSentinel = allCookies.find(c => c.name === "gw_oauth_stale_verifiers");
  console.log("\n  gw_oauth_stale_verifiers sentinel =", staleSentinel ? `'${staleSentinel.value}'` : "ABSENT");

  // Match check
  if (supabaseChallenge && verifierCookies.length > 0) {
    console.log("\n--- HASH MATCH CHECK ---");
    console.log("  /authorize sent code_challenge:", supabaseChallenge);
    for (const v of verifierCookies) {
      const decoded = decodeVerifierCookieValue(v.value);
      const hash = challengeFromVerifier(decoded);
      console.log(`  cookie ${v.name} (Path=${v.path} Domain=${v.domain})`);
      console.log(`     decoded verifier head: ${(decoded ?? "").slice(0, 30)}...`);
      console.log(`     sha256(verifier) base64url: ${hash}`);
      console.log(`     MATCH: ${hash === supabaseChallenge}`);
    }
  } else if (!supabaseChallenge) {
    console.log("\n  NO /authorize intercepted — click did not trigger signInWithOAuth?");
  } else {
    console.log("\n  NO verifier cookie in jar after click");
  }

  await browser.close();
}

await runScenario("A_vanilla", false);
await runScenario("B_stale_planted", true);
console.log("\n========== END ==========");
