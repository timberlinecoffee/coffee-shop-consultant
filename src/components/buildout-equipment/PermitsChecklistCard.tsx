'use client'

// TIM-722: Permits checklist CRUD card.
// Jurisdiction picker (city + state_or_region + country defaulting to US).
// Per-row: status select, submitted_on, approved_on, notes.

import { useCallback } from 'react'
import { useBuildoutDocument } from './useBuildoutDocument'
import { newPermit, PERMIT_STATUSES } from '@/lib/buildout/seedDefaults'
import type { PermitItem, PermitStatus, PermitsData } from '@/lib/buildout/seedDefaults'
import { Button } from '@/components/ui/button'

const STATUS_LABELS: Record<PermitStatus, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  approved: 'Approved',
  denied: 'Denied',
  not_applicable: 'N/A',
}

const STATUS_COLORS: Record<PermitStatus, string> = {
  not_started: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-800',
  denied: 'bg-red-100 text-red-700',
  not_applicable: 'bg-neutral-100 text-neutral-500',
}

export function PermitsChecklistCard() {
  const { status: docStatus, data: permits, save } = useBuildoutDocument('permits')

  const updateJurisdiction = useCallback((field: keyof PermitsData['jurisdiction'], value: string) => {
    save({
      ...permits,
      jurisdiction: { ...permits.jurisdiction, [field]: value || null },
    })
  }, [permits, save])

  const updateItem = useCallback(<K extends keyof PermitItem>(id: string, field: K, value: PermitItem[K]) => {
    const next = permits.items.map((p) => p.id === id ? { ...p, [field]: value } : p)
    save({ ...permits, items: next })
  }, [permits, save])

  const addPermit = useCallback(() => {
    save({ ...permits, items: [...permits.items, newPermit('New permit')] })
  }, [permits, save])

  const removePermit = useCallback((id: string) => {
    save({ ...permits, items: permits.items.filter((p) => p.id !== id) })
  }, [permits, save])

  const approvedCount = permits.items.filter((p) => p.status === 'approved' || p.status === 'not_applicable').length
  const totalCount = permits.items.length

  const statusBadge = {
    idle: null,
    loading: <span className="text-xs text-neutral-400">Loading…</span>,
    saving: <span className="text-xs text-neutral-400">Saving…</span>,
    saved: <span className="text-xs text-emerald-600">Saved</span>,
    error: <span className="text-xs text-red-500">Save failed</span>,
    paywall: <span className="text-xs text-amber-600">Subscription required</span>,
  }[docStatus]

  const jurisdictionLabel = [permits.jurisdiction.city, permits.jurisdiction.state_or_region]
    .filter(Boolean).join(', ')

  return (
    <section className="bg-white rounded-2xl border border-[#efefef] p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-base text-[#1a1a1a]">Permits</h2>
        <div className="flex items-center gap-3">
          {statusBadge}
          {totalCount > 0 && (
            <span className="text-xs text-neutral-400">{approvedCount}/{totalCount} cleared</span>
          )}
        </div>
      </div>

      {/* Jurisdiction */}
      <div className="bg-[#faf9f7] rounded-xl p-3 space-y-2">
        <p className="text-xs font-medium text-neutral-500">Jurisdiction</p>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            value={permits.jurisdiction.city ?? ''}
            onChange={(e) => updateJurisdiction('city', e.target.value)}
            placeholder="City"
            className="text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
          />
          <input
            type="text"
            value={permits.jurisdiction.state_or_region ?? ''}
            onChange={(e) => updateJurisdiction('state_or_region', e.target.value)}
            placeholder="State / Province"
            className="text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
          />
          <input
            type="text"
            value={permits.jurisdiction.country}
            onChange={(e) => updateJurisdiction('country', e.target.value)}
            placeholder="Country"
            className="text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
          />
        </div>
        {jurisdictionLabel && (
          <p className="text-xs text-neutral-400">{jurisdictionLabel}</p>
        )}
      </div>

      {/* Permit rows */}
      {permits.items.length === 0 ? (
        <p className="text-sm text-neutral-400 py-4 text-center">
          No permits yet. Click <strong>+ Add permit</strong> to track your applications.
        </p>
      ) : (
        <div className="space-y-3">
          {permits.items.map((item) => (
            <div key={item.id} className="border border-neutral-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => updateItem(item.id, 'label', e.target.value)}
                  className="flex-1 text-sm font-medium border border-transparent hover:border-neutral-200 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30 text-[#1a1a1a]"
                />
                <select
                  value={item.status}
                  onChange={(e) => updateItem(item.id, 'status', e.target.value as PermitStatus)}
                  className={[
                    'text-xs font-medium border border-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30',
                    STATUS_COLORS[item.status],
                  ].join(' ')}
                >
                  {PERMIT_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removePermit(item.id)}
                  aria-label="Remove permit"
                  className="text-neutral-200 hover:text-red-400 transition-colors text-xs p-0.5 rounded"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-neutral-400 mb-0.5">Submitted on</label>
                  <input
                    type="date"
                    value={item.submitted_on ?? ''}
                    onChange={(e) => updateItem(item.id, 'submitted_on', e.target.value || null)}
                    className="w-full text-xs border border-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#155e63]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-0.5">Approved on</label>
                  <input
                    type="date"
                    value={item.approved_on ?? ''}
                    onChange={(e) => updateItem(item.id, 'approved_on', e.target.value || null)}
                    className="w-full text-xs border border-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#155e63]/30"
                  />
                </div>
              </div>
              <input
                type="text"
                value={item.notes ?? ''}
                onChange={(e) => updateItem(item.id, 'notes', e.target.value || null)}
                placeholder="Notes…"
                className="w-full text-xs border border-transparent hover:border-neutral-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#155e63]/30 text-neutral-500"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addPermit}>+ Add permit</Button>
        <p className="text-xs text-neutral-400 italic">
          Best-effort guidance — confirm specifics with your local jurisdiction.
        </p>
      </div>
    </section>
  )
}
