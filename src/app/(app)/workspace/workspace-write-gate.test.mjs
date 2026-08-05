// TIM-3442: every workspace screen must honour a live trial.
//
// TIM-1902 introduced the card-required 7-day trial and added `hasWriteAccess`
// to express it — "free_trial users on a Stripe-backed 7-day trial are treated
// as 'active' for write access". That helper then reached 8 of 84 gate sites.
// The other 76, including all eleven workspace screens, kept calling
// `isSubscriptionActive`, which is `status === 'active'` and nothing else.
//
// The effect, verified on a live account on 2026-08-05: a user with
// `subscription_status='free_trial'` and a `trial_ends_at` seven days out —
// exactly what Stripe writes when a card-backed trial begins — was shown "Pro"
// in the sidebar (effectiveTierForRead honours the trial) and a read-only
// Concept workspace (the gate does not). The tier resolver and the write gate
// disagreed about the same user, on the same page load.
//
// This test pins the screens. A new workspace that gates on
// `isSubscriptionActive` fails here rather than silently locking out every
// trialist.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(__dirname);

// Files that compute an editability flag for a workspace surface.
const GATE_FILES = files.filter((f) => {
  const src = readFileSync(f, 'utf8');
  return /\bconst\s+canEdit\s*=/.test(src) || /\bcanEdit\s*:/.test(src) && /@\/lib\/access/.test(src);
});

test('the sweep found the workspace gate files it is meant to guard', () => {
  // If a refactor moves these, this test must be updated rather than silently
  // guarding nothing — the failure mode that let the original bug through.
  assert.ok(
    GATE_FILES.length >= 10,
    `expected at least 10 workspace gate files, found ${GATE_FILES.length}`,
  );
});

test('no workspace screen gates editing on isSubscriptionActive', () => {
  const offenders = [];
  for (const f of GATE_FILES) {
    const src = readFileSync(f, 'utf8');
    if (/isSubscriptionActive\s*\(/.test(src)) {
      offenders.push(f.slice(f.indexOf('src/')));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these screens lock out paying trial users:\n  ${offenders.join('\n  ')}\n` +
      'Use hasWriteAccess({ subscription_status, trial_ends_at }) instead.',
  );
});

test('every workspace gate reads trial_ends_at from the profile', () => {
  // hasWriteAccess silently returns false when trial_ends_at is undefined, so a
  // screen that calls it without selecting the column would look correct and
  // behave exactly like the bug. Both halves have to be present.
  const offenders = [];
  for (const f of GATE_FILES) {
    const src = readFileSync(f, 'utf8');
    if (!/hasWriteAccess\s*\(/.test(src)) continue;
    if (!/trial_ends_at/.test(src)) offenders.push(f.slice(f.indexOf('src/')));
  }
  assert.deepEqual(
    offenders,
    [],
    `these screens call hasWriteAccess but never select trial_ends_at:\n  ${offenders.join('\n  ')}`,
  );
});

test('no workspace surface hardcodes a reason for being read-only', () => {
  // The reason belongs to readOnlyReason() alone. A screen that spells out its
  // own cause is a screen that can be wrong about it, which is how "your
  // subscription is paused" reached people who had never subscribed.
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (/subscription is paused so we/i.test(src)) {
      offenders.push(f.slice(f.indexOf('src/')));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these files assert their own read-only reason:\n  ${offenders.join('\n  ')}\n` +
      'Render <ReadOnlyBanner user={{ subscription_status, trial_ends_at }} /> instead.',
  );
});
