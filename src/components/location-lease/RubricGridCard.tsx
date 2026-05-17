// TIM-778: RubricGridCard — 6-factor × N-candidates rubric with weighted totals.
// Scores PUT to /api/workspaces/location-lease/candidates/{id}/scores (debounced 800ms).
// Weights stored in workspace_documents.content.rubric_weights (location_lease key).
'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Settings2 } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from '@/components/ui/card'

type FactorKey =
  | 'foot_traffic'
  | 'parking_transit'
  | 'visibility'
  | 'neighborhood_fit'
  | 'buildout_cost_estimate'
  | 'lease_terms'

const FACTORS: { key: FactorKey; label: string }[] = [
  { key: 'foot_traffic', label: 'Foot Traffic' },
  { key: 'parking_transit', label: 'Parking / Transit' },
  { key: 'visibility', label: 'Visibility' },
  { key: 'neighborhood_fit', label: 'Neighborhood Fit' },
  { key: 'buildout_cost_estimate', label: 'Buildout Cost' },
  { key: 'lease_terms', label: 'Lease Terms' },
]

const DEFAULT_WEIGHTS: Record<FactorKey, number> = {
  foot_traffic: 1,
  parking_transit: 1,
  visibility: 1,
  neighborhood_fit: 1,
  buildout_cost_estimate: 1,
  lease_terms: 1,
}

type Candidate = {
  id: string
  name: string
  status: string
}

type ScoreCell = {
  score: number | null
  notes: string
}

type ScoreMap = Record<string, Partial<Record<FactorKey, ScoreCell>>>

function computeWeightedTotal(
  candidateId: string,
  scores: ScoreMap,
  weights: Record<FactorKey, number>
): string {
  let weightedSum = 0
  let totalWeight = 0
  for (const factor of FACTORS) {
    const cell = scores[candidateId]?.[factor.key]
    const w = weights[factor.key] ?? 1
    if (cell?.score != null && w > 0) {
      weightedSum += w * cell.score
      totalWeight += w
    }
  }
  if (totalWeight === 0) return '—'
  return (weightedSum / totalWeight).toFixed(1) + ' / 5'
}

export function RubricGridCard() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [scores, setScores] = useState<ScoreMap>({})
  const [weights, setWeights] = useState<Record<FactorKey, number>>(DEFAULT_WEIGHTS)
  const [weightPopoverOpen, setWeightPopoverOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const [candidateRes, docRes] = await Promise.all([
          fetch('/api/workspaces/location-lease/candidates'),
          fetch('/api/workspaces/location_lease'),
        ])

        if (!candidateRes.ok) {
          setError('Failed to load candidates.')
          return
        }

        const candidatesData: Candidate[] = await candidateRes.json()
        setCandidates(candidatesData)

        if (docRes.ok) {
          const doc = await docRes.json()
          if (doc?.content?.rubric_weights) {
            setWeights(prev => ({ ...prev, ...doc.content.rubric_weights }))
          }
        }

        if (candidatesData.length > 0) {
          const supabase = createClient()
          const { data: scoreRows } = await supabase
            .from('location_rubric_scores')
            .select('*')
            .in('candidate_id', candidatesData.map(c => c.id))

          if (scoreRows) {
            const map: ScoreMap = {}
            for (const row of scoreRows) {
              if (!map[row.candidate_id]) map[row.candidate_id] = {}
              map[row.candidate_id][row.factor_key as FactorKey] = {
                score: row.score_1_5,
                notes: row.notes ?? '',
              }
            }
            setScores(map)
          }
        }
      } catch {
        setError('Failed to load rubric data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Close popover on outside click
  useEffect(() => {
    if (!weightPopoverOpen) return
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        popoverTriggerRef.current &&
        !popoverTriggerRef.current.contains(e.target as Node)
      ) {
        setWeightPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [weightPopoverOpen])

  const persistScores = useCallback(
    (candidateId: string, candidateScores: Partial<Record<FactorKey, ScoreCell>>) => {
      const existing = debounceTimers.current[candidateId]
      if (existing) clearTimeout(existing)
      debounceTimers.current[candidateId] = setTimeout(async () => {
        setSaving(prev => ({ ...prev, [candidateId]: true }))
        const payload = FACTORS.map(f => ({
          factor_key: f.key,
          score_1_5: candidateScores[f.key]?.score ?? null,
          notes: candidateScores[f.key]?.notes ?? null,
        }))
        await fetch(
          `/api/workspaces/location-lease/candidates/${candidateId}/scores`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scores: payload }),
          }
        )
        setSaving(prev => ({ ...prev, [candidateId]: false }))
      }, 800)
    },
    []
  )

  const persistWeights = useCallback((newWeights: Record<FactorKey, number>) => {
    const existing = debounceTimers.current['__weights__']
    if (existing) clearTimeout(existing)
    debounceTimers.current['__weights__'] = setTimeout(async () => {
      const docRes = await fetch('/api/workspaces/location_lease')
      const doc = docRes.ok ? await docRes.json() : { content: null }
      await fetch('/api/workspaces/location_lease', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { ...(doc?.content ?? {}), rubric_weights: newWeights },
        }),
      })
    }, 800)
  }, [])

  const handleScoreChange = useCallback(
    (candidateId: string, factorKey: FactorKey, clicked: number) => {
      setScores(prev => {
        const candidateScores = { ...(prev[candidateId] ?? {}) }
        const current = candidateScores[factorKey]
        candidateScores[factorKey] = {
          score: current?.score === clicked ? null : clicked,
          notes: current?.notes ?? '',
        }
        const next = { ...prev, [candidateId]: candidateScores }
        persistScores(candidateId, candidateScores)
        return next
      })
    },
    [persistScores]
  )

  const handleNotesChange = useCallback(
    (candidateId: string, factorKey: FactorKey, notes: string) => {
      setScores(prev => {
        const candidateScores = { ...(prev[candidateId] ?? {}) }
        candidateScores[factorKey] = {
          score: candidateScores[factorKey]?.score ?? null,
          notes,
        }
        const next = { ...prev, [candidateId]: candidateScores }
        persistScores(candidateId, candidateScores)
        return next
      })
    },
    [persistScores]
  )

  const handleWeightChange = useCallback(
    (factorKey: FactorKey, rawValue: string) => {
      const parsed = parseFloat(rawValue)
      const value = isNaN(parsed) || parsed < 0 ? 0 : Math.min(parsed, 10)
      setWeights(prev => {
        const next = { ...prev, [factorKey]: value }
        persistWeights(next)
        return next
      })
    },
    [persistWeights]
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading rubric…
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (candidates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Location Rubric</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add candidates to your shortlist to start scoring.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle>Location Rubric</CardTitle>
        <CardAction>
          <div className="relative">
            <button
              ref={popoverTriggerRef}
              type="button"
              onClick={() => setWeightPopoverOpen(prev => !prev)}
              aria-expanded={weightPopoverOpen}
              aria-haspopup="dialog"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                weightPopoverOpen
                  ? 'border-border bg-muted text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Settings2 className="size-3.5" />
              Weights
            </button>

            {weightPopoverOpen && (
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Factor weights"
                className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border bg-card shadow-lg p-3"
              >
                <p className="text-xs font-semibold mb-1 text-foreground">
                  Factor Weights
                </p>
                <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                  Higher weight = more impact on weighted total.
                </p>
                {FACTORS.map(f => (
                  <div key={f.key} className="flex items-center gap-2 mb-2">
                    <label
                      htmlFor={`weight-${f.key}`}
                      className="text-xs text-muted-foreground flex-1 min-w-0 truncate"
                    >
                      {f.label}
                    </label>
                    <input
                      id={`weight-${f.key}`}
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={weights[f.key]}
                      onChange={e => handleWeightChange(f.key, e.target.value)}
                      className="w-14 text-xs rounded border border-border bg-background px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="p-0">
        {/* Horizontal scroll container; first column is sticky */}
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `160px repeat(${candidates.length}, minmax(200px, 1fr))`,
            }}
          >
            {/* ── Header row ── */}
            <div className="sticky left-0 z-20 bg-card border-b border-r px-3 py-2" />
            {candidates.map(candidate => (
              <div key={candidate.id} className="border-b border-r px-3 py-2 min-h-[40px]">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold truncate flex-1 leading-tight">
                    {candidate.name}
                  </span>
                  {saving[candidate.id] && (
                    <span className="shrink-0 text-[10px] text-muted-foreground italic">
                      saving…
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* ── Factor rows ── */}
            {FACTORS.map(factor => (
              <React.Fragment key={factor.key}>
                {/* Sticky factor label */}
                <div className="sticky left-0 z-10 bg-card border-b border-r px-3 py-3 flex items-start">
                  <span className="text-xs font-medium leading-tight">{factor.label}</span>
                </div>

                {/* Score cells */}
                {candidates.map(candidate => {
                  const cell = scores[candidate.id]?.[factor.key]
                  return (
                    <div
                      key={candidate.id}
                      className="border-b border-r px-3 py-2"
                    >
                      {/* Chip selector 1–5 */}
                      <div className="flex gap-1 mb-2" role="group" aria-label={`${factor.label} score for ${candidate.name}`}>
                        {([1, 2, 3, 4, 5] as const).map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => handleScoreChange(candidate.id, factor.key, n)}
                            aria-label={`${n}`}
                            aria-pressed={cell?.score === n}
                            className={cn(
                              'size-7 rounded text-xs font-semibold transition-colors border',
                              cell?.score === n
                                ? 'bg-[#155e63] text-white border-[#155e63]'
                                : 'bg-background text-muted-foreground border-border hover:border-[#155e63]/60 hover:text-[#155e63]'
                            )}
                          >
                            {n}
                          </button>
                        ))}
                      </div>

                      {/* Notes */}
                      <textarea
                        value={cell?.notes ?? ''}
                        onChange={e =>
                          handleNotesChange(candidate.id, factor.key, e.target.value)
                        }
                        placeholder="Notes…"
                        rows={2}
                        className="w-full text-[11px] leading-relaxed text-muted-foreground bg-transparent resize-none outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>
                  )
                })}
              </React.Fragment>
            ))}

            {/* ── Weighted total footer ── */}
            <div className="sticky left-0 z-10 bg-muted/40 border-r px-3 py-3 flex items-center">
              <span className="text-xs font-semibold">Weighted Total</span>
            </div>
            {candidates.map(candidate => (
              <div
                key={candidate.id}
                className="bg-muted/40 border-r px-3 py-3 flex items-center"
              >
                <span className="text-sm font-bold text-[#155e63]">
                  {computeWeightedTotal(candidate.id, scores, weights)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
