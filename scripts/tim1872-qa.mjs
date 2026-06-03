// TIM-1872 QA: drive the real "Review with AI" control on prod as trent@simpler.coffee.
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
const EMAIL = "trent@simpler.coffee";

const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
if (!linkRes.ok) { console.error("generate_link FAIL", linkRes.status, await linkRes.text()); process.exit(1); }
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});
if (!verifyRes.ok) { console.error("verify FAIL", verifyRes.status, await verifyRes.text()); process.exit(1); }
const auth = await verifyRes.json();
console.log("AUTH OK user:", auth.user?.email);

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
  // Pre-accept cookie consent so the banner doesn't overlap the UI.
  { name: "gw_consent", value: "all", domain: HOST, path: "/", secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERR:", m.text()); });

await page.goto(`${BASE}/workspace/concept`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);

const visionBefore = await page.locator("#concept-vision").inputValue().catch(() => "(no vision field)");
console.log("VISION BEFORE:", JSON.stringify(visionBefore.slice(0, 80)));

const btn = page.getByRole("button", { name: /Review with AI/i });
console.log("button enabled:", await btn.first().isEnabled());
await btn.first().click();
console.log("clicked Review with AI; waiting for review modal (AI call)...");

const dialog = page.locator('[role="dialog"][aria-label*="suggestions"]');
let up = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  if ((await dialog.count()) > 0) { up = true; break; }
  const err = await page.getByText(/Could not run|already looks sharp|credits|trial/i).count();
  if (err > 0) { console.log("RESULT MSG:", await page.getByText(/Could not run|already looks sharp|credits|trial/i).first().innerText()); break; }
}
console.log("review modal open:", up);
await page.screenshot({ path: "scripts/shots/tim1872-2-review-modal.png", fullPage: false });

if (up) {
  const acceptBtns = dialog.getByRole("button", { name: "Accept this suggestion" });
  const n = await acceptBtns.count();
  console.log("suggestion cards (accept buttons):", n);
  if (n > 0) { await acceptBtns.first().click(); await page.waitForTimeout(600); console.log("accepted suggestion #1"); }
  await page.screenshot({ path: "scripts/shots/tim1872-3-after-accept.png", fullPage: false });

  const apply = dialog.getByRole("button", { name: /^Apply \d+ change/ });
  if (await apply.count()) {
    console.log("apply button label:", await apply.first().innerText());
    await apply.first().click();
    await page.waitForTimeout(3000);
    console.log("clicked Apply");
  } else {
    console.log("no enabled Apply button; footer buttons:", await dialog.getByRole("button").allInnerTexts());
  }
  await page.screenshot({ path: "scripts/shots/tim1872-4-applied.png", fullPage: false });

  const visionAfter = await page.locator("#concept-vision").inputValue().catch(() => "(no vision field)");
  console.log("VISION AFTER :", JSON.stringify(visionAfter.slice(0, 80)));
  console.log("CHANGED:", visionBefore !== visionAfter);

  // Round-trip: reload and confirm the accepted change persisted (applied=reviewed -> saved).
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const visionReload = await page.locator("#concept-vision").inputValue().catch(() => "(no vision field)");
  console.log("VISION RELOAD:", JSON.stringify(visionReload.slice(0, 80)));
  console.log("PERSISTED:", visionReload === visionAfter && visionReload !== visionBefore);

  // Restore the demo fixture's original vision text so QA leaves no residue.
  if (visionBefore && !visionBefore.startsWith("(") && visionReload !== visionBefore) {
    const f = page.locator("#concept-vision");
    await f.fill(visionBefore);
    await f.blur();
    await page.waitForTimeout(2500);
    const restored = await f.inputValue();
    console.log("RESTORED:", restored === visionBefore);
  }
}

await browser.close();
console.log("QA DONE");
