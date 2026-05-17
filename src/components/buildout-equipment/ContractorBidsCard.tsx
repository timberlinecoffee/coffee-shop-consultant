'use client'

// TIM-722: Contractor bids CRUD card for the buildout_equipment workspace.
// Per-row: scope, contractor name, bid total (USD), start/finish dates, status, notes, remove.
// Footer shows total of received + accepted bids only.

import { useCallback } from 'react'
import { useBuildoutDocument } from './useBuildoutDocument'
import { newBid, BID_SCOPES, BID_STATUSES } from '@/lib/buildout/seedDefaults'
import type { ContractorBid, BidScope, BidStatus } from '@/lib/buildout/seedDefaults'
import { Button } from '@/components/ui/button'

const SCOPE_LABELS: Record<BidScope, string> = {
  general: 'General', plumbing: 'Plumbing', electrical: 'Electrical',
  hvac: 'HVAC', millwork: 'Millwork', signage: 'Signage', other: 'Other',
}

const STATUS_LABELS: Record<BidStatus, string> = {
  requested: 'Requested', received: 'Received', accepted: 'Accepted', rejected: 'Rejected',
}

const STATUS_COLORS: Record<BidStatus, string> = {
  requested: 'bg-slate-100 text-slate-700',
  received: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function parseDollarsToCents(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ''))
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100)
}

export function ContractorBidsCard() {
  const { status, data: bids, save } = useBuildoutDocument('contractor_bids')

  const update = useCallback(<K extends keyof ContractorBid>(id: string, field: K, value: ContractorBid[K]) => {
    const next = bids.map((b) => b.id === id ? { ...b, [field]: value } : b)
    save(next)
  }, [bids, save])

  const addBid = useCallback(() => {
    save([...bids, newBid()])
  }, [bids, save])

  const removeBid = useCallback((id: string) => {
    save(bids.filter((b) => b.id !== id))
  }, [bids, save])

  const acceptedTotal = bids
    .filter((b) => b.status === 'received' || b.status === 'accepted')
    .reduce((s, b) => s + b.bid_total_cents, 0)

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
        <h2 className="font-semibold text-base text-[#1a1a1a]">Contractor Bids</h2>
        <div className="flex items-center gap-3">
          {statusBadge}
          <Button variant="default" size="sm" onClick={addBid}>+ Add bid</Button>
        </div>
      </div>

      {bids.length === 0 ? (
        <p className="text-sm text-neutral-400 py-4 text-center">
          No bids yet. Click <strong>+ Add bid</strong> to track a contractor quote.
        </p>
      ) : (
        <div className="space-y-3">
          {bids.map((bid) => (
            <div key={bid.id} className="border border-neutral-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Scope</label>
                  <select
                    value={bid.scope}
                    onChange={(e) => update(bid.id, 'scope', e.target.value as BidScope)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
                  >
                    {BID_SCOPES.map((s) => (
                      <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-neutral-500 mb-1">Contractor name</label>
                  <input
                    type="text"
                    value={bid.contractor_name}
                    onChange={(e) => update(bid.id, 'contractor_name', e.target.value)}
                    placeholder="Contractor name"
                    className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Bid total (USD)</label>
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-400 text-sm">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={centsToDisplay(bid.bid_total_cents)}
                      onChange={(e) => update(bid.id, 'bid_total_cents', parseDollarsToCents(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Status</label>
                  <select
                    value={bid.status}
                    onChange={(e) => update(bid.id, 'status', e.target.value as BidStatus)}
                    className={[
                      'w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30 font-medium text-xs',
                      STATUS_COLORS[bid.status],
                    ].join(' ')}
                  >
                    {BID_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Scheduled start</label>
                  <input
                    type="date"
                    value={bid.scheduled_start ?? ''}
                    onChange={(e) => update(bid.id, 'scheduled_start', e.target.value || null)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Scheduled finish</label>
                  <input
                    type="date"
                    value={bid.scheduled_finish ?? ''}
                    onChange={(e) => update(bid.id, 'scheduled_finish', e.target.value || null)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Notes</label>
                <input
                  type="text"
                  value={bid.notes ?? ''}
                  onChange={(e) => update(bid.id, 'notes', e.target.value || null)}
                  placeholder="Optional notes"
                  className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#155e63]/30"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeBid(bid.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Remove bid
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {bids.length > 0 && (
        <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
          <span className="text-xs text-neutral-500">
            {bids.length} bid{bids.length !== 1 ? 's' : ''} · received & accepted total
          </span>
          <span className="text-sm font-bold tabular-nums text-[#1a1a1a]">
            ${centsToDisplay(acceptedTotal)}
          </span>
        </div>
      )}
    </section>
  )
}
