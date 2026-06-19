// TIM-2750 — test the double-click race hypothesis.
// Click Continue with Google twice in rapid succession; capture both /authorize
// challenges and the final verifier cookie. If the final cookie's hash matches
// the SECOND challenge but Supabase will redirect from the FIRST request's
// flow, the user would land at /auth/callback with a verifier that mismatches
// the recorded challenge.

import { chromium } from "playwright";
import crypto from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3740";
const SUPABASE_REF = "ltmcttjftxzpgynhnrpg";
const VERIFIER_NAME = `sb-${SUPABASE_REF}-auth-token-code-verifier`;

function decode(raw) {
  const stripped = raw.startsWith("base64-") ? raw.slice(7) : raw;
  try {
    const utf = Buffer.from(stripped, "base64url").toString("utf8");
    return JSON.parse(utf);
  } catch {
    return null;
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const challenges = [];
await page.route("https://accounts.google.com/**", r => r.abort());
await page.route(`https://${SUPABASE_REF}.supabase.co/auth/v1/authorize**`, r => {
  const u = new URL(r.request().url());
  const challenge = u.searchParams.get("code_challenge");
  challenges.push({ challenge, at: Date.now() });
  console.log(`  /authorize call #${challenges.length}, challenge=${challenge}`);
  r.abort();
});

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
console.log("Page loaded, attempting rapid double-click");

const btn = page.getByRole("button", { name: /Continue with Google/i });
// Try to dispatch two clicks back-to-back without React having a chance to disable
await Promise.all([
  btn.click().catch(() => {}),
  btn.click({ force: true }).catch(() => {}),
  btn.click({ force: true }).catch(() => {}),
]);
await page.waitForTimeout(3000);

console.log(`\nTotal /authorize calls intercepted: ${challenges.length}`);
const cookies = await ctx.cookies();
const verifiers = cookies.filter(c => c.name === VERIFIER_NAME || c.name.startsWith(`${VERIFIER_NAME}.`));
console.log(`\nFinal verifier cookies in jar: ${verifiers.length}`);
for (const v of verifiers) {
  const decoded = decode(v.value);
  if (!decoded) {
    console.log(`  ${v.name} — failed to decode`);
    continue;
  }
  const hash = crypto.createHash("sha256").update(decoded).digest("base64url");
  console.log(`  ${v.name} Path=${v.path} verifier hash = ${hash}`);
  console.log(`     MATCHES challenge #1: ${hash === challenges[0]?.challenge}`);
  if (challenges.length > 1) {
    console.log(`     MATCHES challenge #2: ${hash === challenges[1]?.challenge}`);
  }
}

if (challenges.length > 1) {
  console.log("\n*** SMOKING GUN: multiple /authorize calls intercepted — double-click race is reproducible ***");
}
await browser.close();
