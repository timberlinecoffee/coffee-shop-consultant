// TIM-779: LeaseTermsCard — collapsible per-candidate lease term capture.
// PUTs to /api/workspaces/location-lease/candidates/{id}/lease-terms (debounced 800ms).
'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card'

// ── Types ──────────────────────────────────────────────────────────────

type Candidate = { id: string; name: string }

type TermsDisplay = {
  base_rent: string
  rent_escalation_pct: string
  security_deposit: string
  ti_allowance: string
  term_months: string
  options_text: string
  personal_guarantee: string
  exit_clauses: string
}

type TermsRow = {
  candidate_id: string
  base_rent_cents: number | null
  rent_escalation_pct: number | null
  security_deposit_cents: number | null
  ti_allowance_cents: number | null
  term_months: number | null
  options_text: string | null
  personal_guarantee: string | null
  exit_clauses: string | null
}

type TermsPayload = Omit<TermsRow, 'candidate_id'>

// ── Formatting helpers ─────────────────────────────────────────────────

function centsToDisplay(cents: number | null): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

function displayToCents(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : Math.round(num * 100)
}

function pctToDisplay(pct: number | null): string {
  if (pct == null) return ''
  return pct.toFixed(2)
}

function displayToPct(s: string): number | null {
  if (!s.trim()) return null
  const num = parseFloat(s)
  return isNaN(num) ? null : num
}

function rowToDisplay(row: TermsRow | null): TermsDisplay {
  return {
    base_rent: centsToDisplay(row?.base_rent_cents ?? null),
    rent_escalation_pct: pctToDisplay(row?.rent_escalation_pct ?? null),
    security_deposit: centsToDisplay(row?.security_deposit_cents ?? null),
    ti_allowance: centsToDisplay(row?.ti_allowance_cents ?? null),
    term_months: row?.term_months != null ? String(row.term_months) : '',
    options_text: row?.options_text ?? '',
    personal_guarantee: row?.personal_guarantee ?? '',
    exit_clauses: row?.exit_clauses ?? '',
  }
}

function displayToPayload(d: TermsDisplay): TermsPayload {
  return {
    base_rent_cents: displayToCents(d.base_rent),
    rent_escalation_pct: displayToPct(d.rent_escalation_pct),
    security_deposit_cents: displayToCents(d.security_deposit),
    ti_allowance_cents: displayToCents(d.ti_allowance),
    term_months: d.term_months ? (parseInt(d.term_months, 10) || null) : null,
    options_text: d.options_text.trim() || null,
    personal_guarantee: d.personal_guarantee.trim() || null,
    exit_clauses: d.exit_clauses.trim() || null,
  }
}

// ── Sub-components ─────────────────────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function CurrencyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-3 text-sm text-muted-foreground">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '0.00'}
        className="h-8 w-full rounded-lg border border-border bg-transparent pl-6 pr-3 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground/50"
      />
    </div>
  )
}

function PctInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative flex items-center">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '0.00'}
        className="h-8 w-full rounded-lg border border-border bg-transparent px-3 pr-7 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground/50"
      />
      <span className="pointer-events-none absolute right-3 text-sm text-muted-foreground">%</span>
    </div>
  )
}

const TEXTAREA_CLASS =
  'w-full rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground/50 resize-y'

// ── Per-candidate collapsible section ─────────────────────────────────

type CandidateSectionProps = {
  candidate: Candidate
  initialDisplay: TermsDisplay
}

function CandidateTermsSection({ candidate, initialDisplay }: CandidateSectionProps) {
  const [open, setOpen] = useState(false)
  const [display, setDisplay] = useState<TermsDisplay>(initialDisplay)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDisplay(initialDisplay)
  }, [initialDisplay])

  const schedulePut = useCallback(
    (d: TermsDisplay) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        setSaving(true)
        try {
          await fetch(
            `/api/workspaces/location-lease/candidates/${candidate.id}/lease-terms`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(displayToPayload(d)),
            }
          )
        } finally {
          setSaving(false)
        }
      }, 800)
    },
    [candidate.id]
  )

  function update(field: keyof TermsDisplay, value: string) {
    setDisplay(prev => {
      const next = { ...prev, [field]: value }
      schedulePut(next)
      return next
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="text-sm font-medium">{candidate.name}</span>
        <span className="flex shrink-0 items-center gap-2">
          {saving && (
            <span className="text-[10px] italic text-muted-foreground">saving…</span>
          )}
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </span>
      </button>

      {/* Expandable body */}
      <div
        aria-hidden={!open}
        className={cn(
          'border-t border-border transition-all duration-200',
          open ? 'block' : 'hidden'
        )}
      >
        <div className="px-4 py-4">
          {/* Numeric / currency fields — 2-col on sm+, 1-col on mobile */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldGroup label="Base Rent / Month">
              <CurrencyInput
                value={display.base_rent}
                onChange={v => update('base_rent', v)}
              />
            </FieldGroup>

            <FieldGroup label="Annual Escalation">
              <PctInput
                value={display.rent_escalation_pct}
                onChange={v => update('rent_escalation_pct', v)}
                placeholder="3.50"
              />
            </FieldGroup>

            <FieldGroup label="Security Deposit">
              <CurrencyInput
                value={display.security_deposit}
                onChange={v => update('security_deposit', v)}
              />
            </FieldGroup>

            <FieldGroup label="TI Allowance">
              <CurrencyInput
                value={display.ti_allowance}
                onChange={v => update('ti_allowance', v)}
              />
            </FieldGroup>

            <FieldGroup label="Term (months)">
              <input
                type="number"
                min="0"
                step="1"
                value={display.term_months}
                onChange={e => update('term_months', e.target.value)}
                placeholder="24"
                className="h-8 w-full rounded-lg border border-border bg-transparent px-3 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground/50"
              />
            </FieldGroup>
          </div>

          {/* Free-text fields — always full-width */}
          <div className="mt-3 grid grid-cols-1 gap-3">
            <FieldGroup label="Options">
              <textarea
                value={display.options_text}
                onChange={e => update('options_text', e.target.value)}
                placeholder="e.g. Two 5-year renewal options at market rate…"
                rows={2}
                className={TEXTAREA_CLASS}
              />
            </FieldGroup>

            <FieldGroup label="Personal Guarantee">
              <textarea
                value={display.personal_guarantee}
                onChange={e => update('personal_guarantee', e.target.value)}
                placeholder="e.g. 12-month personal guarantee…"
                rows={2}
                className={TEXTAREA_CLASS}
              />
            </FieldGroup>

            <FieldGroup label="Exit Clauses">
              <textarea
                value={display.exit_clauses}
                onChange={e => update('exit_clauses', e.target.value)}
                placeholder="e.g. 90-day notice, co-tenancy clause…"
                rows={2}
                className={TEXTAREA_CLASS}
              />
            </FieldGroup>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────

export function LeaseTermsCard() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [displays, setDisplays] = useState<Record<string, TermsDisplay>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/workspaces/location-lease/candidates')
        if (!res.ok) {
          setError('Failed to load candidates.')
          return
        }
        const candidatesData: Candidate[] = await res.json()
        setCandidates(candidatesData)

        if (candidatesData.length > 0) {
          const supabase = createClient()
          const { data: rows } = await supabase
            .from('location_lease_terms')
            .select('*')
            .in(
              'candidate_id',
              candidatesData.map(c => c.id)
            )

          const displayMap: Record<string, TermsDisplay> = {}
          for (const c of candidatesData) {
            const row = (rows ?? []).find(r => r.candidate_id === c.id) ?? null
            displayMap[c.id] = rowToDisplay(row as TermsRow | null)
          }
          setDisplays(displayMap)
        }
      } catch {
        setError('Failed to load lease terms.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading lease terms…
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
          <CardTitle>Lease Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add candidates to your shortlist to capture their lease terms.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Lease Terms</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-4">
        {candidates.map(candidate => (
          <CandidateTermsSection
            key={candidate.id}
            candidate={candidate}
            initialDisplay={displays[candidate.id] ?? rowToDisplay(null)}
          />
        ))}
      </CardContent>
    </Card>
  )
}
