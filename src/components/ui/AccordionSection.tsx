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

// TIM-4108 (UX Phase 3): a section can now be opened from outside itself, so
// the header's one emphasised button ("Continue with Channels") can take the
// owner straight to the step it names. Both new props are OPTIONAL and the
// uncontrolled behaviour is unchanged when they are absent — existing callers
// keep working exactly as before.
export interface AccordionSectionProps {
  title: string
  status?: SectionStatus
  defaultOpen?: boolean
  /**
   * Anchor for scrolling. Rendered as id="step-<stepId>" so
   * `scrollToStep` can find it without every workspace inventing a scheme.
   */
  stepId?: string
  /** Controlled open state. Omit to keep the section's own internal state. */
  open?: boolean
  /** Required when `open` is supplied — the section reports its own toggles. */
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

export function AccordionSection({
  title,
  status,
  defaultOpen = false,
  stepId,
  open: openProp,
  onOpenChange,
  children,
}: AccordionSectionProps) {
  const [openState, setOpen] = useState(defaultOpen)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openState
  const toggle = () => {
    if (controlled) onOpenChange?.(!open)
    else setOpen((o) => !o)
  }
  return (
    <div
      id={stepId ? `step-${stepId}` : undefined}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden scroll-mt-24"
    >
      <button
        type="button"
        onClick={toggle}
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
