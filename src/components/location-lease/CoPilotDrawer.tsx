// TIM-1115: Co-Pilot drawer for the Location & Lease workspace (extracted from CandidateListCard).
'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { COPILOT_NAME } from '@/lib/copilot/branding'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export interface CoPilotDrawerProps {
  open: boolean
  onClose: () => void
  planId: string
  aiCreditsRemaining: number
  subscriptionTier: string
}

export function CoPilotDrawer({
  open,
  onClose,
  planId,
  aiCreditsRemaining,
  subscriptionTier,
}: CoPilotDrawerProps) {
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
            } else if (
              payload.code === 'error' ||
              payload.code === 'quota' ||
              payload.code === 'paywall'
            ) {
              setError((payload.message as string) ?? `${COPILOT_NAME} error. Please try again.`)
            } else if ('threadId' in payload) {
              setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
              setStreamText('')
            }
          } catch {
            // ignore malformed SSE data
          }
        }
      }

      if (accumulated) {
        setMessages((prev) => {
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
      <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-96 bg-white shadow-2xl flex flex-col border-l border-[var(--border)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <p className="text-sm font-semibold text-foreground">{COPILOT_NAME}</p>
            <p className="text-xs text-[var(--neutral-cool-600)]">Location &amp; Lease workspace</p>
          </div>
          <div className="flex items-center gap-3">
            {subscriptionTier === 'pro' ? (
              <span className="text-xs text-emerald-600 font-medium">500 credits/mo</span>
            ) : (
              <span
                className={cn(
                  'text-xs font-medium',
                  aiCreditsRemaining <= 10 && aiCreditsRemaining > 0
                    ? 'text-amber-500'
                    : 'text-[var(--neutral-cool-600)]'
                )}
              >
                {aiCreditsRemaining} credits
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-lg bg-[var(--surface-warm-50)] hover:bg-[var(--surface-warm-50)]/80 transition-colors"
              aria-label={`Close ${COPILOT_NAME}`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="text-center py-8">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-[var(--teal)]/10">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--teal)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
                  <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                  <line x1="6" x2="6" y1="2" y2="4" />
                  <line x1="10" x2="10" y1="2" y2="4" />
                  <line x1="14" x2="14" y1="2" y2="4" />
                </svg>
              </div>
              <p className="text-sm font-medium text-foreground mb-1">{COPILOT_NAME} is ready</p>
              <p className="text-xs text-[var(--neutral-cool-600)] leading-relaxed">
                Ask about any of your shortlisted locations, lease terms, or site selection strategy.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-[var(--teal)] text-white rounded-br-sm'
                    : 'bg-[var(--surface-warm-50)] text-foreground rounded-bl-sm'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && streamText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-[var(--surface-warm-50)] px-4 py-3 text-sm leading-relaxed text-foreground">
                {streamText}
              </div>
            </div>
          )}

          {loading && !streamText && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-[var(--surface-warm-50)] px-4 py-3">
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <div
                      key={delay}
                      className="size-2 rounded-full bg-[var(--neutral-cool-600)]/60 animate-bounce"
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

        <div className="border-t border-[var(--border)] px-4 py-4">
          {subscriptionTier === 'free' ? (
            <p className="text-center text-xs text-[var(--neutral-cool-600)]">
              {COPILOT_NAME} requires a paid plan.{' '}
              <a href="/pricing" className="text-[var(--teal)] underline">
                Upgrade →
              </a>
            </p>
          ) : aiCreditsRemaining === 0 ? (
            <p className="text-center text-xs text-[var(--neutral-cool-600)]">
              You&apos;re out of credits for this month.{' '}
              <a href="/pricing" className="text-[var(--teal)] underline">
                Upgrade for more messages →
              </a>
            </p>
          ) : (
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                rows={2}
                placeholder="Ask about your shortlisted locations…"
                className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--neutral-cool-600)]/50 outline-none focus-visible:border-[var(--teal)] focus-visible:ring-2 focus-visible:ring-[var(--teal)]/30"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="shrink-0 rounded-xl bg-[var(--teal)] px-3 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
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
