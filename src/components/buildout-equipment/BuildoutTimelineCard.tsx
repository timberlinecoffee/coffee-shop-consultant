'use client'

// TIM-722: Build-out timeline CRUD card.
// Target open date at top; reorder (↑/↓), add custom, delete, completed checkbox, notes.

import { useCallback } from 'react'
import { useBuildoutDocument } from './useBuildoutDocument'
import { newMilestone } from '@/lib/buildout/seedDefaults'
import type { Milestone } from '@/lib/buildout/seedDefaults'
import { Button } from '@/components/ui/button'

export function BuildoutTimelineCard() {
  const { status, data: timeline, save } = useBuildoutDocument('timeline')

  const updateOpenDate = useCallback((date: string) => {
    save({ ...timeline, target_open_date: date || null })
  }, [timeline, save])

  const updateMilestone = useCallback(<K extends keyof Milestone>(id: string, field: K, value: Milestone[K]) => {
    const next = timeline.milestones.map((m) => m.id === id ? { ...m, [field]: value } : m)
    save({ ...timeline, milestones: next })
  }, [timeline, save])

  const moveMilestone = useCallback((id: string, direction: -1 | 1) => {
    const items = [...timeline.milestones]
    const idx = items.findIndex((m) => m.id === id)
    if (idx < 0) return
    const target = idx + direction
    if (target < 0 || target >= items.length) return
    ;[items[idx], items[target]] = [items[target], items[idx]]
    const reindexed = items.map((m, i) => ({ ...m, position: i }))
    save({ ...timeline, milestones: reindexed })
  }, [timeline, save])

  const addMilestone = useCallback(() => {
    const next = newMilestone('New milestone', 'custom', timeline.milestones.length)
    save({ ...timeline, milestones: [...timeline.milestones, next] })
  }, [timeline, save])

  const removeMilestone = useCallback((id: string) => {
    const next = timeline.milestones.filter((m) => m.id !== id).map((m, i) => ({ ...m, position: i }))
    save({ ...timeline, milestones: next })
  }, [timeline, save])

  const completedCount = timeline.milestones.filter((m) => m.completed).length
  const totalCount = timeline.milestones.length

  const statusBadge = {
    idle: null,
    loading: <span className="text-xs text-neutral-400">Loading…</span>,
    saving: <span className="text-xs text-neutral-400">Saving…</span>,
    saved: <span className="text-xs text-emerald-600">Saved</span>,
    error: <span className="text-xs text-red-500">Save failed</span>,
    paywall: <span className="text-xs text-amber-600">Subscription required</span>,
  }[status]

  return (
    <section className="bg-white rounded-2xl border border-[#efefef] p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-base text-[#1a1a1a]">Build-out Timeline</h2>
        <div className="flex items-center gap-3">
          {statusBadge}
          {totalCount > 0 && (
            <span className="text-xs text-neutral-400">{completedCount}/{totalCount} done</span>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs text-neutral-500 mb-1">Target open date</label>
        <input
          type="date"
          value={timeline.target_open_date ?? ''}
          onChange={(e) => updateOpenDate(e.target.value)}
          className="text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
        />
      </div>

      <div className="space-y-2">
        {timeline.milestones.length === 0 ? (
          <p className="text-sm text-neutral-400 py-4 text-center">
            No milestones yet. Click <strong>+ Add milestone</strong> to build your timeline.
          </p>
        ) : (
          timeline.milestones.map((m, idx) => (
            <div key={m.id} className="flex items-start gap-3 border border-neutral-100 rounded-xl p-3">
              <input
                type="checkbox"
                checked={m.completed}
                onChange={(e) => updateMilestone(m.id, 'completed', e.target.checked)}
                className="mt-0.5 rounded accent-[#155e63]"
                aria-label={`Mark "${m.label}" complete`}
              />
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  type="text"
                  value={m.label}
                  onChange={(e) => updateMilestone(m.id, 'label', e.target.value)}
                  className={[
                    'w-full text-sm font-medium border border-transparent hover:border-neutral-200 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30',
                    m.completed ? 'line-through text-neutral-400' : 'text-[#1a1a1a]',
                  ].join(' ')}
                />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <label className="text-xs text-neutral-400">Target:</label>
                    <input
                      type="date"
                      value={m.target_date ?? ''}
                      onChange={(e) => updateMilestone(m.id, 'target_date', e.target.value || null)}
                      className="text-xs border border-neutral-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#155e63]/30"
                    />
                  </div>
                  <input
                    type="text"
                    value={m.notes ?? ''}
                    onChange={(e) => updateMilestone(m.id, 'notes', e.target.value || null)}
                    placeholder="Notes…"
                    className="flex-1 text-xs border border-transparent hover:border-neutral-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#155e63]/30 text-neutral-500"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1 items-center shrink-0">
                <button
                  type="button"
                  onClick={() => moveMilestone(m.id, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="p-0.5 rounded text-neutral-300 hover:text-neutral-600 disabled:opacity-20 transition-colors"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveMilestone(m.id, 1)}
                  disabled={idx === timeline.milestones.length - 1}
                  aria-label="Move down"
                  className="p-0.5 rounded text-neutral-300 hover:text-neutral-600 disabled:opacity-20 transition-colors"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeMilestone(m.id)}
                  aria-label="Remove milestone"
                  className="p-0.5 rounded text-neutral-200 hover:text-red-400 transition-colors text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Button variant="outline" size="sm" onClick={addMilestone}>
        + Add milestone
      </Button>
    </section>
  )
}
