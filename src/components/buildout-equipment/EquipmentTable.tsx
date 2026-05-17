'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

// ── Types ─────────────────────────────────────────────────────────────────────

type PriorityTier = 'must_have' | 'important' | 'nice_to_have'

const CATEGORIES = [
  'espresso', 'grinder', 'refrigeration', 'plumbing', 'electrical',
  'furniture', 'smallwares', 'pos', 'signage', 'other',
] as const

const PRIORITY_LABELS: Record<PriorityTier, string> = {
  must_have: 'Must-have',
  important: 'Important',
  nice_to_have: 'Nice-to-have',
}

const PRIORITY_COLORS: Record<PriorityTier, string> = {
  must_have: 'bg-emerald-100 text-emerald-800',
  important: 'bg-amber-100 text-amber-800',
  nice_to_have: 'bg-slate-100 text-slate-700',
}

type EquipmentItem = {
  id: string
  plan_id: string
  name: string
  category: string
  vendor: string | null
  model: string | null
  quantity: number
  unit_cost_cents: number
  priority_tier: PriorityTier
  notes: string | null
  archived: boolean
  position: number
}

type DraftRow = {
  _key: string  // local-only key for new unsaved rows
  id: string | null  // null until persisted
  name: string
  category: string
  vendor: string
  model: string
  quantity: number
  unit_cost_cents: number
  priority_tier: PriorityTier
  notes: string
  archived: boolean
  _saving: boolean
  _error: string | null
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseDollarsToCents(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ''))
  if (isNaN(n) || n < 0) return 0
  return Math.round(n * 100)
}

function itemToDraft(item: EquipmentItem): DraftRow {
  return {
    _key: item.id,
    id: item.id,
    name: item.name,
    category: item.category,
    vendor: item.vendor ?? '',
    model: item.model ?? '',
    quantity: item.quantity,
    unit_cost_cents: item.unit_cost_cents,
    priority_tier: item.priority_tier,
    notes: item.notes ?? '',
    archived: item.archived,
    _saving: false,
    _error: null,
  }
}

function newDraftRow(planId: string, position: number): DraftRow {
  return {
    _key: `new-${Date.now()}-${Math.random()}`,
    id: null,
    name: '',
    category: 'other',
    vendor: '',
    model: '',
    quantity: 1,
    unit_cost_cents: 0,
    priority_tier: 'must_have',
    notes: '',
    archived: false,
    _saving: false,
    _error: null,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface EquipmentTableProps {
  planId: string
  initialItems: EquipmentItem[]
}

export function EquipmentTable({ planId, initialItems }: EquipmentTableProps) {
  const supabase = createClient()

  const [rows, setRows] = useState<DraftRow[]>(() => initialItems.map(itemToDraft))
  const [showArchived, setShowArchived] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const tableRef = useRef<HTMLTableElement>(null)

  // ── Derived totals ───────────────────────────────────────────────────────
  const activeRows = rows.filter(r => !r.archived)
  const mustHaveTotal = activeRows
    .filter(r => r.priority_tier === 'must_have')
    .reduce((sum, r) => sum + r.quantity * r.unit_cost_cents, 0)
  const niceToHaveTotal = activeRows
    .filter(r => r.priority_tier !== 'must_have')
    .reduce((sum, r) => sum + r.quantity * r.unit_cost_cents, 0)
  const grandTotal = mustHaveTotal + niceToHaveTotal
  const itemCount = activeRows.length

  // ── Save helpers ─────────────────────────────────────────────────────────
  const persistRow = useCallback(async (key: string, draft: DraftRow) => {
    if (!draft.name.trim()) return  // don't persist empty rows

    setRows(prev => prev.map(r => r._key === key ? { ...r, _saving: true, _error: null } : r))

    if (draft.id === null) {
      // INSERT
      const { data, error } = await supabase
        .from('buildout_equipment_items')
        .insert({
          plan_id: planId,
          name: draft.name.trim(),
          category: draft.category,
          vendor: draft.vendor.trim() || null,
          model: draft.model.trim() || null,
          quantity: draft.quantity,
          unit_cost_cents: draft.unit_cost_cents,
          priority_tier: draft.priority_tier,
          notes: draft.notes.trim() || null,
          archived: false,
          position: rows.findIndex(r => r._key === key),
        })
        .select('id')
        .single()

      if (error || !data) {
        setRows(prev => prev.map(r => r._key === key ? { ...r, _saving: false, _error: 'Save failed' } : r))
        return
      }
      setRows(prev => prev.map(r => r._key === key ? { ...r, id: data.id, _saving: false } : r))
    } else {
      // UPDATE
      const { error } = await supabase
        .from('buildout_equipment_items')
        .update({
          name: draft.name.trim(),
          category: draft.category,
          vendor: draft.vendor.trim() || null,
          model: draft.model.trim() || null,
          quantity: draft.quantity,
          unit_cost_cents: draft.unit_cost_cents,
          priority_tier: draft.priority_tier,
          notes: draft.notes.trim() || null,
        })
        .eq('id', draft.id)

      setRows(prev => prev.map(r => r._key === key ? { ...r, _saving: false, _error: error ? 'Save failed' : null } : r))
    }
  }, [planId, rows, supabase])

  const scheduleSave = useCallback((key: string, draft: DraftRow) => {
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => persistRow(key, draft), 600)
  }, [persistRow])

  // ── Field update ─────────────────────────────────────────────────────────
  function updateField<K extends keyof DraftRow>(key: string, field: K, value: DraftRow[K]) {
    setRows(prev => {
      const next = prev.map(r => r._key === key ? { ...r, [field]: value } : r)
      const updated = next.find(r => r._key === key)!
      scheduleSave(key, updated)
      return next
    })
  }

  // ── Add row ──────────────────────────────────────────────────────────────
  function addRow() {
    const draft = newDraftRow(planId, rows.length)
    setRows(prev => [...prev, draft])
    // Focus the name field of the new row after render
    setTimeout(() => {
      const inputs = tableRef.current?.querySelectorAll<HTMLInputElement>('tbody tr:last-child input')
      inputs?.[0]?.focus()
    }, 50)
  }

  // ── Tab from last cell → add row ─────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, rowKey: string, isLastField: boolean) {
    if (e.key === 'Tab' && !e.shiftKey && isLastField) {
      const visibleRows = rows.filter(r => showArchived || !r.archived)
      const lastVisible = visibleRows[visibleRows.length - 1]
      if (lastVisible?._key === rowKey) {
        e.preventDefault()
        addRow()
      }
    }
  }

  // ── Archive / restore ────────────────────────────────────────────────────
  async function toggleArchive(key: string, currentArchived: boolean) {
    const row = rows.find(r => r._key === key)
    if (!row?.id) return

    const nextArchived = !currentArchived
    setRows(prev => prev.map(r => r._key === key ? { ...r, archived: nextArchived } : r))

    const { error } = await supabase
      .from('buildout_equipment_items')
      .update({ archived: nextArchived })
      .eq('id', row.id)

    if (error) {
      setRows(prev => prev.map(r => r._key === key ? { ...r, archived: currentArchived } : r))
      setGlobalError('Archive failed. Try again.')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const visibleRows = rows.filter(r => showArchived || !r.archived)
  const archivedCount = rows.filter(r => r.archived).length

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={addRow}>
            + Add item
          </Button>
          {/* TIM-623-D: bulk import drawer placeholder */}
          <Button variant="outline" size="sm" disabled title="Bulk import coming in TIM-623-D">
            Bulk import
          </Button>
        </div>
        <div className="flex items-center gap-3">
          {archivedCount > 0 && (
            <label className="flex items-center gap-1.5 text-sm text-neutral-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={e => setShowArchived(e.target.checked)}
                className="rounded"
              />
              Show archived ({archivedCount})
            </label>
          )}
        </div>
      </div>

      {globalError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{globalError}</p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table ref={tableRef} className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-neutral-50 text-neutral-600 text-xs uppercase tracking-wide">
              <th className="px-3 py-2 text-left font-medium border-b border-neutral-200 min-w-[160px]">Name</th>
              <th className="px-3 py-2 text-left font-medium border-b border-neutral-200 min-w-[120px]">Category</th>
              <th className="px-3 py-2 text-left font-medium border-b border-neutral-200 min-w-[120px]">Vendor</th>
              <th className="px-3 py-2 text-left font-medium border-b border-neutral-200 min-w-[120px]">Model</th>
              <th className="px-3 py-2 text-center font-medium border-b border-neutral-200 w-16">Qty</th>
              <th className="px-3 py-2 text-right font-medium border-b border-neutral-200 w-28">Unit cost</th>
              <th className="px-3 py-2 text-right font-medium border-b border-neutral-200 w-28">Subtotal</th>
              <th className="px-3 py-2 text-center font-medium border-b border-neutral-200 min-w-[120px]">Priority</th>
              <th className="px-3 py-2 text-center font-medium border-b border-neutral-200 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-neutral-400 text-sm">
                  No equipment yet. Click <strong>+ Add item</strong> or <strong>Bulk import</strong> to get started.
                </td>
              </tr>
            )}
            {visibleRows.map((row, _idx) => {
              const subtotalCents = row.quantity * row.unit_cost_cents
              const isArchived = row.archived

              return (
                <tr
                  key={row._key}
                  className={[
                    'border-b border-neutral-100 last:border-0 transition-colors',
                    isArchived ? 'opacity-50 bg-neutral-50' : 'hover:bg-neutral-50',
                    row._saving ? 'opacity-70' : '',
                  ].join(' ')}
                >
                  {/* Name */}
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => updateField(row._key, 'name', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, row._key, false)}
                      disabled={isArchived}
                      placeholder="Equipment name"
                      className="w-full px-1.5 py-1 rounded border border-transparent hover:border-neutral-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-transparent text-sm disabled:cursor-not-allowed"
                    />
                  </td>

                  {/* Category */}
                  <td className="px-2 py-1">
                    <select
                      value={row.category}
                      onChange={e => updateField(row._key, 'category', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, row._key, false)}
                      disabled={isArchived}
                      className="w-full px-1.5 py-1 rounded border border-transparent hover:border-neutral-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-transparent text-sm capitalize disabled:cursor-not-allowed"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>

                  {/* Vendor */}
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={row.vendor}
                      onChange={e => updateField(row._key, 'vendor', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, row._key, false)}
                      disabled={isArchived}
                      placeholder="Vendor"
                      className="w-full px-1.5 py-1 rounded border border-transparent hover:border-neutral-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-transparent text-sm disabled:cursor-not-allowed"
                    />
                  </td>

                  {/* Model */}
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={row.model}
                      onChange={e => updateField(row._key, 'model', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, row._key, false)}
                      disabled={isArchived}
                      placeholder="Model"
                      className="w-full px-1.5 py-1 rounded border border-transparent hover:border-neutral-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-transparent text-sm disabled:cursor-not-allowed"
                    />
                  </td>

                  {/* Qty */}
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={e => updateField(row._key, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                      onKeyDown={e => handleKeyDown(e, row._key, false)}
                      disabled={isArchived}
                      className="w-full px-1.5 py-1 text-center rounded border border-transparent hover:border-neutral-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-transparent text-sm disabled:cursor-not-allowed"
                    />
                  </td>

                  {/* Unit cost */}
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-0.5">
                      <span className="text-neutral-400 text-xs">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={centsToDisplay(row.unit_cost_cents)}
                        onChange={e => updateField(row._key, 'unit_cost_cents', parseDollarsToCents(e.target.value))}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => handleKeyDown(e, row._key, false)}
                        disabled={isArchived}
                        className="w-full px-1 py-1 text-right rounded border border-transparent hover:border-neutral-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-transparent text-sm disabled:cursor-not-allowed"
                      />
                    </div>
                  </td>

                  {/* Subtotal (read-only) */}
                  <td className="px-3 py-1 text-right text-sm font-medium tabular-nums text-neutral-700">
                    ${centsToDisplay(subtotalCents)}
                  </td>

                  {/* Priority tier */}
                  <td className="px-2 py-1">
                    <select
                      value={row.priority_tier}
                      onChange={e => updateField(row._key, 'priority_tier', e.target.value as PriorityTier)}
                      onKeyDown={e => handleKeyDown(e, row._key, false)}
                      disabled={isArchived}
                      className={[
                        'w-full px-1.5 py-1 rounded border border-transparent text-xs font-medium text-center',
                        'focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:cursor-not-allowed',
                        PRIORITY_COLORS[row.priority_tier],
                      ].join(' ')}
                    >
                      {(Object.keys(PRIORITY_LABELS) as PriorityTier[]).map(t => (
                        <option key={t} value={t}>{PRIORITY_LABELS[t]}</option>
                      ))}
                    </select>
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-1">
                    <div className="flex items-center justify-center gap-1">
                      {row._saving && (
                        <span className="text-[10px] text-neutral-400">saving…</span>
                      )}
                      {row._error && (
                        <span className="text-[10px] text-red-500" title={row._error}>⚠</span>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleArchive(row._key, row.archived)}
                        disabled={!row.id}
                        title={isArchived ? 'Restore' : 'Archive'}
                        className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 transition-colors"
                      >
                        {isArchived ? (
                          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M2 4h12v1.5L12 14H4L2 5.5V4z" />
                            <path d="M2 4h12M6 8l2 2 2-2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M2 4h12v1.5L12 14H4L2 5.5V4z" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2 4h12" strokeLinecap="round" />
                            <path d="M6 8l2-2 2 2M8 6v4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* Footer totals */}
          <tfoot>
            <tr className="bg-neutral-50 border-t-2 border-neutral-200">
              <td colSpan={6} className="px-3 py-2 text-xs text-neutral-500">
                <span className="font-medium text-neutral-700">Items: {itemCount}</span>
                {itemCount > 0 && (
                  <>
                    <span className="mx-2 text-neutral-300">·</span>
                    <span className="text-emerald-700 font-medium">Must-have: ${centsToDisplay(mustHaveTotal)}</span>
                    <span className="mx-2 text-neutral-300">·</span>
                    <span className="text-amber-700 font-medium">Nice-to-have: ${centsToDisplay(niceToHaveTotal)}</span>
                  </>
                )}
              </td>
              <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-neutral-900">
                ${centsToDisplay(grandTotal)}
              </td>
              <td colSpan={2} className="px-3 py-2 text-xs text-neutral-400 text-right">
                Total
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-neutral-400">
        Changes save automatically. Tab through the last row to add a new item.
      </p>
    </div>
  )
}
