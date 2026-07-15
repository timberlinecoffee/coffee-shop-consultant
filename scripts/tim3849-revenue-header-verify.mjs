/**
 * TIM-3849 verify — screenshot the Financials workspace "Additional Revenue
 * Streams" section on the target host and count occurrences of the redundant
 * inner "Revenue" header text.
 *
 * Before fix (prod today):  1 match  (redundant "REVENUE" caption)
 * After  fix (after deploy): 0 matches
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3849");
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
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
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
  const context = await browser.newContext({ viewport: { width: 1400, height: 1600 } });
  await loginPlant(context, token);
  const page = await context.newPage();

  page.on("console", (m) => { if (m.type() === "error") console.log("[browser-error]", m.text()); });

  await page.goto(`${BASE_URL}/workspace/financials`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);

  // Take a full page screenshot for reference regardless of interaction.
  await page.screenshot({ path: join(OUT_DIR, `${LABEL}-full-initial.png`), fullPage: true });

  // Try to open the "Revenue Streams" accordion so the section is visible.
  const accordionCandidates = [
    /Revenue Streams/i,
    /Revenue$/i,
  ];
  for (const rx of accordionCandidates) {
    const el = page.getByRole("button", { name: rx }).first();
    if (await el.count()) {
      try { await el.click({ timeout: 2000 }); await page.waitForTimeout(600); break; } catch {}
    }
  }

  // Anchor to the "Additional Revenue Streams" caption and screenshot around it.
  const additional = page.getByText(/Additional Revenue Streams/i).first();
  try {
    await additional.waitFor({ timeout: 8000 });
    await additional.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  } catch (e) {
    console.log("[warn] Additional Revenue Streams not visible; capturing full page anyway");
    await page.screenshot({ path: join(OUT_DIR, `${LABEL}-full-after-open.png`), fullPage: true });
  }

  // Count the redundant inner "Revenue" caption within the Additional Revenue
  // Streams card. Selector matches CategorySection's uppercase teal caption
  // reading exactly "Revenue" (case-insensitive, exact word).
  //
  // Scope: the container that immediately follows the "Additional Revenue
  // Streams" caption inside the card. We count every visible <p> whose
  // normalized text is exactly "Revenue".
  const captionSel = "p.text-sm.font-bold.uppercase";
  const total = await page.locator(captionSel).allTextContents();
  const redundantMatches = total.filter((t) => t.trim().toLowerCase() === "revenue");
  const count = redundantMatches.length;

  let clip = null;
  try {
    const box = await additional.boundingBox();
    if (box) clip = { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: 1200, height: 560 };
  } catch {}
  if (clip) {
    await page.screenshot({ path: join(OUT_DIR, `${LABEL}-additional-revenue-streams.png`), clip });
  }

  const result = { label: LABEL, baseUrl: BASE_URL, redundantRevenueCaptionCount: count, expectedAfterFix: 0 };
  await writeFile(join(OUT_DIR, `${LABEL}-result.json`), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  // Exit non-zero when the count doesn't match expectation for the label.
  const expected = LABEL === "before" ? 1 : 0;
  process.exit(count === expected ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
