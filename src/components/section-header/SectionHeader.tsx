'use client'

// TIM-3304: Canonical sub-section header for every Groundwork workspace panel.
// Locked visual structure: [Title] [Help (?)] ─────────────── [Write with AI]
//
// Constraints (hard):
//   - Help (?) is anchored immediately right of the title — never floats right.
//   - The only right-side element is "Write with AI". No gear, eye, save, or
//     any extra action slot. Extra right-side actions are the regression vector
//     TIM-3300 called out; resist adding a prop for them.
//   - Token-only styling (TIM-2760 v2 tokens). No new hex values or px values.

import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { SectionHelp } from '@/components/ui/section-help'

export interface SectionHeaderProps {
  title: string
  /** Body content for the help popover. Omit to suppress the (?) icon. */
  helpContent?: ReactNode
  /** When provided, renders the "Write with AI" button on the right. */
  onWriteWithAi?: () => void
  /**
   * Extra classes applied to the root element — use to override the default
   * `mb-4` bottom margin when the surrounding card already provides spacing.
   */
  className?: string
}

export function SectionHeader({ title, helpContent, onWriteWithAi, className }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-4 mb-4${className ? ` ${className}` : ''}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-[var(--foreground)] truncate">
          {title}
        </span>
        {helpContent != null && (
          <SectionHelp title={title}>{helpContent}</SectionHelp>
        )}
      </div>

      {onWriteWithAi != null && (
        <button
          type="button"
          onClick={onWriteWithAi}
          aria-label={`Write ${title} with AI`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-3 py-1 hover:bg-[var(--teal)]/5 transition-colors whitespace-nowrap flex-shrink-0"
        >
          <Sparkles size={12} aria-hidden="true" />
          Write with AI
        </button>
      )}
    </div>
  )
}
