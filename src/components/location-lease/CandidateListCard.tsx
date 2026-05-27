// TIM-1115: Suite landing — list of unified per-location cards with "All / Shortlist"
// tab filter and a dedicated AI trade-off entry point when 2+ shortlisted.
// Per-location info (intake, scorecard, lease terms, AI feedback) lives inside LocationCard.
'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Star, Sparkles, MessageCircle } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LocationCard } from './LocationCard'
import { TradeoffPanel } from './TradeoffPanel'
import { CoPilotDrawer } from './CoPilotDrawer'

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

// ── CandidateListCard ──────────────────────────────────────────────────────

export interface CandidateListCardProps {
  initialCandidates: Candidate[]
  planId: string
  aiCreditsRemaining: number
  subscriptionTier: string
}

type ViewMode = 'all' | 'shortlist'

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
  const [tradeoffOpen, setTradeoffOpen] = useState(false)
  const [view, setView] = useState<ViewMode>('all')

  const shortlisted = useMemo(
    () => candidates.filter((c) => c.status === 'shortlisted'),
    [candidates]
  )

  const visible = useMemo(() => {
    const filtered = view === 'shortlist' ? shortlisted : candidates
    return filtered.slice().sort((a, b) => a.position - b.position)
  }, [view, candidates, shortlisted])

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
          status: view === 'shortlist' ? 'shortlisted' : 'shortlisted',
        }),
      })
      if (!res.ok) return
      const newCandidate: Candidate = await res.json()
      setCandidates((prev) => [...prev, newCandidate])
    } finally {
      setAdding(false)
    }
  }

  // ── Archive candidate ────────────────────────────────────────────────────

  async function handleArchive(id: string) {
    const prev = candidates
    setCandidates((c) => c.filter((x) => x.id !== id))

    const res = await fetch(`/api/workspaces/location-lease/candidates/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      setCandidates(prev)
    }
  }

  // ── Patch candidate ──────────────────────────────────────────────────────

  const handlePatch = useCallback(
    async (id: string, patch: Partial<Omit<Candidate, 'id' | 'position'>>) => {
      const snapshot = candidates
      setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))

      setSaving((s) => ({ ...s, [id]: true }))

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
        setSaving((s) => ({ ...s, [id]: false }))
      }
    },
    [candidates]
  )

  // ── Render ───────────────────────────────────────────────────────────────

  const tradeoffDisabled = shortlisted.length < 2

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Locations</CardTitle>
          <CardAction>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDrawerOpen((p) => !p)}
                className={cn(drawerOpen && 'bg-[#155e63] text-white hover:bg-[#155e63]/90')}
                aria-label="Toggle Co-Pilot"
              >
                <MessageCircle className="size-3.5" />
                <span className="hidden sm:inline ml-1">Co-Pilot</span>
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={adding} aria-label="Add candidate">
                <Plus className="size-3.5" />
                <span className="hidden sm:inline ml-1">Add location</span>
              </Button>
            </div>
          </CardAction>
        </CardHeader>

        <CardContent className="pt-4 flex flex-col gap-4">
          {/* ── Tab / segmented control + tradeoff CTA ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Location filter"
              className="inline-flex items-center rounded-lg border border-[#efefef] p-0.5 bg-[#f7f6f3]/50"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === 'all'}
                onClick={() => setView('all')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  view === 'all'
                    ? 'bg-white shadow-sm text-foreground'
                    : 'text-[#888] hover:text-foreground'
                )}
              >
                All
                <span className="text-[10px] text-[#888]">{candidates.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'shortlist'}
                onClick={() => setView('shortlist')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  view === 'shortlist'
                    ? 'bg-white shadow-sm text-foreground'
                    : 'text-[#888] hover:text-foreground'
                )}
              >
                <Star className={cn('size-3', view === 'shortlist' && 'fill-amber-400 text-amber-500')} />
                Shortlist
                <span className="text-[10px] text-[#888]">{shortlisted.length}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTradeoffOpen(true)}
                disabled={tradeoffDisabled}
                title={
                  tradeoffDisabled
                    ? 'Shortlist 2 or more locations to compare'
                    : 'Generate AI trade-off across shortlisted locations'
                }
              >
                <Sparkles className="size-3.5" />
                <span className="hidden sm:inline ml-1">Compare shortlist</span>
              </Button>
            </div>
          </div>

          {/* ── List ── */}
          {visible.length === 0 ? (
            view === 'shortlist' ? (
              <div className="py-10 text-center">
                <p className="text-sm text-[#888] mb-3">
                  No shortlisted locations yet. Tap the star on a location to add it to your shortlist.
                </p>
                <Button variant="outline" size="sm" onClick={() => setView('all')}>
                  See all locations
                </Button>
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm text-[#888] mb-3">No locations yet.</p>
                <Button size="sm" onClick={handleAdd} disabled={adding}>
                  <Plus className="size-3.5 mr-1" />
                  Add your first location
                </Button>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-3">
              {visible.map((candidate) => (
                <LocationCard
                  key={candidate.id}
                  candidate={candidate}
                  saving={!!saving[candidate.id]}
                  subscriptionTier={subscriptionTier}
                  aiCreditsRemaining={aiCreditsRemaining}
                  onPatch={handlePatch}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Trade-Off panel */}
      <TradeoffPanel
        open={tradeoffOpen}
        onClose={() => setTradeoffOpen(false)}
        candidates={shortlisted}
        subscriptionTier={subscriptionTier}
        aiCreditsRemaining={aiCreditsRemaining}
      />

      {/* CoPilot drawer */}
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
