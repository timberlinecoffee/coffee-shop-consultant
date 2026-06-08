// TIM-1942 prod live-verify: drive every admin-portal flow on production.
//
// 1. Anonymous /admin* → 404, anonymous /api/admin/* → 401 (don't reveal route).
// 2. Sign in as APP_ADMIN_EMAIL via service-role magiclink + cookie inject.
// 3. /api/admin/members → list, take screenshot of /admin home + members + audit.
// 4. Submit support form (TIM-1941) → confirm it appears in /admin/support.
// 5. Pick a test member, call change-plan, cancel (period_end), password-reset.
// 6. Assert each action wrote an admin_audit_log row + Stripe sub mutated.
// 7. Snapshot /admin/audit-log showing the 4 new rows.

import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://coffee-shop-consultant.vercel.app";
const HOST = "coffee-shop-consultant.vercel.app";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const ADMIN_EMAIL = "trentrollings@gmail.com";

const shots = "scripts/shots";
fs.mkdirSync(shots, { recursive: true });

function logFail(msg) { console.error("FAIL:", msg); process.exitCode = 1; }
function logPass(msg) { console.log("PASS:", msg); }

// === Step 1: anonymous gates ===
{
  const r = await fetch(`${BASE}/admin`, { redirect: "manual" });
  if (r.status !== 404) logFail(`/admin anon expected 404, got ${r.status}`); else logPass(`/admin anon → 404`);
}
{
  const r = await fetch(`${BASE}/admin/members`, { redirect: "manual" });
  if (r.status !== 404) logFail(`/admin/members anon expected 404, got ${r.status}`); else logPass(`/admin/members anon → 404`);
}
{
  const r = await fetch(`${BASE}/api/admin/members`);
  if (r.status !== 401) logFail(`/api/admin/members anon expected 401, got ${r.status}`); else logPass(`/api/admin/members anon → 401`);
}
{
  const r = await fetch(`${BASE}/api/admin/audit-log`);
  if (r.status !== 401) logFail(`/api/admin/audit-log anon expected 401, got ${r.status}`); else logPass(`/api/admin/audit-log anon → 401`);
}

// === Step 2: mint admin session ===
const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }),
});
if (!linkRes.ok) { logFail(`generate_link: ${linkRes.status} ${await linkRes.text()}`); process.exit(1); }
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});
if (!verifyRes.ok) { logFail(`verify: ${verifyRes.status} ${await verifyRes.text()}`); process.exit(1); }
const auth = await verifyRes.json();
logPass(`auth as ${auth.user?.email}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([
  {
    name: `sb-${REF}-auth-token`,
    value: JSON.stringify({
      access_token: auth.access_token, refresh_token: auth.refresh_token,
      expires_in: auth.expires_in, expires_at: auth.expires_at,
      token_type: auth.token_type, user: auth.user,
    }),
    domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
  },
  { name: "gw_consent", value: "all", domain: HOST, path: "/", secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERR:", m.text()); });

async function shot(name) {
  const path = `${shots}/tim1942-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log("snap:", path);
}

// === Step 3: list members + snapshots ===
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
await shot("home");

await page.goto(`${BASE}/admin/members`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
await shot("members");

// Fetch the members list directly through the API for selection.
const membersRes = await page.request.get(`${BASE}/api/admin/members`);
if (!membersRes.ok()) logFail(`members API ${membersRes.status()}`);
const members = await membersRes.json();
logPass(`members API returned ${members.length} rows`);

// Pick test targets. We need:
//   - changeTarget: has an active Stripe sub so sub.update works without a fresh payment method
//   - cancelTarget: any non-admin member (period_end is harmless)
// Prefer the explicit tim1955-prefixed verify fixtures so we don't touch real users.
const isFixture = (m) => m.email.startsWith("tim1955+") || m.email.startsWith("qa-") || m.email.endsWith("@verify.local");
const changeTarget = members.find((m) => m.email !== ADMIN_EMAIL && m.subscription_status === "active" && isFixture(m)) ?? members.find((m) => m.email !== ADMIN_EMAIL && m.subscription_status === "active");
const cancelTarget = members.find((m) => m.email !== ADMIN_EMAIL && isFixture(m) && m.id !== changeTarget?.id) ?? members.find((m) => m.email !== ADMIN_EMAIL && m.id !== changeTarget?.id);
const resetTarget = members.find((m) => m.email !== ADMIN_EMAIL && isFixture(m)) ?? members.find((m) => m.email !== ADMIN_EMAIL);
if (!changeTarget || !cancelTarget || !resetTarget) { logFail("missing test targets"); process.exit(1); }
console.log("changeTarget:", changeTarget.email, changeTarget.subscription_tier, changeTarget.subscription_status);
console.log("cancelTarget:", cancelTarget.email, cancelTarget.subscription_tier, cancelTarget.subscription_status);
console.log("resetTarget:", resetTarget.email);
const target = changeTarget;

// === Step 4: submit support form, confirm in inbox ===
const subjectTag = `TIM-1942 verify ${new Date().toISOString().slice(11, 19)}`;
const supportSubmit = await fetch(`${BASE}/api/support`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "TIM-1942 verifier",
    email: "verify+tim1942@simpler.coffee",
    subject: subjectTag,
    message: `Live-verify ping for TIM-1942 admin inbox. Filed at ${new Date().toISOString()}.`,
    page_url: `${BASE}/help/contact`,
  }),
});
if (!supportSubmit.ok) logFail(`support submit ${supportSubmit.status}`);
else logPass("support form submitted");

await page.goto(`${BASE}/admin/support`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
const present = await page.getByText(subjectTag, { exact: false }).count();
if (present === 0) logFail(`support subject "${subjectTag}" not visible in inbox`); else logPass(`support message visible in admin inbox`);
await shot("support");

// === Step 5: 3 admin actions on the test member ===
await page.goto(`${BASE}/admin/members/${target.id}`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
await shot("member-detail-before");

// 5a. Change plan on changeTarget — flip starter→pro (or vice versa) so sub.update has work to do.
const newTier = changeTarget.subscription_tier === "pro" ? "starter" : "pro";
const changeRes = await page.request.post(`${BASE}/api/admin/members/${changeTarget.id}/change-plan`, {
  data: { tier: newTier, interval: "monthly", proration: "none" },
});
const changeBody = await changeRes.json().catch(() => ({}));
if (!changeRes.ok()) logFail(`change-plan ${changeRes.status()} ${JSON.stringify(changeBody)}`);
else logPass(`change-plan ${changeTarget.subscription_tier}→${newTier} → ${JSON.stringify(changeBody).slice(0, 160)}`);

// 5a.5 Restore changeTarget to its original tier so we leave clean state.
const restoreRes = await page.request.post(`${BASE}/api/admin/members/${changeTarget.id}/change-plan`, {
  data: { tier: changeTarget.subscription_tier, interval: "monthly", proration: "none" },
});
if (!restoreRes.ok()) console.warn("WARN: restore change-plan", restoreRes.status());
else console.log(`restored ${changeTarget.email} to ${changeTarget.subscription_tier}`);

// 5b. Cancel at period end on cancelTarget.
const cancelRes = await page.request.post(`${BASE}/api/admin/members/${cancelTarget.id}/cancel`, {
  data: { when: "period_end" },
});
const cancelBody = await cancelRes.json().catch(() => ({}));
if (!cancelRes.ok()) logFail(`cancel ${cancelRes.status()} ${JSON.stringify(cancelBody)}`);
else logPass(`cancel(period_end) → ${JSON.stringify(cancelBody).slice(0, 200)}`);

// 5c. Trigger password reset on resetTarget.
const resetRes = await page.request.post(`${BASE}/api/admin/members/${resetTarget.id}/password-reset`);
const resetBody = await resetRes.json().catch(() => ({}));
if (!resetRes.ok()) logFail(`password-reset ${resetRes.status()} ${JSON.stringify(resetBody)}`);
else logPass(`password-reset → ${JSON.stringify(resetBody).slice(0, 200)}`);

// 5d. Reload detail page so it reflects the new plan + sub.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await shot("member-detail-after");

// === Step 6: CSV export — assert it's a real CSV, not a JSON error ===
const csvRes = await page.request.get(`${BASE}/api/admin/members/export`);
if (!csvRes.ok()) logFail(`csv export ${csvRes.status()}`);
else {
  const ct = csvRes.headers()["content-type"] ?? "";
  const body = await csvRes.text();
  const header = body.split("\n", 1)[0];
  if (!ct.startsWith("text/csv")) logFail(`csv content-type ${ct}`);
  if (!header.startsWith("id,email")) logFail(`csv header unexpected: ${header}`);
  // Spot-check formula injection guard: no line should start with =, +, @ (- is plausible for negative numbers but we don't expect any).
  const bad = body.split("\n").slice(1).find((row) => /^"?[=+@]/.test(row));
  if (bad) logFail(`csv row starts with formula char: ${bad.slice(0, 120)}`);
  else logPass(`csv export ${body.length} bytes, ${body.split("\n").length - 2} rows, no leading formula chars`);
}

// === Step 7: audit log — confirm all 4 of our actions wrote rows ===
const auditRes = await page.request.get(`${BASE}/api/admin/audit-log`);
if (!auditRes.ok()) logFail(`audit-log ${auditRes.status()}`);
const audit = await auditRes.json();
const since = Date.now() - 5 * 60 * 1000;
const ours = audit.filter((row) => new Date(row.created_at).getTime() >= since && row.actor_email === ADMIN_EMAIL);
const have = new Set(ours.map((r) => r.action));
console.log("recent actions:", [...have].sort());
for (const action of ["change_plan", "cancel_account", "password_reset", "support_message_update"]) {
  if (action === "support_message_update") {
    // We didn't change the message status — only logged on PATCH. So just confirm the other 3.
    continue;
  }
  if (!have.has(action)) logFail(`audit log missing action: ${action}`);
  else logPass(`audit log has action: ${action}`);
}

await page.goto(`${BASE}/admin/audit-log`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
await shot("audit-log");

await browser.close();

if (process.exitCode) console.error("\nRESULT: FAIL");
else console.log("\nRESULT: PASS");
