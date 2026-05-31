// TIM-1518: Single source of truth for the Opening Month Plan starter
// playbook + the day_offset bounds enforced by the Postgres CHECK
// constraint on `public.soft_open_plan_items`. The smoke test in
// seed.test.mjs imports both so any drift between the seed data and the
// SQL constraint fails CI before a founder click.

export interface SeedRow {
  day_offset: number;
  task: string;
  owner: string | null;
  notes: string | null;
}

// Must stay in sync with migration
// 20260531145023_tim1518_widen_soft_open_plan_items_day_offset.sql.
export const DAY_OFFSET_MIN = -90;
export const DAY_OFFSET_MAX = 365;

export const SEED_ROWS: SeedRow[] = [
  // ── Pre-Open Weeks ────────────────────────────────────────────────────────
  { day_offset: -28, task: "Lock Staff Training Schedule", owner: "Founder", notes: "Week-by-week milk, espresso, register, and POS run-throughs." },
  { day_offset: -21, task: "Place First Supplier Orders", owner: "Founder", notes: "Coffee, milk, cups, lids, syrups, pastry — confirm lead times." },
  { day_offset: -14, task: "Walk The Neighborhood", owner: "Founder", notes: "Drop intro cards at nearby businesses, offices, and residential buildings." },
  { day_offset: -10, task: "Friends And Family Soft Open Date", owner: "Founder", notes: "Pick a date and an invite list. Treat it as a real dress rehearsal." },
  { day_offset: -7, task: "Soft Open Dry Run With Staff", owner: "Founder", notes: "Full opening flow with no customers. Time the bar and identify gaps." },
  { day_offset: -3, task: "Confirm Grand Open Marketing Push", owner: "Founder", notes: "Sign, social posts, local press follow-up, neighborhood signage." },

  // ── Opening Week ──────────────────────────────────────────────────────────
  { day_offset: 0, task: "Grand Open Day", owner: "Founder", notes: "Plan staffing as if you'll be twice as busy. Have backup bar staff." },
  { day_offset: 1, task: "Daily Debrief With Staff", owner: "Founder", notes: "Fifteen minutes after close. What broke, what worked, what to change." },
  { day_offset: 3, task: "Restock From First Sales Read", owner: "Founder", notes: "Reorder anything sold faster than projected. Adjust par levels." },
  { day_offset: 7, task: "First Week Recap", owner: "Founder", notes: "Sales by daypart, top sellers, customer feedback themes, staff notes." },

  // ── First 30 Days ─────────────────────────────────────────────────────────
  { day_offset: 10, task: "Lock Supplier Delivery Cadence", owner: "Founder", notes: "Confirm weekly cadence with each vendor based on real sell-through." },
  { day_offset: 14, task: "Two Week KPI Check", owner: "Founder", notes: "Ticket size, drink mix, labor as % of sales, waste. Note what to tweak." },
  { day_offset: 21, task: "Three Week Staff Review", owner: "Founder", notes: "One-on-ones with each opener. Address coverage gaps before month two." },
  { day_offset: 28, task: "Month One Recap And Plan", owner: "Founder", notes: "What stays, what changes for month two. Update training and menu as needed." },
];
