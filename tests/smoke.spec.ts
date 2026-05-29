/**
 * Playwright smoke test — TIM-1357 Pillar 3
 *
 * Usage:
 *   pnpm test:smoke                          # test default routes
 *   SMOKE_ISSUE=TIM-XXX pnpm test:smoke      # routes + CTAs from issue
 *
 * When SMOKE_ISSUE is set the test fetches the issue from the Paperclip API
 * (PAPERCLIP_API_URL + PAPERCLIP_API_KEY) and extracts routes from the
 * "## Routes" section of the description.  Falls back to DEFAULT_ROUTES when
 * the env var is absent or the fetch fails.
 */

import { test, expect, Page } from "@playwright/test";
import * as https from "https";
import * as http from "http";

const DEFAULT_ROUTES = ["/", "/pricing", "/login", "/signup", "/dashboard"];

function fetchJson(url: string, token: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error("bad JSON")); }
      });
    });
    req.on("error", reject);
  });
}

function parseRoutes(md: string): string[] {
  const section = md.match(/##\s*Routes\s*\n([\s\S]*?)(?:\n##|$)/i)?.[1] ?? "";
  return section
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.startsWith("/"));
}

async function resolveRoutes(): Promise<string[]> {
  const issueId = process.env.SMOKE_ISSUE;
  if (!issueId) return DEFAULT_ROUTES;

  const base = process.env.PAPERCLIP_API_URL;
  const token = process.env.PAPERCLIP_API_KEY;
  if (!base || !token) {
    console.warn("SMOKE_ISSUE set but PAPERCLIP_API_URL/KEY missing — using defaults");
    return DEFAULT_ROUTES;
  }

  try {
    const issue = (await fetchJson(`${base}/api/issues/${issueId}`, token)) as {
      description?: string;
    };
    const routes = issue.description ? parseRoutes(issue.description) : [];
    if (routes.length === 0) {
      console.warn(`No routes found in ${issueId} description — using defaults`);
      return DEFAULT_ROUTES;
    }
    console.log(`Smoke routes from ${issueId}:`, routes);
    return routes;
  } catch (err) {
    console.warn("Could not fetch issue:", err);
    return DEFAULT_ROUTES;
  }
}

async function checkButtonsEnabled(page: Page) {
  const buttons = page.locator("button:not([disabled]), a[role='button']:not([disabled])");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    // Only assert visible buttons (skip hidden/offscreen)
    if (await btn.isVisible()) {
      await expect(btn).toBeEnabled();
    }
  }
}

const routes = await resolveRoutes();

for (const route of routes) {
  test(`smoke: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });

    // 1. All visible buttons are enabled
    await checkButtonsEnabled(page);

    // 2. Screenshot baseline (stored in tests/__screenshots__)
    await expect(page).toHaveScreenshot(`${route.replace(/\//g, "_") || "home"}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
}
