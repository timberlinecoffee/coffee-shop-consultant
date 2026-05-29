// TIM-1145: Lightweight info tooltip for jargon labels.
// First-time coffee shop owners hit terms like CAM, TI Allowance, and
// personal guarantee with no context. This wraps any label with a "?" icon
// that opens a short, plain-English explanation in an inline panel.
// Click to toggle (mobile-friendly); Escape closes.

'use client'

import React, { useEffect, useRef, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InfoTip({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
    <span ref={ref} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((p) => !p)
        }}
        aria-expanded={open}
        aria-label={`What is ${label}?`}
        className={cn(
          'inline-flex items-center justify-center rounded transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--teal)]',
          open ? 'text-[var(--teal)]' : 'text-[var(--warm-900)] hover:text-[var(--teal)]',
        )}
      >
        <HelpCircle size={13} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} explanation`}
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-[var(--warm-800)] bg-[var(--warm-250)] p-3 shadow-lg"
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--teal)]">
              {label}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close explanation"
              className="text-[var(--dark-grey)] transition-colors hover:text-[var(--foreground)]"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          <div className="text-xs leading-relaxed text-[var(--gray-1300)]">{children}</div>
        </div>
      )}
    </span>
  )
}
