#!/usr/bin/env node
// TIM-3405 — 375px mobile screenshots for TIM-3403 (BottomTabBar Menu tab reverted)
// Run: SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_NEW_SECRET_KEY node scripts/tim3405-mobile-shots.mjs
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

process.env.LD_LIBRARY_PATH = '/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'tim3405');
fs.mkdirSync(OUT, { recursive: true });

const PROD_URL = 'https://groundwork.cafe';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ltmcttjftxzpgynhnrpg.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_NEW_SECRET_KEY;
if (!SERVICE_KEY) { console.error('SUPABASE_NEW_SECRET_KEY required'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = `tim3405-shots-${Date.now()}@test.groundwork.cafe`;
const PASSWORD = 'Test1234!';

async function main() {
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (authErr) throw authErr;
  const userId = authData.user.id;
  console.log('User created:', userId);

  await supabase.from('users').upsert({
    id: userId,
    subscription_status: 'active',
    subscription_tier: 'pro',
    onboarding_completed: true,
  });
  const { data: plan, error: planErr } = await supabase.from('coffee_shop_plans')
    .insert({ user_id: userId, plan_name: 'TIM-3405 Test Shop', status: 'in_progress' })
    .select().single();
  if (planErr) throw planErr;
  const planId = plan.id;
  await supabase.from('users').update({ current_plan_id: planId }).eq('id', userId);
  console.log('Plan seeded:', planId);

  const browser = await chromium.launch({
    executablePath: '/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });

  // iPhone SE viewport (Apple's "375px" reference)
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  // Pre-set gw_consent cookie to suppress cookie banner that would otherwise
  // occlude the BottomTabBar at 375px (per TIM-3356 standing pattern).
  await ctx.addCookies([
    {
      name: 'gw_consent',
      value: encodeURIComponent(JSON.stringify({
        version: 1, analytics: false, marketing: false, decidedAt: new Date().toISOString(),
      })),
      domain: '.groundwork.cafe',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await ctx.newPage();

  page.on('console', m => console.log('  [page]', m.type(), m.text().slice(0, 240)));
  page.on('pageerror', e => console.log('  [pageerr]', e.message));

  await page.goto(`${PROD_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL(u => !/\/login(\?|$)/.test(new URL(u, PROD_URL).pathname + new URL(u, PROD_URL).search), { timeout: 30000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(500);
  console.log('Post-login URL:', page.url());
  if (/\/login/.test(page.url())) {
    const errTxt = await page.locator('[role="alert"], .text-red-600').first().textContent().catch(() => null);
    console.error('Stuck on /login, error text:', errTxt);
    await page.screenshot({ path: path.join(OUT, 'debug-login-stuck.png') });
    throw new Error('Login did not redirect away from /login: ' + errTxt);
  }

  await page.goto(`${PROD_URL}/workspace/concept`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  console.log('Workspace URL:', page.url());

  // Drawer closed — verify bottom tab bar shows the 5 reverted tabs
  const bottomBar = page.locator('nav.fixed.bottom-0');
  await bottomBar.waitFor({ state: 'visible', timeout: 10000 });
  const tabLabels = await bottomBar.locator('a, button').allTextContents();
  const tabBlob = tabLabels.join('|').toLowerCase();
  console.log('Bottom tab labels (raw):', tabLabels);
  for (const t of ['home','plan','build','financials','run']) {
    if (!tabBlob.includes(t)) console.warn('Missing expected tab:', t);
  }
  if (tabBlob.includes('menu')) console.warn('WARN: Menu tab still present — should be reverted');

  const hamburger = page.locator('button[aria-label="Open navigation"]');
  const hamburgerVisible = await hamburger.isVisible();
  console.log('Hamburger visible:', hamburgerVisible);

  const shotA = path.join(OUT, 'A-drawer-closed-375.png');
  await page.screenshot({ path: shotA, fullPage: false });
  console.log('Screenshot A saved:', shotA);

  // Drawer open
  await hamburger.click();
  await page.waitForTimeout(700);
  // Drawer dialog should be visible (SidebarV2 mounts as a dialog role on mobile)
  const drawer = page.locator('aside[aria-label="Main navigation"], div[role="dialog"]').first();
  await drawer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

  const shotB = path.join(OUT, 'B-drawer-open-375.png');
  await page.screenshot({ path: shotB, fullPage: false });
  console.log('Screenshot B saved:', shotB);

  await browser.close();

  // Cleanup
  await supabase.from('coffee_shop_plans').delete().eq('id', planId);
  await supabase.auth.admin.deleteUser(userId);
  console.log('Done. Output:', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
