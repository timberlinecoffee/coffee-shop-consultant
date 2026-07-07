/**
 * TIM-3672 verify — open BP workspace as trent@simpler.coffee, expand Management Team,
 * capture DOM state of the section card + screenshot.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3672");
const BASE_URL = process.env.BASE_URL ?? "https://groundwork.cafe";
const LABEL = process.env.LABEL ?? "prod";

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
if (!SUPABASE_SECRET || !SUPABASE_PUBLISHABLE) {
  console.error("Missing SUPABASE_NEW_SECRET_KEY or SUPABASE_NEW_PUBLISHABLE_KEY");
  process.exit(1);
}
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";
const HOST = BASE_URL.replace(/^https?:\/\//, "").split("/")[0];
const COOKIE_DOMAIN = HOST.startsWith("localhost")
  ? "localhost"
  : HOST.endsWith(".vercel.app")
  ? HOST
  : ".groundwork.cafe";

const CHROMIUM = "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const LD_LIB = "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";
process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
  ? `${LD_LIB}:${process.env.LD_LIBRARY_PATH}`
  : LD_LIB;

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function magiclinkFor(email) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const token = data?.properties?.hashed_token;
  if (!token) throw new Error("no magiclink token");
  return token;
}

async function loginPlant(context, token) {
  const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (error) throw error;
  const { session } = data;
  if (!session) throw new Error("no session");
  const sessionData = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: session.user,
  };
  const raw = "base64-" + Buffer.from(JSON.stringify(sessionData)).toString("base64");
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const encoded = encodeURIComponent(raw);
  const CHUNK = 3180;
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK) chunks.push(encoded.slice(i, i + CHUNK));
  const cookies = chunks.map((v, idx) => ({
    name: `${cookieName}.${idx}`,
    value: v,
    domain: COOKIE_DOMAIN,
    path: "/",
    httpOnly: false,
    secure: !HOST.startsWith("localhost"),
    sameSite: "Lax",
  }));
  await context.addCookies(cookies);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const token = await magiclinkFor("trent@simpler.coffee");
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await loginPlant(context, token);
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[browser-error]", msg.text());
  });

  await page.goto(`${BASE_URL}/workspace/business-plan`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  await page.screenshot({ path: join(OUT_DIR, `${LABEL}-01-initial.png`), fullPage: true });

  const url = page.url();
  console.log("landed URL:", url);
  if (!url.includes("/business-plan")) {
    console.log("did not land on BP — bailing");
    await browser.close();
    return;
  }

  // Find + expand "Management Team" section — click the expand button.
  const managementBtn = page.getByRole("button", { name: /Expand Management Team/i });
  const managementCount = await managementBtn.count();
  console.log("management expand buttons found:", managementCount);
  if (managementCount === 0) {
    console.log("checking if already expanded / different label");
    const collapseBtn = page.getByRole("button", { name: /Collapse Management Team/i });
    console.log("management collapse buttons found:", await collapseBtn.count());
  } else {
    await managementBtn.first().click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: join(OUT_DIR, `${LABEL}-02-management-expanded.png`), fullPage: true });

  // Check for Write with AI button under Management
  const writeBtnCount = await page.getByRole("button", { name: /Write Management Team with AI/i }).count();
  console.log("Write Management Team with AI button count:", writeBtnCount);

  // Also check global Write with AI buttons for comparison
  const allWriteBtns = await page.locator("button", { hasText: "Write with AI" }).count();
  console.log("total Write with AI buttons in DOM:", allWriteBtns);

  const cards = await page.locator("h2:has-text('Management Team')").count();
  console.log("Management Team headings found:", cards);

  // Dump section card region HTML for Management Team
  const cardHtml = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll("h2")).find((h) => h.textContent?.trim() === "Management Team");
    if (!heading) return "NOT FOUND";
    let el = heading;
    while (el && el.parentElement && !(el.classList?.contains("group") && el.classList?.contains("relative"))) {
      el = el.parentElement;
    }
    return el ? el.outerHTML.slice(0, 8000) : "NO GROUP-RELATIVE ANCESTOR";
  });
  await writeFile(join(OUT_DIR, `${LABEL}-management-card.html`), cardHtml, "utf8");
  console.log("dumped management card html to", `${LABEL}-management-card.html`);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
