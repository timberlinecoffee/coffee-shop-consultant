#!/usr/bin/env node
// TIM-3330 race repro — drives @supabase/ssr's createServerClient through the
// `_callRefreshToken` -> non-retryable error -> `_removeSession` path, then
// checks whether the resulting setAll deletion batch:
//   (a) propagates to the response cookie jar (BEFORE the guard), or
//   (b) is suppressed when the inbound request still carries a valid auth token
//       (AFTER the guard).
//
// Run: node scripts/tim3330-race-repro.mjs
//
// No network: global fetch is stubbed to return a non-retryable AuthApiError
// (HTTP 400 invalid_grant / refresh_token_already_used) on every /auth/v1/token
// hit, which is exactly what a losing concurrent refresh sees in prod.

import { createServerClient } from "@supabase/ssr";
import {
  shouldSuppressSetAll,
} from "../src/lib/auth/cookie-deletion-guard.ts";

const REF = "abcdef";
const STORAGE_KEY = `sb-${REF}-auth-token`;

// --- 1. Forge a near-expiry session ----------------------------------------

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jwt(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

const nowSec = Math.floor(Date.now() / 1000);
const expiredAccess = jwt({
  iss: "supabase",
  sub: "u_race",
  aud: "authenticated",
  exp: nowSec - 60, // expired 60s ago — forces refresh on getUser()
  role: "authenticated",
});

const session = {
  access_token: expiredAccess,
  refresh_token: "rt_race_loser",
  expires_at: nowSec - 60,
  expires_in: -60,
  token_type: "bearer",
  user: { id: "u_race", aud: "authenticated", role: "authenticated" },
};

const sessionCookieValue = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

// --- 2. Stub fetch to return a non-retryable refresh failure ---------------

let refreshHits = 0;
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("/auth/v1/token") && url.includes("grant_type=refresh_token")) {
    refreshHits += 1;
    return new Response(
      JSON.stringify({
        code: "refresh_token_already_used",
        message: "Already Used Refresh Token",
        error: "invalid_grant",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
};

// --- 3. Run a single getUser() scenario -----------------------------------

async function run({ guardEnabled }) {
  const inbound = new Map([[STORAGE_KEY, sessionCookieValue]]);
  const requestJar = {
    getAll: () => [...inbound.entries()].map(([name, value]) => ({ name, value })),
  };
  let setAllCalls = 0;
  let suppressedCalls = 0;
  const responseJar = new Map(inbound); // start as a copy

  const supabase = createServerClient(
    "https://abcdef.supabase.co",
    "sb_publishable_NOT_REAL",
    {
      cookies: {
        getAll: () => requestJar.getAll(),
        setAll: (cookiesToSet) => {
          setAllCalls += 1;
          if (guardEnabled && shouldSuppressSetAll(cookiesToSet, requestJar, { reason: "race-repro" })) {
            suppressedCalls += 1;
            return;
          }
          for (const { name, value } of cookiesToSet) {
            if (value === "") responseJar.delete(name);
            else responseJar.set(name, value);
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();
  return {
    error: error ? { name: error.name, message: error.message, code: error.code } : null,
    user: data.user ? { id: data.user.id } : null,
    setAllCalls,
    suppressedCalls,
    responseStillHasAuthToken: responseJar.has(STORAGE_KEY) && responseJar.get(STORAGE_KEY) !== "",
  };
}

// --- 4. Run both variants and print the verdict ----------------------------

const refreshHitsBefore = refreshHits;
const withoutGuard = await run({ guardEnabled: false });
const withoutGuardFetches = refreshHits - refreshHitsBefore;

const refreshHitsMid = refreshHits;
const withGuard = await run({ guardEnabled: true });
const withGuardFetches = refreshHits - refreshHitsMid;

const verdict = {
  scenario: "Single getUser() with expired session + non-retryable refresh failure",
  refreshFetchesWithoutGuard: withoutGuardFetches,
  refreshFetchesWithGuard: withGuardFetches,
  withoutGuard,
  withGuard,
};
console.log(JSON.stringify(verdict, null, 2));

const wipeFiredWithoutGuard = withoutGuard.setAllCalls > 0 && !withoutGuard.responseStillHasAuthToken;
const wipeBlockedWithGuard = withGuard.suppressedCalls > 0 && withGuard.responseStillHasAuthToken;

if (!wipeFiredWithoutGuard) {
  console.error("FAIL: expected wipe to fire without guard");
  process.exit(2);
}
if (!wipeBlockedWithGuard) {
  console.error("FAIL: expected wipe to be suppressed with guard");
  process.exit(2);
}
console.log("\nPASS — race wipe fires without guard, is suppressed with guard.");
