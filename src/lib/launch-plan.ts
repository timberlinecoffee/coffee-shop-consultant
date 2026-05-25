// TIM-1040: Launch plan types, track definitions, and backward scheduler.

export const TRACK_KEYS = [
  'legal_compliance',
  'real_estate_buildout',
  'equipment',
  'brand_marketing',
  'menu_operations',
  'people_hiring',
  'finance_admin',
  'pre_launch_events',
  'post_launch',
] as const

export type TrackKey = (typeof TRACK_KEYS)[number]

export const TRACK_LABELS: Record<TrackKey, string> = {
  legal_compliance: 'Legal & Compliance',
  real_estate_buildout: 'Real Estate & Build-out',
  equipment: 'Equipment',
  brand_marketing: 'Brand & Marketing',
  menu_operations: 'Menu & Operations',
  people_hiring: 'People & Hiring',
  finance_admin: 'Finance & Admin',
  pre_launch_events: 'Pre-Launch Events',
  post_launch: 'Post-Launch',
}

// Track colors (Tailwind bg/border/text classes — teal family, unique per track)
export const TRACK_COLORS: Record<TrackKey, { bg: string; border: string; text: string; dot: string }> = {
  legal_compliance:     { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  real_estate_buildout: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  equipment:            { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
  brand_marketing:      { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-700',   dot: 'bg-pink-500' },
  menu_operations:      { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500' },
  people_hiring:        { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  finance_admin:        { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   dot: 'bg-teal-500' },
  pre_launch_events:    { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-700',   dot: 'bg-rose-500' },
  post_launch:          { bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-700',  dot: 'bg-slate-500' },
}

export type MilestoneStatus = 'not_started' | 'in_progress' | 'blocked' | 'done'
export type MilestoneSource = 'ai_generated' | 'user_added'

export interface Milestone {
  id: string
  plan_id: string
  title: string
  description: string | null
  track: TrackKey
  target_date: string | null   // ISO date string YYYY-MM-DD
  actual_date: string | null
  status: MilestoneStatus
  estimated_duration_days: number | null
  depends_on_milestone_ids: string[]
  critical_path: boolean
  owner: string
  ai_notes: string | null
  user_edited: boolean
  source: MilestoneSource
  order_index: number
  created_at: string
  updated_at: string
}

// Config stored in workspace_documents for launch_plan key.
export interface LaunchPlanConfig {
  targetLaunchDate: string | null          // ISO date string YYYY-MM-DD
  lastGeneratedAt: string | null           // ISO timestamp
  viewPreference: 'list' | 'calendar'
  sourcesSnapshotAt: string | null         // ISO timestamp — when sources were last snapshotted
}

export function defaultLaunchPlanConfig(): LaunchPlanConfig {
  return {
    targetLaunchDate: null,
    lastGeneratedAt: null,
    viewPreference: 'list',
    sourcesSnapshotAt: null,
  }
}

export function normalizeLaunchPlanConfig(raw: unknown): LaunchPlanConfig {
  const defaults = defaultLaunchPlanConfig()
  if (!raw || typeof raw !== 'object') return defaults
  const r = raw as Record<string, unknown>
  return {
    targetLaunchDate: typeof r.targetLaunchDate === 'string' ? r.targetLaunchDate : defaults.targetLaunchDate,
    lastGeneratedAt: typeof r.lastGeneratedAt === 'string' ? r.lastGeneratedAt : defaults.lastGeneratedAt,
    viewPreference: r.viewPreference === 'calendar' ? 'calendar' : 'list',
    sourcesSnapshotAt: typeof r.sourcesSnapshotAt === 'string' ? r.sourcesSnapshotAt : defaults.sourcesSnapshotAt,
  }
}

// ── Backward scheduler ────────────────────────────────────────────────────────

/**
 * Returns a date that is `days` calendar days before `launchDate`.
 * Returns null if launchDate is null.
 */
export function daysBeforeLaunch(launchDate: string, days: number): string {
  const d = new Date(launchDate)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * Returns the number of calendar days between today and targetDate.
 * Negative = overdue.
 */
export function daysToGo(targetDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/**
 * Color signal for days-to-go pill.
 */
export function daysToGoColor(days: number, status: MilestoneStatus): 'green' | 'amber' | 'red' | 'done' {
  if (status === 'done') return 'done'
  if (days > 30) return 'green'
  if (days >= 0) return 'amber'
  return 'red'
}

// Lead-time conflict check: a milestone with estimatedDurationDays that exceed
// the days until launch is flagged as conflicted.
export interface LeadTimeConflict {
  milestoneId: string
  title: string
  requiredDays: number
  availableDays: number
}

export function detectLeadTimeConflicts(milestones: Milestone[], targetLaunchDate: string): LeadTimeConflict[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const launch = new Date(targetLaunchDate)
  launch.setHours(0, 0, 0, 0)
  const totalDays = Math.round((launch.getTime() - today.getTime()) / 86_400_000)

  return milestones
    .filter(
      (m) =>
        m.status !== 'done' &&
        m.estimated_duration_days != null &&
        m.target_date != null &&
        m.estimated_duration_days > 0,
    )
    .flatMap((m) => {
      const available = Math.round(
        (new Date(m.target_date!).getTime() - today.getTime()) / 86_400_000,
      )
      if (m.estimated_duration_days! > available && available < totalDays) {
        return [
          {
            milestoneId: m.id,
            title: m.title,
            requiredDays: m.estimated_duration_days!,
            availableDays: available,
          },
        ]
      }
      return []
    })
}

// ── Calendar helpers ──────────────────────────────────────────────────────────

export interface CalendarMonth {
  year: number
  month: number // 0-indexed
  weeks: (CalendarDay | null)[][]
}

export interface CalendarDay {
  date: string // YYYY-MM-DD
  dayNum: number
  isToday: boolean
  isLaunchDay: boolean
  milestones: Milestone[]
}

export function buildCalendarMonths(
  milestones: Milestone[],
  targetLaunchDate: string | null,
  monthsBefore = 6,
  monthsAfter = 1,
): CalendarMonth[] {
  const today = new Date()
  const startDate = new Date(today)
  startDate.setMonth(startDate.getMonth() - monthsBefore)
  startDate.setDate(1)

  const endDate = new Date(today)
  endDate.setMonth(endDate.getMonth() + monthsAfter + 1)
  endDate.setDate(0)

  const milestonesByDate = new Map<string, Milestone[]>()
  for (const m of milestones) {
    if (!m.target_date) continue
    const existing = milestonesByDate.get(m.target_date) ?? []
    existing.push(m)
    milestonesByDate.set(m.target_date, existing)
  }

  const todayStr = today.toISOString().slice(0, 10)
  const months: CalendarMonth[] = []

  let cursor = new Date(startDate)
  while (cursor <= endDate) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const weeks: (CalendarDay | null)[][] = []
    let week: (CalendarDay | null)[] = new Array(firstDay.getDay()).fill(null)

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      week.push({
        date: dateStr,
        dayNum: d,
        isToday: dateStr === todayStr,
        isLaunchDay: dateStr === targetLaunchDate,
        milestones: milestonesByDate.get(dateStr) ?? [],
      })
      if (week.length === 7) {
        weeks.push(week)
        week = []
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null)
      weeks.push(week)
    }

    months.push({ year, month, weeks })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return months
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
