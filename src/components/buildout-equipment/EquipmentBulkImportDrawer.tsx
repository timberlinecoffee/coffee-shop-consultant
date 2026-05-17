'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer'

// ── Types ─────────────────────────────────────────────────────────────────────

type PriorityTier = 'must_have' | 'important' | 'nice_to_have'

const VALID_CATEGORIES = [
  'espresso', 'grinder', 'refrigeration', 'plumbing', 'electrical',
  'furniture', 'smallwares', 'pos', 'signage', 'other',
] as const

const PRIORITY_ALIASES: Record<string, PriorityTier> = {
  must_have: 'must_have',
  'must-have': 'must_have',
  'must have': 'must_have',
  important: 'important',
  nice_to_have: 'nice_to_have',
  'nice-to-have': 'nice_to_have',
  'nice to have': 'nice_to_have',
}

type ParsedRow = {
  rowNum: number
  name: string
  category: string
  quantity: number
  unit_cost_cents: number
  vendor: string | null
  model: string | null
  priority_tier: PriorityTier
  notes: string | null
  errors: string[]
}

export interface EquipmentBulkImportDrawerProps {
  planId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (count: number) => void
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') return line.split('\t').map(f => f.trim())

  const fields: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      fields.push(cur.trim()); cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur.trim())
  return fields
}

function parseTabular(raw: string): ParsedRow[] {
  // Strip UTF-8 BOM
  const text = raw.replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)
  // Drop trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length < 2) return []

  const headerLine = lines[0]
  const delimiter = headerLine.includes('\t') ? '\t' : ','
  const headers = parseLine(headerLine, delimiter).map(h => h.toLowerCase().replace(/\s+/g, '_'))

  const col = (name: string) => headers.indexOf(name)
  const nameIdx = col('name')
  const categoryIdx = col('category')
  const quantityIdx = col('quantity')
  const costCentsIdx = col('unit_cost_cents')
  const costDollarsIdx = col('unit_cost')
  const vendorIdx = col('vendor')
  const modelIdx = col('model')
  const priorityIdx = col('priority_tier')
  const notesIdx = col('notes')

  return lines.slice(1).map((line, i) => {
    const fields = parseLine(line, delimiter)
    const get = (idx: number) => (idx >= 0 ? (fields[idx] ?? '').trim() : '')
    const errors: string[] = []

    const name = get(nameIdx)
    if (!name) errors.push('name is required')

    const categoryRaw = get(categoryIdx)
    const category = categoryRaw.toLowerCase()
    if (!categoryRaw) {
      errors.push('category is required')
    } else if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
      errors.push(`invalid category "${categoryRaw}"`)
    }

    const quantityRaw = get(quantityIdx)
    const quantity = parseInt(quantityRaw, 10)
    if (!quantityRaw) {
      errors.push('quantity is required')
    } else if (isNaN(quantity) || quantity < 1) {
      errors.push(`quantity must be ≥ 1, got "${quantityRaw}"`)
    }

    let unit_cost_cents = 0
    if (costCentsIdx >= 0) {
      const raw = get(costCentsIdx).replace(/[^0-9.]/g, '')
      if (!raw) {
        errors.push('unit_cost_cents is required')
      } else {
        const n = parseFloat(raw)
        if (isNaN(n) || n < 0) errors.push(`invalid unit_cost_cents "${get(costCentsIdx)}"`)
        else unit_cost_cents = Math.round(n)
      }
    } else if (costDollarsIdx >= 0) {
      const raw = get(costDollarsIdx).replace(/[^0-9.]/g, '')
      if (!raw) {
        errors.push('unit_cost is required')
      } else {
        const n = parseFloat(raw)
        if (isNaN(n) || n < 0) errors.push(`invalid unit_cost "${get(costDollarsIdx)}"`)
        else unit_cost_cents = Math.round(n * 100)
      }
    } else {
      errors.push('missing unit_cost_cents or unit_cost column')
    }

    const priorityRaw = get(priorityIdx)
    let priority_tier: PriorityTier = 'must_have'
    if (priorityRaw) {
      const mapped = PRIORITY_ALIASES[priorityRaw.toLowerCase()]
      if (!mapped) errors.push(`invalid priority_tier "${priorityRaw}"`)
      else priority_tier = mapped
    }

    return {
      rowNum: i + 2,
      name,
      category,
      quantity: isNaN(quantity) ? 0 : quantity,
      unit_cost_cents,
      vendor: get(vendorIdx) || null,
      model: get(modelIdx) || null,
      priority_tier,
      notes: get(notesIdx) || null,
      errors,
    }
  })
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Component ─────────────────────────────────────────────────────────────────

const EXAMPLE_TSV = `name\tcategory\tquantity\tunit_cost\tvendor\tpriority_tier
La Marzocca Linea PB\tespresso\t1\t14000\tLa Marzocca\tmust_have
Mazzer Major E\tgrinder\t2\t2200\tMazzer\tmust_have
Undercounter Refrigerator\trefrigeration\t1\t1800\tTrue Mfg\timportant`

type Mode = 'paste' | 'upload'
type Step = 'input' | 'preview'

export function EquipmentBulkImportDrawer({
  planId, open, onOpenChange, onImported,
}: EquipmentBulkImportDrawerProps) {
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('paste')
  const [step, setStep] = useState<Step>('input')
  const [pasteValue, setPasteValue] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setMode('paste')
    setStep('input')
    setPasteValue('')
    setRows([])
    setImporting(false)
    setImportError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    onOpenChange(false)
    setTimeout(reset, 300)
  }

  function parseAndPreview(raw: string) {
    const parsed = parseTabular(raw)
    setRows(parsed)
    setStep('preview')
    setImportError(null)
  }

  function handlePastePreview() {
    parseAndPreview(pasteValue)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result
      if (typeof text === 'string') parseAndPreview(text)
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result
      if (typeof text === 'string') parseAndPreview(text)
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  async function handleImport() {
    if (rows.length === 0 || errorCount > 0) return
    setImporting(true)
    setImportError(null)

    const inserts = rows.map((row, i) => ({
      plan_id: planId,
      name: row.name,
      category: row.category,
      quantity: row.quantity,
      unit_cost_cents: row.unit_cost_cents,
      vendor: row.vendor,
      model: row.model,
      priority_tier: row.priority_tier,
      notes: row.notes,
      archived: false,
      position: 10000 + i,
    }))

    const { error } = await supabase
      .from('buildout_equipment_items')
      .insert(inserts)

    setImporting(false)
    if (error) {
      setImportError(error.message)
      return
    }
    onImported(inserts.length)
    onOpenChange(false)
    setTimeout(reset, 300)
  }

  const errorCount = rows.filter(r => r.errors.length > 0).length
  const validCount = rows.length - errorCount

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="!w-full sm:!max-w-2xl overflow-y-auto">
        <DrawerHeader className="border-b border-neutral-200 pb-4">
          <DrawerTitle>Bulk Import Equipment</DrawerTitle>
          <DrawerDescription>
            Paste from Google Sheets / Excel or upload a .csv file. Required columns:{' '}
            <code className="text-xs bg-neutral-100 px-1 rounded">name, category, quantity, unit_cost_cents</code>{' '}
            (or <code className="text-xs bg-neutral-100 px-1 rounded">unit_cost</code> in dollars).
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {step === 'input' && (
            <>
              {/* Mode tabs */}
              <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg w-fit">
                {(['paste', 'upload'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={[
                      'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                      mode === m
                        ? 'bg-white shadow-sm text-neutral-900'
                        : 'text-neutral-500 hover:text-neutral-700',
                    ].join(' ')}
                  >
                    {m === 'paste' ? 'Paste text' : 'Upload CSV'}
                  </button>
                ))}
              </div>

              {mode === 'paste' && (
                <div className="space-y-3">
                  <p className="text-xs text-neutral-500">
                    Copy rows from Google Sheets or Excel and paste below. The first row must be the header.
                  </p>
                  <textarea
                    value={pasteValue}
                    onChange={e => setPasteValue(e.target.value)}
                    placeholder={EXAMPLE_TSV}
                    rows={10}
                    className="w-full font-mono text-xs border border-neutral-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y bg-white placeholder:text-neutral-300"
                    spellCheck={false}
                  />
                  <Button
                    onClick={handlePastePreview}
                    disabled={!pasteValue.trim()}
                    size="sm"
                  >
                    Parse & preview
                  </Button>
                </div>
              )}

              {mode === 'upload' && (
                <div
                  onDrop={handleFileDrop}
                  onDragOver={e => e.preventDefault()}
                  className="border-2 border-dashed border-neutral-300 rounded-xl p-8 text-center space-y-3 hover:border-blue-400 transition-colors cursor-pointer"
                  onClick={() => fileRef.current?.click()}
                >
                  <svg className="mx-auto size-8 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4-4 4M12 4v12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm text-neutral-600">
                    Drop a <strong>.csv</strong> file here or <span className="text-blue-600 underline">browse</span>
                  </p>
                  <p className="text-xs text-neutral-400">BOM-encoded and mixed-delimiter files are handled automatically.</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {/* Column reference */}
              <div className="rounded-lg border border-neutral-200 overflow-hidden">
                <div className="bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600 border-b border-neutral-200">
                  Column reference
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className="px-3 py-1.5 text-left text-neutral-500 font-medium">Column</th>
                      <th className="px-3 py-1.5 text-left text-neutral-500 font-medium">Required</th>
                      <th className="px-3 py-1.5 text-left text-neutral-500 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {[
                      ['name', true, 'Free text'],
                      ['category', true, 'espresso, grinder, refrigeration, plumbing, electrical, furniture, smallwares, pos, signage, other'],
                      ['quantity', true, 'Positive integer'],
                      ['unit_cost_cents', false, 'Integer cents. Use this OR unit_cost'],
                      ['unit_cost', false, 'Dollars with decimals. Multiplied by 100'],
                      ['vendor', false, 'Optional free text'],
                      ['model', false, 'Optional free text'],
                      ['priority_tier', false, 'must_have, important, or nice_to_have. Defaults to must_have'],
                      ['notes', false, 'Optional free text'],
                    ].map(([col, req, note]) => (
                      <tr key={col as string}>
                        <td className="px-3 py-1.5 font-mono text-neutral-800">{col as string}</td>
                        <td className="px-3 py-1.5">
                          {req
                            ? <span className="text-emerald-700 font-medium">Required</span>
                            : <span className="text-neutral-400">Optional</span>}
                        </td>
                        <td className="px-3 py-1.5 text-neutral-500">{note as string}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className={[
                'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium',
                errorCount > 0
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-700',
              ].join(' ')}>
                <span>
                  {rows.length} row{rows.length !== 1 ? 's' : ''} parsed
                  {errorCount > 0
                    ? ` — ${errorCount} error${errorCount !== 1 ? 's' : ''} found`
                    : ' — all valid'}
                </span>
                <button
                  onClick={() => { setStep('input'); setRows([]); setImportError(null) }}
                  className="text-xs underline opacity-70 hover:opacity-100"
                >
                  Edit input
                </button>
              </div>

              {importError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Import failed: {importError}
                </p>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-neutral-200 max-h-[50vh] overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-neutral-50 text-neutral-600 text-[10px] uppercase tracking-wide">
                      <th className="px-2 py-2 text-center border-b border-neutral-200 w-10">#</th>
                      <th className="px-2 py-2 text-left border-b border-neutral-200 min-w-[120px]">Name</th>
                      <th className="px-2 py-2 text-left border-b border-neutral-200">Category</th>
                      <th className="px-2 py-2 text-center border-b border-neutral-200 w-12">Qty</th>
                      <th className="px-2 py-2 text-right border-b border-neutral-200 w-24">Unit cost</th>
                      <th className="px-2 py-2 text-left border-b border-neutral-200">Vendor</th>
                      <th className="px-2 py-2 text-left border-b border-neutral-200">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr
                        key={row.rowNum}
                        className={[
                          'border-b border-neutral-100 last:border-0',
                          row.errors.length > 0 ? 'bg-red-50' : '',
                        ].join(' ')}
                      >
                        <td className="px-2 py-1.5 text-center text-neutral-400">{row.rowNum}</td>
                        <td className="px-2 py-1.5 font-medium text-neutral-800">
                          {row.name || <span className="text-red-400 italic">missing</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={!row.category || row.errors.some(e => e.includes('category'))
                            ? 'text-red-500' : 'text-neutral-700'}>
                            {row.category || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-center text-neutral-700">
                          <span className={row.errors.some(e => e.includes('quantity')) ? 'text-red-500' : ''}>
                            {row.quantity || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-neutral-700">
                          <span className={row.errors.some(e => e.includes('unit_cost')) ? 'text-red-500' : ''}>
                            ${centsToDisplay(row.unit_cost_cents)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-neutral-500">{row.vendor || '—'}</td>
                        <td className="px-2 py-1.5 text-neutral-500">{row.priority_tier}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                          No data rows found. Check that the input has a header row and at least one data row.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Inline error list */}
              {errorCount > 0 && (
                <div className="space-y-1">
                  {rows.filter(r => r.errors.length > 0).map(row => (
                    <div key={row.rowNum} className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5">
                      <span className="font-medium">Row {row.rowNum}:</span>{' '}
                      {row.errors.join(' · ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DrawerFooter className="border-t border-neutral-200">
          {step === 'preview' && errorCount === 0 && rows.length > 0 ? (
            <div className="flex gap-2 justify-end">
              <DrawerClose asChild>
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
              </DrawerClose>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? 'Importing…' : `Import ${validCount} row${validCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <DrawerClose asChild>
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Close
                </Button>
              </DrawerClose>
            </div>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
