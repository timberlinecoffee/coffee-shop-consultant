'use client'

// TIM-3688 (D.2): Shared AccordionSection extracted from three identical
// inline copies in Marketing / Operations Playbook / Opening Month workspaces.
// TIM-3694 (C.0): retains bg-[var(--card)] — dark-mode-safe; light-mode
// equivalent of bg-white per QA Round 1 direction. Resolves audit findings
// P1-2, P1-4, P1-6 once C.x consumers migrate.
// Contract per style guide [TIM-1537 §AccordionSection with status]:
//
//   - status?: "complete" | "in_progress" | "empty" — chip omitted entirely
//     when undefined so non-playbook consumers get a bare accordion.
//   - Token-only styling; no hex or px literals.
//   - Consumer migration is C.x children (TIM-3689 fan-out), NOT this issue.

import { useState, type ReactNode } from 'react'
import { CheckCircle, ChevronDown, Circle, Minus } from 'lucide-react'

export type SectionStatus = 'complete' | 'in_progress' | 'empty'

function StatusBadge({ status }: { status: SectionStatus }) {
  if (status === 'complete') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--teal)] bg-[var(--teal-tint-100)] border border-[var(--teal-tint)] px-2 py-0.5 rounded-full shrink-0">
        <CheckCircle size={10} aria-hidden="true" />
        Complete
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
        <Circle size={10} aria-hidden="true" />
        In progress
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--muted-foreground)] bg-[var(--background)] border border-[var(--border)] px-2 py-0.5 rounded-full shrink-0">
      <Minus size={10} aria-hidden="true" />
      Empty
    </span>
  )
}

export interface AccordionSectionProps {
  title: string
  status?: SectionStatus
  defaultOpen?: boolean
  children: ReactNode
}

export function AccordionSection({
  title,
  status,
  defaultOpen = false,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--background)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            size={16}
            className={`text-[var(--muted-foreground)] transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
        </div>
        {status !== undefined && <StatusBadge status={status} />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-[var(--border)] space-y-5">
          {children}
        </div>
      )}
    </div>
  )
}
