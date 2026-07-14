// TIM-3869: Pure helpers for SectionHeader aiActions API.
// Extracted to a plain .ts file so they can be imported by .test.mjs
// without triggering JSX processing.

export type AiActionKind = 'analyse' | 'write'

export interface AiAction {
  kind: AiActionKind
  onClick: () => void
  disabled?: boolean
}

/** Resolve the effective action list from the two prop paths (aiActions wins). */
export function resolveAiActions(
  aiActions: AiAction[] | undefined,
  onWriteWithAi: (() => void) | undefined
): AiAction[] {
  if (aiActions != null) return aiActions
  if (onWriteWithAi != null) return [{ kind: 'write', onClick: onWriteWithAi }]
  return []
}

/**
 * Validate that when both analyse and write are present, analyse comes first.
 * Returns 'valid' or 'order-violation'. Used by assertAiActionsOrder + tests.
 */
export function validateAiActionsOrder(actions: AiAction[]): 'valid' | 'order-violation' {
  const analyseIdx = actions.findIndex((a) => a.kind === 'analyse')
  const writeIdx = actions.findIndex((a) => a.kind === 'write')
  if (analyseIdx !== -1 && writeIdx !== -1 && analyseIdx > writeIdx) {
    return 'order-violation'
  }
  return 'valid'
}

/** Generate the aria-label for an AI action button. */
export function getAiActionLabel(kind: AiActionKind, title: string): string {
  return kind === 'analyse' ? `Analyse ${title} with AI` : `Write ${title} with AI`
}
