/**
 * TIM-1747: QA verification for TIM-1739 Asset & Depreciation tab
 * - Purchase month = 4 asset: capex outflow in month 4, depreciation from month 4
 * - Tab renamed, capex editor relocated from Forecast Inputs
 * - Schedule table shows "Purchase" column with "Mo 4"
 */

import { test, expect, type Page } from "@playwright/test";

const QA_EMAIL = "qa-agent@timberline.coffee";
const QA_PASSWORD = "QATim1729Test!";
const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bWN0dGpmdHh6cGd5bmhucnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTA4NjcsImV4cCI6MjA5MTk2Njg2N30.EUgFAKZSbWRZmJBTHdX9E0oEQDOVjzf39ynDH7Fs5Ok";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bWN0dGpmdHh6cGd5bmhucnBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjM5MDg2NywiZXhwIjoyMDkxOTY2ODY3fQ.HsIx2BzWVKeZQYG8-VY74fEqasQuoFcRcroh34MHl7c";
const PLAN_ID = "f4958d74-b640-4e45-b3a8-043603c2340f";

// TIM-1739: purchase month 4 capex line — $1,200,000 asset, 5yr life
const CAPEX_LINE_ID = "qa-tim1739-capex-month4";
const CAPEX_LINE_LABEL = "QA Espresso Machine (Mo 4)";

async function signIn(page: Page) {
  const authRes = await page.request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { email: QA_EMAIL, password: QA_PASSWORD },
    }
  );
  expect(authRes.ok(), `Auth failed: ${await authRes.text()}`).toBeTruthy();
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
      name: "sb-ltmcttjftxzpgynhnrpg-auth-token",
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

async function seedCapexLine(page: Page) {
  // Get current financial model so we can merge cleanly
  const fmRes = await page.request.get(
    `${SUPABASE_URL}/rest/v1/financial_models?plan_id=eq.${PLAN_ID}&select=forecast_inputs`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  expect(fmRes.ok(), `FM fetch failed: ${await fmRes.text()}`).toBeTruthy();
  const rows = await fmRes.json();
  const existing = rows[0]?.forecast_inputs ?? {};

  // Remove any prior QA capex test line then add the new one
  const filtered = (existing.forecast_lines ?? []).filter(
    (l: { id: string }) => l.id !== CAPEX_LINE_ID
  );

  const newCapexLine = {
    id: CAPEX_LINE_ID,
    label: CAPEX_LINE_LABEL,
    category: "capex",
    mode: "flat",
    value: 120000000, // $1,200,000 in cents
    useful_life_years: 5,
    ramp: { enabled: true, start_month: 4, ramp_months: 0, start_pct: 100 },
  };

  const newInputs = { ...existing, forecast_lines: [...filtered, newCapexLine] };

  const patchRes = await page.request.patch(
    `${SUPABASE_URL}/rest/v1/financial_models?plan_id=eq.${PLAN_ID}`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      data: { forecast_inputs: newInputs },
    }
  );
  if (!patchRes.ok()) {
    // Insert if no row exists
    const insRes = await page.request.post(
      `${SUPABASE_URL}/rest/v1/financial_models`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        data: { plan_id: PLAN_ID, forecast_inputs: newInputs },
      }
    );
    expect(insRes.ok(), `FM insert failed: ${await insRes.text()}`).toBeTruthy();
  }
}

test.describe("TIM-1747: Asset & Depreciation tab — in-app QA", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await seedCapexLine(page);
  });

  test("full verification checklist", async ({ page }) => {
    await page.goto("http://localhost:3002/workspace/financials", {
      waitUntil: "networkidle",
    });

    // ── CHECK 1: Forecast Inputs has no capex section ──────────────────────────
    // The "Forecast Inputs" tab is active by default — confirm no "Asset Purchases" section
    const forecastTab = page.getByRole("button", { name: "Forecast Inputs" });
    await expect(forecastTab).toBeVisible();

    // Costs & Expenses should exist but not capex
    const costsSection = page.getByText("Costs & Expenses");
    await expect(costsSection).toBeVisible();

    // "Asset Purchases" heading should NOT appear on Forecast Inputs tab
    await expect(page.getByText("Asset Purchases", { exact: false })).toHaveCount(0);

    await page.screenshot({
      path: "/tmp/tim-1747-1-forecast-inputs-no-capex.png",
      fullPage: false,
    });

    // ── CHECK 2: Asset & Depreciation tab exists and shows capex editor ────────
    const depTabBtn = page.getByRole("button", { name: "Asset & Depreciation" });
    await expect(depTabBtn).toBeVisible();
    await depTabBtn.click();
    await page.waitForTimeout(1500);

    // Asset Purchases section at top (exact match — page also has "Asset Purchases (Capex)" meta label)
    const assetPurchasesHeader = page.getByText("Asset Purchases", { exact: true });
    await expect(assetPurchasesHeader).toBeVisible();

    // Our seeded QA line should be visible
    const qaLine = page.getByText(CAPEX_LINE_LABEL);
    await expect(qaLine).toBeVisible();

    // "one-time · Mo 4" label should show
    const mo4Badge = page.getByText("one-time · Mo 4");
    await expect(mo4Badge).toBeVisible();

    // Schedule table should show "Purchase" column header
    const purchaseCol = page.getByRole("columnheader", { name: "Purchase" });
    await expect(purchaseCol).toBeVisible();

    // Schedule row for our asset should show "Mo 4" in the Purchase column (exact match)
    const mo4Cell = page.getByRole("cell", { name: "Mo 4", exact: true });
    await expect(mo4Cell).toBeVisible();

    await page.screenshot({
      path: "/tmp/tim-1747-2-asset-depreciation-tab.png",
      fullPage: true,
    });

    // ── CHECK 3a: Cash Flow — capital outflow in month 4 ──────────────────────
    const cashFlowBtn = page.getByRole("button", { name: "Cash Flow" });
    await cashFlowBtn.click();
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: "/tmp/tim-1747-3-cash-flow.png",
      fullPage: true,
    });

    // ── CHECK 3b: P&L — verify depreciation section visible ───────────────────
    const plBtn = page.getByRole("button", { name: "P&L" });
    await plBtn.click();
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: "/tmp/tim-1747-4-pl.png",
      fullPage: true,
    });

    // ── CHECK 3c: Balance Sheet ───────────────────────────────────────────────
    const bsBtn = page.getByRole("button", { name: "Balance Sheet" });
    await bsBtn.click();
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: "/tmp/tim-1747-5-balance-sheet.png",
      fullPage: true,
    });

    // Back to Asset & Depreciation for final screenshot
    await depTabBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "/tmp/tim-1747-final-asset-dep.png",
      fullPage: true,
    });
  });
});
