// TIM-3869: Pure AI-action helpers. Extracted so the logic is testable without
// JSX. SectionHeader.tsx imports these; tests import this file directly.

export type AiActionKind = 'analyse' | 'write'

export interface AiAction {
  kind: AiActionKind
  onClick: () => void
  disabled?: boolean
}

/**
 * Assert that when both 'analyse' and 'write' are present, 'analyse' comes
 * first. Fires in every non-production environment so tests catch ordering
 * bugs without requiring a dev server.
 */
export function assertAiActionsOrder(actions: AiAction[]): void {
  if (process.env.NODE_ENV === 'production') return
  const analyseIdx = actions.findIndex((a) => a.kind === 'analyse')
  const writeIdx = actions.findIndex((a) => a.kind === 'write')
  if (analyseIdx !== -1 && writeIdx !== -1 && analyseIdx > writeIdx) {
    throw new Error(
      '[SectionHeader] aiActions order violation: when both analyse and write ' +
        'are present, analyse must come first. ' +
        'Pass [{kind:"analyse",...}, {kind:"write",...}].',
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
