// TIM-3443: one write gate, everywhere.
//
// History this pins down, in order:
//   TIM-1902 added the card-required 7-day trial and `hasWriteAccess` to
//   express it. The helper reached 8 of 84 gate sites. The other 76 kept
//   calling `isSubscriptionActive` (status === 'active' and nothing else), so
//   for the entire life of the trial feature, a user with a card on file could
//   not write anything.
//
//   TIM-3442 migrated the eleven workspace screens. That half-fix was worse
//   than either end state: the screen unlocked, the route behind it did not,
//   and a trial user got "Save Failed — Retry" after typing. Shipping one side
//   of a two-sided contract is the exact defect pattern the migration existed
//   to remove.
//
//   TIM-3443 (this) migrates the remaining ~65 API routes and pins the whole
//   surface, so screens and routes can never again disagree about who may
//   write.
//
// `isSubscriptionActive` is deliberately still exported — "is this a paying
// customer" is a real and different question from "may this user write", and
// billing surfaces legitimately ask it. What it may not be is a write gate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', 'app');
const SRC_ROOT = join(__dirname, '..');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

const appFiles = walk(APP_ROOT);

test('the sweep actually reaches the app tree', () => {
  // A guard that silently walks an empty directory is worse than no guard.
  assert.ok(appFiles.length > 200, `expected a large app tree, walked ${appFiles.length} files`);
  assert.ok(
    appFiles.some((f) => f.includes(join('api', 'workspaces'))),
    'expected the workspace API routes to be in scope',
  );
});

test('nothing under src/app gates writes on isSubscriptionActive', () => {
  const offenders = appFiles
    .filter((f) => /\bisSubscriptionActive\s*\(/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(SRC_ROOT, f));

  assert.deepEqual(
    offenders,
    [],
    'these gate on paid-and-active only, locking out card-backed trial users:\n  ' +
      offenders.join('\n  ') +
      '\nUse hasWriteAccess({ subscription_status, trial_ends_at }).',
  );
});

test('every caller of hasWriteAccess also reads trial_ends_at', () => {
  // hasWriteAccess returns false when trial_ends_at is undefined, so a caller
  // that forgets to select the column behaves *identically to the bug* while
  // looking correct. Both halves must be present in the same file.
  const offenders = appFiles
    .filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /hasWriteAccess\s*\(/.test(src) && !/trial_ends_at/.test(src);
    })
    .map((f) => relative(SRC_ROOT, f));

  assert.deepEqual(
    offenders,
    [],
    'these call hasWriteAccess but never select trial_ends_at, so every trial user reads as expired:\n  ' +
      offenders.join('\n  '),
  );
});

test('the two gates have not silently converged', () => {
  // If someone "simplifies" hasWriteAccess back into isSubscriptionActive, the
  // sweeps above would still pass while the trial broke again. Assert the
  // behavioural difference that is the entire point of the helper.
  const future = new Date(Date.now() + 86_400_000).toISOString();
  return import('./access.ts').then(({ hasWriteAccess, isSubscriptionActive }) => {
    const trialist = { subscription_status: 'free_trial', trial_ends_at: future };
    assert.equal(hasWriteAccess(trialist), true, 'a live card-backed trial must be able to write');
    assert.equal(
      isSubscriptionActive(trialist.subscription_status),
      false,
      'isSubscriptionActive must remain the narrower question',
    );
  });
});
