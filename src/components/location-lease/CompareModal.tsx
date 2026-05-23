// TIM-780: CompareModal — side-by-side 2–3 column desktop, swipeable mobile.
'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { X, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Candidate, CandidateStatus } from './CandidateListCard'

// ── Types ──────────────────────────────────────────────────────────────────

type FactorKey =
  | 'foot_traffic'
  | 'parking_transit'
  | 'visibility'
  | 'neighborhood_fit'
  | 'buildout_cost_estimate'
  | 'lease_terms'

const FACTOR_LABELS: Record<FactorKey, string> = {
  foot_traffic: 'Foot Traffic',
  parking_transit: 'Parking / Transit',
  visibility: 'Visibility',
  neighborhood_fit: 'Neighborhood Fit',
  buildout_cost_estimate: 'Buildout Cost',
  lease_terms: 'Lease Terms',
}

const FACTOR_KEYS: FactorKey[] = [
  'foot_traffic',
  'parking_transit',
  'visibility',
  'neighborhood_fit',
  'buildout_cost_estimate',
  'lease_terms',
]

type ScoreRow = {
  candidate_id: string
  factor_key: FactorKey
  score_1_5: number | null
  notes: string | null
}

type LeaseRow = {
  candidate_id: string
  base_rent_cents: number | null
  rent_escalation_pct: number | null
  term_months: number | null
  options_text: string | null
}

type RubricPoint = { factor: FactorKey; score: number }

type CandidateData = {
  candidate: Candidate
  strengths: RubricPoint[]
  weaknesses: RubricPoint[]
  rentPerSqFt: string | null
  leaseTermSummary: string
}

// ── Status config (mirrors CandidateListCard) ──────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────

function centsToK(cents: number | null): string {
  if (cents == null) return '—'
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k/mo`
  return `$${dollars.toFixed(0)}/mo`
}

function computeRentPerSqFt(candidate: Candidate): string | null {
  if (!candidate.asking_rent_cents || !candidate.sq_ft) return null
  const monthly = candidate.asking_rent_cents / 100
  const perSqFtMonthly = monthly / candidate.sq_ft
  return `$${(perSqFtMonthly * 12).toFixed(2)}/sq ft/yr`
}

function computeStrengthsWeaknesses(
  candidateId: string,
  scores: ScoreRow[]
): { strengths: RubricPoint[]; weaknesses: RubricPoint[] } {
  const candidateScores = scores
    .filter(r => r.candidate_id === candidateId && r.score_1_5 != null)
    .map(r => ({ factor: r.factor_key, score: r.score_1_5! }))
    .sort((a, b) => b.score - a.score)

  return {
    strengths: candidateScores.slice(0, 3),
    weaknesses: candidateScores.slice(-3).reverse(),
  }
}

function buildLeaseTermSummary(row: LeaseRow | undefined): string {
  if (!row) return '—'
  const parts: string[] = []
  if (row.base_rent_cents) parts.push(centsToK(row.base_rent_cents))
  if (row.term_months) parts.push(`${row.term_months}mo term`)
  if (row.rent_escalation_pct) parts.push(`${row.rent_escalation_pct}% escalation`)
  if (row.options_text) parts.push(row.options_text.length > 40 ? row.options_text.slice(0, 40) + '…' : row.options_text)
  return parts.length ? parts.join(' · ') : '—'
}

function buildCopilotPrompt(candidates: Candidate[]): string {
  const list = candidates
    .map(c => `"${c.name}" (id: ${c.id})`)
    .join(', ')
  return `Please compare these location candidates side-by-side for me: ${list}. For each one, summarise the key strengths, weaknesses, lease terms, and give me a final recommendation on which to prioritise.`
}

// ── ScoreBadge ─────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 4
      ? 'bg-emerald-100 text-emerald-700'
      : score <= 2
      ? 'bg-rose-100 text-rose-600'
      : 'bg-amber-100 text-amber-700'
  return (
    <span className={cn('inline-flex size-5 items-center justify-center rounded text-[10px] font-bold', color)}>
      {score}
    </span>
  )
}

// ── CandidateColumn ────────────────────────────────────────────────────────

function CandidateColumn({ data }: { data: CandidateData }) {
  const { candidate, strengths, weaknesses, rentPerSqFt, leaseTermSummary } = data
  const status = STATUS_CONFIG[candidate.status]

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#efefef] bg-white p-4 min-w-0">
      {/* Name + status */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight text-foreground">{candidate.name}</h3>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
              status.className
            )}
          >
            {status.label}
          </span>
        </div>
        {candidate.address && (
          <p className="text-xs text-[#888] leading-tight">{candidate.address}</p>
        )}
        {candidate.neighborhood && !candidate.address && (
          <p className="text-xs text-[#888] leading-tight">{candidate.neighborhood}</p>
        )}
      </div>

      {/* Rent / sq ft */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[#888]">Rent</span>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">
            {candidate.asking_rent_cents ? centsToK(candidate.asking_rent_cents) : '—'}
          </span>
          {rentPerSqFt && (
            <span className="text-[10px] text-[#888]">{rentPerSqFt}</span>
          )}
        </div>
        {candidate.sq_ft && (
          <span className="text-[10px] text-[#888]">
            {candidate.sq_ft.toLocaleString()} sq ft
          </span>
        )}
      </div>

      {/* Strengths */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">
          Top Strengths
        </span>
        {strengths.length === 0 ? (
          <p className="text-xs text-[#888] italic">No scores yet</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {strengths.map(s => (
              <li key={s.factor} className="flex items-center gap-1.5">
                <ScoreBadge score={s.score} />
                <span className="text-xs text-foreground">{FACTOR_LABELS[s.factor]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Weaknesses */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-rose-500">
          Weaknesses
        </span>
        {weaknesses.length === 0 ? (
          <p className="text-xs text-[#888] italic">No scores yet</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {weaknesses.map(s => (
              <li key={s.factor} className="flex items-center gap-1.5">
                <ScoreBadge score={s.score} />
                <span className="text-xs text-foreground">{FACTOR_LABELS[s.factor]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Lease term summary */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[#888]">
          Lease Terms
        </span>
        <p className="text-xs text-foreground leading-relaxed">{leaseTermSummary}</p>
      </div>
    </div>
  )
}

// ── CoPilotDrawer (embedded) ───────────────────────────────────────────────

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function CompareCoPilotDrawer({
  open,
  onClose,
  planId,
  aiCreditsRemaining,
  subscriptionTier,
  initialPrompt,
}: {
  open: boolean
  onClose: () => void
  planId: string
  aiCreditsRemaining: number
  subscriptionTier: string
  initialPrompt: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState(initialPrompt)
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sentRef = useRef(false)

  // Reset when opening
  useEffect(() => {
    if (open) {
      setMessages([])
      setInput(initialPrompt)
      setStreamText('')
      setError('')
      sentRef.current = false
    }
  }, [open, initialPrompt])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText, open])

  const canUse = subscriptionTier !== 'free' && aiCreditsRemaining > 0

  const sendMessage = useCallback(
    async (overrideInput?: string) => {
      const text = (overrideInput ?? input).trim()
      if (!text || loading || !canUse) return

      const userMsg: ChatMessage = { role: 'user', content: text }
      const nextMessages = [...messages, userMsg]
      setMessages(nextMessages)
      setInput('')
      setLoading(true)
      setError('')
      setStreamText('')

      abortRef.current = new AbortController()

      try {
        const res = await fetch('/api/copilot/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId,
            workspaceKey: 'location_lease',
            messages: nextMessages,
          }),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '')
          try {
            const parsed = JSON.parse(text)
            setError(parsed.message ?? 'Something went wrong. Please try again.')
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
              } else if (
                payload.code === 'error' ||
                payload.code === 'quota' ||
                payload.code === 'paywall'
              ) {
                setError((payload.message as string) ?? 'Co-pilot error. Please try again.')
              } else if ('threadId' in payload) {
                setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
                setStreamText('')
              }
            } catch {
              // ignore malformed SSE
            }
          }
        }

        if (accumulated) {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.content === accumulated) return prev
            return [...prev, { role: 'assistant', content: accumulated }]
          })
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
    },
    [input, loading, canUse, messages, planId]
  )

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60] lg:hidden" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-[70] w-full sm:w-96 bg-white shadow-2xl flex flex-col border-l border-[#efefef]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#efefef]">
          <div>
            <p className="text-sm font-semibold text-foreground">Co-Pilot · Compare</p>
            <p className="text-xs text-[#888]">Location comparison assistant</p>
          </div>
          <div className="flex items-center gap-3">
            {subscriptionTier === 'pro' ? (
              <span className="text-xs text-emerald-600 font-medium">Unlimited</span>
            ) : (
              <span
                className={cn(
                  'text-xs font-medium',
                  aiCreditsRemaining <= 10 && aiCreditsRemaining > 0
                    ? 'text-amber-500'
                    : 'text-[#888]'
                )}
              >
                {aiCreditsRemaining} credits
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-lg bg-[#f7f6f3] hover:bg-[#f7f6f3]/80 transition-colors"
              aria-label="Close co-pilot"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="text-center py-6">
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-2xl bg-[#155e63]/10">
                <MessageSquare className="size-5 text-[#155e63]" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Ready to compare</p>
              <p className="text-xs text-[#888] leading-relaxed">
                Hit send to ask your co-pilot to compare your shortlisted candidates.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-[#155e63] text-white rounded-br-sm'
                    : 'bg-[#f7f6f3] text-foreground rounded-bl-sm'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && streamText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-[#f7f6f3] px-4 py-3 text-sm leading-relaxed text-foreground">
                {streamText}
              </div>
            </div>
          )}

          {loading && !streamText && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-[#f7f6f3] px-4 py-3">
                <div className="flex gap-1">
                  {[0, 150, 300].map(delay => (
                    <div
                      key={delay}
                      className="size-2 rounded-full bg-[#888]/60 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-center text-xs text-red-600 px-2">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[#efefef] px-4 py-4">
          {subscriptionTier === 'free' ? (
            <p className="text-center text-xs text-[#888]">
              AI co-pilot requires a paid plan.{' '}
              <a href="/account" className="text-[#155e63] underline">
                Upgrade →
              </a>
            </p>
          ) : aiCreditsRemaining === 0 ? (
            <p className="text-center text-xs text-[#888]">
              You&apos;re out of credits for this month.{' '}
              <a href="/account" className="text-[#155e63] underline">
                Upgrade for unlimited →
              </a>
            </p>
          ) : (
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                rows={3}
                placeholder="Ask about your shortlisted locations…"
                className="flex-1 resize-none rounded-xl border border-[#efefef] bg-background px-3 py-2 text-sm text-foreground placeholder:text-[#888]/50 outline-none focus-visible:border-[#155e63] focus-visible:ring-2 focus-visible:ring-[#155e63]/30"
              />
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="shrink-0 rounded-xl bg-[#155e63] px-3 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                aria-label="Send message"
              >
                ↑
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── CompareModal (main export) ─────────────────────────────────────────────

export interface CompareModalProps {
  open: boolean
  onClose: () => void
  candidates: Candidate[]
  planId: string
  aiCreditsRemaining: number
  subscriptionTier: string
}

export function CompareModal({
  open,
  onClose,
  candidates,
  planId,
  aiCreditsRemaining,
  subscriptionTier,
}: CompareModalProps) {
  const [columnData, setColumnData] = useState<CandidateData[]>([])
  const [loading, setLoading] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fetch rubric scores and lease terms when opening
  useEffect(() => {
    if (!open || candidates.length === 0) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const supabase = createClient()
        const ids = candidates.map(c => c.id)

        const [{ data: scoreRows }, { data: leaseRows }] = await Promise.all([
          supabase
            .from('location_rubric_scores')
            .select('candidate_id, factor_key, score_1_5, notes')
            .in('candidate_id', ids),
          supabase
            .from('location_lease_terms')
            .select('candidate_id, base_rent_cents, rent_escalation_pct, term_months, options_text')
            .in('candidate_id', ids),
        ])

        if (cancelled) return

        const data: CandidateData[] = candidates.map(candidate => {
          const { strengths, weaknesses } = computeStrengthsWeaknesses(
            candidate.id,
            (scoreRows ?? []) as ScoreRow[]
          )
          const leaseRow = (leaseRows ?? []).find(r => r.candidate_id === candidate.id) as
            | LeaseRow
            | undefined

          return {
            candidate,
            strengths,
            weaknesses,
            rentPerSqFt: computeRentPerSqFt(candidate),
            leaseTermSummary: buildLeaseTermSummary(leaseRow),
          }
        })

        setColumnData(data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [open, candidates])

  // Sync dots with scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setActiveIdx(Math.min(Math.max(0, idx), candidates.length - 1))
  }, [candidates.length])

  function scrollTo(idx: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' })
    setActiveIdx(idx)
  }

  // Trap Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !copilotOpen) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, copilotOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const copilotPrompt = buildCopilotPrompt(candidates)
  const gridCols =
    candidates.length === 1
      ? 'lg:grid-cols-1'
      : candidates.length === 2
      ? 'lg:grid-cols-2'
      : 'lg:grid-cols-3'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={() => { if (!copilotOpen) onClose() }}
        aria-hidden
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal
        aria-label="Compare locations"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-background shadow-2xl lg:inset-x-auto lg:inset-y-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-[min(92vw,1200px)] lg:max-h-[88vh] lg:rounded-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#efefef] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Compare Locations</h2>
            <p className="text-xs text-[#888]">
              {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} · side-by-side
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCopilotOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#155e63]/10 px-3 py-1.5 text-xs font-medium text-[#155e63] transition-colors hover:bg-[#155e63]/20"
            >
              <MessageSquare className="size-3.5" />
              Ask Co-Pilot to compare
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close compare"
              className="flex size-8 items-center justify-center rounded-lg bg-[#f7f6f3] text-[#888] hover:bg-[#f7f6f3]/80 hover:text-[#1a1a1a] transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#888]">
              Loading comparison…
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#888]">
              No candidates to compare.
            </div>
          ) : (
            <>
              {/* ── Desktop: grid ── */}
              <div className={cn('hidden lg:grid gap-4 p-5', gridCols)}>
                {columnData.map(d => (
                  <CandidateColumn key={d.candidate.id} data={d} />
                ))}
              </div>

              {/* ── Mobile: scroll-snap swipeable ── */}
              <div className="lg:hidden flex flex-col">
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                  } as React.CSSProperties}
                >
                  {columnData.map(d => (
                    <div
                      key={d.candidate.id}
                      className="w-full shrink-0 snap-center px-4 py-4"
                    >
                      <CandidateColumn data={d} />
                    </div>
                  ))}
                </div>

                {/* Dots + prev/next */}
                {candidates.length > 1 && (
                  <div className="flex shrink-0 items-center justify-center gap-3 px-4 pb-4 pt-1">
                    <button
                      type="button"
                      onClick={() => scrollTo(Math.max(0, activeIdx - 1))}
                      disabled={activeIdx === 0}
                      aria-label="Previous candidate"
                      className="flex size-7 items-center justify-center rounded-full border border-[#efefef] text-[#888] disabled:opacity-30 hover:bg-[#f7f6f3] transition-colors"
                    >
                      <ChevronLeft className="size-4" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      {candidates.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => scrollTo(i)}
                          aria-label={`Go to candidate ${i + 1}`}
                          className={cn(
                            'rounded-full transition-all',
                            i === activeIdx
                              ? 'w-4 h-2 bg-[#155e63]'
                              : 'size-2 bg-[#f7f6f3]-foreground/30 hover:bg-[#f7f6f3]-foreground/50'
                          )}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => scrollTo(Math.min(candidates.length - 1, activeIdx + 1))}
                      disabled={activeIdx === candidates.length - 1}
                      aria-label="Next candidate"
                      className="flex size-7 items-center justify-center rounded-full border border-[#efefef] text-[#888] disabled:opacity-30 hover:bg-[#f7f6f3] transition-colors"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* CoPilot drawer */}
      <CompareCoPilotDrawer
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        planId={planId}
        aiCreditsRemaining={aiCreditsRemaining}
        subscriptionTier={subscriptionTier}
        initialPrompt={copilotPrompt}
      />
    </>
  )
}
