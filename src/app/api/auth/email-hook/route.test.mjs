// TIM-3022: pin-test for the auth-email-hook route wiring.
//
// The route can't be invoked from raw `node --test` because of the @/ alias.
// Instead we pin the integration contract via source-grep: the route MUST
// (a) verify standard-webhooks signatures, (b) enforce rate limit, (c) wire
// each Resend template sender into the dispatcher, (d) set runtime=nodejs
// and dynamic=force-dynamic, and (e) preserve the 401 / fall-through shape
// the issue scope requires.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');

test('route declares nodejs runtime + force-dynamic', () => {
  assert.match(src, /export const runtime = ['"]nodejs['"]/);
  assert.match(src, /export const dynamic = ['"]force-dynamic['"]/);
});

test('route reads the RAW body before signature verify', () => {
  // request.text() must come before any JSON.parse so the standard-webhooks
  // signature is computed over the exact bytes Supabase POSTed.
  const rawIdx = src.indexOf('request.text()');
  const verifyIdx = src.indexOf('verifyStandardWebhook(');
  const parseIdx = src.indexOf('JSON.parse(rawBody)');
  assert.ok(rawIdx > 0, 'expected request.text() call');
  assert.ok(verifyIdx > rawIdx, 'verify must run on raw body');
  assert.ok(
    parseIdx > verifyIdx,
    'JSON.parse must come AFTER signature verify',
  );
});

test('route imports the verifier from @/lib/webhooks/standard-webhooks', () => {
  assert.match(
    src,
    /import\s*\{[^}]*\bverifyStandardWebhook\b[^}]*\}\s*from\s*['"]@\/lib\/webhooks\/standard-webhooks['"]/,
  );
});

test('route reads SEND_EMAIL_HOOK_SECRET from env when verifying', () => {
  assert.match(src, /process\.env\.SEND_EMAIL_HOOK_SECRET/);
});

test('failed signature verify returns 401', () => {
  assert.match(src, /status:\s*401/);
});

test('route enforces rate limit via enforceRateLimit with auth-email-hook bucket', () => {
  assert.match(
    src,
    /import\s*\{[^}]*\benforceRateLimit\b[^}]*\}\s*from\s*['"]@\/lib\/rate-limit['"]/,
  );
  assert.match(src, /bucket:\s*['"]auth-email-hook['"]/);
});

test('route wires every send-template helper into the dispatcher', () => {
  const required = [
    'sendVerifyEmail',
    'sendWelcomeEmail',
    'sendPasswordResetEmail',
    'sendEmailChangeEmail',
    'sendMagicLinkEmail',
  ];
  for (const name of required) {
    assert.match(
      src,
      new RegExp(`\\b${name}\\b`),
      `route must reference ${name} so dispatch() can route the corresponding action`,
    );
  }
  assert.match(
    src,
    /import\s*\{[^}]*\bsendVerifyEmail\b[^}]*\}\s*from\s*['"]@\/lib\/email\/templates['"]/,
  );
});

test('route calls dispatchEmailHook with the senders object', () => {
  assert.match(src, /dispatchEmailHook\(payload,\s*\{/);
});
