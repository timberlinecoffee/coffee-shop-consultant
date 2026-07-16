// TIM-3869: Unit coverage for the bounded aiActions prop on SectionHeader.
// Tests run against the pure ai-actions.ts helper (no JSX / no DOM needed).
// Render-shape and aria-label conformance verified via source scan below.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { resolveAiActions, assertAiActionsOrder } = await import('./ai-actions.ts')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// ── Case 1: write-only ────────────────────────────────────────────────────────

test('aiActions=[write] resolves to write only', () => {
  let called = 0
  const fn = () => { called++ }
  const result = resolveAiActions([{ kind: 'write', onClick: fn }], undefined, true)
  assert.equal(result.length, 1)
  assert.equal(result[0].kind, 'write')
})

// ── Case 2: analyse-only ──────────────────────────────────────────────────────

test('aiActions=[analyse] resolves to analyse only', () => {
  const result = resolveAiActions([{ kind: 'analyse', onClick: () => {} }], undefined, true)
  assert.equal(result.length, 1)
  assert.equal(result[0].kind, 'analyse')
})

// ── Case 3: both in correct order ─────────────────────────────────────────────

test('aiActions=[analyse, write] resolves both in order', () => {
  const result = resolveAiActions(
    [{ kind: 'analyse', onClick: () => {} }, { kind: 'write', onClick: () => {} }],
    undefined,
    true,
  )
  assert.equal(result.length, 2)
  assert.equal(result[0].kind, 'analyse')
  assert.equal(result[1].kind, 'write')
})

// ── Case 4: wrong order fires assert ─────────────────────────────────────────

test('assertAiActionsOrder throws when write precedes analyse', () => {
  assert.throws(
    () =>
      assertAiActionsOrder([
        { kind: 'write', onClick: () => {} },
        { kind: 'analyse', onClick: () => {} },
      ]),
    /order violation/,
  )
})

// ── Case 5: legacy onWriteWithAi shim ─────────────────────────────────────────

test('onWriteWithAi shim synthesizes write action when aiActions omitted', () => {
  const fn = () => {}
  const result = resolveAiActions(undefined, fn, true)
  assert.equal(result.length, 1)
  assert.equal(result[0].kind, 'write')
  assert.equal(result[0].onClick, fn, 'shim must preserve original handler reference')
})

test('aiActions prop wins over onWriteWithAi when both are given', () => {
  const shimFn = () => {}
  const actionFn = () => {}
  const result = resolveAiActions([{ kind: 'analyse', onClick: actionFn }], shimFn, true)
  assert.equal(result.length, 1)
  assert.equal(result[0].kind, 'analyse')
})

// ── Case 6: click handlers fire exactly once ──────────────────────────────────

test('click handler fires exactly once per call', () => {
  let callCount = 0
  const fn = () => { callCount++ }
  const result = resolveAiActions([{ kind: 'write', onClick: fn }], undefined, true)
  result[0].onClick()
  assert.equal(callCount, 1)
})

// ── Case 7: aria-label pattern in source ─────────────────────────────────────

test('Analyse button has correct aria-label pattern in SectionHeader source', () => {
  const src = readFileSync(
    join(ROOT, 'src', 'components', 'section-header', 'SectionHeader.tsx'),
    'utf8',
  )
  assert.match(
    src,
    /`Analyse \$\{title\} with AI`/,
    "SectionHeader must produce aria-label matching 'Analyse {title} with AI'",
  )
})

// ── Feature flag: analyse stripped when flag off ──────────────────────────────

test('analyse action stripped when analyseButtonEnabled=false', () => {
  const result = resolveAiActions(
    [{ kind: 'analyse', onClick: () => {} }, { kind: 'write', onClick: () => {} }],
    undefined,
    false,
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].kind, 'write')
})

// ── TIM-3950: regenerate kind ordering ────────────────────────────────────────

test('aiActions=[write, regenerate] resolves in order', () => {
  const result = resolveAiActions(
    [{ kind: 'write', onClick: () => {} }, { kind: 'regenerate', onClick: () => {} }],
    undefined,
    true,
  )
  assert.equal(result.length, 2)
  assert.equal(result[0].kind, 'write')
  assert.equal(result[1].kind, 'regenerate')
})

test('aiActions=[analyse, write, regenerate] resolves all three in order', () => {
  const result = resolveAiActions(
    [
      { kind: 'analyse', onClick: () => {} },
      { kind: 'write', onClick: () => {} },
      { kind: 'regenerate', onClick: () => {} },
    ],
    undefined,
    true,
  )
  assert.equal(result.length, 3)
  assert.equal(result[0].kind, 'analyse')
  assert.equal(result[1].kind, 'write')
  assert.equal(result[2].kind, 'regenerate')
})

test('assertAiActionsOrder throws when regenerate precedes write', () => {
  assert.throws(
    () =>
      assertAiActionsOrder([
        { kind: 'regenerate', onClick: () => {} },
        { kind: 'write', onClick: () => {} },
      ]),
    /order violation/,
  )
})

test('assertAiActionsOrder throws when regenerate precedes analyse', () => {
  assert.throws(
    () =>
      assertAiActionsOrder([
        { kind: 'regenerate', onClick: () => {} },
        { kind: 'analyse', onClick: () => {} },
      ]),
    /order violation/,
  )
})
