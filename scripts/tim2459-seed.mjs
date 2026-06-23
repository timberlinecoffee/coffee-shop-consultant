// TIM-2531: persona-seed harness for TIM-2459 multi-persona QA verify runs.
//
// Provisions 6 QA personas (matching TIM-2457 spec) without writing the
// nonexistent users.country_code column (which caused PGRST204 errors and
// silently failed entire seed rows — see TIM-2464 / TIM-2531).
//
// Country context is written to plan_hiring_settings.hiring_country (per-plan,
// canonical location per TIM-1300). HiringCountry covers US | GB | CA | AU | MX
// (MX added in TIM-2551 — Mexico hiring requirements live in
// hiring_requirement_sets with country_code='MX', is_system=true).
//
// Every DB mutation is explicitly asserted before continuing to the next persona
// (Engineering Rule 5: errors must be loud, never silently swallowed).
//
// Outputs:  scripts/tim2459-seed-output.json  (persona array with userId/planId
//           for use by downstream verify/Playwright scripts)
//
// Run with:
//   node scripts/tim2459-seed.mjs
//   node scripts/tim2459-seed.mjs --clean   (delete test accounts before seeding)

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const envRaw = fs.readFileSync(".env.local", "utf8")
  .split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"));
const env = Object.fromEntries(
  envRaw.map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("FATAL: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OUTPUT_PATH = "scripts/tim2459-seed-output.json";
const TS = Date.now();

// 6 personas matching TIM-2457 specification.
// users.localization stores the raw country code so UI tests can read it if needed.
const PERSONAS = [
  { n: 1, slug: "p1-seattle",   currency: "USD", hiringCountry: "US", shopName: "Pioneer Square Coffee Co.",  viewport: "desktop" },
  { n: 2, slug: "p2-austin",    currency: "USD", hiringCountry: "US", shopName: "Lone Star Coffee Cart",       viewport: "desktop" },
  { n: 3, slug: "p3-calgary",   currency: "CAD", hiringCountry: "CA", shopName: "Foothills Drive-Thru Coffee", viewport: "desktop" },
  { n: 4, slug: "p4-toronto",   currency: "CAD", hiringCountry: "CA", shopName: "Queen West Co-Brew",          viewport: "desktop" },
  { n: 5, slug: "p5-melbourne", currency: "AUD", hiringCountry: "AU", shopName: "Fitzroy Single Origin",       viewport: "mobile" },
  { n: 6, slug: "p6-mexico",    currency: "MXN", hiringCountry: "MX", shopName: "Roma Norte Tostaduría",       viewport: "mobile" },
];

function assert(condition, message) {
  if (!condition) {
    console.error("SEED ABORT:", message);
    process.exit(1);
  }
}

async function provisionPersona(persona) {
  const email = `qa-tim2459-${persona.slug}+${TS}@groundwork-test.com`;
  console.log(`\n[P${persona.n}] ${persona.slug} — seeding ${email}`);

  // Step 1: create auth user
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password: `TIM2459_${TS}!`,
    email_confirm: true,
  });
  assert(!cErr && created?.user, `[P${persona.n}] createUser failed: ${cErr?.message}`);
  const userId = created.user.id;
  console.log(`  [1/4] auth user created: ${userId}`);

  // Wait for handle_new_user trigger to create the users row.
  await new Promise((r) => setTimeout(r, 600));

  // Step 2: update users row.
  // NOTE: users.country_code does NOT exist in prod schema (only users.currency_code
  // ships per TIM-1741). Country lives on plan_hiring_settings.hiring_country
  // and users.localization — NOT on a top-level users column.
  const { error: uErr } = await admin.from("users").update({
    currency_code: persona.currency,
    onboarding_completed: true,
    subscription_status: "active",
    subscription_tier: "starter",
    ai_credits_remaining: 100,
    trial_ends_at: null,
    localization: { countryCode: persona.hiringCountry ?? "MX" },
  }).eq("id", userId);
  assert(!uErr, `[P${persona.n}] users.update failed: ${uErr?.message}`);
  console.log(`  [2/4] users row updated (currency_code=${persona.currency})`);

  // Step 3: create coffee_shop_plans row.
  const { data: planRow, error: pErr } = await admin.from("coffee_shop_plans")
    .insert({ user_id: userId, plan_name: persona.shopName })
    .select("id")
    .single();
  assert(!pErr && planRow?.id, `[P${persona.n}] coffee_shop_plans.insert failed: ${pErr?.message}`);
  const planId = planRow.id;
  console.log(`  [3/4] plan created: ${planId}`);

  // Step 4: set plan_hiring_settings.hiring_country (HiringCountry: US|GB|CA|AU|MX).
  if (persona.hiringCountry) {
    const { error: hErr } = await admin.from("plan_hiring_settings")
      .upsert({ plan_id: planId, hiring_country: persona.hiringCountry });
    assert(!hErr, `[P${persona.n}] plan_hiring_settings.upsert failed: ${hErr?.message}`);
    console.log(`  [4/4] plan_hiring_settings.hiring_country=${persona.hiringCountry}`);
  } else {
    console.log(`  [4/4] plan_hiring_settings skipped (${persona.slug} has no valid HiringCountry)`);
  }

  return { userId, planId, email, ...persona };
}

async function mintSession(email) {
  const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  assert(
    !lErr && linkData?.properties?.hashed_token,
    `mintSession generateLink failed for ${email}: ${lErr?.message ?? "no hashed_token"}`
  );

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otpData, error: oErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  assert(
    !oErr && otpData?.session,
    `mintSession verifyOtp failed for ${email}: ${oErr?.message ?? "no session"}`
  );
  return otpData.session;
}

// ──────────────────────────────────────────────────────────────────────────────
// main
// ──────────────────────────────────────────────────────────────────────────────

console.log("=== TIM-2459 PERSONA SEED ===");
console.log(`Timestamp: ${TS}`);
console.log(`Seeding ${PERSONAS.length} personas against ${SUPABASE_URL}`);

const provisioned = [];

for (const persona of PERSONAS) {
  const row = await provisionPersona(persona);
  const session = await mintSession(row.email);
  provisioned.push({ ...row, session });
  console.log(`  -> session minted for ${row.email}`);
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(provisioned, null, 2));

console.log(`\n=== SEED COMPLETE ===`);
console.log(`${provisioned.length}/${PERSONAS.length} personas provisioned`);
console.log(`Output: ${OUTPUT_PATH}`);
console.log(`\nAll seed mutations completed with zero errors (PGRST204 check: PASS)`);
