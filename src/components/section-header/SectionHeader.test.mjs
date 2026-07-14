// TIM-3869: Unit tests for SectionHeader aiActions API.
// Covers the 7 required cases from the issue DoD.
// Imports from the plain-TS helpers module (no JSX needed).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveAiActions,
  validateAiActionsOrder,
  getAiActionLabel,
} from '../../lib/section-header-helpers.ts'

// ── Case 1: write-only ────────────────────────────────────────────────────────
test('aiActions=[{kind:"write"}] resolves to write action only', () => {
  const onClick = () => {}
  const result = resolveAiActions([{ kind: 'write', onClick }], undefined)
  assert.equal(result.length, 1)
  assert.equal(result[0].kind, 'write')
  assert.equal(result[0].onClick, onClick)
})

// ── Case 2: analyse-only ──────────────────────────────────────────────────────
test('aiActions=[{kind:"analyse"}] resolves to analyse action only', () => {
  const onClick = () => {}
  const result = resolveAiActions([{ kind: 'analyse', onClick }], undefined)
  assert.equal(result.length, 1)
  assert.equal(result[0].kind, 'analyse')
})

// ── Case 3: both, correct order ───────────────────────────────────────────────
test('aiActions=[analyse, write] resolves both with analyse first', () => {
  const onAnalyse = () => {}
  const onWrite = () => {}
  const result = resolveAiActions(
    [{ kind: 'analyse', onClick: onAnalyse }, { kind: 'write', onClick: onWrite }],
    undefined
  )
  assert.equal(result.length, 2)
  assert.equal(result[0].kind, 'analyse')
  assert.equal(result[1].kind, 'write')
})

// ── Case 4: wrong order detected ─────────────────────────────────────────────
test('aiActions=[write, analyse] triggers order-violation', () => {
  const result = validateAiActionsOrder([
    { kind: 'write', onClick: () => {} },
    { kind: 'analyse', onClick: () => {} },
  ])
  assert.equal(result, 'order-violation')
})

test('aiActions=[analyse, write] validates as valid order', () => {
  const result = validateAiActionsOrder([
    { kind: 'analyse', onClick: () => {} },
    { kind: 'write', onClick: () => {} },
  ])
  assert.equal(result, 'valid')
})

// ── Case 5: legacy onWriteWithAi shim ────────────────────────────────────────
test('onWriteWithAi shim synthesises a write action when aiActions is absent', () => {
  const fn = () => {}
  const result = resolveAiActions(undefined, fn)
  assert.equal(result.length, 1)
  assert.equal(result[0].kind, 'write')
  assert.equal(result[0].onClick, fn)
})

test('aiActions wins over onWriteWithAi when both are provided', () => {
  const writeViaNew = () => {}
  const writeViaOld = () => {}
  const result = resolveAiActions(
    [{ kind: 'write', onClick: writeViaNew }],
    writeViaOld
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].onClick, writeViaNew, 'aiActions should win over deprecated shim')
})

// ── Case 6: click handlers preserved (fire exactly once) ─────────────────────
test('onClick reference is preserved and fires exactly once through resolveAiActions', () => {
  let called = 0
  const onClick = () => { called++ }
  const result = resolveAiActions([{ kind: 'write', onClick }], undefined)
  result[0].onClick()
  assert.equal(called, 1)
})

// ── Case 7: aria-label generation ────────────────────────────────────────────
test('getAiActionLabel generates correct aria-labels for analyse and write', () => {
  assert.equal(getAiActionLabel('analyse', 'Revenue'), 'Analyse Revenue with AI')
  assert.equal(getAiActionLabel('write', 'Revenue'), 'Write Revenue with AI')
  assert.equal(
    getAiActionLabel('analyse', 'Daily Traffic & Schedule'),
    'Analyse Daily Traffic & Schedule with AI'
  )
})
