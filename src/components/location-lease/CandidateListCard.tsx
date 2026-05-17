// TIM-777 / TIM-620-C: Candidate list with inline editors, status pills, and CoPilot drawer.
'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Archive, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────────────────

export type CandidateStatus =
  | 'shortlisted'
  | 'viewing_scheduled'
  | 'lease_review'
  | 'passed'
  | 'signed'

export type Candidate = {
  id: string
  name: string
  address: string | null
  neighborhood: string | null
  sq_ft: number | null
  asking_rent_cents: number | null
  cam_cents: number | null
  listing_url: string | null
  broker_contact: string | null
  status: CandidateStatus
  notes: string | null
  position: number
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

// ── Status config ──────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── InlineInput ────────────────────────────────────────────────────────────

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
    'w-full bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-0'

  const wrapCls =
    'flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 transition-colors hover:border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30'

  if (multiline) {
    return (
      <div className={wrapCls}>
        <textarea
          value={local}
          onChange={e => setLocal(e.target.value)}
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
      {prefix && <span className="shrink-0 text-sm text-muted-foreground">{prefix}</span>}
      <input
        type={type}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cls}
      />
      {suffix && <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  )
}

// ── StatusPillSelector ─────────────────────────────────────────────────────

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
        onClick={() => setOpen(p => !p)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-80',
          cfg.className
        )}
      >
        {cfg.label}
        <ChevronDown className="size-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 rounded-xl border bg-card shadow-lg py-1 min-w-[150px]">
          {STATUS_ORDER.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors',
                s === status && 'font-semibold'
              )}
            >
              <span className={cn('rounded-full border px-2 py-0.5', STATUS_CONFIG[s].className)}>
                {STATUS_CONFIG[s].label}
              </span>
              {s === status && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── FieldLabel ─────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{children}</span>
}

// ── CandidateRow ──────────────────────────────────────────────────────────

function CandidateRow({
  candidate,
  saving,
  onPatch,
  onArchive,
}: {
  candidate: Candidate
  saving: boolean
  onPatch: (id: string, patch: Partial<Omit<Candidate, 'id' | 'position'>>) => void
  onArchive: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  function commitText(field: keyof Candidate, raw: string) {
    const v = raw.trim() || null
    onPatch(candidate.id, { [field]: v } as Partial<Candidate>)
  }

  function commitCents(field: 'asking_rent_cents' | 'cam_cents', raw: string) {
    onPatch(candidate.id, { [field]: displayToCents(raw) })
  }

  function commitSqFt(raw: string) {
    const n = parseInt(raw, 10)
    onPatch(candidate.id, { sq_ft: isNaN(n) ? null : n })
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* ── Summary row (always visible) ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Name — inline editable */}
        <div className="flex-1 min-w-0">
          <InlineInput
            value={candidate.name}
            placeholder="Location name"
            onCommit={v => onPatch(candidate.id, { name: v || 'Untitled' })}
          />
        </div>

        <StatusPillSelector
          status={candidate.status}
          onChange={s => onPatch(candidate.id, { status: s })}
        />

        {saving && (
          <span className="shrink-0 text-[10px] italic text-muted-foreground">saving…</span>
        )}

        <button
          type="button"
          onClick={() => setExpanded(p => !p)}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
          className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        <button
          type="button"
          onClick={() => onArchive(candidate.id)}
          aria-label="Archive candidate"
          title="Archive this location"
          className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Archive className="size-4" />
        </button>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Address */}
          <div className="sm:col-span-2 flex flex-col gap-1">
            <FieldLabel>Address</FieldLabel>
            <InlineInput
              value={candidate.address ?? ''}
              placeholder="Street address"
              onCommit={v => commitText('address', v)}
            />
          </div>

          {/* Neighborhood */}
          <div className="flex flex-col gap-1">
            <FieldLabel>Neighborhood</FieldLabel>
            <InlineInput
              value={candidate.neighborhood ?? ''}
              placeholder="e.g. Downtown, Mission District"
              onCommit={v => commitText('neighborhood', v)}
            />
          </div>

          {/* Sq Ft */}
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

          {/* Asking Rent */}
          <div className="flex flex-col gap-1">
            <FieldLabel>Asking Rent / Mo</FieldLabel>
            <InlineInput
              value={centsToDisplay(candidate.asking_rent_cents)}
              placeholder="0.00"
              prefix="$"
              onCommit={v => commitCents('asking_rent_cents', v)}
            />
          </div>

          {/* CAM */}
          <div className="flex flex-col gap-1">
            <FieldLabel>CAM / Mo</FieldLabel>
            <InlineInput
              value={centsToDisplay(candidate.cam_cents)}
              placeholder="0.00"
              prefix="$"
              onCommit={v => commitCents('cam_cents', v)}
            />
          </div>

          {/* Listing URL */}
          <div className="flex flex-col gap-1">
            <FieldLabel>Listing URL</FieldLabel>
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <InlineInput
                  value={candidate.listing_url ?? ''}
                  placeholder="https://…"
                  onCommit={v => commitText('listing_url', v)}
                />
              </div>
              {candidate.listing_url && (
                <a
                  href={candidate.listing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Open listing"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Broker contact */}
          <div className="flex flex-col gap-1">
            <FieldLabel>Broker Contact</FieldLabel>
            <InlineInput
              value={candidate.broker_contact ?? ''}
              placeholder="Name, phone or email"
              onCommit={v => commitText('broker_contact', v)}
            />
          </div>

          {/* Notes — full width */}
          <div className="sm:col-span-2 flex flex-col gap-1">
            <FieldLabel>Notes</FieldLabel>
            <InlineInput
              value={candidate.notes ?? ''}
              placeholder="Pro/cons, impressions, follow-up items…"
              multiline
              onCommit={v => commitText('notes', v)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── CoPilotDrawer ──────────────────────────────────────────────────────────

function CoPilotDrawer({
  open,
  onClose,
  planId,
  aiCreditsRemaining,
  subscriptionTier,
}: {
  open: boolean
  onClose: () => void
  planId: string
  aiCreditsRemaining: number
  subscriptionTier: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText, open])

  const canUse = subscriptionTier !== 'free' && aiCreditsRemaining > 0

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !canUse) return

    const userMsg: ChatMessage = { role: 'user', content: input.trim() }
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
            } else if (payload.code === 'error' || payload.code === 'quota' || payload.code === 'paywall') {
              setError((payload.message as string) ?? 'Co-pilot error. Please try again.')
            } else if ('threadId' in payload) {
              // done event — finalise
              setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
              setStreamText('')
            }
          } catch {
            // ignore malformed SSE data
          }
        }
      }

      if (accumulated && !messages.some(m => m.content === accumulated)) {
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
  }, [input, loading, canUse, messages, planId])

  if (!open) return null

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 lg:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-96 bg-card shadow-2xl flex flex-col border-l border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">Co-Pilot</p>
            <p className="text-xs text-muted-foreground">Location &amp; Lease workspace</p>
          </div>
          <div className="flex items-center gap-3">
            {subscriptionTier === 'pro' ? (
              <span className="text-xs text-emerald-600 font-medium">Unlimited</span>
            ) : (
              <span className={cn('text-xs font-medium', aiCreditsRemaining <= 10 && aiCreditsRemaining > 0 ? 'text-amber-500' : 'text-muted-foreground')}>
                {aiCreditsRemaining} credits
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              aria-label="Close co-pilot"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="text-center py-8">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#155e63]/10">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#155e63" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                  <line x1="6" x2="6" y1="2" y2="4" /><line x1="10" x2="10" y1="2" y2="4" /><line x1="14" x2="14" y1="2" y2="4" />
                </svg>
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Your co-pilot is ready</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Ask about any of your shortlisted locations, lease terms, or site selection strategy.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-[#155e63] text-white rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              )}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Streaming partial */}
          {loading && streamText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
                {streamText}
              </div>
            </div>
          )}

          {loading && !streamText && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                <div className="flex gap-1">
                  {[0, 150, 300].map(delay => (
                    <div key={delay} className="size-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-center text-xs text-destructive px-2">{error}</p>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-4">
          {subscriptionTier === 'free' ? (
            <p className="text-center text-xs text-muted-foreground">
              AI co-pilot requires a paid plan.{' '}
              <a href="/account" className="text-[#155e63] underline">Upgrade →</a>
            </p>
          ) : aiCreditsRemaining === 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              You&apos;re out of credits for this month.{' '}
              <a href="/account" className="text-[#155e63] underline">Upgrade for unlimited →</a>
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
                rows={2}
                placeholder="Ask about your shortlisted locations…"
                className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <button
                type="button"
                onClick={sendMessage}
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

// ── CandidateListCard (main export) ───────────────────────────────────────

export interface CandidateListCardProps {
  initialCandidates: Candidate[]
  planId: string
  aiCreditsRemaining: number
  subscriptionTier: string
}

export function CandidateListCard({
  initialCandidates,
  planId,
  aiCreditsRemaining,
  subscriptionTier,
}: CandidateListCardProps) {
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates)
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ── Add candidate ────────────────────────────────────────────────────────

  async function handleAdd() {
    setAdding(true)
    try {
      const res = await fetch('/api/workspaces/location-lease/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Location',
          position: candidates.length,
        }),
      })
      if (!res.ok) return
      const newCandidate: Candidate = await res.json()
      setCandidates(prev => [...prev, newCandidate])
    } finally {
      setAdding(false)
    }
  }

  // ── Archive candidate ────────────────────────────────────────────────────

  async function handleArchive(id: string) {
    // Optimistic remove
    const prev = candidates
    setCandidates(c => c.filter(x => x.id !== id))

    const res = await fetch(`/api/workspaces/location-lease/candidates/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      // Revert
      setCandidates(prev)
    }
  }

  // ── Patch candidate ──────────────────────────────────────────────────────

  const handlePatch = useCallback(async (
    id: string,
    patch: Partial<Omit<Candidate, 'id' | 'position'>>
  ) => {
    const snapshot = candidates
    // Optimistic update
    setCandidates(prev =>
      prev.map(c => c.id === id ? { ...c, ...patch } : c)
    )

    setSaving(s => ({ ...s, [id]: true }))

    try {
      const res = await fetch(`/api/workspaces/location-lease/candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        setCandidates(snapshot)
      }
    } finally {
      setSaving(s => ({ ...s, [id]: false }))
    }
  }, [candidates])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Location Shortlist</CardTitle>
          <CardAction>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDrawerOpen(p => !p)}
                className={cn(drawerOpen && 'bg-[#155e63] text-white hover:bg-[#155e63]/90')}
                aria-label="Toggle Co-Pilot"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                  <line x1="6" x2="6" y1="2" y2="4" /><line x1="10" x2="10" y1="2" y2="4" /><line x1="14" x2="14" y1="2" y2="4" />
                </svg>
                <span className="hidden sm:inline ml-1">Co-Pilot</span>
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={adding}
                aria-label="Add candidate"
              >
                <Plus className="size-3.5" />
                <span className="hidden sm:inline ml-1">Add location</span>
              </Button>
            </div>
          </CardAction>
        </CardHeader>

        <CardContent className="pt-4">
          {candidates.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground mb-3">No locations yet.</p>
              <Button size="sm" onClick={handleAdd} disabled={adding}>
                <Plus className="size-3.5 mr-1" />
                Add your first location
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {candidates
                .slice()
                .sort((a, b) => a.position - b.position)
                .map(candidate => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    saving={!!saving[candidate.id]}
                    onPatch={handlePatch}
                    onArchive={handleArchive}
                  />
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CoPilot drawer — mounted at card root, not inside candidate rows */}
      <CoPilotDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        planId={planId}
        aiCreditsRemaining={aiCreditsRemaining}
        subscriptionTier={subscriptionTier}
      />
    </>
  )
}
