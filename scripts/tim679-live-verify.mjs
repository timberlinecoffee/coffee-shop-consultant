// TIM-679 live-mode Stripe verify: authenticate a throwaway user via Supabase admin,
// then POST /api/stripe/create-checkout-session for each of the 4 tier/interval combos.
// Expected: each returns { url: "https://checkout.stripe.com/...cs_live_..." } if the
// configured Vercel Prod STRIPE_*_PRICE_ID env vars point to real live-mode prices.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\\n$/, "").replace(/\\n/g, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD = "https://coffee-shop-consultant.vercel.app";
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("missing supabase creds"); process.exit(2); }

const ADMIN = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const suffix = Math.random().toString(36).slice(2, 9);
const email = `tim679-verify-${suffix}@paperclip.local`;
const password = `Tim679Verify!${suffix}`;

async function main() {
  // 1. Create user
  const { data: userData, error: userErr } = await ADMIN.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr) throw new Error(`createUser: ${userErr.message}`);
  const userId = userData.user?.id;
  console.log(`created throwaway user ${email} (id=${userId})`);

  // 2. Get session via admin.generateLink + verifyOtp (captcha-safe path).
  const { data: linkData, error: linkErr } = await ADMIN.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw new Error(`generateLink: ${linkErr.message}`);
  const otp = linkData.properties?.email_otp;
  if (!otp) throw new Error("no email_otp in generateLink response");
  const CLIENT = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: signData, error: signErr } = await CLIENT.auth.verifyOtp({
    email, token: otp, type: "magiclink",
  });
  if (signErr) throw new Error(`verifyOtp: ${signErr.message}`);
  const accessToken = signData.session?.access_token;
  const refreshToken = signData.session?.refresh_token;
  if (!accessToken) throw new Error("no access token");
  console.log(`obtained access token via magiclink (len=${accessToken.length})`);

  // 3. Build Supabase auth cookies for the prod hostname using @supabase/ssr's
  //    exact format: `sb-<ref>-auth-token` = `base64-<base64url(JSON)>`,
  //    chunked at 3180-char boundaries as `.0`, `.1`, ... if needed.
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const cookieBaseName = `sb-${projectRef}-auth-token`;
  const sessionJson = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: signData.session?.expires_in,
    expires_at: signData.session?.expires_at,
    token_type: signData.session?.token_type,
    user: signData.session?.user,
  });
  const b64 = Buffer.from(sessionJson, "utf8").toString("base64url");
  const encodedValue = "base64-" + b64;
  // Chunk: mirror createChunks — encodedValue after encodeURIComponent, chunked at 3180.
  const CHUNK_SIZE = 3180;
  const encoded = encodeURIComponent(encodedValue);
  const chunks = [];
  if (encoded.length <= CHUNK_SIZE) {
    chunks.push({ name: cookieBaseName, value: encodedValue });
  } else {
    let i = 0, remaining = encoded;
    while (remaining.length > 0) {
      const slice = remaining.slice(0, CHUNK_SIZE);
      chunks.push({ name: `${cookieBaseName}.${i}`, value: decodeURIComponent(slice) });
      remaining = remaining.slice(CHUNK_SIZE);
      i++;
    }
  }
  const cookie = chunks.map(c => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
  console.log(`built ${chunks.length} cookie chunk(s), header len=${cookie.length}`);

  // 4. Probe each of the 4 tier/interval combos
  const combos = [
    { tier: "starter", interval: "monthly", expectedEnvVar: "STRIPE_STARTER_MONTHLY_PRICE_ID" },
    { tier: "starter", interval: "annual", expectedEnvVar: "STRIPE_STARTER_ANNUAL_PRICE_ID" },
    { tier: "pro",     interval: "monthly", expectedEnvVar: "STRIPE_PRO_MONTHLY_PRICE_ID" },
    { tier: "pro",     interval: "annual",  expectedEnvVar: "STRIPE_PRO_ANNUAL_PRICE_ID" },
  ];

  const results = [];
  for (const c of combos) {
    const res = await fetch(`${PROD}/api/stripe/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: PROD },
      body: JSON.stringify({ tier: c.tier, interval: c.interval }),
    });
    const bodyText = await res.text();
    let body;
    try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText.slice(0, 500) }; }
    const url = body.url || null;
    const livemode = url ? /cs_live_/.test(url) : null;
    const testmode = url ? /cs_test_/.test(url) : null;
    results.push({ ...c, status: res.status, url, livemode, testmode, error: body.error, redirectHost: url ? new URL(url).host : null });
    console.log(`  ${c.tier}/${c.interval}: HTTP ${res.status} livemode=${livemode} testmode=${testmode} host=${url ? new URL(url).host : "n/a"}`);
    if (!url && body.error) console.log(`    err: ${body.error}`);
  }

  // 5. Delete the throwaway user
  if (userId) {
    const { error: delErr } = await ADMIN.auth.admin.deleteUser(userId);
    if (delErr) console.log(`  cleanup warn: ${delErr.message}`);
    else console.log(`cleaned up user ${userId}`);
  }

  // Final report
  console.log("\n=== VERIFY REPORT ===");
  const allLive = results.every(r => r.livemode === true);
  const anyTest = results.some(r => r.testmode === true);
  const anyErr = results.filter(r => !r.url);
  console.log(`all 4 combos returned cs_live_ URL: ${allLive}`);
  console.log(`any combo returned cs_test_ URL   : ${anyTest}`);
  console.log(`errors: ${anyErr.length}`);
  console.log(JSON.stringify(results, null, 2));
  process.exit(allLive && !anyTest && anyErr.length === 0 ? 0 : 1);
}

main().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
