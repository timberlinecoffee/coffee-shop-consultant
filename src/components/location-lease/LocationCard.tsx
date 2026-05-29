// TIM-1115: Unified per-location card.
// All info for one candidate lives in this card: intake fields, scorecard
// (13 factors + AI feedback), and lease terms. No separate top-level sections.
'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Archive,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ClipboardList,
  Receipt,
  Sparkles,
  AlertCircle,
  Star,
  Map,
  CheckSquare,
  Square,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { AddressAutocomplete, type PlacePick } from './AddressAutocomplete'
import { AreaAnalysisPanel } from './AreaAnalysisPanel'
import type { Candidate, CandidateStatus } from './CandidateListCard'

// ── Status config (kept in sync with CandidateListCard) ──────────────────

const STATUS_CONFIG: Record<CandidateStatus, { label: string; className: string }> = {
  shortlisted: {
    label: 'Shortlisted',
    className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400',
  },
  viewing_scheduled: {
    label: 'Viewing',
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
  },
  lease_review: {
    label: 'Lease Review',
    className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400',
  },
  passed: {
    label: 'Passed',
    className: 'bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400',
  },
  signed: {
    label: 'Signed',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
}

const STATUS_ORDER: CandidateStatus[] = [
  'shortlisted',
  'viewing_scheduled',
  'lease_review',
  'passed',
  'signed',
]

// ── Scorecard factor definitions ─────────────────────────────────────────

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

const SCORECARD_FACTORS: ScorecardFactor[] = [
  { key: 'foot_traffic_weekday', label: 'Weekday Foot Traffic', description: 'Estimated pedestrian count on a typical weekday. 5 = very high, 1 = very low.', hasScore: true },
  { key: 'foot_traffic_weekend', label: 'Weekend Foot Traffic', description: 'Estimated pedestrian count on a typical weekend day.', hasScore: true },
  { key: 'street_visibility', label: 'Street Visibility', description: 'How easily the storefront is seen from the street or passing traffic.', hasScore: true },
  { key: 'parking', label: 'Parking Availability', description: 'On-site or nearby parking for customers and staff.', hasScore: true },
  { key: 'public_transit', label: 'Public Transit Proximity', description: 'Walkability from bus stops, train stations, or transit corridors.', hasScore: true },
  { key: 'surrounding_businesses', label: 'Surrounding Businesses', description: 'Quality and synergy of neighboring tenants. 5 = strongly complementary, 1 = direct competition.', hasScore: true },
  { key: 'demographics_fit', label: 'Demographics Fit', description: 'How well the local customer base matches your target personas.', hasScore: true },
  { key: 'lease_cost_vs_market', label: 'Lease Cost vs. Market', description: 'Value of the asking rent relative to comparable spaces in the area. 5 = well below market, 1 = above market.', hasScore: true },
  { key: 'space_layout', label: 'Space Layout Suitability', description: 'Square footage, kitchen feasibility, and seating capacity for your concept.', hasScore: true },
  { key: 'buildout_condition', label: 'Build-out Condition', description: 'Existing condition and estimated build-out cost. 5 = turnkey, 1 = gut renovation.', hasScore: true },
  { key: 'permits_zoning', label: 'Permits / Zoning', description: 'How straightforward it is to get the permits and approvals you need. 5 = easy, 1 = high friction.', hasScore: true },
  { key: 'safety_perception', label: 'Safety / Area Perception', description: 'Customer and staff comfort with the area at all operating hours.', hasScore: true },
  { key: 'gut_feel', label: "Owner's Gut Feel", description: 'Your overall instinct about this location. No score — just write it out.', hasScore: false },
]

const SCORED_FACTORS = SCORECARD_FACTORS.filter((f) => f.hasScore)

type ScoreCell = { score: number | null; notes: string }
type ScoreMap = Partial<Record<ScorecardFactorKey, ScoreCell>>

function computeOverallScore(scores: ScoreMap): string {
  let sum = 0
  let count = 0
  for (const f of SCORED_FACTORS) {
    const s = scores[f.key]?.score
    if (s != null) {
      sum += s
      count++
    }
  }
  if (count === 0) return '—'
  return `${(sum / count).toFixed(1)} / 5`
}

// ── Lease terms types ────────────────────────────────────────────────────

type TermsDisplay = {
  base_rent: string
  rent_escalation_pct: string
  security_deposit: string
  ti_allowance: string
  term_months: string
  options_text: string
  personal_guarantee: string
  exit_clauses: string
}

const EMPTY_TERMS: TermsDisplay = {
  base_rent: '',
  rent_escalation_pct: '',
  security_deposit: '',
  ti_allowance: '',
  term_months: '',
  options_text: '',
  personal_guarantee: '',
  exit_clauses: '',
}

type TermsRow = {
  candidate_id: string
  base_rent_cents: number | null
  rent_escalation_pct: number | null
  security_deposit_cents: number | null
  ti_allowance_cents: number | null
  term_months: number | null
  options_text: string | null
  personal_guarantee: string | null
  exit_clauses: string | null
}

function rowToTerms(row: TermsRow | null): TermsDisplay {
  return {
    base_rent: centsToDisplay(row?.base_rent_cents ?? null),
    rent_escalation_pct: pctToDisplay(row?.rent_escalation_pct ?? null),
    security_deposit: centsToDisplay(row?.security_deposit_cents ?? null),
    ti_allowance: centsToDisplay(row?.ti_allowance_cents ?? null),
    term_months: row?.term_months != null ? String(row.term_months) : '',
    options_text: row?.options_text ?? '',
    personal_guarantee: row?.personal_guarantee ?? '',
    exit_clauses: row?.exit_clauses ?? '',
  }
}

function termsToPayload(d: TermsDisplay) {
  return {
    base_rent_cents: displayToCents(d.base_rent),
    rent_escalation_pct: displayToPct(d.rent_escalation_pct),
    security_deposit_cents: displayToCents(d.security_deposit),
    ti_allowance_cents: displayToCents(d.ti_allowance),
    term_months: d.term_months ? parseInt(d.term_months, 10) || null : null,
    options_text: d.options_text.trim() || null,
    personal_guarantee: d.personal_guarantee.trim() || null,
    exit_clauses: d.exit_clauses.trim() || null,
  }
}

// ── Money/pct helpers ────────────────────────────────────────────────────

function centsToDisplay(cents: number | null): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

function displayToCents(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : Math.round(n * 100)
}

function pctToDisplay(pct: number | null): string {
  if (pct == null) return ''
  return pct.toFixed(2)
}

function displayToPct(s: string): number | null {
  if (!s.trim()) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// ── InlineInput (mirrors CandidateListCard) ──────────────────────────────

function InlineInput({
  value,
  placeholder,
  type = 'text',
  prefix,
  suffix,
  multiline,
  onCommit,
}: {
  value: string
  placeholder?: string
  type?: string
  prefix?: string
  suffix?: string
  multiline?: boolean
  onCommit: (v: string) => void
}) {
  const [local, setLocal] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    setLocal(value)
    prevRef.current = value
  }, [value])

  function handleBlur() {
    if (local !== prevRef.current) {
      onCommit(local)
      prevRef.current = local
    }
  }

  const cls =
    'w-full bg-transparent text-sm outline-none text-foreground placeholder:text-[var(--neutral-cool-600)]/50 focus-visible:ring-0'

  const wrapCls =
    'flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 transition-colors hover:border-[var(--border)] focus-within:border-[var(--teal)] focus-within:ring-2 focus-within:ring-[var(--teal)]/30'

  if (multiline) {
    return (
      <div className={wrapCls}>
        <textarea
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          rows={2}
          className={cn(cls, 'resize-y')}
        />
      </div>
    )
  }

  return (
    <div className={wrapCls}>
      {prefix && <span className="shrink-0 text-sm text-[var(--neutral-cool-600)]">{prefix}</span>}
      <input
        type={type}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cls}
      />
      {suffix && <span className="shrink-0 text-sm text-[var(--neutral-cool-600)]">{suffix}</span>}
    </div>
  )
}

// ── StatusPillSelector ────────────────────────────────────────────────────

function StatusPillSelector({
  status,
  onChange,
}: {
  status: CandidateStatus
  onChange: (s: CandidateStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const cfg = STATUS_CONFIG[status]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-80',
          cfg.className
        )}
      >
        {cfg.label}
        <ChevronDown className="size-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 rounded-xl border bg-white shadow-lg py-1 min-w-[150px]">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s)
                setOpen(false)
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--surface-warm-50)] transition-colors',
                s === status && 'font-semibold'
              )}
            >
              <span className={cn('rounded-full border px-2 py-0.5', STATUS_CONFIG[s].className)}>
                {STATUS_CONFIG[s].label}
              </span>
              {s === status && <span className="ml-auto text-[10px] text-[var(--neutral-cool-600)]">current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]/40">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-warm-50)]/60"
      >
        <Icon className="size-3.5 text-[var(--teal)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</span>
        {badge}
        <ChevronDown
          className={cn(
            'ml-auto size-4 text-[var(--neutral-cool-600)] transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && <div className="border-t border-[var(--border)] px-3 py-3">{children}</div>}
    </div>
  )
}

// ── FieldLabel ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--neutral-cool-600)]">{children}</span>
}

// ── ScoreBadge ───────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 4
      ? 'bg-emerald-100 text-emerald-700'
      : score <= 2
      ? 'bg-rose-100 text-rose-600'
      : 'bg-amber-100 text-amber-700'
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold min-w-[24px]',
        color
      )}
    >
      {score}
    </span>
  )
}

// ── RatingPicker ─────────────────────────────────────────────────────────

function RatingPicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex gap-1" role="group">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          aria-label={`Rate ${n}`}
          aria-pressed={value === n}
          className={cn(
            'size-7 rounded text-xs font-semibold transition-colors border',
            value === n
              ? 'bg-[var(--teal)] text-white border-[var(--teal)]'
              : 'bg-background text-[var(--neutral-cool-600)] border-[var(--border)] hover:border-[var(--teal)]/60 hover:text-[var(--teal)]'
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

// ── ScorecardSection ─────────────────────────────────────────────────────

function ScorecardSection({
  candidateId,
  candidateName,
  canUseAI,
  subscriptionTier,
  aiCreditsRemaining,
}: {
  candidateId: string
  candidateName: string
  canUseAI: boolean
  subscriptionTier: string
  aiCreditsRemaining: number
}) {
  const [scores, setScores] = useState<ScoreMap>({})
  const [loaded, setLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('location_rubric_scores')
      .select('factor_key, score_1_5, notes')
      .eq('candidate_id', candidateId)
      .in('factor_key', SCORECARD_FACTORS.map((f) => f.key))
      .then(({ data }) => {
        if (data) {
          const map: ScoreMap = {}
          for (const row of data) {
            map[row.factor_key as ScorecardFactorKey] = {
              score: row.score_1_5,
              notes: row.notes ?? '',
            }
          }
          setScores(map)
        }
        setLoaded(true)
      })
  }, [candidateId])

  const persist = useCallback(
    (next: ScoreMap) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        const payload = SCORECARD_FACTORS.map((f) => ({
          factor_key: f.key,
          score_1_5: next[f.key]?.score ?? null,
          notes: next[f.key]?.notes ?? null,
        }))
        await fetch(`/api/workspaces/location-lease/candidates/${candidateId}/scores`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scores: payload }),
        })
      }, 600)
    },
    [candidateId]
  )

  function handleScore(key: ScorecardFactorKey, value: number | null) {
    setScores((prev) => {
      const next = {
        ...prev,
        [key]: { score: value, notes: prev[key]?.notes ?? '' },
      }
      persist(next)
      return next
    })
  }

  function handleNotes(key: ScorecardFactorKey, notes: string) {
    setScores((prev) => {
      const next = {
        ...prev,
        [key]: { score: prev[key]?.score ?? null, notes },
      }
      persist(next)
      return next
    })
  }

  if (!loaded) {
    return <p className="text-xs text-[var(--neutral-cool-600)]">Loading scorecard…</p>
  }

  const overallScore = computeOverallScore(scores)
  const filledCount = SCORED_FACTORS.filter((f) => scores[f.key]?.score != null).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--neutral-cool-600)]">
          {filledCount}/{SCORED_FACTORS.length} rated
          {filledCount > 0 && (
            <>
              {' · '}
              <span className="font-semibold text-[var(--teal)]">{overallScore} avg</span>
            </>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {SCORECARD_FACTORS.map((factor) => (
          <div key={factor.key} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{factor.label}</span>
                  {factor.hasScore && scores[factor.key]?.score != null && (
                    <ScoreBadge score={scores[factor.key]!.score!} />
                  )}
                </div>
                <p className="text-xs text-[var(--neutral-cool-600)] mt-0.5 leading-relaxed">{factor.description}</p>
              </div>
              {factor.hasScore && (
                <div className="shrink-0 pt-0.5">
                  <RatingPicker
                    value={scores[factor.key]?.score ?? null}
                    onChange={(v) => handleScore(factor.key, v)}
                  />
                </div>
              )}
            </div>
            <textarea
              value={scores[factor.key]?.notes ?? ''}
              onChange={(e) => handleNotes(factor.key, e.target.value)}
              placeholder={
                factor.key === 'gut_feel'
                  ? 'Write your overall instinct about this location…'
                  : 'Observation or notes (optional)…'
              }
              rows={factor.key === 'gut_feel' ? 3 : 2}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--neutral-cool-600)]/40 outline-none focus-visible:border-[var(--teal)] focus-visible:ring-2 focus-visible:ring-[var(--teal)]/30"
            />
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <AiFeedbackPanel
          candidateId={candidateId}
          candidateName={candidateName}
          canUse={canUseAI}
          subscriptionTier={subscriptionTier}
          aiCreditsRemaining={aiCreditsRemaining}
        />
      </div>
    </div>
  )
}

// ── AiFeedbackPanel ──────────────────────────────────────────────────────

function AiFeedbackPanel({
  candidateId,
  canUse,
  subscriptionTier,
  aiCreditsRemaining,
}: {
  candidateId: string
  candidateName: string
  canUse: boolean
  subscriptionTier: string
  aiCreditsRemaining: number
}) {
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [finalText, setFinalText] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  async function requestFeedback() {
    if (loading || !canUse) return
    setFinalText('')
    setStreamText('')
    setError('')
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
      <div className="rounded-xl border border-[var(--border)] p-3 text-center">
        <p className="text-xs text-[var(--neutral-cool-600)]">
          {subscriptionTier === 'free' ? (
            <>
              AI feedback requires a paid plan.{' '}
              <a href="/pricing" className="text-[var(--teal)] underline">
                Upgrade →
              </a>
            </>
          ) : aiCreditsRemaining === 0 ? (
            <>
              You&apos;re out of credits.{' '}
              <a href="/pricing" className="text-[var(--teal)] underline">
                Upgrade for more →
              </a>
            </>
          ) : (
            'AI feedback unavailable.'
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">AI Feedback</h4>
          <p className="text-[11px] text-[var(--neutral-cool-600)] mt-0.5 leading-relaxed">
            Fill in scores above, then run AI feedback for risk profile, strengths, concerns, and due-diligence questions.
          </p>
        </div>
        <Button size="sm" onClick={requestFeedback} disabled={loading} className="shrink-0">
          <Sparkles className="size-3.5 mr-1.5" />
          {loading ? 'Analyzing…' : finalText ? 'Refresh' : 'Get AI Feedback'}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
          <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {displayText && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-warm-50)]/40 px-4 py-4">
          <FeedbackRenderer text={displayText} streaming={!!streamText && !finalText} />
        </div>
      )}

      {finalText && (
        <p className="text-[10px] leading-relaxed text-[var(--muted-foreground)]">
          <span className="font-semibold">AI Scorecard Feedback.</span>{" "}
          The Move Forward / Negotiate / Pass recommendation and due-diligence questions are
          generated by AI from the scores you entered. This is not a real estate professional
          assessment or legal opinion. Consult a commercial real estate attorney and broker before
          proceeding.{" "}
          <span className="text-[var(--teal)]">
            Colorado users: you may{" "}
            <a
              href="mailto:legal@timberlinecoffeeschool.com"
              className="underline hover:text-[var(--teal-dark)]"
            >
              request human review
            </a>{" "}
            if this assessment affected a consequential decision.
          </span>
        </p>
      )}
    </div>
  )
}

function FeedbackRenderer({ text, streaming }: { text: string; streaming: boolean }) {
  const sections = parseAiFeedback(text)

  if (!sections) {
    return (
      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
        {text}
        {streaming && <span className="animate-pulse">▋</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {sections.recommendation && (
        <RecommendationCallout
          verdict={sections.recommendationVerdict}
          body={sections.recommendation}
        />
      )}
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
                <span className="shrink-0 text-[var(--neutral-cool-600)] font-medium">{i + 1}.</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </FeedbackSection>
      )}
      {streaming && <p className="text-[11px] text-[var(--neutral-cool-600)] italic">Generating…</p>}
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
      <h5 className={cn('text-xs font-semibold uppercase tracking-wide', headerClass)}>{title}</h5>
      {children}
    </div>
  )
}

type RecommendationVerdict = 'move' | 'negotiate' | 'pass' | 'unknown'

type ParsedFeedback = {
  recommendation: string
  recommendationVerdict: RecommendationVerdict
  riskProfile: string
  strengths: string[]
  concerns: string[]
  questions: string[]
}

function classifyVerdict(body: string): RecommendationVerdict {
  // Look at the first ~120 chars (verdict line) for the keyword.
  const head = body.slice(0, 160).toLowerCase()
  if (/(^|\W)move\s*forward(\W|$)/.test(head)) return 'move'
  if (/(^|\W)negotiate(\s+first)?(\W|$)/.test(head)) return 'negotiate'
  if (/(^|\W)pass(\W|$)/.test(head)) return 'pass'
  return 'unknown'
}

function parseAiFeedback(text: string): ParsedFeedback | null {
  if (!text.includes('##')) return null

  function extractSection(header: string): string {
    const re = new RegExp(`##\\s*${header}[^\\n]*\\n([\\s\\S]*?)(?=##|$)`, 'i')
    const m = text.match(re)
    return m ? m[1].trim() : ''
  }

  function parseBullets(raw: string): string[] {
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*\d.]+\s*\*?\*?/, '').replace(/\*\*$/, '').trim())
      .filter(Boolean)
  }

  const recommendation = extractSection('Recommendation')

  return {
    recommendation,
    recommendationVerdict: recommendation ? classifyVerdict(recommendation) : 'unknown',
    riskProfile: extractSection('Overall Risk Profile'),
    strengths: parseBullets(extractSection('Top 3 Strengths')),
    concerns: parseBullets(extractSection('Top 3 Concerns')),
    questions: parseBullets(extractSection('Due-Diligence Questions')),
  }
}

function RecommendationCallout({
  verdict,
  body,
}: {
  verdict: RecommendationVerdict
  body: string
}) {
  const cfg =
    verdict === 'move'
      ? {
          label: 'Move Forward',
          wrap: 'border-emerald-300 bg-emerald-50',
          chip: 'bg-emerald-600 text-white',
          title: 'text-emerald-800',
        }
      : verdict === 'negotiate'
        ? {
            label: 'Negotiate First',
            wrap: 'border-amber-300 bg-amber-50',
            chip: 'bg-amber-600 text-white',
            title: 'text-amber-800',
          }
        : verdict === 'pass'
          ? {
              label: 'Pass',
              wrap: 'border-rose-300 bg-rose-50',
              chip: 'bg-rose-600 text-white',
              title: 'text-rose-800',
            }
          : {
              label: 'Recommendation',
              wrap: 'border-[var(--border)] bg-[var(--surface-warm-50)]/60',
              chip: 'bg-[var(--teal)] text-white',
              title: 'text-foreground',
            }

  // Strip the leading bolded verdict from the body if present so we don't
  // double-render it next to the chip.
  const cleanedBody = body
    .replace(/^\s*\*\*[^*]+\*\*\s*\n?/, '')
    .trim()

  return (
    <div className={cn('rounded-xl border px-4 py-3', cfg.wrap)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
            cfg.chip
          )}
        >
          {cfg.label}
        </span>
        <span
          className={cn('text-xs font-semibold uppercase tracking-wide', cfg.title)}
        >
          AI Recommendation
        </span>
      </div>
      {cleanedBody && (
        <p className="mt-2 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {cleanedBody}
        </p>
      )}
    </div>
  )
}

// ── LabelWithTip ─────────────────────────────────────────────────────────

function LabelWithTip({
  label,
  tipLabel,
  children,
}: {
  label: string
  tipLabel: string
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center gap-1 text-xs font-medium text-[var(--neutral-cool-600)]">
      {label}
      <InfoTip label={tipLabel}>{children}</InfoTip>
    </label>
  )
}

// ── LeaseTermsSection ─────────────────────────────────────────────────────
// TIM-1145: Asking Rent and CAM now live here (moved from intake card).
// Rent per month auto-fills from Asking Rent when the user first opens a
// card that has asking_rent_cents but no base_rent yet.

function LeaseTermsSection({
  candidateId,
  askingRentCents,
  camCents,
  onUpdateCandidate,
}: {
  candidateId: string
  askingRentCents: number | null
  camCents: number | null
  onUpdateCandidate: (patch: { asking_rent_cents?: number | null; cam_cents?: number | null }) => void
}) {
  const [terms, setTerms] = useState<TermsDisplay>(EMPTY_TERMS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rentLinked, setRentLinked] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local display values for asking rent and CAM (candidate-level, not lease_terms)
  const [askingRentLocal, setAskingRentLocal] = useState(centsToDisplay(askingRentCents))
  const [camLocal, setCamLocal] = useState(centsToDisplay(camCents))

  useEffect(() => {
    setAskingRentLocal(centsToDisplay(askingRentCents))
  }, [askingRentCents])

  useEffect(() => {
    setCamLocal(centsToDisplay(camCents))
  }, [camCents])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('location_lease_terms')
      .select('*')
      .eq('candidate_id', candidateId)
      .maybeSingle()
      .then(({ data }) => {
        const display = rowToTerms((data ?? null) as TermsRow | null)
        // Auto-fill base_rent from asking_rent when there is none yet.
        if (!display.base_rent && askingRentCents != null) {
          display.base_rent = centsToDisplay(askingRentCents)
          setRentLinked(true)
        }
        setTerms(display)
        setLoaded(true)
      })
  }, [candidateId, askingRentCents])

  const persist = useCallback(
    (next: TermsDisplay) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        setSaving(true)
        try {
          await fetch(`/api/workspaces/location-lease/candidates/${candidateId}/lease-terms`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(termsToPayload(next)),
          })
        } finally {
          setSaving(false)
        }
      }, 600)
    },
    [candidateId]
  )

  function update(field: keyof TermsDisplay, value: string) {
    setTerms((prev) => {
      const next = { ...prev, [field]: value }
      // Once the user edits base_rent, it's no longer linked.
      if (field === 'base_rent') setRentLinked(false)
      persist(next)
      return next
    })
  }

  function commitAskingRent(raw: string) {
    const cents = displayToCents(raw)
    setAskingRentLocal(centsToDisplay(cents))
    onUpdateCandidate({ asking_rent_cents: cents })
    // Keep base_rent in sync if still linked.
    if (rentLinked) {
      setTerms((prev) => {
        const next = { ...prev, base_rent: centsToDisplay(cents) }
        persist(next)
        return next
      })
    }
  }

  function commitCam(raw: string) {
    const cents = displayToCents(raw)
    setCamLocal(centsToDisplay(cents))
    onUpdateCandidate({ cam_cents: cents })
  }

  if (!loaded) return <p className="text-xs text-[var(--neutral-cool-600)]">Loading lease terms…</p>

  return (
    <div className="flex flex-col gap-4">
      {saving && <p className="text-[10px] italic text-[var(--neutral-cool-600)] -mt-1">Saving…</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Asking Rent (moved from intake card, stored on candidate) */}
        <FieldGroup
          label={
            <LabelWithTip label="Asking Rent / Month" tipLabel="Asking Rent">
              The monthly rent the landlord is asking for. This is the starting number
              before any negotiation — it may or may not include CAM charges. Check your
              listing sheet or ask the broker to clarify.
            </LabelWithTip>
          }
        >
          <CurrencyInput
            value={askingRentLocal}
            onChange={setAskingRentLocal}
            onBlur={() => commitAskingRent(askingRentLocal)}
          />
        </FieldGroup>

        {/* CAM (moved from intake card, stored on candidate) */}
        <FieldGroup
          label={
            <LabelWithTip label="CAM / Month" tipLabel="CAM (Common Area Maintenance)">
              CAM stands for Common Area Maintenance. It is an extra monthly charge on top of
              base rent that covers shared spaces like hallways, parking lots, and lobbies in a
              shopping center or multi-tenant building. Not all leases have it — single-tenant
              buildings usually don&apos;t.
            </LabelWithTip>
          }
        >
          <CurrencyInput
            value={camLocal}
            onChange={setCamLocal}
            onBlur={() => commitCam(camLocal)}
          />
        </FieldGroup>

        {/* Rent per Month — auto-fills from Asking Rent */}
        <FieldGroup
          label={
            <span className="flex items-center gap-1 text-xs font-medium text-[var(--neutral-cool-600)]">
              Rent per Month (Your Budget)
              {rentLinked && (
                <span className="text-[10px] text-[var(--teal)] font-normal normal-case">
                  · auto-filled from Asking Rent
                </span>
              )}
            </span>
          }
        >
          <CurrencyInput value={terms.base_rent} onChange={(v) => update('base_rent', v)} />
        </FieldGroup>

        <FieldGroup
          label={
            <LabelWithTip label="Annual Escalation" tipLabel="Annual Escalation">
              The percentage your rent increases each year automatically. Common leases include
              3–5% annual bumps. A 3.5% escalation means if you pay $3,000 now, you&apos;ll pay
              $3,105 next year.
            </LabelWithTip>
          }
        >
          <PctInput
            value={terms.rent_escalation_pct}
            onChange={(v) => update('rent_escalation_pct', v)}
            placeholder="3.50"
          />
        </FieldGroup>

        <FieldGroup label="Security Deposit">
          <CurrencyInput value={terms.security_deposit} onChange={(v) => update('security_deposit', v)} />
        </FieldGroup>

        <FieldGroup
          label={
            <LabelWithTip label="Tenant Improvement Allowance" tipLabel="Tenant Improvement Allowance (TIA)">
              Money the landlord agrees to give you toward building out the space — new flooring,
              plumbing, electrical, etc. It&apos;s usually written as a dollar amount per square foot.
              A higher TIA means lower out-of-pocket build-out costs for you.
            </LabelWithTip>
          }
        >
          <CurrencyInput value={terms.ti_allowance} onChange={(v) => update('ti_allowance', v)} />
        </FieldGroup>

        <FieldGroup label="Term (Months)">
          <input
            type="number"
            min="0"
            step="1"
            value={terms.term_months}
            onChange={(e) => update('term_months', e.target.value)}
            placeholder="24"
            className="h-8 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-1 text-sm outline-none transition-colors focus-visible:border-[var(--teal)] focus-visible:ring-3 focus-visible:ring-[var(--teal)]/50 placeholder:text-[var(--neutral-cool-600)]/50"
          />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <FieldGroup label="Options">
          <textarea
            value={terms.options_text}
            onChange={(e) => update('options_text', e.target.value)}
            placeholder="e.g. Two 5-year renewal options at market rate…"
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-[var(--teal)] focus-visible:ring-3 focus-visible:ring-[var(--teal)]/50 placeholder:text-[var(--neutral-cool-600)]/50 resize-y"
          />
        </FieldGroup>

        <FieldGroup
          label={
            <LabelWithTip label="Personal Guarantee" tipLabel="Personal Guarantee">
              A legal promise that if the business can&apos;t pay rent, you personally are on
              the hook. Landlords often require this for first-time tenants. Try to negotiate a
              burn-down guarantee that reduces over time.
            </LabelWithTip>
          }
        >
          <textarea
            value={terms.personal_guarantee}
            onChange={(e) => update('personal_guarantee', e.target.value)}
            placeholder="e.g. 12-month personal guarantee…"
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-[var(--teal)] focus-visible:ring-3 focus-visible:ring-[var(--teal)]/50 placeholder:text-[var(--neutral-cool-600)]/50 resize-y"
          />
        </FieldGroup>

        <FieldGroup
          label={
            <LabelWithTip label="Exit Clauses" tipLabel="Exit Clauses">
              Conditions in your lease that let either party end the agreement early. Common ones
              include a co-tenancy clause (you can leave if an anchor tenant closes) or a kick-out
              clause (landlord can end the lease if a bigger tenant wants the space).
            </LabelWithTip>
          }
        >
          <textarea
            value={terms.exit_clauses}
            onChange={(e) => update('exit_clauses', e.target.value)}
            placeholder="e.g. 90-day notice, co-tenancy clause…"
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-[var(--teal)] focus-visible:ring-3 focus-visible:ring-[var(--teal)]/50 placeholder:text-[var(--neutral-cool-600)]/50 resize-y"
          />
        </FieldGroup>
      </div>
    </div>
  )
}

function FieldGroup({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {typeof label === 'string' ? (
        <label className="text-xs font-medium text-[var(--neutral-cool-600)]">{label}</label>
      ) : (
        label
      )}
      {children}
    </div>
  )
}

function CurrencyInput({
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
}) {
  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-3 text-sm text-[var(--neutral-cool-600)]">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder ?? '0.00'}
        className="h-8 w-full rounded-lg border border-[var(--border)] bg-transparent pl-6 pr-3 py-1 text-sm outline-none transition-colors focus-visible:border-[var(--teal)] focus-visible:ring-3 focus-visible:ring-[var(--teal)]/50 placeholder:text-[var(--neutral-cool-600)]/50"
      />
    </div>
  )
}

function PctInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative flex items-center">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '0.00'}
        className="h-8 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 pr-7 py-1 text-sm outline-none transition-colors focus-visible:border-[var(--teal)] focus-visible:ring-3 focus-visible:ring-[var(--teal)]/50 placeholder:text-[var(--neutral-cool-600)]/50"
      />
      <span className="pointer-events-none absolute right-3 text-sm text-[var(--neutral-cool-600)]">%</span>
    </div>
  )
}

// ── LocationCard (main export) ───────────────────────────────────────────

export interface LocationCardProps {
  candidate: Candidate
  saving: boolean
  subscriptionTier: string
  aiCreditsRemaining: number
  onPatch: (id: string, patch: Partial<Omit<Candidate, 'id' | 'position'>>) => void
  onArchive: (id: string) => void
  // TIM-1153: bulk-select mode
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

export function LocationCard({
  candidate,
  saving,
  subscriptionTier,
  aiCreditsRemaining,
  onPatch,
  onArchive,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: LocationCardProps) {
  const [open, setOpen] = useState(false)

  const canUseAI = subscriptionTier !== 'free' && aiCreditsRemaining > 0
  const isShortlisted = candidate.status === 'shortlisted'
  const hasCoords = candidate.lat != null && candidate.lng != null

  function toggleShortlist() {
    if (isShortlisted) {
      onPatch(candidate.id, { status: 'viewing_scheduled' })
    } else {
      onPatch(candidate.id, { status: 'shortlisted' })
    }
  }

  function commitText(field: keyof Candidate, raw: string) {
    const v = raw.trim() || null
    onPatch(candidate.id, { [field]: v } as Partial<Candidate>)
  }

  function commitSqFt(raw: string) {
    const n = parseInt(raw, 10)
    onPatch(candidate.id, { sq_ft: isNaN(n) ? null : n })
  }

  // Called when user picks a structured suggestion from the autocomplete.
  function handleAddressPick(place: PlacePick) {
    onPatch(candidate.id, {
      address: place.address,
      neighborhood: place.neighborhood ?? candidate.neighborhood,
      city: place.city,
      postal_code: place.postal_code,
      country: place.country,
      lat: place.lat,
      lng: place.lng,
      area_analysis: null,
      area_analysis_at: null,
    } as Partial<Candidate>)
  }

  // Called when the user edits the address text after a pick (clears geo).
  function handleAddressClearGeo(newText: string) {
    onPatch(candidate.id, {
      address: newText || null,
      lat: null,
      lng: null,
      area_analysis: null,
      area_analysis_at: null,
    } as Partial<Candidate>)
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-white transition-colors',
        selectMode && selected
          ? 'border-[var(--teal)] ring-2 ring-[var(--teal)]/30'
          : 'border-[var(--border)]'
      )}
    >
      {/* ── Summary row ── */}
      <div className="flex items-center gap-2 px-4 py-3">
        {selectMode && (
          <button
            type="button"
            onClick={() => onToggleSelect?.(candidate.id)}
            aria-label={selected ? 'Deselect' : 'Select'}
            aria-pressed={selected}
            className={cn(
              'shrink-0 rounded-lg p-1 transition-colors',
              selected
                ? 'text-[var(--teal)] hover:bg-[var(--teal)]/10'
                : 'text-[var(--neutral-cool-600)] hover:bg-[var(--surface-warm-50)] hover:text-[var(--teal)]'
            )}
          >
            {selected ? (
              <CheckSquare className="size-4" />
            ) : (
              <Square className="size-4" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={toggleShortlist}
          aria-label={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
          title={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
          disabled={selectMode}
          className={cn(
            'shrink-0 rounded-lg p-1 transition-colors',
            isShortlisted
              ? 'text-amber-500 hover:bg-amber-50'
              : 'text-[var(--neutral-cool-600)] hover:bg-[var(--surface-warm-50)] hover:text-amber-500',
            selectMode && 'opacity-60 cursor-not-allowed'
          )}
        >
          <Star className={cn('size-4', isShortlisted && 'fill-amber-400 text-amber-500')} />
        </button>

        <div className="flex-1 min-w-0">
          <InlineInput
            value={candidate.name}
            placeholder="Location name"
            onCommit={(v) => onPatch(candidate.id, { name: v || 'Untitled' })}
          />
        </div>

        <StatusPillSelector
          status={candidate.status}
          onChange={(s) => onPatch(candidate.id, { status: s })}
        />

        {saving && <span className="shrink-0 text-[10px] italic text-[var(--neutral-cool-600)]">saving…</span>}

        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          aria-label={open ? 'Collapse details' : 'Expand details'}
          className="shrink-0 rounded-lg p-1 text-[var(--neutral-cool-600)] transition-colors hover:bg-[var(--surface-warm-50)] hover:text-[var(--foreground)]"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        <button
          type="button"
          onClick={() => onArchive(candidate.id)}
          aria-label="Archive candidate"
          title="Archive this location"
          className="shrink-0 rounded-lg p-1 text-[var(--neutral-cool-600)] transition-colors hover:bg-red-600/10 hover:text-red-600"
        >
          <Archive className="size-4" />
        </button>
      </div>

      {/* ── Expanded — all info for this location lives here ── */}
      {open && (
        <div className="border-t border-[var(--border)] px-4 py-4 flex flex-col gap-4">
          {/* Intake fields */}
          <Section icon={ClipboardList} title="Identity & Intake" defaultOpen>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Address — autocomplete replaces plain text field */}
              <div className="sm:col-span-2 flex flex-col gap-1">
                <FieldLabel>Address</FieldLabel>
                <AddressAutocomplete
                  value={candidate.address ?? ''}
                  hasCoords={hasCoords}
                  onPick={handleAddressPick}
                  onClearGeo={handleAddressClearGeo}
                />
              </div>

              <div className="flex flex-col gap-1">
                <FieldLabel>Neighborhood</FieldLabel>
                <InlineInput
                  value={candidate.neighborhood ?? ''}
                  placeholder="e.g. Downtown, Mission District"
                  onCommit={(v) => commitText('neighborhood', v)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <FieldLabel>Sq Ft</FieldLabel>
                <InlineInput
                  value={candidate.sq_ft != null ? String(candidate.sq_ft) : ''}
                  placeholder="1200"
                  type="number"
                  suffix="sq ft"
                  onCommit={commitSqFt}
                />
              </div>

              <div className="flex flex-col gap-1">
                <FieldLabel>Listing URL</FieldLabel>
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <InlineInput
                      value={candidate.listing_url ?? ''}
                      placeholder="https://…"
                      onCommit={(v) => commitText('listing_url', v)}
                    />
                  </div>
                  {candidate.listing_url && (
                    <a
                      href={candidate.listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] transition-colors"
                      aria-label="Open listing"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <FieldLabel>Broker Contact</FieldLabel>
                <InlineInput
                  value={candidate.broker_contact ?? ''}
                  placeholder="Name, phone or email"
                  onCommit={(v) => commitText('broker_contact', v)}
                />
              </div>

              <div className="sm:col-span-2 flex flex-col gap-1">
                <FieldLabel>Notes</FieldLabel>
                <InlineInput
                  value={candidate.notes ?? ''}
                  placeholder="Pro/cons, impressions, follow-up items…"
                  multiline
                  onCommit={(v) => commitText('notes', v)}
                />
              </div>
            </div>
          </Section>

          {/* Area Analysis — powered by OpenStreetMap + AI */}
          <Section icon={Map} title="Area Analysis">
            <AreaAnalysisPanel
              candidateId={candidate.id}
              hasCoords={hasCoords}
              initialText={candidate.area_analysis ?? null}
              initialAt={candidate.area_analysis_at ?? null}
              canUse={canUseAI}
              subscriptionTier={subscriptionTier}
              aiCreditsRemaining={aiCreditsRemaining}
            />
          </Section>

          {/* Scorecard + AI feedback */}
          <Section icon={ClipboardList} title="Scorecard & AI Feedback">
            <ScorecardSection
              candidateId={candidate.id}
              candidateName={candidate.name}
              canUseAI={canUseAI}
              subscriptionTier={subscriptionTier}
              aiCreditsRemaining={aiCreditsRemaining}
            />
          </Section>

          {/* Lease terms — Asking Rent + CAM now live here */}
          <Section icon={Receipt} title="Lease Terms">
            <LeaseTermsSection
              candidateId={candidate.id}
              askingRentCents={candidate.asking_rent_cents}
              camCents={candidate.cam_cents}
              onUpdateCandidate={(patch) => onPatch(candidate.id, patch)}
            />
          </Section>
        </div>
      )}
    </div>
  )
}
