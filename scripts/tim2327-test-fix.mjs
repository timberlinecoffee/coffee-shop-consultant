import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Plant the stale verifier that exposed the bug
  await ctx.addCookies([
    {
      name: "sb-ltmcttjftxzpgynhnrpg-auth-token-code-verifier",
      value: "base64-STALE_VARIANT_THAT_WOULD_HAVE_SHADOWED_THE_FRESH_WRITE_PADDED",
      domain: ".localhost",
      path: "/",
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(Date.now()/1000) + 3600,
    },
  ]).catch(() => {/* localhost may reject leading dot */});
  // Try without leading dot too
  await ctx.addCookies([
    {
      name: "sb-ltmcttjftxzpgynhnrpg-auth-token-code-verifier",
      value: "base64-STALE_HOST_ONLY_VARIANT_PLACEHOLDER",
      domain: "localhost",
      path: "/login",
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(Date.now()/1000) + 3600,
    },
  ]);

  await page.goto("http://localhost:3740/login", { waitUntil: "networkidle" });
  console.log("--- verifier cookies BEFORE click ---");
  for (const c of await ctx.cookies()) {
    if (c.name.includes("verifier")) console.log("  ", c.name, "Path=" + c.path, "Domain=" + c.domain, "len=" + c.value.length);
  }

  let supabaseChallenge = null;
  await page.route("https://accounts.google.com/**", r => r.abort());
  await page.route("https://*.supabase.co/auth/v1/authorize**", r => {
    supabaseChallenge = new URL(r.request().url()).searchParams.get("code_challenge");
    console.log("\n--- Supabase challenge:", supabaseChallenge);
    r.abort();
  });

  await page.getByRole("button", { name: /Continue with Google/i }).click().catch(() => {});
  await page.waitForTimeout(3000);

  console.log("\n--- verifier cookies AFTER click ---");
  let count = 0;
  let savedVerifier = null;
  for (const c of await ctx.cookies()) {
    if (c.name.endsWith("-auth-token-code-verifier")) {
      console.log("  ", c.name, "Path=" + c.path, "Domain=" + c.domain, "len=" + c.value.length, "val=" + c.value.slice(0,30));
      count++;
      savedVerifier = c.value;
    }
  }
  console.log("  TOTAL VERIFIER COOKIES:", count);

  console.log("\n--- sentinel ---");
  for (const c of await ctx.cookies()) {
    if (c.name === "gw_oauth_stale_verifiers") console.log("  gw_oauth_stale_verifiers = '" + c.value + "'");
  }

  // Verify challenge matches verifier
  if (savedVerifier && supabaseChallenge) {
    const stripped = savedVerifier.startsWith("base64-") ? savedVerifier.slice(7) : savedVerifier;
    const decoded = Buffer.from(stripped, "base64url").toString("utf8");
    const rawV = decoded.startsWith('"') ? JSON.parse(decoded) : decoded;
    const crypto = await import("node:crypto");
    const challenge = crypto.createHash("sha256").update(rawV).digest("base64url");
    console.log("\n--- match check ---");
    console.log("  saved verifier hash:", challenge);
    console.log("  challenge sent     :", supabaseChallenge);
    console.log("  MATCH:", challenge === supabaseChallenge);
  }

  await browser.close();
})();
