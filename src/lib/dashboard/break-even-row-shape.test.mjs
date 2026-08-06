// TIM-3444: the Home dashboard's break-even must survive being handed a plain
// projection row.
//
// What shipped: `computeBreakEvenModel` declared its parameter as MonthlySlice
// and read `m1.total_cogs_cents`. That field exists only on MonthlySlice — a
// slice is built with `total_cogs_cents: row.cogs_cents`, the same number under
// a second name. The Home dashboard only ever holds MonthlyProjectionRow, so it
// laundered its argument through `as unknown as MonthlySlice`, and that double
// cast is the sole reason the mismatch compiled.
//
// The failure was silent and total:
//   undefined - number        -> NaN
//   1 - NaN                   -> NaN
//   NaN > 0                   -> false, so the Infinity branch was taken
//   !Number.isFinite(Infinity)-> deriveBreakEvenStatus returns compute_failed
//
// The owner saw "We couldn't calculate this. Try re-saving your Financials." on
// Home — an instruction to re-save a workspace that reported 7 of 7 steps done,
// 100% — while the Break-Even tab two clicks away rendered 1,662 transactions
// and $19,935.11 from the very same plan. Both dashboard tiles, one missing
// field, and a cast that hid it.
//
// These tests pin the row shape specifically, because a test written against a
// full MonthlySlice would pass against the bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { computeBreakEvenModel } from '../financial-projection.ts';
import { deriveBreakEvenStatus } from './metric-status.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Exactly the fields MonthlyProjectionRow carries — deliberately WITHOUT the
// slice-only `total_cogs_cents` alias. This is what Home actually passes.
function projectionRow(over = {}) {
  return {
    net_revenue_cents: 2_577_604,
    cogs_cents: 203_557,
    labor_cogs_cents: 0,
    labor_overhead_cents: 914_370,
    payment_processing_cents: 65_091,
    spoilage_cents: 4_071,
    interest_cents: 98_583,
    depreciation_cents: 139_365,
    forecast_line_amounts: [
      { id: 'rent', category: 'overhead', amount_cents: 420_000 },
      { id: 'utilities', category: 'overhead', amount_cents: 60_000 },
      { id: 'marketing', category: 'overhead', amount_cents: 52_073 },
    ],
    ...over,
  };
}

const FORECAST_LINES = [
  { id: 'rent', mode: 'flat', legacy_key: 'rent' },
  { id: 'utilities', mode: 'flat', legacy_key: 'utilities' },
  { id: 'marketing', mode: 'pct', legacy_key: 'marketing' },
];

const AVG_TICKET_CENTS = 1_200;

test('a plain projection row produces a finite break-even', () => {
  const model = computeBreakEvenModel(projectionRow(), FORECAST_LINES, AVG_TICKET_CENTS);

  assert.ok(model, 'expected a model, got null');
  assert.ok(
    Number.isFinite(model.breakEvenRevenueCents),
    `break-even revenue must be finite, got ${model.breakEvenRevenueCents}`,
  );
  assert.ok(
    Number.isFinite(model.breakEvenTransactions),
    `break-even transactions must be finite, got ${model.breakEvenTransactions}`,
  );
  assert.ok(
    Number.isFinite(model.contributionMarginPct) && model.contributionMarginPct > 0,
    `contribution margin must be a positive number, got ${model.contributionMarginPct}`,
  );
});

test('the dashboard reports the metric as available, not compute_failed', () => {
  // The end the owner actually sees. Before TIM-3444 this returned
  // { ok: false, reason: 'compute_failed' } for every plan ever created.
  const row = projectionRow();
  const status = deriveBreakEvenStatus({
    model: computeBreakEvenModel(row, FORECAST_LINES, AVG_TICKET_CENTS),
    avgTicketCents: AVG_TICKET_CENTS,
    netRevenueCents: row.net_revenue_cents,
  });

  assert.deepEqual(status, { ok: true });
});

test('the slice alias and the row field are interchangeable', () => {
  // A slice is literally built as `total_cogs_cents: row.cogs_cents`. Whichever
  // name a caller happens to hold, the answer must be identical — otherwise the
  // Home tile and the Break-Even tab can disagree again.
  const row = projectionRow();
  const sliceShaped = { ...row, total_cogs_cents: row.cogs_cents };

  const fromRow = computeBreakEvenModel(row, FORECAST_LINES, AVG_TICKET_CENTS);
  const fromSlice = computeBreakEvenModel(sliceShaped, FORECAST_LINES, AVG_TICKET_CENTS);

  assert.deepEqual(fromRow, fromSlice);
});

test('a genuinely uncoverable plan still reports no contribution margin', () => {
  // Guard against "fixing" this by making everything finite. When variable
  // costs eat the whole ticket there IS no break-even, and that must still be
  // reported as such rather than as a number.
  const row = projectionRow({ cogs_cents: 2_600_000 });
  const model = computeBreakEvenModel(row, FORECAST_LINES, AVG_TICKET_CENTS);

  assert.ok(model);
  assert.ok(model.contributionMarginPct <= 0, 'expected a non-positive contribution margin');

  const status = deriveBreakEvenStatus({
    model,
    avgTicketCents: AVG_TICKET_CENTS,
    netRevenueCents: row.net_revenue_cents,
  });
  assert.deepEqual(status, { ok: false, reason: 'no_contribution_margin' });
});

test('nothing launders a projection row into a MonthlySlice', () => {
  // The double cast is what let the mismatch compile. If it comes back, so does
  // the bug — and the type checker will not say a word.
  //
  // Scanned against CODE ONLY. The first version of this test scanned the whole
  // file and failed on the comment above the call site explaining why the cast
  // was removed — the same comment-satisfies-the-grep trap that nearly let the
  // #439 guard pass for the wrong reason. A guard that a comment can trip is a
  // guard a comment can also silence.
  const snapshot = readFileSync(join(__dirname, 'financial-snapshot.ts'), 'utf8');
  const code = snapshot
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  assert.doesNotMatch(
    code,
    /as\s+unknown\s+as\s+MonthlySlice/,
    'financial-snapshot.ts must pass the row directly; computeBreakEvenModel takes MonthlyProjectionRow',
  );
});
