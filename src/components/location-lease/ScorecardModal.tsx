// TIM-930: Location Scorecard — structured self-audit + AI feedback per candidate.
'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { X, Sparkles, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────────────────

type ScorecardFactorKey =
  | 'foot_traffic_weekday'
  | 'foot_traffic_weekend'
  | 'street_visibility'
  | 'parking'
  | 'public_transit'
  | 'surrounding_businesses'
  | 'demographics_fit'
  | 'lease_cost_vs_market'
  | 'space_layout'
  | 'buildout_condition'
  | 'permits_zoning'
  | 'safety_perception'
  | 'gut_feel'

type ScorecardFactor = {
  key: ScorecardFactorKey
  label: string
  description: string
  hasScore: boolean
}

type ScoreCell = {
  score: number | null
  notes: string
}

type ScoreMap = Partial<Record<ScorecardFactorKey, ScoreCell>>

// ── Criteria definition ─────────────────────────────────────────────────────

const SCORECARD_FACTORS: ScorecardFactor[] = [
  {
    key: 'foot_traffic_weekday',
    label: 'Weekday Foot Traffic',
    description: 'Estimated pedestrian count on a typical weekday. 5 = very high, 1 = very low.',
    hasScore: true,
  },
  {
    key: 'foot_traffic_weekend',
    label: 'Weekend Foot Traffic',
    description: 'Estimated pedestrian count on a typical weekend day.',
    hasScore: true,
  },
  {
    key: 'street_visibility',
    label: 'Street Visibility',
    description: 'How easily the storefront is seen from the street or passing traffic.',
    hasScore: true,
  },
  {
    key: 'parking',
    label: 'Parking Availability',
    description: 'On-site or nearby parking for customers and staff.',
    hasScore: true,
  },
  {
    key: 'public_transit',
    label: 'Public Transit Proximity',
    description: 'Walkability from bus stops, train stations, or transit corridors.',
    hasScore: true,
  },
  {
    key: 'surrounding_businesses',
    label: 'Surrounding Businesses',
    description: 'Quality and synergy of neighboring tenants. 5 = strongly complementary, 1 = direct competition.',
    hasScore: true,
  },
  {
    key: 'demographics_fit',
    label: 'Demographics Fit',
    description: 'How well the local customer base matches your target personas.',
    hasScore: true,
  },
  {
    key: 'lease_cost_vs_market',
    label: 'Lease Cost vs. Market',
    description: 'Value of the asking rent relative to comparable spaces in the area. 5 = well below market, 1 = above market.',
    hasScore: true,
  },
  {
    key: 'space_layout',
    label: 'Space Layout Suitability',
    description: 'Square footage, kitchen feasibility, and seating capacity for your concept.',
    hasScore: true,
  },
  {
    key: 'buildout_condition',
    label: 'Build-out Condition',
    description: 'Existing condition and estimated build-out cost. 5 = turnkey, 1 = gut renovation.',
    hasScore: true,
  },
  {
    key: 'permits_zoning',
    label: 'Permits / Zoning',
    description: 'How straightforward it is to get the permits and approvals you need. 5 = easy, 1 = high friction.',
    hasScore: true,
  },
  {
    key: 'safety_perception',
    label: 'Safety / Area Perception',
    description: 'Customer and staff comfort with the area at all operating hours.',
    hasScore: true,
  },
  {
    key: 'gut_feel',
    label: "Owner's Gut Feel",
    description: 'Your overall instinct about this location. No score — just write it out.',
    hasScore: false,
  },
]

const SCORED_FACTORS = SCORECARD_FACTORS.filter(f => f.hasScore)

// ── Helpers ─────────────────────────────────────────────────────────────────

function computeOverallScore(scores: ScoreMap): string {
  let sum = 0
  let count = 0
  for (const f of SCORED_FACTORS) {
    const s = scores[f.key]?.score
    if (s != null) { sum += s; count++ }
  }
  if (count === 0) return '—'
  return `${(sum / count).toFixed(1)} / 5`
}

// ── RatingPicker ────────────────────────────────────────────────────────────

function RatingPicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex gap-1" role="group">
      {([1, 2, 3, 4, 5] as const).map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          aria-label={`Rate ${n}`}
          aria-pressed={value === n}
          className={cn(
            'size-8 rounded text-xs font-semibold transition-colors border',
            value === n
              ? 'bg-[#155e63] text-white border-[#155e63]'
              : 'bg-background text-[#888] border-[#efefef] hover:border-[#155e63]/60 hover:text-[#155e63]'
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

// ── ScoreBadge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 4
      ? 'bg-emerald-100 text-emerald-700'
      : score <= 2
      ? 'bg-rose-100 text-rose-600'
      : 'bg-amber-100 text-amber-700'
  return (
    <span className={cn('inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold min-w-[24px]', color)}>
      {score}
    </span>
  )
}

// ── AiFeedbackPanel ──────────────────────────────────────────────────────────

function AiFeedbackPanel({
  candidateId,
  canUse,
  subscriptionTier,
  aiCreditsRemaining,
}: {
  candidateId: string
  canUse: boolean
  subscriptionTier: string
  aiCreditsRemaining: number
}) {
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [finalText, setFinalText] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  function reset() {
    setFinalText('')
    setStreamText('')
    setError('')
  }

  async function requestFeedback() {
    if (loading || !canUse) return
    reset()
    setLoading(true)

    abortRef.current = new AbortController()

    try {
      const res = await fetch(
        `/api/workspaces/location-lease/candidates/${candidateId}/scorecard-feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: abortRef.current.signal,
        }
      )

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        try {
          const parsed = JSON.parse(text)
          setError(parsed.error ?? 'Something went wrong. Please try again.')
        } catch {
          setError('Connection error. Please try again.')
        }
        setLoading(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) continue
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const payload = JSON.parse(raw) as Record<string, unknown>
            if ('delta' in payload && typeof payload.delta === 'string') {
              accumulated += payload.delta
              setStreamText(accumulated)
            } else if (payload.code === 'error') {
              setError((payload.message as string) ?? 'AI feedback error.')
            } else if ('threadId' in payload) {
              setFinalText(accumulated)
              setStreamText('')
            }
          } catch {
            // ignore malformed SSE
          }
        }
      }

      if (accumulated && !finalText) {
        setFinalText(accumulated)
        setStreamText('')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Connection error. Please try again.')
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const displayText = finalText || streamText

  if (!canUse) {
    return (
      <div className="rounded-xl border border-[#efefef] p-4 text-center">
        <p className="text-xs text-[#888]">
          {subscriptionTier === 'free'
            ? <>AI feedback requires a paid plan. <a href="/account" className="text-[#155e63] underline">Upgrade →</a></>
            : aiCreditsRemaining === 0
            ? <>You're out of credits. <a href="/account" className="text-[#155e63] underline">Upgrade for more →</a></>
            : 'AI feedback unavailable.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="sm"
        onClick={requestFeedback}
        disabled={loading}
        className="self-start"
      >
        <Sparkles className="size-3.5 mr-1.5" />
        {loading ? 'Analyzing…' : finalText ? 'Refresh Feedback' : 'Get AI Feedback'}
      </Button>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
          <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {displayText && (
        <div className="rounded-xl border border-[#efefef] bg-[#f7f6f3]/50 px-4 py-4">
          <FeedbackRenderer text={displayText} streaming={!!streamText && !finalText} />
        </div>
      )}
    </div>
  )
}

// ── FeedbackRenderer ─────────────────────────────────────────────────────────

function FeedbackRenderer({ text, streaming }: { text: string; streaming: boolean }) {
  // Parse the four sections from the AI response
  const sections = parseAiFeedback(text)

  if (!sections) {
    // Still streaming first words — show raw
    return (
      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
        {text}
        {streaming && <span className="animate-pulse">▋</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {sections.riskProfile && (
        <FeedbackSection title="Overall Risk Profile" variant="neutral">
          <p className="text-sm text-foreground leading-relaxed">{sections.riskProfile}</p>
        </FeedbackSection>
      )}
      {sections.strengths.length > 0 && (
        <FeedbackSection title="Top 3 Strengths" variant="positive">
          <ul className="flex flex-col gap-1.5">
            {sections.strengths.map((s, i) => (
              <li key={i} className="text-sm text-foreground leading-relaxed flex gap-2">
                <span className="shrink-0 text-emerald-600 font-semibold">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </FeedbackSection>
      )}
      {sections.concerns.length > 0 && (
        <FeedbackSection title="Top 3 Concerns" variant="negative">
          <ul className="flex flex-col gap-1.5">
            {sections.concerns.map((s, i) => (
              <li key={i} className="text-sm text-foreground leading-relaxed flex gap-2">
                <span className="shrink-0 text-rose-500 font-semibold">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </FeedbackSection>
      )}
      {sections.questions.length > 0 && (
        <FeedbackSection title="Due-Diligence Questions" variant="neutral">
          <ul className="flex flex-col gap-2">
            {sections.questions.map((q, i) => (
              <li key={i} className="text-sm text-foreground leading-relaxed flex gap-2">
                <span className="shrink-0 text-[#888] font-medium">{i + 1}.</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </FeedbackSection>
      )}
      {streaming && (
        <p className="text-[11px] text-[#888] italic">Generating…</p>
      )}
    </div>
  )
}

function FeedbackSection({
  title,
  variant,
  children,
}: {
  title: string
  variant: 'positive' | 'negative' | 'neutral'
  children: React.ReactNode
}) {
  const headerClass =
    variant === 'positive'
      ? 'text-emerald-700'
      : variant === 'negative'
      ? 'text-rose-600'
      : 'text-foreground'

  return (
    <div className="flex flex-col gap-2">
      <h4 className={cn('text-xs font-semibold uppercase tracking-wide', headerClass)}>{title}</h4>
      {children}
    </div>
  )
}

type ParsedFeedback = {
  riskProfile: string
  strengths: string[]
  concerns: string[]
  questions: string[]
}

function parseAiFeedback(text: string): ParsedFeedback | null {
  // Need at least one section header to have arrived
  if (!text.includes('##')) return null

  function extractSection(header: string): string {
    const re = new RegExp(`##\\s*${header}[^\\n]*\\n([\\s\\S]*?)(?=##|$)`, 'i')
    const m = text.match(re)
    return m ? m[1].trim() : ''
  }

  function parseBullets(raw: string): string[] {
    return raw
      .split('\n')
      .map(l => l.replace(/^[-*\d.]+\s*\*?\*?/, '').replace(/\*\*$/,'').trim())
      .filter(Boolean)
  }

  const riskRaw = extractSection('Overall Risk Profile')
  const strengthsRaw = extractSection('Top 3 Strengths')
  const concernsRaw = extractSection('Top 3 Concerns')
  const questionsRaw = extractSection('Due-Diligence Questions')

  return {
    riskProfile: riskRaw,
    strengths: parseBullets(strengthsRaw),
    concerns: parseBullets(concernsRaw),
    questions: parseBullets(questionsRaw),
  }
}

// ── ScorecardModal (main export) ─────────────────────────────────────────────

export interface ScorecardModalProps {
  open: boolean
  onClose: () => void
  candidateId: string
  candidateName: string
  planId: string
  aiCreditsRemaining: number
  subscriptionTier: string
  isBetaWaived: boolean
}

export function ScorecardModal({
  open,
  onClose,
  candidateId,
  candidateName,
  planId: _planId,
  aiCreditsRemaining,
  subscriptionTier,
  isBetaWaived,
}: ScorecardModalProps) {
  const [scores, setScores] = useState<ScoreMap>({})
  const [loading, setLoading] = useState(false)
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // TIM-943: beta-waived accounts bypass the paid-tier/credit gate; server-side
  // enforcement in /api/copilot/stream still runs (see TIM-925).
  const canUseAI = isBetaWaived || (subscriptionTier !== 'free' && aiCreditsRemaining > 0)

  // Load existing scores on open
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('location_rubric_scores')
        .select('factor_key, score_1_5, notes')
        .eq('candidate_id', candidateId)
        .in('factor_key', SCORECARD_FACTORS.map(f => f.key))

      if (cancelled) return

      const map: ScoreMap = {}
      for (const row of (data ?? [])) {
        map[row.factor_key as ScorecardFactorKey] = {
          score: row.score_1_5,
          notes: row.notes ?? '',
        }
      }
      setScores(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [open, candidateId])

  // Trap Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Prevent body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const persistScores = useCallback((updatedScores: ScoreMap) => {
    const key = `${candidateId}`
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key])
    debounceTimers.current[key] = setTimeout(async () => {
      const payload = SCORECARD_FACTORS.map(f => ({
        factor_key: f.key,
        score_1_5: updatedScores[f.key]?.score ?? null,
        notes: updatedScores[f.key]?.notes ?? null,
      }))
      await fetch(`/api/workspaces/location-lease/candidates/${candidateId}/scores`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: payload }),
      })
    }, 600)
  }, [candidateId])

  const handleScore = useCallback((factorKey: ScorecardFactorKey, value: number | null) => {
    setScores(prev => {
      const next = {
        ...prev,
        [factorKey]: {
          score: value,
          notes: prev[factorKey]?.notes ?? '',
        },
      }
      persistScores(next)
      return next
    })
  }, [persistScores])

  const handleNotes = useCallback((factorKey: ScorecardFactorKey, notes: string) => {
    setScores(prev => {
      const next = {
        ...prev,
        [factorKey]: {
          score: prev[factorKey]?.score ?? null,
          notes,
        },
      }
      persistScores(next)
      return next
    })
  }, [persistScores])

  if (!open) return null

  const overallScore = computeOverallScore(scores)
  const filledCount = SCORED_FACTORS.filter(f => scores[f.key]?.score != null).length

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal
        aria-label={`Location scorecard for ${candidateName}`}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-background shadow-2xl lg:inset-x-auto lg:inset-y-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-[min(90vw,860px)] lg:max-h-[90vh] lg:rounded-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#efefef] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Location Scorecard</h2>
            <p className="text-xs text-[#888]">
              {candidateName}
              {filledCount > 0 && (
                <> &middot; {filledCount}/{SCORED_FACTORS.length} rated &middot; <span className="font-medium text-[#155e63]">{overallScore} avg</span></>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scorecard"
            className="flex size-8 items-center justify-center rounded-lg bg-[#f7f6f3] text-[#888] hover:bg-[#f7f6f3]/80 hover:text-[#1a1a1a] transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#888]">
              Loading scorecard…
            </div>
          ) : (
            <div className="px-5 py-5 flex flex-col gap-8">
              {/* Criteria grid */}
              <div className="flex flex-col gap-5">
                {SCORECARD_FACTORS.map(factor => (
                  <div key={factor.key} className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{factor.label}</span>
                          {factor.hasScore && scores[factor.key]?.score != null && (
                            <ScoreBadge score={scores[factor.key]!.score!} />
                          )}
                        </div>
                        <p className="text-xs text-[#888] mt-0.5 leading-relaxed">{factor.description}</p>
                      </div>
                      {factor.hasScore && (
                        <div className="shrink-0 pt-0.5">
                          <RatingPicker
                            value={scores[factor.key]?.score ?? null}
                            onChange={v => handleScore(factor.key, v)}
                          />
                        </div>
                      )}
                    </div>
                    <textarea
                      value={scores[factor.key]?.notes ?? ''}
                      onChange={e => handleNotes(factor.key, e.target.value)}
                      placeholder={
                        factor.key === 'gut_feel'
                          ? 'Write your overall instinct about this location…'
                          : 'Observation or notes (optional)…'
                      }
                      rows={factor.key === 'gut_feel' ? 3 : 2}
                      className="w-full resize-none rounded-xl border border-[#efefef] bg-background px-3 py-2 text-sm text-foreground placeholder:text-[#888]/40 outline-none focus-visible:border-[#155e63] focus-visible:ring-2 focus-visible:ring-[#155e63]/30"
                    />
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-[#efefef]" />

              {/* AI Feedback section */}
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">AI Feedback</h3>
                  <p className="text-xs text-[#888] mt-0.5">
                    Fill in the criteria above, then run AI feedback to get a risk profile, key strengths, concerns, and due-diligence questions.
                  </p>
                </div>
                <AiFeedbackPanel
                  candidateId={candidateId}
                  canUse={canUseAI}
                  subscriptionTier={subscriptionTier}
                  aiCreditsRemaining={aiCreditsRemaining}
                />
              </div>

              {/* Bottom spacing */}
              <div className="h-2" />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
