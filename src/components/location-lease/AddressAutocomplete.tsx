// TIM-1145: Address autocomplete backed by Nominatim (OpenStreetMap).
// Free, no API key. The picked suggestion writes structured fields
// (address, neighborhood, city, lat, lng, postal_code, country) back
// to the candidate so the AI area analysis has real geo context.

'use client'

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { MapPin, Loader2 } from 'lucide-react'
import { InfoTip } from '@/components/ui/info-tip'

export type PlacePick = {
  address: string | null
  neighborhood: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  lat: number
  lng: number
}

type Suggestion = {
  placeId: number
  displayName: string
  shortLabel: string
  lat: number
  lng: number
  streetAddress: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  countryCode: string | null
}

export function AddressAutocomplete({
  value,
  onPick,
  onClearGeo,
  hasCoords,
}: {
  value: string
  onPick: (place: PlacePick) => void
  onClearGeo: (newText: string) => void
  hasCoords: boolean
}) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)

  useEffect(() => {
    setText(value)
    dirtyRef.current = false
  }, [value])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIdx(-1)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function scheduleSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 3) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/workspaces/location-lease/places/search?q=${encodeURIComponent(q.trim())}`,
        )
        const data = (await res.json()) as { results: Suggestion[] }
        setSuggestions(data.results ?? [])
        setOpen(true)
        setActiveIdx(data.results && data.results.length > 0 ? 0 : -1)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 320)
  }

  function handleChange(v: string) {
    setText(v)
    dirtyRef.current = true
    if (hasCoords) {
      // Once the user starts typing again, the cached coords are stale.
      onClearGeo(v)
    }
    scheduleSearch(v)
  }

  function commitText() {
    if (dirtyRef.current && text !== value) {
      onClearGeo(text)
      dirtyRef.current = false
    }
  }

  function pick(s: Suggestion) {
    setOpen(false)
    setActiveIdx(-1)
    setText(s.shortLabel)
    dirtyRef.current = false
    onPick({
      address: s.shortLabel,
      neighborhood: s.neighborhood,
      city: s.city,
      postal_code: s.postalCode,
      country: s.countryCode ?? s.country,
      lat: s.lat,
      lng: s.lng,
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Enter') commitText()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0) pick(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 transition-colors hover:border-[var(--border)] focus-within:border-[var(--teal)] focus-within:ring-2 focus-within:ring-[var(--teal)]/30">
        {hasCoords ? (
          <MapPin
            className="shrink-0 size-3.5 text-[var(--teal)]"
            aria-label="Address verified on map"
          />
        ) : (
          <MapPin className="shrink-0 size-3.5 text-[var(--neutral-cool-600)]/60" aria-hidden="true" />
        )}
        <input
          type="text"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true)
          }}
          onBlur={commitText}
          onKeyDown={onKeyDown}
          placeholder="Start typing a street address…"
          className="w-full bg-transparent text-sm outline-none text-foreground placeholder:text-[var(--neutral-cool-600)]/50"
        />
        {loading && <Loader2 className="size-3.5 shrink-0 text-[var(--neutral-cool-600)] animate-spin" aria-hidden="true" />}
        <InfoTip label="Address">
          Type a street address and pick a suggestion from the dropdown. For example, &ldquo;123 Main St, Portland, OR&rdquo;. Selecting a match locks in the exact coordinates so the AI can analyze foot traffic patterns, nearby businesses, neighborhood demographics, and transit access for this location.
        </InfoTip>
      </div>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-auto rounded-xl border border-[var(--border)] bg-white shadow-lg py-1"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              role="option"
              aria-selected={i === activeIdx}
            >
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(s)
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                  i === activeIdx ? 'bg-[var(--surface-warm-50)]' : 'hover:bg-[var(--surface-warm-50)]/60',
                )}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--teal)]" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-foreground truncate">{s.shortLabel}</span>
                  <span className="block text-[11px] text-[var(--neutral-cool-600)] truncate">{s.displayName}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && suggestions.length === 0 && text.trim().length >= 3 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs text-[var(--neutral-cool-600)] shadow-lg">
          No matches. Keep typing or finish the address by hand.
        </div>
      )}

      {!hasCoords && text.trim().length > 0 && (
        <p className="mt-1 px-2 text-[10px] text-[var(--neutral-cool-600)]">
          Pick a suggestion above so the AI knows the exact block.
        </p>
      )}
    </div>
  )
}
