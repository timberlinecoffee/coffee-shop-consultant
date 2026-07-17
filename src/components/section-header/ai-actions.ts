// TIM-3869: Pure AI-action helpers. Extracted so the logic is testable without
// JSX. SectionHeader.tsx imports these; tests import this file directly.
//
// TIM-3950 canon extension (board directive TIM-3949): the right-side action
// slot on Business Plan sections now supports three kinds — {analyse, write,
// regenerate} — in that visual order when multiple are present. 'regenerate'
// is scoped to Business Plan sections today. Do NOT add a fourth kind without
// a new board directive.

export type AiActionKind = 'analyse' | 'write' | 'regenerate'

export interface AiAction {
  kind: AiActionKind
  onClick: () => void
  disabled?: boolean
  /** Optional override for the button label (replaces the default "<Kind> with AI" text). */
  label?: string
}

/**
 * Assert the canonical action order when multiple are present:
 * analyse → write → regenerate. Fires in every non-production environment so
 * tests catch ordering bugs without requiring a dev server.
 */
export function assertAiActionsOrder(actions: AiAction[]): void {
  if (process.env.NODE_ENV === 'production') return
  const analyseIdx = actions.findIndex((a) => a.kind === 'analyse')
  const writeIdx = actions.findIndex((a) => a.kind === 'write')
  const regenerateIdx = actions.findIndex((a) => a.kind === 'regenerate')
  if (analyseIdx !== -1 && writeIdx !== -1 && analyseIdx > writeIdx) {
    throw new Error(
      '[SectionHeader] aiActions order violation: when analyse and write ' +
        'are both present, analyse must come first.',
    )
  }
  if (writeIdx !== -1 && regenerateIdx !== -1 && writeIdx > regenerateIdx) {
    throw new Error(
      '[SectionHeader] aiActions order violation: when write and regenerate ' +
        'are both present, write must come first.',
    )
  }
  if (analyseIdx !== -1 && regenerateIdx !== -1 && analyseIdx > regenerateIdx) {
    throw new Error(
      '[SectionHeader] aiActions order violation: when analyse and regenerate ' +
        'are both present, analyse must come first.',
    )
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
