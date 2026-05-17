// TIM-722: Shared schema, validators, factories, and seeding logic for the
// buildout_equipment workspace document (contractor_bids, timeline, permits).

export const SCHEMA_VERSION = 1

// ── Enum types ────────────────────────────────────────────────────────────────

export type BidScope = 'general' | 'plumbing' | 'electrical' | 'hvac' | 'millwork' | 'signage' | 'other'
export type BidStatus = 'requested' | 'received' | 'accepted' | 'rejected'
export type PermitStatus = 'not_started' | 'submitted' | 'approved' | 'denied' | 'not_applicable'

export const BID_SCOPES: BidScope[] = ['general', 'plumbing', 'electrical', 'hvac', 'millwork', 'signage', 'other']
export const BID_STATUSES: BidStatus[] = ['requested', 'received', 'accepted', 'rejected']
export const PERMIT_STATUSES: PermitStatus[] = ['not_started', 'submitted', 'approved', 'denied', 'not_applicable']

export function isValidBidScope(s: unknown): s is BidScope {
  return BID_SCOPES.includes(s as BidScope)
}
export function isValidBidStatus(s: unknown): s is BidStatus {
  return BID_STATUSES.includes(s as BidStatus)
}
export function isValidPermitStatus(s: unknown): s is PermitStatus {
  return PERMIT_STATUSES.includes(s as PermitStatus)
}

// ── Document types ─────────────────────────────────────────────────────────────

export type ContractorBid = {
  id: string
  scope: BidScope
  contractor_name: string
  bid_total_cents: number
  scheduled_start: string | null
  scheduled_finish: string | null
  status: BidStatus
  notes: string | null
}

export type Milestone = {
  id: string
  key: string
  label: string
  target_date: string | null
  completed: boolean
  notes: string | null
  position: number
}

export type Timeline = {
  target_open_date: string | null
  milestones: Milestone[]
}

export type PermitItem = {
  id: string
  key: string
  label: string
  status: PermitStatus
  submitted_on: string | null
  approved_on: string | null
  notes: string | null
}

export type PermitsData = {
  jurisdiction: { city: string | null; state_or_region: string | null; country: string }
  items: PermitItem[]
}

export type BuildoutDocument = {
  schema_version: number
  contractor_bids: ContractorBid[]
  timeline: Timeline
  permits: PermitsData
  _digest?: Record<string, unknown>
}

// ── Validation ────────────────────────────────────────────────────────────────

export type ValidationResult = { valid: true } | { valid: false; field: string; message: string }

export function validateBuildoutDocument(content: unknown): ValidationResult {
  if (!content || typeof content !== 'object') {
    return { valid: false, field: 'content', message: 'must be an object' }
  }
  const doc = content as Record<string, unknown>

  if (Array.isArray(doc.contractor_bids)) {
    for (let i = 0; i < doc.contractor_bids.length; i++) {
      const bid = doc.contractor_bids[i] as Record<string, unknown>
      if (bid.scope !== undefined && !isValidBidScope(bid.scope)) {
        return { valid: false, field: `contractor_bids[${i}].scope`, message: `invalid scope "${bid.scope}"` }
      }
      if (bid.status !== undefined && !isValidBidStatus(bid.status)) {
        return { valid: false, field: `contractor_bids[${i}].status`, message: `invalid status "${bid.status}"` }
      }
    }
  }

  if (doc.permits && typeof doc.permits === 'object') {
    const permits = doc.permits as Record<string, unknown>
    if (Array.isArray(permits.items)) {
      for (let i = 0; i < permits.items.length; i++) {
        const item = permits.items[i] as Record<string, unknown>
        if (item.status !== undefined && !isValidPermitStatus(item.status)) {
          return { valid: false, field: `permits.items[${i}].status`, message: `invalid status "${item.status}"` }
        }
      }
    }
  }

  return { valid: true }
}

// ── Factories ──────────────────────────────────────────────────────────────────

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function newBid(overrides?: Partial<ContractorBid>): ContractorBid {
  return {
    id: uid(),
    scope: 'general',
    contractor_name: '',
    bid_total_cents: 0,
    scheduled_start: null,
    scheduled_finish: null,
    status: 'requested',
    notes: null,
    ...overrides,
  }
}

export function newMilestone(label: string, key?: string, position?: number): Milestone {
  return {
    id: uid(),
    key: key ?? 'custom',
    label,
    target_date: null,
    completed: false,
    notes: null,
    position: position ?? 0,
  }
}

export function newPermit(label: string, key?: string): PermitItem {
  return {
    id: uid(),
    key: key ?? 'custom',
    label,
    status: 'not_started',
    submitted_on: null,
    approved_on: null,
    notes: null,
  }
}

// ── Default milestones (7) ────────────────────────────────────────────────────

export const DEFAULT_MILESTONES: Array<{ key: string; label: string }> = [
  { key: 'permit_submit', label: 'Submit permit applications' },
  { key: 'demo', label: 'Demolition' },
  { key: 'rough_in', label: 'Rough-in (plumbing + electrical)' },
  { key: 'inspections', label: 'Rough-in inspections' },
  { key: 'finish', label: 'Finish work + millwork' },
  { key: 'equipment_install', label: 'Equipment installation' },
  { key: 'soft_open', label: 'Soft open' },
]

// ── Default permits (5) ───────────────────────────────────────────────────────

export const DEFAULT_PERMITS: Array<{ key: string; label: string }> = [
  { key: 'business_license', label: 'Business license' },
  { key: 'food_handler', label: 'Food handler / food establishment permit' },
  { key: 'health_inspection', label: 'Health department inspection' },
  { key: 'building_permit', label: 'Building permit' },
  { key: 'sign_permit', label: 'Sign permit' },
]

// ── Seeding ───────────────────────────────────────────────────────────────────

export function shouldSeedDefaults(content: unknown): boolean {
  if (!content || typeof content !== 'object') return true
  const doc = content as Record<string, unknown>
  if (!doc.schema_version) return true
  const timeline = doc.timeline as Timeline | undefined
  const permits = doc.permits as PermitsData | undefined
  const hasMilestones = (timeline?.milestones?.length ?? 0) > 0
  const hasPermits = (permits?.items?.length ?? 0) > 0
  return !hasMilestones && !hasPermits
}

export function seedBuildoutDocument(existing?: Partial<BuildoutDocument>): BuildoutDocument {
  const milestones = DEFAULT_MILESTONES.map((m, i) => newMilestone(m.label, m.key, i))
  const permits = DEFAULT_PERMITS.map((p) => newPermit(p.label, p.key))

  return {
    schema_version: SCHEMA_VERSION,
    contractor_bids: existing?.contractor_bids ?? [],
    timeline: {
      target_open_date: existing?.timeline?.target_open_date ?? null,
      milestones: existing?.timeline?.milestones?.length ? existing.timeline.milestones : milestones,
    },
    permits: {
      jurisdiction: existing?.permits?.jurisdiction ?? { city: null, state_or_region: null, country: 'US' },
      items: existing?.permits?.items?.length ? existing.permits.items : permits,
    },
    _digest: existing?._digest,
  }
}

// ── Digest compute (client-side estimate) ─────────────────────────────────────

export function computeBuildoutDigest(doc: BuildoutDocument): Record<string, number> {
  const bids = doc.contractor_bids ?? []
  const buildout_bid_total_cents = bids
    .filter((b) => b.status === 'received' || b.status === 'accepted')
    .reduce((s, b) => s + b.bid_total_cents, 0)
  const open_permits_count = (doc.permits?.items ?? []).filter(
    (p) => p.status !== 'approved' && p.status !== 'not_applicable'
  ).length
  return { buildout_bid_total_cents, open_permits_count }
}
