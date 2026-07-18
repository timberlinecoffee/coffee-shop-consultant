// TIM-2459: shared provision + cookie-mint helpers (see TIM-2455 prod-verify
// pattern). All persona scripts call provisionPersona() then mintCookies().

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, "..", "..");

export function loadDotEnv() {
  const out = {};
  try {
    const raw = readFileSync(join(REPO_ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
      if (!m) continue;
      out[m[1]] = m[3].replace(/\\n$/, "").trim();
    }
  } catch {
    // optional
  }
  return out;
}

const env = { ...process.env, ...loadDotEnv() };
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
export const BASE = process.env.VERIFY_BASE_URL ?? "https://groundwork.cafe";

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)");
}

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const HOST = new URL(BASE).hostname;

// Provision a fresh user, mark onboarding complete, seed plan + localization.
// Returns { userId, planId }. If onboarded=false, leaves onboarding incomplete
// so the next visit redirects to /onboarding.
export async function provisionPersona(persona, { onboarded = true } = {}) {
  // Reuse existing user if it already exists (idempotent across re-runs).
  const ts = Date.now();
  const email = persona.email.replace("@", `+${ts}@`); // unique per run
  const password = `qa2459_${ts}`;

  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !createData?.user) {
    throw new Error(`createUser failed for ${email}: ${createErr?.message ?? "unknown"}`);
  }
  const userId = createData.user.id;

  // Note: users.country_code does NOT exist in prod schema (only currency_code
  // shipped via TIM-1741 emergency migration). Country selection is driven
  // from coffee_shop_plans.location_city / location_country instead.
  const userPatch = {
    currency_code: persona.currencyCode,
    subscription_status: "active",
    subscription_tier: "starter",
    trial_ends_at: null,
    beta_waiver_until: null,
    ai_credits_remaining: 100,
  };
  if (onboarded) userPatch.onboarding_completed = true;

  const { error: uErr } = await admin.from("users").update(userPatch).eq("id", userId);
  if (uErr) console.warn(`[warn] users.update: ${uErr.message}`);

  let planId = null;
  if (onboarded) {
    const { data: planRow, error: pErr } = await admin
      .from("coffee_shop_plans")
      .insert({ user_id: userId, plan_name: persona.shopName })
      .select("id")
      .single();
    if (pErr) console.warn(`[warn] coffee_shop_plans.insert: ${pErr.message}`);
    planId = planRow?.id ?? null;

    // Best-effort: write hiring_country to the workspace_state if the column
    // exists on coffee_shop_plans. Schema variants tolerated.
    if (planId && persona.hiringCountry) {
      await admin
        .from("coffee_shop_plans")
        .update({ hiring_country: persona.hiringCountry })
        .eq("id", planId)
        .then((r) => {
          if (r.error) console.warn(`[note] plan.hiring_country unset (${r.error.message})`);
        })
        .catch(() => {});
    }
  }

  return { userId, planId, email, password };
}

export async function cleanupPersona(userId) {
  try {
    await admin.from("coffee_shop_plans").delete().eq("user_id", userId);
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  } catch (e) {
    console.warn(`[cleanup] ${e.message}`);
  }
}

// Mint a Playwright cookie set from a freshly-created user. Uses the canonical
// @supabase/ssr base64-chunked-cookie pattern (TIM-2455).
export async function mintCookies(email) {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkError?.message ?? "no hashed_token"}`);
  }
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpError || !otpData?.session) {
    throw new Error(`verifyOtp failed: ${otpError?.message ?? "no session"}`);
  }

  const storageKey = `sb-${PROJECT_REF}-auth-token`;
  const payload = JSON.stringify(otpData.session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const baseCookie = {
    domain: HOST,
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
    secure: true,
  };
  const cookies = [];
  if (fullValue.length <= MAX) {
    cookies.push({ ...baseCookie, name: storageKey, value: fullValue });
  } else {
    let i = 0;
    let pos = 0;
    while (pos < fullValue.length) {
      cookies.push({
        ...baseCookie,
        name: `${storageKey}.${i}`,
        value: fullValue.slice(pos, pos + MAX),
      });
      pos += MAX;
      i += 1;
    }
  }
  return { cookies, userId: otpData.session.user.id };
}

export async function gotoPath(page, path, { timeout = 60_000 } = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

export async function dismissConsent(page) {
  const consent = page.locator('[role="dialog"][aria-label*="ookie" i], [role="dialog"][aria-label*="onsent" i]').first();
  if (!(await consent.isVisible().catch(() => false))) return;
  for (const label of [/accept/i, /agree/i, /allow/i, /dismiss/i, /close/i, /^ok$/i]) {
    const btn = consent.getByRole("button", { name: label }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      break;
    }
  }
}
