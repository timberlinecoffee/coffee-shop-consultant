// TIM-2922: capture a live UI screenshot of the "Benchmark against cafes in
// my area" output on trent's Calgary fixture. Proof for the board confirm card.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = "https://groundwork.cafe";
const HOST = "groundwork.cafe";
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const EMAIL = "trent@simpler.coffee";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

mkdirSync("scripts/shots", { recursive: true });

const { data: linkData } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
const tokenHash = linkData?.properties?.hashed_token;
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: sessData } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
const session = sessData.session;

const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
await ctx.addCookies([{ name: `sb-${REF}-auth-token`, value: cookieValue, domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax" }]);
const page = await ctx.newPage();

console.log("loading /workspace/menu-pricing");
await page.goto(`${PROD_URL}/workspace/menu-pricing`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});

const cookieBtn = page.getByRole("button", { name: /^Accept All$/ });
if (await cookieBtn.first().isVisible().catch(() => false)) {
  await cookieBtn.first().click();
  await page.waitForTimeout(300);
}

// Open the "Double Espresso" row
const itemRow = page.getByText("Double Espresso", { exact: true }).first();
await itemRow.scrollIntoViewIfNeeded();
await itemRow.click();
await page.waitForTimeout(800);

// Click "Cost of Goods" tab where the benchmark button lives
const cogsTab = page.getByRole("tab", { name: /Cost of Goods/i });
await cogsTab.first().waitFor({ state: "visible", timeout: 10_000 });
await cogsTab.first().click();
await page.waitForTimeout(500);

// Click "Benchmark against cafes in my area" button
const benchmarkBtn = page.getByRole("button", { name: /Benchmark against caf[eé]s|Reading local market/i });
await benchmarkBtn.first().scrollIntoViewIfNeeded();
await benchmarkBtn.first().waitFor({ state: "visible", timeout: 10_000 });
console.log("clicking Benchmark against cafes in my area...");
await benchmarkBtn.first().click();

// Wait for the benchmark response — wait for the API response and the
// loading text to disappear.
console.log("waiting for benchmark response (up to 180s)...");
await page.waitForResponse(
  (r) => r.url().includes("/api/workspaces/menu-pricing/benchmark-price") && r.request().method() === "POST",
  { timeout: 180_000 },
);
console.log("benchmark API responded, waiting for UI to render...");
// Wait until the loading button text is gone and a dollar amount renders inside the LOCAL BENCHMARK section
await page.getByText(/Reading local market/i).waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(3000);

// Scroll the LOCAL BENCHMARK section into view
const benchmarkSection = page.getByText(/LOCAL BENCHMARK/i).first();
await benchmarkSection.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(500);

// Open the citations expander if it exists ("view cafés (3)" details)
const sourcesToggle = page.locator("summary").filter({ hasText: /caf[eé]s? \(\d+\)|sources|view/i }).first();
if (await sourcesToggle.isVisible().catch(() => false)) {
  await sourcesToggle.click().catch(() => {});
  await page.waitForTimeout(800);
  console.log("opened citations expander");
}

// Capture full editor pane
await page.screenshot({ path: "scripts/shots/tim2922-benchmark-ui.png", fullPage: true });
console.log("captured scripts/shots/tim2922-benchmark-ui.png");

// Also capture a close-up of just the benchmark output section
const editor = page.locator('div:has-text("LOCAL BENCHMARK")').last();
const bbox = await editor.boundingBox().catch(() => null);
if (bbox) {
  const x = Math.max(0, bbox.x - 20);
  const y = Math.max(0, bbox.y - 20);
  await page.screenshot({
    path: "scripts/shots/tim2922-benchmark-closeup.png",
    clip: { x, y, width: Math.min(1100, bbox.width + 80), height: Math.min(700, bbox.height + 80) },
  });
  console.log("captured scripts/shots/tim2922-benchmark-closeup.png");
}

await browser.close();
