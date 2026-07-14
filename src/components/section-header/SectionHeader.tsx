'use client'

// TIM-3855 (2026-07-14): Canon amendment. TIM-3300 said "Write with AI is the
// ONLY right-side element." Board directive on TIM-3855 formally overrides that
// and adds a second AI action, "Analyse with AI". The right-side action slot is
// now a BOUNDED list from {analyse, write}, in that visual order when both are
// present. Do NOT canon-fix this back — the amendment is the new baseline.
// Do NOT add a third action kind without a new board directive.
//
// TIM-3304: Canonical sub-section header for every Groundwork workspace panel.
// Locked visual structure: [Title] [Help (?)] ─────────────── [Analyse] [Write]
//
// Constraints (hard):
//   - Help (?) is anchored immediately right of the title — never floats right.
//   - The right-side slot is a BOUNDED list from {analyse, write}. Visual order
//     is always [Analyse][Write] when both are present. No gear, eye, save, or
//     any other action kind. See TIM-3855.
//   - Token-only styling (TIM-2760 v2 tokens). No new hex values or px values.

import { ScanSearch, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { SectionHelp } from '@/components/ui/section-help'
import { AI_ANALYSE_BUTTON_ENABLED } from '@/lib/feature-flags'
import {
  type AiAction,
  type AiActionKind,
  resolveAiActions,
  validateAiActionsOrder,
  getAiActionLabel,
} from '@/lib/section-header-helpers'

// Re-export the bounded types and pure helpers for consumers.
export type { AiAction, AiActionKind }
export { resolveAiActions, validateAiActionsOrder, getAiActionLabel }

export interface SectionHeaderProps {
  title: string
  /** Body content for the help popover. Omit to suppress the (?) icon. */
  helpContent?: ReactNode
  /** Ordered list of AI actions. Rendered left-to-right in the order given.
   *  When both are present, order MUST be [{kind:'analyse'}, {kind:'write'}]
   *  so the visual order is [Analyse] [Write]. Enforced with a runtime assert
   *  in development. */
  aiActions?: AiAction[]
  /** @deprecated Use aiActions instead. Kept as a shim during Phase 2 rollout.
   *  If both aiActions and onWriteWithAi are given, aiActions wins. */
  onWriteWithAi?: () => void
  /**
   * Extra classes applied to the root element. When provided, the default
   * `mb-4` is suppressed entirely — pass `mb-4` explicitly if you need it.
   */
  className?: string
  /**
   * Renders the title as an aria heading at the given level (2 or 3).
   * Omit for the default <span> (non-heading) rendering.
   */
  headingLevel?: 2 | 3
}

export function SectionHeader({
  title,
  helpContent,
  aiActions,
  onWriteWithAi,
  className,
  headingLevel,
}: SectionHeaderProps) {
  const TitleEl = headingLevel != null ? (`h${headingLevel}` as 'h2' | 'h3') : 'span'
  const effectiveActions = resolveAiActions(aiActions, onWriteWithAi)

  if (process.env.NODE_ENV === 'development' && validateAiActionsOrder(effectiveActions) === 'order-violation') {
    console.error(
      '[SectionHeader] aiActions order violation: analyse must precede write. ' +
        'Pass [{kind:"analyse"}, {kind:"write"}], not the reverse.'
    )
  }

  // When the feature flag is off, filter out analyse actions so only write renders.
  const visibleActions = AI_ANALYSE_BUTTON_ENABLED
    ? effectiveActions
    : effectiveActions.filter((a) => a.kind !== 'analyse')

  return (
    <div className={`flex items-center justify-between gap-4${className != null ? ` ${className}` : ' mb-4'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <TitleEl className="text-sm font-semibold text-[var(--foreground)] truncate" title={title}>
          {title}
        </TitleEl>
        {helpContent != null && (
          <SectionHelp title={title}>{helpContent}</SectionHelp>
        )}
      </div>

      {visibleActions.length > 0 && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {visibleActions.map((action) => {
            const isAnalyse = action.kind === 'analyse'
            return (
              <button
                key={action.kind}
                type="button"
                onClick={() => {
                  try {
                    action.onClick()
                  } catch (err) {
                    if (process.env.NODE_ENV === 'development') {
                      console.error(`[SectionHeader] ${action.kind} onClick threw:`, err)
                    }
                  }
                }}
                disabled={action.disabled}
                aria-label={getAiActionLabel(action.kind, title)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-3 py-1 hover:bg-[var(--teal)]/5 transition-colors whitespace-nowrap flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyse ? (
                  <ScanSearch size={12} aria-hidden="true" />
                ) : (
                  <Sparkles size={12} aria-hidden="true" />
                )}
                {isAnalyse ? 'Analyse with AI' : 'Write with AI'}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
