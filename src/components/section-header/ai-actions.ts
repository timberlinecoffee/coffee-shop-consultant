// TIM-3869: Pure AI-action helpers. Extracted so the logic is testable without
// JSX. SectionHeader.tsx imports these; tests import this file directly.
//
// TIM-3950 canon extension (board directive TIM-3949): the right-side action
// slot on Business Plan sections now supports three kinds — {analyse, write,
// regenerate} — in that visual order when multiple are present. 'regenerate'
// is scoped to Business Plan sections today.
//
// D-001 canon extension (board ruling, 2026-07-26). THIS IS THE DIRECTIVE the
// TIM-3950 note above required before a fourth kind could be added. 'suggest'
// becomes a real kind and leads the visual order:
//
//     [Suggest] [Analyse] [Write] [Regenerate]
//
// Before D-001, three call sites faked it with `{kind:'write', label:'Suggest'}`
// (hiring-workspace-v3.tsx :1595, :1993, :3033) — a write button wearing a
// suggest label, invisible to this assertion and to the conformance test.
// Those now use the real kind. Do NOT add a fifth kind without a new ruling.

export type AiActionKind = 'suggest' | 'analyse' | 'write' | 'regenerate'

/**
 * Canonical left-to-right order. Index in this array IS the rank; the assertion
 * below is derived from it, so adding a kind to the type and to this array is
 * all that a future ruling needs to touch.
 */
export const AI_ACTION_ORDER: readonly AiActionKind[] = [
  'suggest',
  'analyse',
  'write',
  'regenerate',
] as const

export interface AiAction {
  kind: AiActionKind
  onClick: () => void
  disabled?: boolean
  /** Optional override for the button label (replaces the default "<Kind> with AI" text). */
  label?: string
}

/**
 * Assert the canonical action order when multiple are present:
 * suggest → analyse → write → regenerate. Fires in every non-production
 * environment so tests catch ordering bugs without requiring a dev server.
 *
 * D-001 asked for this to be EXTENDED, not reversed — the pre-existing
 * analyse → write → regenerate rankings are unchanged; 'suggest' is prepended.
 * Derived from AI_ACTION_ORDER so the six pairwise rules (four kinds) stay in
 * sync with the canon automatically instead of by hand.
 */
export function assertAiActionsOrder(actions: AiAction[]): void {
  if (process.env.NODE_ENV === 'production') return
  const firstIdx = (kind: AiActionKind) => actions.findIndex((a) => a.kind === kind)

  for (let earlier = 0; earlier < AI_ACTION_ORDER.length; earlier++) {
    for (let later = earlier + 1; later < AI_ACTION_ORDER.length; later++) {
      const earlierKind = AI_ACTION_ORDER[earlier]
      const laterKind = AI_ACTION_ORDER[later]
      const earlierAt = firstIdx(earlierKind)
      const laterAt = firstIdx(laterKind)
      if (earlierAt !== -1 && laterAt !== -1 && earlierAt > laterAt) {
        throw new Error(
          `[SectionHeader] aiActions order violation: when ${earlierKind} and ` +
            `${laterKind} are both present, ${earlierKind} must come first.`,
        )
      }
    }
  }
}

/**
 * Derive the effective ordered action list from the new aiActions prop plus
 * the legacy onWriteWithAi shim. If both are given, aiActions wins.
 * When analyseButtonEnabled is false (flag off), analyse actions are stripped.
 */
export function resolveAiActions(
  aiActions: AiAction[] | undefined,
  onWriteWithAi: (() => void) | undefined,
  analyseButtonEnabled: boolean,
): AiAction[] {
  const actions: AiAction[] =
    aiActions ?? (onWriteWithAi ? [{ kind: 'write', onClick: onWriteWithAi }] : [])
  assertAiActionsOrder(actions)
  if (!analyseButtonEnabled) {
    return actions.filter((a) => a.kind !== 'analyse')
  }
  return actions
}
