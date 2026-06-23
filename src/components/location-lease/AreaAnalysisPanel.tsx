// TIM-1145: AI area analysis panel — surfaces nearby businesses + city
// context to Claude so the founder gets a real read on the actual block
// once they've picked an address from autocomplete.

'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, AlertCircle, MapPin } from 'lucide-react'
import { useAIReviewModal } from '@/hooks/useAIReviewModal'

export function AreaAnalysisPanel({
  candidateId,
  hasCoords,
  initialText,
  initialAt,
  canUse,
  subscriptionTier,
  aiCreditsRemaining,
}: {
  candidateId: string
  hasCoords: boolean
  initialText: string | null
  initialAt: string | null
  canUse: boolean
  subscriptionTier: string
  aiCreditsRemaining: number
}) {
  const [text, setText] = useState(initialText ?? '')
  const [generatedAt, setGeneratedAt] = useState(initialAt ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal()

  async function run() {
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch(
        `/api/workspaces/location-lease/candidates/${candidateId}/area-analysis`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      )
      const data = (await res.json()) as { text?: string; generatedAt?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Area analysis failed.')
        return
      }
      const proposedText = data.text ?? ''
      const proposedAt = data.generatedAt ?? new Date().toISOString()
      // TIM-2924 Shape B fix: route through review modal so the user can edit
      // before the analysis is persisted. onApply calls PATCH /candidates/{id}.
      openAIReviewModal({
        suggestions: [
          {
            id: `area-analysis-${candidateId}`,
            fieldId: 'area_analysis',
            fieldLabel: 'Area Analysis',
            originalValue: text,
            proposedValue: proposedText,
            isStructured: false,
          },
        ],
        context: { workspace: 'Location & Lease', section: 'Area Analysis' },
        onApply: async (accepted) => {
          const finalText = accepted[0].finalValue
          const patchRes = await fetch(
            `/api/workspaces/location-lease/candidates/${candidateId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                area_analysis: finalText,
                area_analysis_at: proposedAt,
              }),
            },
          )
          if (!patchRes.ok) throw new Error('Failed to save area analysis')
          setText(finalText)
          setGeneratedAt(proposedAt)
        },
      })
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!hasCoords) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)]/40 px-3 py-3 text-center">
        <MapPin className="mx-auto mb-1 size-4 text-[var(--neutral-cool-600)]/60" aria-hidden="true" />
        <p className="text-xs text-[var(--neutral-cool-600)]">
          Pick an address from the autocomplete above. Then we can pull what is
          actually around this block and have the AI read the neighborhood for you.
        </p>
      </div>
    )
  }

  if (!canUse) {
    return (
      <div className="rounded-xl border border-[var(--border)] px-3 py-3 text-center">
        <p className="text-xs text-[var(--neutral-cool-600)]">
          {subscriptionTier === 'free' ? (
            <>
              Area analysis requires a paid plan.{' '}
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
            'Area analysis unavailable.'
          )}
        </p>
      </div>
    )
  }

  return (
    <>
      {AIReviewModalNode}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
              Area Analysis
            </h4>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--neutral-cool-600)]">
              We pull nearby businesses, transit stops, and parking from OpenStreetMap,
              then ask the AI to read the block for your concept.
            </p>
          </div>
          <Button size="sm" onClick={run} disabled={loading} className="shrink-0">
            <Sparkles className="mr-1.5 size-3.5" />
            {loading ? 'Analyzing…' : text ? 'Refresh' : 'Analyze The Area'}
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden="true" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {text && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-warm-50)]/40 px-4 py-4">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>
            {generatedAt && (
              <p className="mt-3 text-[10px] italic text-[var(--neutral-cool-600)]">
                Generated {formatWhen(generatedAt)}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}
