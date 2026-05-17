'use client'

// TIM-722: Client hook for reading/writing the buildout_equipment workspace
// document. Each card consumes this hook and holds one slice of the document.
// Before every PUT, we refetch to merge, so concurrent saves don't clobber.

import { useState, useEffect, useCallback } from 'react'
import type { BuildoutDocument, ContractorBid, Timeline, PermitsData } from '@/lib/buildout/seedDefaults'
import { shouldSeedDefaults, seedBuildoutDocument } from '@/lib/buildout/seedDefaults'

export type DocStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'paywall'

export type BuildoutDocSlice = 'contractor_bids' | 'timeline' | 'permits'

export type UseBuildoutDocumentResult<S extends BuildoutDocSlice> = {
  status: DocStatus
  data: S extends 'contractor_bids' ? ContractorBid[]
      : S extends 'timeline' ? Timeline
      : PermitsData
  save: (next: S extends 'contractor_bids' ? ContractorBid[]
              : S extends 'timeline' ? Timeline
              : PermitsData) => Promise<void>
}

const BASE_URL = '/api/workspaces/buildout_equipment'

async function fetchDoc(): Promise<BuildoutDocument | null> {
  const res = await fetch(BASE_URL, { credentials: 'same-origin' })
  if (!res.ok) return null
  const json = await res.json()
  if (!json.content) return null
  return json.content as BuildoutDocument
}

async function putDoc(content: BuildoutDocument): Promise<{ ok: boolean; paywall?: boolean }> {
  const res = await fetch(BASE_URL, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (res.status === 402) return { ok: false, paywall: true }
  return { ok: res.ok }
}

function emptyDoc(): BuildoutDocument {
  return seedBuildoutDocument()
}

const SLICE_DEFAULTS: Record<BuildoutDocSlice, unknown> = {
  contractor_bids: [],
  timeline: { target_open_date: null, milestones: [] },
  permits: { jurisdiction: { city: null, state_or_region: null, country: 'US' }, items: [] },
}

export function useBuildoutDocument<S extends BuildoutDocSlice>(slice: S): UseBuildoutDocumentResult<S> {
  const [doc, setDoc] = useState<BuildoutDocument | null>(null)
  const [status, setStatus] = useState<DocStatus>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    fetchDoc().then((fetched) => {
      if (cancelled) return
      if (!fetched) {
        // No document yet — use seeded defaults locally; will persist on first save
        setDoc(emptyDoc())
      } else if (shouldSeedDefaults(fetched)) {
        setDoc(seedBuildoutDocument(fetched))
      } else {
        setDoc(fetched)
      }
      setStatus('idle')
    }).catch(() => {
      if (!cancelled) setStatus('error')
    })
    return () => { cancelled = true }
  }, [])

  const data = (doc ? (doc[slice] ?? SLICE_DEFAULTS[slice]) : SLICE_DEFAULTS[slice]) as UseBuildoutDocumentResult<S>['data']

  const save = useCallback(async (next: UseBuildoutDocumentResult<S>['data']) => {
    setStatus('saving')
    try {
      // Refetch to merge so sibling cards saving concurrently don't clobber each other
      const current = await fetchDoc()
      const base: BuildoutDocument = current ?? emptyDoc()
      const merged: BuildoutDocument = { ...base, [slice]: next }
      const result = await putDoc(merged)
      if (result.paywall) {
        setStatus('paywall')
        return
      }
      if (!result.ok) {
        setStatus('error')
        return
      }
      setDoc(merged)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }, [slice])

  return { status, data, save } as UseBuildoutDocumentResult<S>
}
