// TIM-3248: inline status chip for COGS range comparison.
// Statuses: green (on target), yellow (under target), red (over target), grey (no range).

import type { ReactNode } from "react"

export type BenchmarkStatus = "green" | "yellow" | "red" | "grey"

const STATUS_STYLES: Record<
  BenchmarkStatus,
  { bg: string; border: string; text: string; dot: string }
> = {
  green: {
    bg: "bg-[var(--bench-green-bg)]",
    border: "border-[var(--bench-green-border)]",
    text: "text-[var(--bench-green-text)]",
    dot: "bg-[var(--bench-green-text)]",
  },
  yellow: {
    bg: "bg-[var(--bench-yellow-bg)]",
    border: "border-[var(--bench-yellow-border)]",
    text: "text-[var(--bench-yellow-text)]",
    dot: "bg-[var(--bench-yellow-text)]",
  },
  red: {
    bg: "bg-[var(--bench-red-bg)]",
    border: "border-[var(--bench-red-border)]",
    text: "text-[var(--bench-red-text)]",
    dot: "bg-[var(--bench-red-text)]",
  },
  grey: {
    bg: "bg-[var(--bench-grey-bg)]",
    border: "border-[var(--bench-grey-border)]",
    text: "text-[var(--bench-grey-text)]",
    dot: "bg-[var(--bench-grey-text)]",
  },
}

export function BenchmarkChip({
  status,
  label,
  ariaLabel,
}: {
  status: BenchmarkStatus
  label: ReactNode
  ariaLabel?: string
}) {
  const s = STATUS_STYLES[status]
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${s.bg} ${s.border} ${s.text}`}
      aria-label={ariaLabel}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
