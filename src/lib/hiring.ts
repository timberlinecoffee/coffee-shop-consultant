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

export type CandidateStatus = 'applied' | 'screening' | 'interviewing' | 'offered' | 'hired' | 'rejected'
export type OnboardingPhase = 'pre_boarding' | 'day_1' | 'week_1' | 'month_1' | 'month_2' | 'month_3'

export interface OrgRole {
  id: string
  plan_id: string
  role_title: string
  headcount: number
  start_date: string | null
  monthly_cost_cents: number | null
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
  detail: string | null
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


export const PHASE_LABELS: Record<OnboardingPhase, string> = {
  pre_boarding: 'Pre-Boarding',
  day_1:        'Day 1',
  week_1:       'Week 1',
  month_1:      '30 Days',
  month_2:      '60 Days',
  month_3:      '90 Days',
}

export const CANDIDATE_STATUS_ORDER: CandidateStatus[] = [
  'applied', 'screening', 'interviewing', 'offered', 'hired', 'rejected',
]

export const PHASE_ORDER: OnboardingPhase[] = [
  'pre_boarding', 'day_1', 'week_1', 'month_1', 'month_2', 'month_3',
]

// ── TIM-1300: Country requirements ───────────────────────────────────────────

export type HiringCountry = 'US' | 'GB' | 'CA' | 'AU' | 'MX'

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
  { code: 'MX', label: 'Mexico' },
]

// Default onboarding tasks seeded when a new onboarding plan instance is created.
export const DEFAULT_ONBOARDING_TASKS: Array<{ phase: OnboardingPhase; task: string; detail: string | null; due_offset_days: number }> = [
  { phase: 'pre_boarding', task: 'Send Welcome Letter and First-Day Schedule', detail: 'Email a warm welcome message including the start time, dress code, parking instructions, and who to ask for on arrival. Attach the first-day schedule.', due_offset_days: -7 },
  { phase: 'pre_boarding', task: 'Collect Required New-Hire Documents', detail: 'Request completed W-4, I-9 Section 1, direct deposit form, and any state-specific tax forms. Use your HR portal or email if no portal is set up.', due_offset_days: -5 },
  { phase: 'pre_boarding', task: 'Set Up POS and System Logins', detail: 'Create accounts in your POS system, scheduling app, and any other tools the new hire will use. Send credentials securely before Day 1.', due_offset_days: -3 },
  { phase: 'pre_boarding', task: 'Order Uniform and Equipment', detail: 'Confirm shirt size and order any branded items. Prepare the station, keys, and any tools they will need ready at their workstation on Day 1.', due_offset_days: -7 },
  { phase: 'day_1', task: 'Complete New-Hire Paperwork and I-9 Verification', detail: 'Verify I-9 documents in person. Collect any remaining signed forms (offer letter, handbook acknowledgment, direct deposit). File originals securely.', due_offset_days: 0 },
  { phase: 'day_1', task: 'Introduce to Team and Walk Through Facility', detail: 'Tour the full space: kitchen, storage, restrooms, break area, exits. Introduce every team member they will work alongside regularly.', due_offset_days: 0 },
  { phase: 'day_1', task: 'Review Safety Procedures and Emergency Exits', detail: 'Walk through fire extinguisher locations, emergency exits, first-aid kit, and any food-safety protocols. Confirm the new hire knows the evacuation plan.', due_offset_days: 0 },
  { phase: 'day_1', task: 'Set Up POS Login and System Access', detail: 'Walk through the POS hands-on: login, cash drawer, voids, and end-of-day close. Confirm scheduling app access and any shift-swap tools.', due_offset_days: 0 },
  { phase: 'week_1', task: 'Complete Food Handler or Barista Certification', detail: 'Confirm any locally required food handler card or barista certification is registered and in progress. Provide the link or study materials.', due_offset_days: 3 },
  { phase: 'week_1', task: 'Shadow Senior Barista on Espresso Workflow', detail: 'At least one full shift shadowing an experienced team member. Focus on espresso extraction, milk texturing, and workflow efficiency under rush conditions.', due_offset_days: 2 },
  { phase: 'week_1', task: 'Review Menu, Drink Recipes, and Portion Standards', detail: 'Go through the full menu and recipe cards. Cover portion standards, allergen awareness, and any seasonal or limited items currently on offer.', due_offset_days: 4 },
  { phase: 'week_1', task: 'First Solo Shift (Supervised)', detail: 'First shift working mostly independently with a manager or senior barista nearby. Debrief afterward: what went well, what needs more practice.', due_offset_days: 5 },
  { phase: 'month_1', task: '30-Day Check-In with Manager', detail: 'Informal one-on-one. Cover how the role is going, any questions or concerns, and initial feedback on performance. Not a formal review -- just a check-in.', due_offset_days: 30 },
  { phase: 'month_1', task: 'Complete Initial Competency Self-Assessment', detail: 'New hire rates themselves on key skills using the competency rubric. Manager reviews and calibrates. Identifies focus areas for the next 30 days.', due_offset_days: 28 },
  { phase: 'month_1', task: 'Review Schedule Preferences and Availability', detail: 'Update scheduling preferences, confirm any recurring commitments, and agree on shift patterns for the next 60 days.', due_offset_days: 25 },
  { phase: 'month_2', task: '60-Day Performance Review', detail: 'Structured conversation using the competency rubric. Cover strengths, areas for growth, and set 1-2 specific development goals for the next 30 days.', due_offset_days: 60 },
  { phase: 'month_2', task: 'Identify One Skill Development Focus', detail: 'Together with the new hire, pick one concrete skill to deepen this quarter -- latte art, inventory management, opening/closing, or similar.', due_offset_days: 58 },
  { phase: 'month_3', task: '90-Day Formal Evaluation', detail: 'Formal performance review. Compare current rating against Day 1 self-assessment. Confirm role fit, discuss compensation review timeline if applicable.', due_offset_days: 90 },
  { phase: 'month_3', task: 'Discuss Career Growth and Next 6-Month Goals', detail: 'Set 1-3 goals for the next 6 months. Could include a shift lead role, a new skill area, or cross-training. Document and revisit at next review.', due_offset_days: 90 },
]
