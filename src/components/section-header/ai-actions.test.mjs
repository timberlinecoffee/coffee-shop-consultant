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

// ── D-001: the 'suggest' kind (board ruling 2026-07-26) ─────────────────────
//
// Before D-001 three hiring-v3 sites faked this with {kind:'write',
// label:'Suggest'} — a write button wearing a suggest label, which the order
// assertion could not see. These lock the real kind in.

const { AI_ACTION_ORDER } = await import('./ai-actions.ts')

test('D-001: canonical order is suggest → analyse → write → regenerate', () => {
  assert.deepEqual([...AI_ACTION_ORDER], ['suggest', 'analyse', 'write', 'regenerate'])
})

test('D-001: all four in canonical order pass', () => {
  assert.doesNotThrow(() =>
    assertAiActionsOrder([
      { kind: 'suggest', onClick: () => {} },
      { kind: 'analyse', onClick: () => {} },
      { kind: 'write', onClick: () => {} },
      { kind: 'regenerate', onClick: () => {} },
    ]),
  )
})

for (const later of ['analyse', 'write', 'regenerate']) {
  test(`D-001: throws when ${later} precedes suggest`, () => {
    assert.throws(
      () =>
        assertAiActionsOrder([
          { kind: later, onClick: () => {} },
          { kind: 'suggest', onClick: () => {} },
        ]),
      /order violation/,
    )
  })
}

test('D-001 extends rather than reverses: the pre-existing pairs still throw', () => {
  for (const [a, b] of [['write', 'analyse'], ['regenerate', 'write'], ['regenerate', 'analyse']]) {
    assert.throws(
      () => assertAiActionsOrder([{ kind: a, onClick: () => {} }, { kind: b, onClick: () => {} }]),
      /order violation/,
      `${a} before ${b} should still be a violation`,
    )
  }
})

test('D-001: suggest survives the analyse-flag-off filter', () => {
  // resolveAiActions strips analyse when the flag is off. suggest must not be
  // collateral damage — it is not gated by NEXT_PUBLIC_AI_ANALYSE_BUTTON.
  const result = resolveAiActions(
    [
      { kind: 'suggest', onClick: () => {} },
      { kind: 'analyse', onClick: () => {} },
    ],
    undefined,
    false,
  )
  assert.deepEqual(result.map((a) => a.kind), ['suggest'])
})

test('D-001: no bare "Suggest" label overrides remain on kind:write', () => {
  // The exact anti-pattern the ruling retired. A regex over the hiring source
  // rather than a render test, so it fails loudly if someone reintroduces it.
  const src = readFileSync(
    join(ROOT, 'src/app/(app)/workspace/hiring/hiring-workspace-v3.tsx'),
    'utf8',
  )
  assert.equal(
    /kind:\s*["']write["'][^}]*label:\s*["']Suggest["']/.test(src),
    false,
    'hiring-workspace-v3 still fakes suggest with a write kind',
  )
})

test('D-001: every Suggest button label follows "Suggest <thing> with AI"', () => {
  // Ratified amendment to D-001: one rule, object noun retained, so the two
  // adjacent menu buttons stay distinguishable instead of both reading
  // "Suggest with AI".
  const files = [
    'src/app/(app)/workspace/hiring/hiring-workspace-v3.tsx',
    'src/app/(app)/workspace/menu-pricing/menu-workspace.tsx',
    'src/app/(app)/workspace/suppliers/suppliers-workspace.tsx',
  ]
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    for (const m of src.matchAll(/["'](Suggest [^"']*)["']/g)) {
      // Prose sometimes quotes a label with escaped quotes (\"...\"); drop the
      // trailing backslash so the assertion tests the label, not the escape.
      const label = m[1].replace(/\\$/, '')
      if (label.startsWith('Suggest a ')) continue // title/tooltip prose, not a label
      assert.match(label, / with AI$/, `${f}: "${label}" does not end in "with AI"`)
    }
  }
})

test('D-001: British Analyse is canon in every user-facing button label', () => {
  const files = [
    'src/components/location-lease/TradeoffPanel.tsx',
    'src/components/location-lease/LocationCard.tsx',
    'src/components/location-lease/AreaAnalysisPanel.tsx',
    'src/app/(app)/workspace/financials/financials-workspace.tsx',
  ]
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    assert.equal(/Analyz/.test(src), false, `${f} still contains an American "Analyz*"`)
  }
})
