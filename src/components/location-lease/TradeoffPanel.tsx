// TIM-1115: AI Trade-Off Panel — visual side-by-side comparison of shortlisted candidates.
// Shows per-factor bar chart (color-coded winner), per-candidate strengths/weaknesses,
// and an AI-generated recommended ranking with reasoning.
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatLocationScore } from '@/lib/format'
import { AlertCircle, Sparkles, Trophy } from 'lucide-react'
import { CollapseButton } from '@/components/ui/CollapseButton'
import { Button } from '@/components/ui/button'
import type { Candidate } from './CandidateListCard'

// ── Factor set used for visual comparison ────────────────────────────────

const COMPARE_FACTORS = [
  { key: 'foot_traffic_weekday', label: 'Weekday Foot Traffic' },
  { key: 'foot_traffic_weekend', label: 'Weekend Foot Traffic' },
  { key: 'street_visibility', label: 'Street Visibility' },
  { key: 'parking', label: 'Parking Availability' },
  { key: 'public_transit', label: 'Public Transit' },
  { key: 'surrounding_businesses', label: 'Surrounding Businesses' },
  { key: 'demographics_fit', label: 'Demographics Fit' },
  { key: 'lease_cost_vs_market', label: 'Lease Cost vs. Market' },
  { key: 'space_layout', label: 'Space Layout' },
  { key: 'buildout_condition', label: 'Build-out Condition' },
  { key: 'permits_zoning', label: 'Permits / Zoning' },
  { key: 'safety_perception', label: 'Safety / Area' },
] as const

type FactorKey = (typeof COMPARE_FACTORS)[number]['key']

type ScoreRow = {
  candidate_id: string
  factor_key: string
  score_1_5: number | null
}

// ── Color palette for candidate dots/bars (avoids emojis) ────────────────

const CANDIDATE_COLORS = [
  { name: 'teal',    bar: 'bg-[var(--teal)]',         dot: 'bg-[var(--teal)]',         text: 'text-[var(--teal)]' },
  { name: 'amber',   bar: 'bg-amber-500',         dot: 'bg-amber-500',         text: 'text-amber-600' },
  { name: 'rose',    bar: 'bg-rose-500',          dot: 'bg-rose-500',          text: 'text-rose-600' },
  { name: 'violet',  bar: 'bg-violet-500',        dot: 'bg-violet-500',        text: 'text-violet-600' },
  { name: 'emerald', bar: 'bg-emerald-500',       dot: 'bg-emerald-500',       text: 'text-emerald-600' },
  { name: 'slate',   bar: 'bg-slate-500',         dot: 'bg-slate-500',         text: 'text-slate-600' },
]

// ── Types for tradeoff API response ──────────────────────────────────────

type PerCandidate = {
  id: string
  name: string
  strengths: string[]
  weaknesses: string[]
}

type RankingEntry = {
  id: string
  name: string
  position: number
  reasoning: string
}

type TradeoffResponse = {
  perCandidate: PerCandidate[]
  ranking: RankingEntry[]
}

// ── FactorBarRow ─────────────────────────────────────────────────────────

function FactorBarRow({
  label,
  candidates,
  scores,
  colorByCandidate,
}: {
  label: string
  candidates: Candidate[]
  scores: Record<string, number | null>
  colorByCandidate: Record<string, (typeof CANDIDATE_COLORS)[number]>
}) {
  const rated = candidates.filter((c) => scores[c.id] != null)
  const maxScore = rated.length === 0 ? 0 : Math.max(...rated.map((c) => scores[c.id]!))
  const allEqual = rated.length > 1 && rated.every((c) => scores[c.id] === maxScore)
  const winnerIds = new Set(
    !allEqual && rated.length >= 2 ? rated.filter((c) => scores[c.id] === maxScore).map((c) => c.id) : []
  )

  return (
    <div className="grid grid-cols-12 items-start gap-3 py-2 border-b border-[var(--border)] last:border-b-0">
      <div className="col-span-4 sm:col-span-3 pt-1">
        <span className="text-xs font-medium text-foreground">{label}</span>
      </div>
      <div className="col-span-8 sm:col-span-9 flex flex-col gap-1.5">
        {candidates.map((c) => {
          const score = scores[c.id]
          const color = colorByCandidate[c.id]
          const isWinner = winnerIds.has(c.id)
          const widthPct = score != null ? formatLocationScore(score).pct : 0
          return (
            <div key={c.id} className="flex items-center gap-2">
              <span
                className={cn(
                  'shrink-0 text-[10px] truncate w-20 sm:w-24',
                  isWinner ? 'font-semibold text-foreground' : 'text-[var(--neutral-cool-600)]'
                )}
                title={c.name}
              >
                {c.name}
              </span>
              <div className="flex-1 relative h-4 rounded bg-[var(--surface-warm-50)] overflow-hidden">
                {score != null && (
                  <div
                    className={cn(
                      color.bar,
                      'h-full rounded transition-all',
                      isWinner ? 'opacity-100' : 'opacity-70'
                    )}
                    style={{ width: `${widthPct}%` }}
                  />
                )}
                {isWinner && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <Trophy className="size-3 text-white drop-shadow" />
                  </div>
                )}
              </div>
              <span
                className={cn(
                  'shrink-0 w-6 text-right text-[11px] font-semibold',
                  score == null ? 'text-[var(--neutral-cool-600)]/60' : isWinner ? color.text : 'text-foreground'
                )}
              >
                {score != null ? formatLocationScore(score).display : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TradeoffPanel ────────────────────────────────────────────────────────

export interface TradeoffPanelProps {
  open: boolean
  onClose: () => void
  candidates: Candidate[]
  subscriptionTier: string
  aiCreditsRemaining: number
}

export function TradeoffPanel({
  open,
  onClose,
  candidates,
  subscriptionTier,
  aiCreditsRemaining,
}: TradeoffPanelProps) {
  const [scores, setScores] = useState<Record<string, Record<FactorKey, number | null>>>({})
  const [scoresLoading, setScoresLoading] = useState(false)
  const [tradeoff, setTradeoff] = useState<TradeoffResponse | null>(null)
  const [tradeoffLoading, setTradeoffLoading] = useState(false)
  const [tradeoffError, setTradeoffError] = useState('')

  const canUseAI = subscriptionTier !== 'free' && aiCreditsRemaining > 0

  // Map candidate id → color
  const colorByCandidate: Record<string, (typeof CANDIDATE_COLORS)[number]> = {}
  candidates.forEach((c, i) => {
    colorByCandidate[c.id] = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]
  })

  // Load scores when opening
  useEffect(() => {
    if (!open || candidates.length === 0) return
    let cancelled = false
    setScoresLoading(true)
    setTradeoff(null)
    setTradeoffError('')

    async function load() {
      const supabase = createClient()
      const ids = candidates.map((c) => c.id)
      const { data } = await supabase
        .from('location_rubric_scores')
        .select('candidate_id, factor_key, score_1_5')
        .in('candidate_id', ids)
        .in('factor_key', COMPARE_FACTORS.map((f) => f.key))

      if (cancelled) return

      const map: Record<string, Record<FactorKey, number | null>> = {}
      for (const c of candidates) {
        map[c.id] = Object.fromEntries(COMPARE_FACTORS.map((f) => [f.key, null])) as Record<FactorKey, number | null>
      }
      for (const row of (data ?? []) as ScoreRow[]) {
        if (!map[row.candidate_id]) continue
        const fk = row.factor_key as FactorKey
        if (COMPARE_FACTORS.find((f) => f.key === fk)) {
          map[row.candidate_id][fk] = row.score_1_5
        }
      }
      setScores(map)
      setScoresLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, candidates])

  // Escape closes
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const runTradeoff = useCallback(async () => {
    if (!canUseAI || tradeoffLoading) return
    setTradeoffLoading(true)
    setTradeoffError('')
    setTradeoff(null)

    try {
      const res = await fetch('/api/workspaces/location-lease/tradeoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: candidates.map((c) => c.id) }),
      })
      const text = await res.text().catch(() => '')
      if (!res.ok) {
        try {
          const parsed = JSON.parse(text)
          setTradeoffError(parsed.error ?? 'Trade-off failed. Please try again.')
        } catch {
          setTradeoffError('Trade-off failed. Please try again.')
        }
        return
      }
      try {
        const parsed = JSON.parse(text) as TradeoffResponse
        setTradeoff(parsed)
      } catch {
        setTradeoffError('AI returned an unexpected format.')
      }
    } catch {
      setTradeoffError('Connection error. Please try again.')
    } finally {
      setTradeoffLoading(false)
    }
  }, [canUseAI, tradeoffLoading, candidates])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal
        aria-label="Trade-off analysis"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-background shadow-2xl lg:inset-x-auto lg:inset-y-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-[min(94vw,1100px)] lg:max-h-[90vh] lg:rounded-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Shortlist Trade-Off</h2>
            <p className="text-xs text-[var(--neutral-cool-600)]">
              {candidates.length} Shortlisted · Visual Comparison + AI Recommendation
            </p>
          </div>
          <CollapseButton
            onClick={onClose}
            size={16}
            className="flex size-8 items-center justify-center rounded-lg bg-[var(--surface-warm-50)] text-[var(--neutral-cool-600)] hover:bg-[var(--surface-warm-50)]/80 hover:text-[var(--foreground)]"
            aria-label="Close trade-off"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
          {/* Candidate legend */}
          <div className="flex flex-wrap items-center gap-3">
            {candidates.map((c) => {
              const color = colorByCandidate[c.id]
              return (
                <div key={c.id} className="inline-flex items-center gap-1.5 text-xs">
                  <span className={cn('inline-block size-2.5 rounded-full', color.dot)} />
                  <span className="font-medium text-foreground">{c.name}</span>
                </div>
              )
            })}
          </div>

          {/* Visual comparison — bars per factor */}
          <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-4">
            <h3 className="text-sm font-semibold text-foreground mb-1">Score Comparison</h3>
            <p className="text-xs text-[var(--neutral-cool-600)] mb-4">
              Highest score per factor wins. Cup icon marks the winner; tied rows show no winner.
            </p>

            {scoresLoading ? (
              <p className="text-sm text-[var(--neutral-cool-600)] py-6 text-center">Loading scores…</p>
            ) : (
              <div className="flex flex-col">
                {COMPARE_FACTORS.map((factor) => (
                  <FactorBarRow
                    key={factor.key}
                    label={factor.label}
                    candidates={candidates}
                    scores={Object.fromEntries(
                      candidates.map((c) => [c.id, scores[c.id]?.[factor.key] ?? null])
                    )}
                    colorByCandidate={colorByCandidate}
                  />
                ))}
              </div>
            )}
          </div>

          {/* AI trade-off CTA + results */}
          <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-4 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">AI Recommendation</h3>
                <p className="text-xs text-[var(--neutral-cool-600)] mt-0.5">
                  Get a per-location read on strengths and weaknesses and a recommended ranking based on your scorecard.
                </p>
              </div>
              {canUseAI ? (
                <Button size="sm" onClick={runTradeoff} disabled={tradeoffLoading} className="shrink-0">
                  <Sparkles className="size-3.5 mr-1.5" />
                  {tradeoffLoading ? 'Analyzing…' : tradeoff ? 'Refresh' : 'Generate Trade-Off'}
                </Button>
              ) : (
                <div className="text-right text-xs text-[var(--neutral-cool-600)]">
                  {subscriptionTier === 'free' ? (
                    <>
                      Paid plan required.{' '}
                      <a href="/pricing" className="text-[var(--teal)] underline">
                        Upgrade →
                      </a>
                    </>
                  ) : (
                    <>
                      Out of credits.{' '}
                      <a href="/pricing" className="text-[var(--teal)] underline">
                        Upgrade →
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>

            {tradeoffError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
                <p className="text-xs text-red-700">{tradeoffError}</p>
              </div>
            )}

            {tradeoff && (
              <div className="flex flex-col gap-5">
                {/* Recommended ranking */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
                    Recommended Ranking
                  </h4>
                  <ol className="flex flex-col gap-2">
                    {tradeoff.ranking.map((r) => {
                      const color = colorByCandidate[r.id]
                      return (
                        <li
                          key={r.id}
                          className={cn(
                            'flex items-start gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5',
                            r.position === 1 && 'bg-emerald-50/40 border-emerald-200'
                          )}
                        >
                          <span
                            className={cn(
                              'shrink-0 inline-flex size-7 items-center justify-center rounded-full text-xs font-bold',
                              r.position === 1
                                ? 'bg-emerald-500 text-white'
                                : 'bg-[var(--surface-warm-50)] text-foreground'
                            )}
                          >
                            {r.position}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {color && <span className={cn('inline-block size-2 rounded-full', color.dot)} />}
                              <span className="text-sm font-semibold text-foreground">{r.name}</span>
                            </div>
                            <p className="text-xs text-[var(--gray-1175)] leading-relaxed mt-1">{r.reasoning}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>

                {/* Per-candidate strengths / weaknesses */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
                    Per-Location Notes
                  </h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {tradeoff.perCandidate.map((p) => {
                      const color = colorByCandidate[p.id]
                      return (
                        <div key={p.id} className="rounded-lg border border-[var(--border)] px-3 py-3 bg-white">
                          <div className="flex items-center gap-2 mb-2">
                            {color && <span className={cn('inline-block size-2 rounded-full', color.dot)} />}
                            <span className="text-sm font-semibold text-foreground">{p.name}</span>
                          </div>
                          {p.strengths.length > 0 && (
                            <div className="mb-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
                                Strengths
                              </p>
                              <ul className="flex flex-col gap-0.5">
                                {p.strengths.map((s, i) => (
                                  <li key={i} className="text-xs text-foreground leading-relaxed">
                                    {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {p.weaknesses.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600 mb-1">
                                Weaknesses
                              </p>
                              <ul className="flex flex-col gap-0.5">
                                {p.weaknesses.map((s, i) => (
                                  <li key={i} className="text-xs text-foreground leading-relaxed">
                                    {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
