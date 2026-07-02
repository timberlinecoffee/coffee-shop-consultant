// TIM-3284 — confirm the SSR HTML always contains the cookie-consent dialog,
// regardless of whether the request carries a gw_consent cookie. This is the
// theoretical mechanism by which the banner can "re-pop" even after the user
// accepted: SSR always renders it, and any client-side hiccup that prevents
// the hydration-time cookie read from taking effect leaves the banner visible.

import { chromium } from "playwright";

const ORIGIN = process.env.ORIGIN || "https://groundwork.cafe";

async function check(label, cookies) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  if (cookies) await ctx.addCookies(cookies);

  // Disable JS to see what the SSR HTML contains BEFORE hydration runs.
  await ctx.route("**/*.js", (route) => route.abort());
  await ctx.addInitScript(() => {
    // Pretend JS is off — actually it IS off via the route abort above for .js
    // assets. But the page may inline some script tags; just observe what
    // renders pre-hydration by reading the HTML directly.
  });

  // Easier: just fetch the HTML.
  const ck = cookies
    ? cookies.map((c) => `${c.name}=${c.value}`).join("; ")
    : "";
  const res = await fetch(`${ORIGIN}/`, {
    headers: ck ? { Cookie: ck } : {},
  });
  const html = await res.text();
  const hasBanner = /aria-label="Cookie consent"/.test(html);
  console.log(`\n=== ${label} ===`);
  console.log("HTTP", res.status, "x-vercel-cache:", res.headers.get("x-vercel-cache"));
  console.log("set-cookie:", res.headers.get("set-cookie"));
  console.log("SSR has banner element in HTML:", hasBanner);
  await browser.close();
  return hasBanner;
}

const withConsent = [
  {
    name: "gw_consent",
    value: encodeURIComponent(
      JSON.stringify({ version: 1, analytics: true, marketing: true, decidedAt: new Date().toISOString().replace(/Z.*$/, "Z") }),
    ),
    domain: ".groundwork.cafe",
    path: "/",
  },
];

await check("Visit WITHOUT gw_consent cookie", null);
await check("Visit WITH gw_consent cookie (accepted-all)", withConsent);
