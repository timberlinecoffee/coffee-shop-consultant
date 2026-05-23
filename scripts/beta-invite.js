#!/usr/bin/env node
// TIM-925: Beta invite + paywall waiver script.
// Usage: node scripts/beta-invite.js <email> [full_name] [waiver_until_iso]
//
// Creates a Groundwork account for the given email and grants a paywall waiver
// until the specified date (defaults to 2026-07-15T00:00:00Z if omitted).
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
// Run from repo root with a .env.local or after exporting those vars.

"use strict";

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Export them or add to .env.local and run via:\n" +
      "  node -r dotenv/config scripts/beta-invite.js <email>"
  );
  process.exit(1);
}

const [, , email, fullName, waiverUntilArg] = process.argv;

if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/beta-invite.js <email> [full_name] [waiver_until_iso]");
  process.exit(1);
}

// Default waiver window: end of Groundwork beta (six weeks after June 13 launch)
const waiverUntil = waiverUntilArg ?? "2026-07-15T00:00:00Z";

// Generate a secure temp password the tester can change on first login.
const tempPassword =
  crypto.randomBytes(6).toString("hex").toUpperCase() + "-" +
  crypto.randomBytes(3).toString("hex");

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`\nCreating beta account for: ${email}`);
  if (fullName) console.log(`  Full name: ${fullName}`);
  console.log(`  Paywall waiver until: ${waiverUntil}`);

  // 1. Create auth user via admin API
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true, // skip email confirmation for beta
    user_metadata: {
      full_name: fullName ?? null,
      signup_source: "beta_invite",
    },
  });

  if (authError) {
    if (authError.message?.toLowerCase().includes("already registered")) {
      console.log("  Auth user already exists — updating waiver only.");
    } else {
      console.error("  Auth user creation failed:", authError.message);
      process.exit(1);
    }
  } else {
    console.log(`  Auth user created: ${authData.user.id}`);
  }

  // Resolve the user id (create may have succeeded or user already existed)
  const { data: authUser, error: lookupError } = await supabase.auth.admin.getUserByEmail(email);
  if (lookupError || !authUser?.user) {
    console.error("  Could not look up user after create:", lookupError?.message);
    process.exit(1);
  }
  const userId = authUser.user.id;

  // 2. Set beta_waiver_until on the public.users row (created by the on_auth_user_created trigger).
  const { error: updateError } = await supabase
    .from("users")
    .update({ beta_waiver_until: waiverUntil })
    .eq("id", userId);

  if (updateError) {
    console.error("  Failed to set beta_waiver_until:", updateError.message);
    process.exit(1);
  }

  console.log("\n✓ Beta account ready.");
  console.log("  User ID :", userId);
  console.log("  Email   :", email);
  console.log("  Temp pw :", tempPassword);
  console.log("  Waiver  : active until", waiverUntil);
  console.log(
    "\nShare with tester:\n" +
      `  Login URL : ${process.env.NEXT_PUBLIC_APP_URL ?? "https://coffee-shop-consultant.vercel.app"}/login\n` +
      `  Email     : ${email}\n` +
      `  Password  : ${tempPassword}\n` +
      "  (tester can change password via Account → Settings after first login)"
  );
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
