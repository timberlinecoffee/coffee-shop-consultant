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
//   - The right-side element is a BOUNDED list: only 'analyse' and 'write'.
//     No gear, eye, save, or any other action slot. Extra right-side actions
//     are the regression vector TIM-3300 called out; resist adding more kinds.
//   - Token-only styling (TIM-2760 v2 tokens). No new hex values or px values.
//   - Analyse button controlled by NEXT_PUBLIC_AI_ANALYSE_BUTTON flag (TIM-3869).

import { ScanSearch, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { SectionHelp } from '@/components/ui/section-help'
import { AI_ANALYSE_BUTTON } from '@/lib/ai-analyse-button'
import { type AiAction, resolveAiActions } from './ai-actions'

export type { AiActionKind, AiAction } from './ai-actions'

export interface SectionHeaderProps {
  title: string
  /** Body content for the help popover. Omit to suppress the (?) icon. */
  helpContent?: ReactNode
  /** Ordered list of AI actions. Rendered left-to-right in the order given.
   *  When both are present, order MUST be [{kind:'analyse'}, {kind:'write'}]
   *  so the visual order is [Analyse] [Write]. Enforced with a runtime assert
   *  in non-production environments. */
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

const ACTION_LABEL: Record<AiAction['kind'], string> = {
  analyse: 'Analyse',
  write: 'Write',
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
  const effectiveActions = resolveAiActions(aiActions, onWriteWithAi, AI_ANALYSE_BUTTON)

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

      {effectiveActions.length > 0 && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {effectiveActions.map((action) => (
            <button
              key={action.kind}
              type="button"
              onClick={() => {
                try {
                  action.onClick()
                } catch (err) {
                  if (process.env.NODE_ENV !== 'production') console.error(err)
                }
              }}
              disabled={action.disabled}
              aria-label={
                action.kind === 'analyse'
                  ? `Analyse ${title} with AI`
                  : `Write ${title} with AI`
              }
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-3 py-1 hover:bg-[var(--teal)]/5 transition-colors whitespace-nowrap flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {action.kind === 'analyse' ? (
                <ScanSearch size={12} aria-hidden="true" />
              ) : (
                <Sparkles size={12} aria-hidden="true" />
              )}
              {ACTION_LABEL[action.kind]} with AI
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
