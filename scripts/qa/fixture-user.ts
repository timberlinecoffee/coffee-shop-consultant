#!/usr/bin/env -S deno run --allow-env --allow-net
// scripts/qa/fixture-user.ts — TIM-682
//
// Thin wrapper that calls the qa-fixture-admin Edge Function.
// Use this instead of auth.admin.* directly so the server-side
// allowlist is always enforced.
//
// Usage:
//   QA_FIXTURE_TOKEN=<token> SUPABASE_URL=<url> deno run --allow-env --allow-net \
//     scripts/qa/fixture-user.ts create qa-foo@timberline.coffee MyPass123!
//   ... update qa-foo@timberline.coffee NewPass456!
//   ... delete qa-foo@timberline.coffee

const [op, email, password] = Deno.args;

if (!op || !email) {
  console.error("Usage: fixture-user.ts <create|update|delete> <email> [password]");
  Deno.exit(1);
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const token = Deno.env.get("QA_FIXTURE_TOKEN");

if (!supabaseUrl || !token) {
  console.error("Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and QA_FIXTURE_TOKEN");
  Deno.exit(1);
}

const fnUrl = `${supabaseUrl}/functions/v1/qa-fixture-admin`;

const res = await fetch(fnUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ op, email, password }),
});

const body = await res.json();

if (!res.ok) {
  console.error(`Error ${res.status}:`, JSON.stringify(body, null, 2));
  Deno.exit(1);
}

console.log("OK:", JSON.stringify(body, null, 2));
