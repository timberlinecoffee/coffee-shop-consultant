// TIM-1442: Shared save indicator — one component for all autosave workspaces.
// Replaces per-workspace SaveStatus functions and removes the static
// "Autosaves as you type" text. Format: "Saved · h:mma".

'use client'

import { Check } from 'lucide-react'

function formatSavedAt(iso: string): string {
  try {
    const d = new Date(iso)
    const h = d.getHours() % 12 || 12
    const m = d.getMinutes().toString().padStart(2, '0')
    const ampm = d.getHours() < 12 ? 'am' : 'pm'
    return `Saved · ${h}:${m}${ampm}`
  } catch {
    return 'Saved'
  }
}

interface SaveIndicatorProps {
  saving: boolean
  savedAt: string | null
  canEdit?: boolean
  error?: string | null
  unsaved?: boolean
  onRetry?: () => void
  className?: string
}

export function SaveIndicator({
  saving,
  savedAt,
  canEdit = true,
  error,
  unsaved,
  onRetry,
  className = '',
}: SaveIndicatorProps) {
  if (!canEdit) {
    return (
      <span className={`text-xs italic text-[var(--dark-grey)] ${className}`}>
        Read-only preview
      </span>
    )
  }

  if (error) {
    return onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className={`text-xs text-[var(--error)] hover:underline ${className}`}
      >
        Save Failed — Retry
      </button>
    ) : (
      <span className={`text-xs text-[var(--error)] ${className}`}>
        Save Failed — Retry
      </span>
    )
  }

  if (saving) {
    return (
      <span className={`text-xs text-[var(--teal)] ${className}`} role="status" aria-live="polite">
        Saving…
      </span>
    )
  }

  if (unsaved) {
    return (
      <span className={`text-xs text-[var(--muted-foreground)] ${className}`} role="status" aria-live="polite">
        Unsaved changes
      </span>
    )
  }

  if (savedAt) {
    return (
      <span
        className={`flex items-center gap-1 text-xs text-[var(--dark-grey)] ${className}`}
        role="status"
        aria-live="polite"
      >
        <Check className="w-3 h-3 text-[var(--teal)]" aria-hidden="true" />
        {formatSavedAt(savedAt)}
      </span>
    )
  }

  return null
}
