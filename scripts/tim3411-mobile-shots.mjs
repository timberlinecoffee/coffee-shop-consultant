#!/usr/bin/env node
// TIM-3411 mobile 375px audit screenshots — unauthenticated surfaces on prod.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.TIM3411_BASE || 'https://groundwork.cafe';
const OUT  = path.resolve('scripts/screenshots/tim3411');
const CHROME = '/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const targets = [
  { slug: 'landing',          path: '/' },
  { slug: 'pricing',          path: '/pricing' },
  { slug: 'login',            path: '/login' },
  { slug: 'signup',           path: '/signup' },
  { slug: 'forgot-password',  path: '/forgot-password' },
  { slug: 'help',             path: '/help' },
  { slug: 'privacy',          path: '/privacy' },
  { slug: 'terms',            path: '/terms' },
  { slug: 'subscription-terms', path: '/subscription-terms' },
  { slug: 'coming-soon',      path: '/coming-soon' },
  { slug: 'affiliates-apply', path: '/affiliates/apply' },
];

const VIEWPORTS = [
  { w: 375, h: 812, tag: '375' },   // iPhone SE / primary
  { w: 360, h: 800, tag: '360' },   // cheapest Android
  { w: 414, h: 896, tag: '414' },   // iPhone Pro
];

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const summary = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    for (const t of targets) {
      const url = BASE + t.path;
      const out = path.join(OUT, `${t.slug}-${vp.tag}.png`);
      try {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const status = resp ? resp.status() : 0;
        await page.waitForTimeout(1500); // settle fonts/lazy images
        // Measure horizontal scroll
        const scroll = await page.evaluate(() => ({
          docW: document.documentElement.scrollWidth,
          winW: window.innerWidth,
          bodyW: document.body.scrollWidth,
        }));
        await page.screenshot({ path: out, fullPage: true });
        const hasHscroll = (scroll.docW || scroll.bodyW) > scroll.winW + 1;
        summary.push({ slug: t.slug, path: t.path, vp: vp.tag, status, hasHscroll, docW: scroll.docW, winW: scroll.winW, out });
        console.error(`[ok ${vp.tag}] ${t.path} -> ${status}, scrollW=${scroll.docW}/${scroll.winW} hscroll=${hasHscroll}`);
      } catch (e) {
        summary.push({ slug: t.slug, path: t.path, vp: vp.tag, status: 'ERR', error: String(e).slice(0, 200) });
        console.error(`[err ${vp.tag}] ${t.path}: ${e.message}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.error(`\nSaved ${summary.length} entries to summary.json`);
};

run().catch((e) => { console.error(e); process.exit(1); });
