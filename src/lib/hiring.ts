// TIM-965: Hiring & Onboarding Suite — data types and config constants.
// Row-level tables (not workspace_documents JSONB) back this workspace.
// TIM-1300: Country-specific requirements types added.

// TIM-1217: Every "add" button in this suite (roles, candidates, questions,
// competencies, staff) inserts a BLANK row optimistically and lets the user
// edit the label field (role_title / name / prompt / skill) inline. An empty
// string is therefore a VALID create. POST handlers must require only that the
// field is present as a string — `!value` rejected "" with a 400, which made
// the optimistic row revert: the founder saw "Create a role" open for a split
// second and instantly close. Use this guard so the contract lives in one place
// and the next copy-paste can't re-introduce the empty-string rejection.
export function isProvidedString(value: unknown): value is string {
  return typeof value === 'string'
}

export type HiringRoleStatus = 'planned' | 'posted' | 'interviewing' | 'hired'
export type CandidateStatus = 'applied' | 'screening' | 'interviewing' | 'offered' | 'hired' | 'rejected'
export type OnboardingPhase = 'day_1' | 'week_1' | 'month_1' | 'month_2' | 'month_3'

export interface OrgRole {
  id: string
  plan_id: string
  role_title: string
  headcount: number
  start_date: string | null
  monthly_cost_cents: number | null
  status: HiringRoleStatus
  notes: string | null
  parent_role_id: string | null
  jd_template_id: string | null
}

export interface JobDescriptionTemplate {
  id: string
  plan_id: string | null
  org_role_template_id: string | null
  title: string
  summary: string
  responsibilities: string
  requirements: string
  comp: string
  is_system: boolean
}

export interface InterviewCandidate {
  id: string
  plan_id: string
  role_id: string | null
  name: string
  contact: string | null
  status: CandidateStatus
  notes: string | null
  position: number
}

export interface InterviewScorecard {
  id: string
  plan_id: string
  role_id: string | null
  name: string
  is_default: boolean
  order_index: number
  created_at: string
  updated_at: string
}

export interface CompetencyFormTemplate {
  id: string
  plan_id: string
  role_id: string | null
  name: string
  order_index: number
  created_at: string
  updated_at: string
}

export interface InterviewQuestion {
  id: string
  plan_id: string
  role_id: string | null
  scorecard_id: string | null
  prompt: string
  weight: number
  order_index: number
}

export interface InterviewScore {
  id: string
  candidate_id: string
  question_id: string
  scorecard_id: string | null
  score: number
  notes: string | null
}

export interface OnboardingPlanInstance {
  id: string
  plan_id: string
  candidate_id: string | null
  role_id: string | null
  hire_name: string
  start_date: string | null
}

export interface OnboardingTask {
  id: string
  instance_id: string
  phase: OnboardingPhase
  task: string
  due_offset_days: number | null
  completed_at: string | null
  notes: string | null
  order_index: number
}

export interface StaffCompetency {
  id: string
  plan_id: string
  skill: string
  rubric: string
  required_for_role: string | null
  form_template_id: string | null
  weight: number
  order_index: number
}

export interface StaffFile {
  id: string
  plan_id: string
  name: string
  hire_date: string | null
  role_id: string | null
  notes: string | null
}

export interface CompetencyEvaluation {
  id: string
  staff_file_id: string
  competency_id: string
  score: number
  notes: string | null
  evaluated_at: string
}

export const CANDIDATE_STATUS_CONFIG: Record<CandidateStatus, { label: string; className: string }> = {
  applied:      { label: 'Applied',      className: 'bg-sky-100 text-sky-700 border-sky-200' },
  screening:    { label: 'Screening',    className: 'bg-amber-100 text-amber-700 border-amber-200' },
  interviewing: { label: 'Interviewing', className: 'bg-violet-100 text-violet-700 border-violet-200' },
  offered:      { label: 'Offered',      className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  hired:        { label: 'Hired',        className: 'bg-teal-100 text-teal-800 border-teal-200' },
  rejected:     { label: 'Rejected',     className: 'bg-rose-100 text-rose-600 border-rose-200' },
}

export const ROLE_STATUS_CONFIG: Record<HiringRoleStatus, { label: string; className: string }> = {
  planned:      { label: 'Planned',      className: 'bg-slate-100 text-slate-600 border-slate-200' },
  posted:       { label: 'Posted',       className: 'bg-sky-100 text-sky-700 border-sky-200' },
  interviewing: { label: 'Interviewing', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  hired:        { label: 'Hired',        className: 'bg-teal-100 text-teal-800 border-teal-200' },
}

export const PHASE_LABELS: Record<OnboardingPhase, string> = {
  day_1:   'Day 1',
  week_1:  'Week 1',
  month_1: '30 Days',
  month_2: '60 Days',
  month_3: '90 Days',
}

export const CANDIDATE_STATUS_ORDER: CandidateStatus[] = [
  'applied', 'screening', 'interviewing', 'offered', 'hired', 'rejected',
]

export const PHASE_ORDER: OnboardingPhase[] = [
  'day_1', 'week_1', 'month_1', 'month_2', 'month_3',
]

// ── TIM-1300: Country requirements ───────────────────────────────────────────

export type HiringCountry = 'US' | 'GB' | 'CA' | 'AU'

export interface PlanHiringSettings {
  hiring_country: HiringCountry | null
  effective_country: HiringCountry | null
}

export interface HiringRequirementSet {
  id: string
  country_code: HiringCountry
  category: string
  title: string
  body: string
  citation_url: string | null
  order_index: number
  is_system: boolean
}

export const HIRING_COUNTRY_OPTIONS: Array<{ code: HiringCountry; label: string }> = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
]

// Default onboarding tasks seeded when a new onboarding plan instance is created.
export const DEFAULT_ONBOARDING_TASKS: Array<{ phase: OnboardingPhase; task: string; due_offset_days: number }> = [
  { phase: 'day_1', task: 'Complete new-hire paperwork and I-9 verification', due_offset_days: 0 },
  { phase: 'day_1', task: 'Introduce to team and walk through facility', due_offset_days: 0 },
  { phase: 'day_1', task: 'Review safety procedures and emergency exits', due_offset_days: 0 },
  { phase: 'day_1', task: 'Set up POS login and system access', due_offset_days: 0 },
  { phase: 'week_1', task: 'Complete food handler or barista certification (if required)', due_offset_days: 3 },
  { phase: 'week_1', task: 'Shadow senior barista on espresso workflow', due_offset_days: 2 },
  { phase: 'week_1', task: 'Review menu, drink recipes, and portion standards', due_offset_days: 4 },
  { phase: 'week_1', task: 'First solo shift (supervised)', due_offset_days: 5 },
  { phase: 'month_1', task: '30-day check-in with manager', due_offset_days: 30 },
  { phase: 'month_1', task: 'Complete initial competency self-assessment', due_offset_days: 28 },
  { phase: 'month_1', task: 'Review schedule preferences and availability', due_offset_days: 25 },
  { phase: 'month_2', task: '60-day performance review', due_offset_days: 60 },
  { phase: 'month_2', task: 'Identify one area for skill development this quarter', due_offset_days: 58 },
  { phase: 'month_3', task: '90-day formal evaluation', due_offset_days: 90 },
  { phase: 'month_3', task: 'Discuss career growth and next 6-month goals', due_offset_days: 90 },
]
