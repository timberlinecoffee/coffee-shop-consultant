// TIM-1442: Per-section help button. Replaces static explanatory paragraphs
// under section headers with a ? icon that opens a compact inline popover.
// Styling matches the existing InfoTip pattern.

'use client'

import { useEffect, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { useEdgeClamp } from '@/lib/use-edge-clamp'
import { CollapseButton } from '@/components/ui/CollapseButton'

interface SectionHelpProps {
  title?: string
  children: React.ReactNode
}

export function SectionHelp({ title, children }: SectionHelpProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const panelRef = useEdgeClamp(open)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((p) => !p)
        }}
        aria-expanded={open}
        aria-label="Section help"
        className={`inline-flex items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--teal)] ${
          open ? 'text-[var(--teal)]' : 'text-[var(--warm-900)] hover:text-[var(--teal)]'
        }`}
      >
        <HelpCircle size={14} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={title ? `${title} help` : 'Section help'}
          className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--warm-800)] bg-[var(--warm-250)] p-3 shadow-lg"
        >
          {title && (
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)]">
                {title}
              </span>
              <CollapseButton
                onClick={() => setOpen(false)}
                size={12}
                className="text-[var(--dark-grey)] transition-colors hover:text-[var(--foreground)]"
                aria-label="Close"
              />
            </div>
          )}
          {!title && (
            <div className="mb-1.5 flex items-start justify-end">
              <CollapseButton
                onClick={() => setOpen(false)}
                size={12}
                className="text-[var(--dark-grey)] transition-colors hover:text-[var(--foreground)]"
                aria-label="Close"
              />
            </div>
          )}
          <div className="text-xs leading-relaxed text-[var(--gray-1300)]">{children}</div>
        </div>
      )}
    </span>
  )
}
