// TIM-3441: pin-test for the /auth/confirm route.
//
// Same technique as the email-hook route test: the handler can't be invoked
// from raw `node --test` because of the @/ alias, so we pin the contract by
// source-grep. What must hold:
//   (a) it exchanges token_hash via verifyOtp — not `code` via
//       exchangeCodeForSession, which is what /auth/callback does and is why
//       emailed confirmation links died there;
//   (b) failures redirect somewhere that tells the truth, never to a page that
//       looks like success;
//   (c) recovery links land on the password form, not on onboarding;
//   (d) the welcome email is sent here, after confirmation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');
const loginPage = readFileSync(
  join(__dirname, '..', '..', 'login', 'page.tsx'),
  'utf8',
);

test('route declares nodejs runtime + force-dynamic + no revalidate', () => {
  assert.match(src, /export const runtime = ['"]nodejs['"]/);
  assert.match(src, /export const dynamic = ['"]force-dynamic['"]/);
  assert.match(src, /export const revalidate = 0/);
});

test('route exchanges token_hash with verifyOtp, not code with exchangeCodeForSession', () => {
  assert.match(src, /verifyOtp\(/);
  assert.match(src, /token_hash:\s*tokenHash/);
  assert.doesNotMatch(src, /exchangeCodeForSession/);
});

test('route sets no-store on every response it hands back', () => {
  // A cached 307 on a single-use token URL burns the token on a redirect the
  // user never sees (same reasoning as TIM-3148 on /auth/callback).
  assert.match(src, /Cache-Control/);
  const redirects = src.match(/NextResponse\.redirect\(/g) ?? [];
  const wrapped = src.match(/applyNoStore\(/g) ?? [];
  assert.ok(redirects.length > 0, 'expected at least one redirect');
  // Every redirect is wrapped, plus the one definition of applyNoStore itself.
  assert.ok(
    wrapped.length >= redirects.length,
    `every redirect must be wrapped in applyNoStore (${redirects.length} redirects, ${wrapped.length} wraps)`,
  );
});

test('a failed confirmation lands on a page that says so', () => {
  assert.match(src, /error=confirm_failed/);
  assert.match(src, /forgot-password\?error=expired/);
  // The message has to actually render, or this is a silent failure — the
  // most expensive bug shape in this product.
  assert.match(
    loginPage,
    /error === ["']confirm_failed["']/,
    'login page must render a message for ?error=confirm_failed',
  );
});

test('recovery is exempt from the onboarding override', () => {
  // Otherwise an un-onboarded user resetting their password gets sent to
  // /onboarding and can never reach the form that sets the new password.
  const recoveryIdx = src.indexOf('type === "recovery"');
  const onboardingIdx = src.indexOf('onboarding_completed');
  assert.ok(recoveryIdx > 0, 'expected an explicit recovery branch');
  assert.ok(
    recoveryIdx < onboardingIdx,
    'the recovery branch must short-circuit before the onboarding lookup',
  );
});

test('the welcome email is sent from here, after confirmation', () => {
  assert.match(
    src,
    /import\s*\{[^}]*\bsendWelcomeEmail\b[^}]*\}\s*from\s*['"]@\/lib\/email\/templates['"]/,
  );
  // It must run after verifyOtp resolved, never before.
  assert.ok(src.indexOf('verifyOtp(') < src.indexOf('sendWelcomeEmail({'));
  // And a Resend outage must not cost the user the confirmation.
  assert.match(src, /try\s*\{[\s\S]*sendWelcomeEmail\(\{[\s\S]*\}\s*catch/);
});

test('only real EmailOtpType values reach verifyOtp', () => {
  for (const t of [
    'signup',
    'invite',
    'magiclink',
    'recovery',
    'email_change',
    'email',
  ]) {
    assert.match(src, new RegExp(`["']${t}["']`), `${t} must be accepted`);
  }
  assert.match(src, /VALID_TYPES\.has\(/);
});
