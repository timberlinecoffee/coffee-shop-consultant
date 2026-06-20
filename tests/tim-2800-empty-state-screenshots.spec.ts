/**
 * TIM-2800: Zero-state screenshot capture for all 4 workspaces across 6 personas.
 *
 * Uses fresh accounts from tim2459-seed.mjs.
 * Captures WorkspaceEmptyState for:
 *   1. Equipment & Buildout
 *   2. Suppliers
 *   3. Location & Lease — all-locations tab
 *   4. Location & Lease — shortlist tab
 *   5. Hiring — Roles tab
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3002 npx playwright test tests/tim-2800-empty-state-screenshots.spec.ts
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync, mkdirSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3002";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_PROJECT_REF = "ltmcttjftxzpgynhnrpg";
const COOKIE_NAME = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

const SCREENSHOTS_DIR = join(__dirname, "__screenshots__/tim-2800");

// Load fresh personas from seed output
const PERSONAS: Array<{
  userId: string;
  planId: string;
  email: string;
  n: number;
  slug: string;
  shopName: string;
  viewport: string;
  session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    token_type: string;
    user: object;
  };
}> = JSON.parse(readFileSync(join(__dirname, "../scripts/tim2459-seed-output.json"), "utf8"));

// Derive the password from the seed timestamp embedded in the email
function passwordFromEmail(email: string): string {
  const match = email.match(/\+(\d+)@/);
  const ts = match?.[1];
  if (!ts) throw new Error(`Cannot extract timestamp from email: ${email}`);
  return `TIM2459_${ts}!`;
}

async function signIn(page: Page, email: string): Promise<void> {
  const password = passwordFromEmail(email);
  const authRes = await page.request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      data: { email, password },
    }
  );
  if (!authRes.ok()) {
    throw new Error(`Auth failed for ${email}: ${await authRes.text()}`);
  }
  const auth = await authRes.json();
  const cookieBase = {
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  };
  await page.context().addCookies([
    {
      ...cookieBase,
      name: COOKIE_NAME,
      value: JSON.stringify({
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        expires_in: auth.expires_in,
        expires_at: auth.expires_at,
        token_type: auth.token_type,
        user: auth.user,
      }),
    },
  ]);
}

async function dismissCookieConsent(page: Page) {
  try {
    const btn = page.getByRole("button", { name: /necessary only/i });
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  } catch {
    // Not present — fine
  }
}

async function waitForWorkspace(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 25000 });
  await page.waitForTimeout(1000);
}

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// P1: full 5-view coverage
test.describe("TIM-2800 WorkspaceEmptyState — P1 Seattle (desktop, full coverage)", () => {
  const persona = PERSONAS[0];
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await signIn(page, persona.email);
  });

  test("Equipment & Buildout — zero state", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/buildout-equipment`, { waitUntil: "domcontentloaded" });
    await waitForWorkspace(page);
    await dismissCookieConsent(page);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "p1-equipment-empty.png"),
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    });
    // Verify empty state component is visible
    await expect(page.locator("text=This is where you build the equipment list")).toBeVisible({ timeout: 5000 });
  });

  test("Suppliers — zero state", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/suppliers`, { waitUntil: "domcontentloaded" });
    await waitForWorkspace(page);
    await dismissCookieConsent(page);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "p1-suppliers-empty.png"),
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    });
    const emptyState = page.locator('[class*="flex flex-col items-center py-16"]').first();
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test("Location & Lease — all-locations tab (zero state)", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/location-lease`, { waitUntil: "domcontentloaded" });
    await waitForWorkspace(page);
    await dismissCookieConsent(page);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "p1-location-all-empty.png"),
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    });
    const emptyState = page.locator('[class*="flex flex-col items-center py-16"]').first();
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test("Location & Lease — shortlist tab (zero state)", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/location-lease`, { waitUntil: "domcontentloaded" });
    await waitForWorkspace(page);
    await dismissCookieConsent(page);
    // Click the shortlist tab
    const shortlistTab = page.locator("button").filter({ hasText: /shortlist/i });
    if (await shortlistTab.count() > 0) {
      await shortlistTab.first().click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "p1-location-shortlist-empty.png"),
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    });
    const emptyState = page.locator('[class*="flex flex-col items-center py-16"]').first();
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test("Hiring — Roles tab (zero state)", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/hiring`, { waitUntil: "domcontentloaded" });
    await waitForWorkspace(page);
    await dismissCookieConsent(page);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "p1-hiring-empty.png"),
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    });
    const emptyState = page.locator('[class*="flex flex-col items-center py-16"]').first();
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });
});

// P2-P6: spot-check Equipment empty state on each persona's viewport
for (const persona of PERSONAS.slice(1)) {
  test.describe(`TIM-2800 spot-check P${persona.n} (${persona.slug})`, () => {
    const vp = persona.viewport === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 };

    test.use({ viewport: vp });

    test(`P${persona.n} Equipment & Buildout — zero state`, async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await signIn(page, persona.email);
      await page.goto(`${BASE_URL}/workspace/buildout-equipment`, { waitUntil: "domcontentloaded" });
      await waitForWorkspace(page);
      await dismissCookieConsent(page);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, `p${persona.n}-${persona.slug}-equipment-empty.png`),
        fullPage: false,
      });
      await expect(page.locator("text=This is where you build the equipment list")).toBeVisible({ timeout: 5000 });
    });
  });
}
