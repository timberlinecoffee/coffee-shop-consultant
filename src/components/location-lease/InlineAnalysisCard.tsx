// TIM-3879: Structured inline renderer for AnalyseResponse.
// Renders score → strengths → concerns → callouts → recommendations.
// Recommendations with actionRef surface a "Review" link — caller supplies
// onViewRecommendation so the parent can open the shared AIReviewModal.
'use client'

import { RefreshCw, TrendingUp, AlertTriangle, Lightbulb, BarChart2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnalyseResponse } from '@/app/api/ai/analyse/[sectionKind]/route'

export type { AnalyseResponse }

const BAND_CONFIG: Record<string, { label: string; className: string }> = {
  strong: { label: 'Strong', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  ok: { label: 'OK', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  weak: { label: 'Weak', className: 'bg-rose-100 text-rose-600 border-rose-200' },
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'text-rose-600',
  warn: 'text-amber-500',
  info: 'text-[var(--neutral-cool-600)]',
}

export interface InlineAnalysisCardProps {
  result: AnalyseResponse
  loading?: boolean
  onRegenerate: () => void
  onViewRecommendation?: (text: string, actionRef: string) => void
}

export function InlineAnalysisCard({
  result,
  loading = false,
  onRegenerate,
  onViewRecommendation,
}: InlineAnalysisCardProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-4 flex flex-col gap-4">
      {/* Score band */}
      {result.score && (
        <div className="flex items-center gap-2">
          {result.score.band && (
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                BAND_CONFIG[result.score.band]?.className,
              )}
            >
              {BAND_CONFIG[result.score.band]?.label}
            </span>
          )}
          <span className="text-sm font-semibold text-foreground">
            {result.score.value}/{result.score.scale}
          </span>
          {result.score.label && (
            <span className="text-xs text-[var(--muted-foreground)]">{result.score.label}</span>
          )}
        </div>
      )}

      {/* Strengths */}
      {result.strengths.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2 flex items-center gap-1.5">
            <TrendingUp size={11} aria-hidden="true" />
            Strengths
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.strengths.map((s, i) => (
              <li key={i} className="text-sm text-foreground leading-relaxed flex gap-2">
                <span className="shrink-0 text-emerald-600 font-bold mt-0.5">+</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concerns */}
      {result.concerns.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} aria-hidden="true" />
            Concerns
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.concerns.map((c, i) => {
              const sev = c.severity ?? 'info'
              return (
                <li key={i} className="text-sm text-foreground leading-relaxed flex gap-2">
                  <span className={cn('shrink-0 font-bold mt-0.5 text-xs', SEVERITY_DOT[sev])}>●</span>
                  <span>{c.text}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Callouts with benchmarks */}
      {result.callouts.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2 flex items-center gap-1.5">
            <BarChart2 size={11} aria-hidden="true" />
            Benchmarks
          </p>
          <ul className="flex flex-col gap-2">
            {result.callouts.map((c, i) => (
              <li key={i} className="text-sm text-foreground leading-relaxed">
                <span>{c.text}</span>
                {c.benchmark && (
                  <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                    Yours: {c.benchmark.yours} · Typical: {c.benchmark.typical} · {c.benchmark.delta}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2 flex items-center gap-1.5">
            <Lightbulb size={11} aria-hidden="true" />
            Recommendations
          </p>
          <ul className="flex flex-col gap-2">
            {result.recommendations.map((r, i) => (
              <li key={i} className="text-sm text-foreground leading-relaxed flex gap-2 items-start">
                <span className="shrink-0 text-[var(--muted-foreground)] font-medium mt-0.5">
                  {i + 1}.
                </span>
                <span className="flex-1">{r.text}</span>
                {r.actionRef && onViewRecommendation && (
                  <button
                    type="button"
                    onClick={() => onViewRecommendation(r.text, r.actionRef!)}
                    className="shrink-0 text-xs text-[var(--teal)] font-medium hover:underline"
                  >
                    Review →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Benchmark context footnote */}
      {result.benchmarkContext && (
        <p className="text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3">
          Source: {result.benchmarkContext.source}
          {result.benchmarkContext.note && ` · ${result.benchmarkContext.note}`}
        </p>
      )}

      {/* Regenerate */}
      <div className="flex justify-end border-t border-[var(--border)] pt-3">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)] border border-[var(--border)] rounded-xl px-3 py-1.5 hover:border-neutral-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 size={11} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={11} aria-hidden="true" />
          )}
          Regenerate
        </button>
      </div>
    </div>
  )
}
