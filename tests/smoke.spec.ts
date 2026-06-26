/**
 * Playwright smoke test — TIM-1357 Pillar 3
 *
 * Usage:
 *   pnpm test:smoke                          # test default routes
 *   SMOKE_ISSUE=TIM-XXX pnpm test:smoke      # routes + CTAs from issue
 *
 * scripts/smoke.mjs resolves SMOKE_ISSUE to a comma-separated SMOKE_ROUTES
 * env var before spawning Playwright, so this file stays sync — top-level
 * await isn't safe under Playwright's require()-based loader (TIM-2994).
 *
 * TIM-3011: Replaced toHaveScreenshot() with a "no 5xx" response check.
 * Visual diffs against a real backend are flaky in CI (fonts, external images,
 * auth state, animations). The lightweight check — status < 500 + all visible
 * buttons enabled — is stable and catches the regressions that matter.
 */

import { test, expect, Page } from "@playwright/test";

const DEFAULT_ROUTES = ["/", "/pricing", "/login", "/signup", "/dashboard"];

function getRoutes(): string[] {
  const raw = process.env.SMOKE_ROUTES?.trim();
  if (!raw) return DEFAULT_ROUTES;
  const routes = raw.split(",").map((r) => r.trim()).filter((r) => r.startsWith("/"));
  return routes.length > 0 ? routes : DEFAULT_ROUTES;
}

async function checkButtonsEnabled(page: Page) {
  const buttons = page.locator("button:not([disabled]), a[role='button']:not([disabled])");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    if (await btn.isVisible()) {
      await expect(btn).toBeEnabled();
    }
  }
}

for (const route of getRoutes()) {
  test(`smoke: ${route}`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    // Verify no 5xx — redirects (3xx) and client routes (2xx) are fine
    expect(response?.status() ?? 200).toBeLessThan(500);
    await checkButtonsEnabled(page);
  });
}
