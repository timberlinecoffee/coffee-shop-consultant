// Reproduce TIM-2915 board symptom on live groundwork.cafe with trent's account.
// 1) Create a Sole Sisters plan via service-role (we have only Beaver & Beef now).
// 2) Login trent with magic-link cookie.
// 3) Open switcher, click Sole Sisters.
// 4) Capture: dropdown trigger label, listbox active flag after switch.
// 5) Reload the page and re-check — is the active state persisted?
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD = "https://groundwork.cafe";
const HOST = new URL(PROD).host;
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const TARGET_EMAIL = "trent@simpler.coffee";
const TRENT = "a9d38122-7402-4490-b662-f05464134db8";
const BEAVER = "37f5d270-8c43-4ab2-b96c-e54ac504c893";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

mkdirSync("scripts/shots", { recursive: true });

// Step 1 — ensure a Sole Sisters plan exists for trent (create temp if not)
let plans = await fetch(`${SUPABASE_URL}/rest/v1/coffee_shop_plans?user_id=eq.${TRENT}&select=id,plan_name,created_at&order=created_at.asc`, {headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:'Bearer '+SUPABASE_SERVICE_KEY}}).then(r=>r.json());
console.log("baseline plans:", plans.length, plans.map(p=>p.id.slice(0,8)+":"+p.plan_name).join(", "));
let solePlan = plans.find(p => p.plan_name === "Sole Sisters") || null;
if (!solePlan) {
  console.log("creating temporary Sole Sisters plan for repro...");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/coffee_shop_plans`, {
    method: "POST",
    headers: {apikey:SUPABASE_SERVICE_KEY,Authorization:'Bearer '+SUPABASE_SERVICE_KEY,'Content-Type':'application/json',Prefer:'return=representation'},
    body: JSON.stringify({user_id: TRENT, plan_name: "Sole Sisters", location_label: "(repro)"})
  });
  const d = await r.json();
  solePlan = d[0];
  console.log("  created", solePlan.id.slice(0,8));
}
// Confirm active = Beaver
await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${TRENT}`, {
  method:"PATCH", headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:'Bearer '+SUPABASE_SERVICE_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
  body: JSON.stringify({current_plan_id: BEAVER})
});

const beforeActive = (await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${TRENT}&select=current_plan_id`, {headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:'Bearer '+SUPABASE_SERVICE_KEY}}).then(r=>r.json()))[0]?.current_plan_id;
console.log("active BEFORE:", beforeActive?.slice(0,8));

// magic-link → cookie
const { data: linkData } = await admin.auth.admin.generateLink({type:"magiclink", email: TARGET_EMAIL});
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: sessData } = await anon.auth.verifyOtp({token_hash: linkData.properties.hashed_token, type: "magiclink"});
const s = sessData.session;
const cookieValue = JSON.stringify({access_token:s.access_token, refresh_token:s.refresh_token, expires_in:s.expires_in, expires_at:s.expires_at, token_type:"bearer", user:s.user});

const browser = await chromium.launch();
const ctx = await browser.newContext({viewport:{width:1440,height:900}});
await ctx.addCookies([{name:`sb-${REF}-auth-token`, value:cookieValue, domain:HOST, path:"/", expires:Math.floor(Date.now()/1000)+3600, httpOnly:false, secure:true, sameSite:"Lax"}]);
const page = await ctx.newPage();

// Step 2 — open dashboard, observe baseline
console.log("opening /dashboard...");
await page.goto(`${PROD}/dashboard`, {waitUntil:"domcontentloaded"});
await page.waitForLoadState("networkidle", {timeout: 30_000});
await page.screenshot({path: "scripts/shots/tim2915b-01-baseline.png"});
const switcherBtn = page.locator('button[aria-haspopup="listbox"]').first();
const initialLabel = (await switcherBtn.innerText()).trim();
console.log("initial trigger label:", JSON.stringify(initialLabel));

// Step 3 — click switcher trigger, then click Sole Sisters row
console.log("opening switcher menu...");
await switcherBtn.click();
await page.waitForTimeout(300);
await page.screenshot({path: "scripts/shots/tim2915b-02-menu-open.png"});

// Snapshot listbox before click
const listbox = page.getByRole("listbox", { name: /projects/i });
const optionsBefore = await listbox.locator('[role="option"]').allInnerTexts();
console.log("options BEFORE switch:", optionsBefore.map(t=>t.replace(/\s+/g," ")));

const soleRow = listbox.locator('[role="option"]').filter({hasText: "Sole Sisters"}).first();

console.log("clicking Sole Sisters switch button...");
const patchPromise = page.waitForResponse(r => r.url().includes(`/api/projects/${solePlan.id}`) && r.request().method() === "PATCH", {timeout: 15_000});
await soleRow.locator("button").first().click();

// IMMEDIATELY snapshot trigger label (without waiting for PATCH)
const immediateLabel = (await switcherBtn.innerText()).trim();
console.log("trigger label IMMEDIATELY after click (no PATCH wait):", JSON.stringify(immediateLabel));

const patchResp = await patchPromise;
console.log(`PATCH /api/projects/${solePlan.id.slice(0,8)} → ${patchResp.status()}`);

await page.waitForLoadState("networkidle", {timeout: 30_000});
await page.waitForTimeout(800);
await page.screenshot({path: "scripts/shots/tim2915b-03-after-switch.png"});

// Trigger label after PATCH + navigation settled
const afterLabel = (await switcherBtn.innerText()).trim();
console.log("trigger label AFTER PATCH settled:", JSON.stringify(afterLabel));

// Open dropdown again, what's marked Active?
console.log("opening switcher menu again...");
await switcherBtn.click();
await page.waitForTimeout(400);
await page.screenshot({path: "scripts/shots/tim2915b-04-menu-reopen.png"});
const optionsAfter = await listbox.locator('[role="option"]').allInnerTexts();
console.log("options AFTER switch:", optionsAfter.map(t=>t.replace(/\s+/g," ")));
const ariaSelectedRows = await listbox.locator('[role="option"][aria-selected="true"]').allInnerTexts();
console.log("aria-selected=true rows:", ariaSelectedRows.map(t=>t.replace(/\s+/g," ")));

// DB state
const afterActive = (await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${TRENT}&select=current_plan_id`, {headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:'Bearer '+SUPABASE_SERVICE_KEY}}).then(r=>r.json()))[0]?.current_plan_id;
console.log("active AFTER (DB):", afterActive?.slice(0,8));

// Test reload survival
console.log("hard reload of /dashboard...");
await page.goto(`${PROD}/dashboard`, {waitUntil:"domcontentloaded"});
await page.waitForLoadState("networkidle", {timeout: 30_000});
const reloadLabel = (await switcherBtn.innerText()).trim();
console.log("trigger label after reload:", JSON.stringify(reloadLabel));

console.log("\n=== VERDICT ===");
console.log(`DB active flipped: ${beforeActive?.slice(0,8)} -> ${afterActive?.slice(0,8)} (target=${solePlan.id.slice(0,8)})`);
console.log(`Trigger label flipped: "${initialLabel.replace(/\s+/g," ")}" -> "${afterLabel.replace(/\s+/g," ")}"`);
console.log(`Reload survives: "${reloadLabel.replace(/\s+/g," ")}"`);

await browser.close();

// Cleanup: restore active to Beaver, leave the Sole Sisters (don't delete - board may use it)
await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${TRENT}`, {
  method:"PATCH", headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:'Bearer '+SUPABASE_SERVICE_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
  body: JSON.stringify({current_plan_id: BEAVER})
});
console.log("(restored current_plan_id=Beaver for cleanup)");
