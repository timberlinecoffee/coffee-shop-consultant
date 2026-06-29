#!/usr/bin/env node
/**
 * TIM-3417 prod evidence shots — TIM-3409 Turnstile-aware auth via
 * generateLink + verifyOtp + base64 cookie injection.
 *
 * Usage:
 *   node scripts/tim3417-shots.mjs   (env-file loaded automatically)
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const OUT = join(repoRoot, 'scripts', 'screenshots', 'tim3417');
mkdirSync(OUT, { recursive: true });

function loadEnv(path) {
  const out = {};
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
      if (!m) continue;
      out[m[1]] = m[3].replace(/\\n$/, '').trim();
    }
  } catch {}
  return out;
}

const env = { ...process.env, ...loadEnv(join(repoRoot, '.env.prod-3417')) };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE || 'https://groundwork.cafe';

process.env.LD_LIBRARY_PATH = '/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu';
const CHROMIUM = '/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const MOBILE = [
  { name: '375x812', w: 375, h: 812 },
  { name: '414x896', w: 414, h: 896 },
  { name: '360x780', w: 360, h: 780 },
];

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedUser() {
  const email = `tim3417-${Date.now()}@test.groundwork.cafe`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'TempPwd1234!', email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;
  await admin.from('users').upsert({
    id: userId, subscription_status: 'active', subscription_tier: 'pro', onboarding_completed: true,
  });
  const { data: plan, error: planErr } = await admin.from('coffee_shop_plans')
    .insert({ user_id: userId, plan_name: 'TIM-3417 Test', status: 'in_progress' })
    .select().single();
  if (planErr) throw planErr;
  await admin.from('users').update({ current_plan_id: plan.id }).eq('id', userId);
  return { userId, email, planId: plan.id };
}

async function mintCookies(email) {
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkError?.message}`);
  }
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    type: 'magiclink', token_hash: linkData.properties.hashed_token,
  });
  if (otpError || !otpData?.session) {
    throw new Error(`verifyOtp failed: ${otpError?.message}`);
  }
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(otpData.session);
  const b64 = Buffer.from(payload, 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const domain = new URL(BASE).hostname;
  const baseCookie = { domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' };
  const cookies = [];
  if (fullValue.length <= MAX) {
    cookies.push({ ...baseCookie, name: storageKey, value: fullValue });
  } else {
    let i = 0, pos = 0;
    while (pos < fullValue.length) {
      cookies.push({ ...baseCookie, name: `${storageKey}.${i}`, value: fullValue.slice(pos, pos + MAX) });
      pos += MAX; i += 1;
    }
  }
  return cookies;
}

async function withCtx(browser, viewport, cookies, fn) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    userAgent: viewport.w <= 414
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
    isMobile: viewport.w <= 414,
    hasTouch: viewport.w <= 414,
    deviceScaleFactor: viewport.w <= 414 ? 2 : 1,
  });
  if (cookies) await ctx.addCookies(cookies);
  try { return await fn(ctx); } finally { await ctx.close(); }
}

async function shotLanding(browser) {
  for (const v of MOBILE) {
    await withCtx(browser, v, null, async (ctx) => {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const menu = page.getByText('Menu Pricing').first();
      if (await menu.count() > 0) {
        await menu.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
      }
      const file = join(OUT, `landing-menumockup-${v.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`OK ${file}`);
    });
  }
}

async function shotWorkspace(browser, cookies) {
  for (const v of MOBILE) {
    await withCtx(browser, v, cookies, async (ctx) => {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/workspace/financials`, { waitUntil: 'load' });
      await page.waitForTimeout(1800);
      const f = join(OUT, `header-financials-${v.name}.png`);
      await page.screenshot({ path: f, fullPage: false });
      console.log(`OK ${f}`);
      await page.goto(`${BASE}/workspace/marketing`, { waitUntil: 'load' });
      await page.waitForTimeout(1800);
      const m = join(OUT, `header-marketing-${v.name}.png`);
      await page.screenshot({ path: m, fullPage: false });
      console.log(`OK ${m}`);
    });
  }
  await withCtx(browser, { name: '1440x900', w: 1440, h: 900 }, cookies, async (ctx) => {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/workspace/financials`, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    const f = join(OUT, `header-financials-1440x900.png`);
    await page.screenshot({ path: f, fullPage: false });
    console.log(`OK ${f}`);
  });
}

async function main() {
  if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) {
    console.error('missing supabase env (need URL + ANON + SERVICE_ROLE)');
    process.exit(1);
  }
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  console.log(`BASE=${BASE}`);
  console.log('--- Landing (MenuMockup) ---');
  await shotLanding(browser);

  const { userId, email } = await seedUser();
  console.log(`--- Workspace (user ${userId}) ---`);
  try {
    const cookies = await mintCookies(email);
    await shotWorkspace(browser, cookies);
  } finally {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }

  await browser.close();
  console.log(`\nOutput: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
