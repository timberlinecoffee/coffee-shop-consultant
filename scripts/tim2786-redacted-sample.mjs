// TIM-2786: produce a redacted sample row for each OAUTH_DIAG event so the
// CTO/board comment on TIM-2750 can paste verbatim what will appear in Vercel
// Logs when the next prod OAuth attempt fires. Run:
//
//   node --experimental-strip-types scripts/tim2786-redacted-sample.mjs
//
// Asserts:
//   - PII never appears (no full auth code, no full email, no Bearer token)
//   - Each emitted line is single-line JSON parseable
//   - corrId stable across the 4 lines (one login attempt = one log group)

import {
  logOAuthDiag,
  tail4,
  newCorrId,
  browserHintFromUA,
  cookieShape,
} from "../src/lib/oauth-diag.ts";

const captured = [];
const original = console.log;
console.log = (...args) => captured.push(args.join(" "));

const corrId = newCorrId();
const ua =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

// 1. callback_entry (server) — simulates a successful exchange request URL
const fakeCode = "AUTHCODE_HEAD_secret_tail_W4f9";
const fakeState = "STATE_HEAD_random_tail_p7Qx";
logOAuthDiag("callback_entry", {
  corrId,
  url: `/auth/callback?code=${tail4(fakeCode)}&state=${tail4(fakeState)}`,
  has_code: true,
  code_tail: tail4(fakeCode),
  state_tail: tail4(fakeState),
  error_param: "absent",
  verifier_cookies: 1,
  verifier_chunks: 0,
  verifier_pre_nav: "1",
  stale_verifiers: "0",
  auth_token_cookies: 0,
  handoff_cookies: 4,
  remember_me: "1",
  browser: browserHintFromUA(ua),
  next_resolved: "/dashboard",
  next_raw_cookie: "absent",
  referer: "https://accounts.google.com/",
  sec_fetch_site: "cross-site",
  sec_fetch_mode: "navigate",
  sec_fetch_dest: "document",
  sb_cookie_shape: cookieShape([
    { name: "sb-ltmcttjftxzpgynhnrpg-auth-token-code-verifier", value: "x".repeat(86) },
  ]),
  all_cookie_names: [
    "sb-ltmcttjftxzpgynhnrpg-auth-token-code-verifier",
    "gw_oauth_corr_id",
    "gw_oauth_verifier_pre_nav",
    "gw_remember_me",
  ],
});

// 2. callback_exchange_fail (server) — simulates the verifier mismatch
logOAuthDiag("callback_exchange_fail", {
  corrId,
  err: "code challenge does not match previously saved code verifier",
  err_status: 400,
  err_name: "AuthApiError",
  verifier_cookies: 1,
  verifier_chunks: 0,
  verifier_pre_nav: "1",
  stale_verifiers: "0",
  auth_token_cookies: 0,
  handoff_cookies: 4,
  browser: "safari",
  sb_names: "sb-ltmcttjftxzpgynhnrpg-auth-token-code-verifier",
});

// 3. callback_redirect (server)
logOAuthDiag("callback_redirect", {
  corrId,
  stage: "exchange_failed",
  location: "/login?error=auth_failed&corr=" + corrId + "&diag=len%3D423",
});

// 4. login_bounce_view (client beacon) — simulates the post-bounce view
logOAuthDiag("login_bounce_view", {
  corrId,
  ua,
  vw: 1440,
  vh: 900,
  cookie_names: ["sb-ltmcttjftxzpgynhnrpg-auth-token-code-verifier", "gw_remember_me"],
  performance_nav_ms: 1247,
  error_param: "auth_failed",
  diag_len: 423,
  diag_head: "stage=exchange_failed|err=code_challenge_does_not_match_previously_saved_code_verifier|err_status=400",
  referrer: "https://groundwork.cafe/auth/callback?code=...W4f9",
  third_party_cookie_hint: "safari_check_itp",
  console_errors: [],
  ip_hash: "a1b2c3d4e5f60718",
});

console.log = original;

// Validate output
let exitCode = 0;
for (const line of captured) {
  if (!line.startsWith("OAUTH_DIAG ")) {
    console.error("FAIL: line missing prefix:", line);
    exitCode = 1;
    continue;
  }
  const body = line.slice("OAUTH_DIAG ".length);
  try {
    JSON.parse(body);
  } catch (e) {
    console.error("FAIL: line not parseable JSON:", line);
    exitCode = 1;
    continue;
  }
  // PII discipline checks
  for (const forbidden of [
    "AUTHCODE_HEAD",
    "STATE_HEAD",
    "secret_tail",
    "random_tail",
    "Bearer ",
    "@",
    "jwt",
  ]) {
    if (body.includes(forbidden)) {
      console.error(`FAIL: line leaked '${forbidden}':`, line);
      exitCode = 1;
    }
  }
  if (!body.includes(`"corrId":"${corrId}"`)) {
    console.error("FAIL: line missing corrId:", line);
    exitCode = 1;
  }
}

console.log("--- TIM-2786 redacted sample (4 events, single corrId) ---");
for (const line of captured) console.log(line);
console.log("--- end sample ---");
console.log(`Lines emitted: ${captured.length}, exit: ${exitCode}`);
process.exit(exitCode);
