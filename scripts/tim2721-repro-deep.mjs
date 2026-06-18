#!/usr/bin/env node
// TIM-2721 deep repro — capture every failing subrequest URL + status so we can
// pinpoint what "never loads" means on prod under ?ui=v2.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, "..");
const OUT_DIR = join(REPO_ROOT, "done-evidence", "tim2721");
mkdirSync(OUT_DIR, { recursive: true });

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
      if (!m) continue;
      out[m[1]] = m[3].replace(/\\n$/, "").trim();
    }
  } catch {}
  return out;
}

const env = { ...process.env, ...loadEnv(join(REPO_ROOT, ".env.local")) };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL ?? "https://groundwork.cafe";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";

async function mintCookies(host) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: link } = await admin.auth.admin.generateLink({
    type: "magiclink", email: FIXTURE_EMAIL,
  });
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otp } = await anon.auth.verifyOtp({
    type: "magiclink", token_hash: link.properties.hashed_token,
  });
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(otp.session);
  const b64 = Buffer.from(payload, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const base = { domain: host, path: "/", httpOnly: false, sameSite: "Lax", secure: true };
  const cookies = [];
  if (fullValue.length <= MAX) {
    cookies.push({ ...base, name: storageKey, value: fullValue });
  } else {
    let i = 0, pos = 0;
    while (pos < fullValue.length) {
      cookies.push({ ...base, name: `${storageKey}.${i}`, value: fullValue.slice(pos, pos + MAX) });
      pos += MAX; i += 1;
    }
  }
  return cookies;
}

async function probe(context, name, target) {
  const page = await context.newPage();
  const failedReqs = [];
  const allReqs = [];

  page.on("response", resp => {
    const u = resp.url();
    const status = resp.status();
    allReqs.push({ url: u.length > 200 ? u.slice(0, 200) + "..." : u, status, type: resp.request().resourceType() });
    if (status >= 400) failedReqs.push({ url: u, status, type: resp.request().resourceType() });
  });
  page.on("requestfailed", req => {
    failedReqs.push({ url: req.url(), status: "FAILED", type: req.resourceType(), error: req.failure()?.errorText });
  });

  let navError = null;
  try {
    await page.goto(target, { waitUntil: "commit", timeout: 30000 });
  } catch (err) {
    navError = err.message;
  }
  await page.waitForTimeout(5500);

  const finalUrl = page.url();
  const meta = await page.evaluate(() => {
    const sidebarV2 = !!document.querySelector('[data-sidebar="root"], [data-testid*="sidebar-v2"], aside [aria-label*="primary" i]');
    const homev2Ring = !!document.querySelector('svg[viewBox="0 0 96 96"]');
    const bottomTabBar = !!document.querySelector('nav[aria-label*="primary" i], nav[aria-label*="bottom" i]');
    const allNavLabels = Array.from(document.querySelectorAll('nav')).map(n => n.getAttribute('aria-label') || n.className).slice(0, 5);
    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim()?.slice(0, 150) ?? null,
      sidebarV2, homev2Ring, bottomTabBar,
      allNavLabels,
      bodyLen: document.body?.innerText?.length ?? 0,
      hasFinancialSnapshot: !!Array.from(document.querySelectorAll('*')).find(el => el.textContent?.includes('Financial Snapshot') || el.textContent?.includes('Break-Even')),
    };
  });

  const screenshot = join(OUT_DIR, `deep-${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  await page.close();

  return { name, target, finalUrl, navError, meta, failedReqs, totalReqs: allReqs.length };
}

async function main() {
  const host = new URL(BASE).hostname;
  console.log(`→ mint session for ${FIXTURE_EMAIL}`);
  const cookies = await mintCookies(host);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addCookies(cookies);

  const urls = [
    ["financials-v2-desktop", `${BASE}/workspace/financials?ui=v2`],
    ["home-v2-desktop",       `${BASE}/dashboard?ui=v2`],
    ["financials-v1-desktop", `${BASE}/workspace/financials?ui=v1`],
    ["home-v1-desktop",       `${BASE}/dashboard?ui=v1`],
  ];

  const out = [];
  for (const [name, url] of urls) {
    console.log(`→ ${name}`);
    const r = await probe(context, name, url);
    console.log(`  final=${r.finalUrl} h1="${r.meta.h1}" sidebarV2=${r.meta.sidebarV2} ring=${r.meta.homev2Ring} tabBar=${r.meta.bottomTabBar} navs=${JSON.stringify(r.meta.allNavLabels)} failed=${r.failedReqs.length}/${r.totalReqs}`);
    for (const f of r.failedReqs.slice(0, 10)) {
      console.log(`    [FAIL ${f.status}] ${f.type} ${f.url}`);
    }
    out.push(r);
  }

  await context.close();
  await browser.close();
  writeFileSync(join(OUT_DIR, "deep.json"), JSON.stringify(out, null, 2));
  console.log(`→ wrote deep.json + ${out.length} screenshots`);
}

main().catch(err => { console.error(err); process.exit(1); });
