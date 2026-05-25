// TIM-1063: Progress dashboard helpers.
//
// Pure data-shaping for the "Next step" card, workspace completion strip,
// stale nudges, and recent activity feed. Server-side fetching lives in the
// dashboard page; this module is intentionally side-effect free so it can be
// unit-tested without a Supabase client.

// NOTE: this module deliberately does not import from `./workspace-manifest`
// or `./modules` so the unit test (`dashboard-nudges.test.mjs`) can run under
// Node's `--experimental-strip-types` without hitting cross-file ESM
// resolution issues. The constants below MUST stay in sync with
// `WORKSPACE_MANIFEST` / `AVAILABLE_MODULES`; the contract is pinned by
// `dashboard-nudges.test.mjs` and `workspace-manifest.test.mjs`.

export type NavIcon =
  | "lightbulb"
  | "bar-chart"
  | "map-pin"
  | "utensils"
  | "wrench"
  | "rocket"
  | "users"
  | "megaphone"
  | "file-text";

interface NudgeManifestEntry {
  moduleNumber: number;
  label: string;
  href: string;
  icon: NavIcon;
  totalSections: number | null;
  /** True when the workspace page has actually shipped on every env. */
  isShipped: boolean;
}

// Mirror of WORKSPACE_MANIFEST + AVAILABLE_MODULES from ./workspace-manifest
// and ./modules. Update both files together.
const NUDGE_MANIFEST: ReadonlyArray<NudgeManifestEntry> = [
  { moduleNumber: 1, label: "Concept",              href: "/workspace/concept",           icon: "lightbulb",  totalSections: 5,    isShipped: true },
  { moduleNumber: 2, label: "Financials",           href: "/workspace/financials",         icon: "bar-chart",  totalSections: 2,    isShipped: true },
  { moduleNumber: 3, label: "Location & Lease",     href: "/workspace/location-lease",     icon: "map-pin",    totalSections: 3,    isShipped: true },
  { moduleNumber: 4, label: "Menu & Pricing",       href: "/workspace/menu-pricing",       icon: "utensils",   totalSections: null, isShipped: true },
  { moduleNumber: 5, label: "Build Out & Equipment",href: "/workspace/buildout-equipment", icon: "wrench",     totalSections: null, isShipped: true },
  { moduleNumber: 6, label: "Launch Plan",          href: "/workspace/launch-plan",        icon: "rocket",     totalSections: null, isShipped: true },
  { moduleNumber: 7, label: "Hiring & Onboarding",  href: "/workspace/hiring",             icon: "users",      totalSections: 4,    isShipped: true },
  { moduleNumber: 8, label: "Business Plan",        href: "/workspace/business-plan",      icon: "file-text",  totalSections: null, isShipped: true },
  { moduleNumber: 9, label: "Marketing",            href: "/workspace/marketing",          icon: "megaphone",  totalSections: null, isShipped: true },
];

// Recommendation priority — lower index = higher priority. The new owner
// should see Concept → Financials → Menu → Buildout → Launch → Hiring →
// Business Plan → Marketing nudged first, with any future Suppliers / SOPs
// workspaces inserted near their natural position once they ship.
//
// Keys match WORKSPACE_MANIFEST.moduleNumber.
export const RECOMMENDATION_ORDER: ReadonlyArray<number> = [
  1, // Concept
  2, // Financials
  3, // Location & Lease
  4, // Menu & Pricing
  5, // Build Out & Equipment
  6, // Launch Plan
  7, // Hiring & Onboarding
  8, // Business Plan
  9, // Marketing
];

// Days before a workspace is considered "stale" for the nudge feed.
export const STALE_THRESHOLD_DAYS = 7;

export interface WorkspaceProgressSnapshot {
  moduleNumber: number;
  label: string;
  href: string;
  icon: NavIcon;
  isUnlocked: boolean;
  /** Filled sections, capped by totalSections. 0 when nothing is touched. */
  filledSections: number;
  /** Total expected sections. null = workspace has no section-based progress. */
  totalSections: number | null;
  /** Percent complete, clamped 0..100. null when totalSections is null. */
  pct: number | null;
  /** Last edit timestamp (ISO), or null if never edited. */
  lastTouchedAt: string | null;
  /** True if filledSections === totalSections (and totalSections > 0). */
  isComplete: boolean;
  /** True if filledSections > 0. */
  isStarted: boolean;
}

export interface NextStepSuggestion {
  moduleNumber: number;
  label: string;
  href: string;
  /** Founder-voice copy. No leverage/synergy/passionate/curated. */
  headline: string;
  /** Short body explaining why this is next. */
  body: string;
  ctaLabel: string;
}

export interface StaleNudge {
  moduleNumber: number;
  label: string;
  href: string;
  /** Days since the workspace was last edited. */
  daysStale: number;
  message: string;
}

export interface ActivityEntry {
  moduleNumber: number;
  label: string;
  href: string;
  /** Edit timestamp (ISO). */
  at: string;
  /** Short human label (e.g. "Edited Concept"). */
  summary: string;
}

export interface RecentActivityInput {
  /** Workspace key → last edit ISO timestamp. Missing keys = never edited. */
  lastTouchedByKey: Map<string, string>;
}

/**
 * Build the per-workspace snapshot list using the live manifest and the
 * completedByModule counter already computed by the dashboard/workspace
 * layout. Workspaces whose pages have not shipped are filtered out so the
 * dashboard quietly omits Suppliers/Marketing/SOPs until they exist.
 */
export function buildWorkspaceSnapshots(
  completedByModule: Map<number, number>,
  lastTouchedByKey: Map<string, string>
): WorkspaceProgressSnapshot[] {
  return NUDGE_MANIFEST.filter((item) => item.isShipped).map(
    (item) => buildSnapshot(item, completedByModule, lastTouchedByKey)
  );
}

function buildSnapshot(
  item: NudgeManifestEntry,
  completedByModule: Map<number, number>,
  lastTouchedByKey: Map<string, string>
): WorkspaceProgressSnapshot {
  const rawFilled = completedByModule.get(item.moduleNumber) ?? 0;
  const filledSections = item.totalSections != null ? Math.min(rawFilled, item.totalSections) : rawFilled;
  const pct =
    item.totalSections != null && item.totalSections > 0
      ? Math.min(100, Math.round((filledSections / item.totalSections) * 100))
      : null;
  const key = workspaceKeyForModule(item.moduleNumber);
  const lastTouchedAt = key ? lastTouchedByKey.get(key) ?? null : null;
  return {
    moduleNumber: item.moduleNumber,
    label: item.label,
    href: item.href,
    icon: item.icon,
    isUnlocked: item.isShipped,
    filledSections,
    totalSections: item.totalSections,
    pct,
    lastTouchedAt,
    isComplete: item.totalSections != null && item.totalSections > 0 && filledSections >= item.totalSections,
    isStarted: filledSections > 0 || lastTouchedAt !== null,
  };
}

/**
 * Pick the single "do this next" suggestion. Picks the first workspace in
 * RECOMMENDATION_ORDER that is unlocked, not marked "good enough for now",
 * and not yet complete. Returns null only when every shipped workspace is
 * complete or every one has been opted out.
 *
 * `optedOut` carries module numbers the owner explicitly marked good enough.
 */
export function pickNextStep(
  snapshots: WorkspaceProgressSnapshot[],
  optedOut: ReadonlySet<number> = new Set()
): NextStepSuggestion | null {
  const byNumber = new Map(snapshots.map((s) => [s.moduleNumber, s] as const));
  for (const moduleNumber of RECOMMENDATION_ORDER) {
    const snap = byNumber.get(moduleNumber);
    if (!snap || !snap.isUnlocked) continue;
    if (optedOut.has(moduleNumber)) continue;
    if (snap.isComplete) continue;
    return suggestionFor(snap);
  }
  return null;
}

function suggestionFor(snap: WorkspaceProgressSnapshot): NextStepSuggestion {
  const copy = NEXT_STEP_COPY[snap.moduleNumber];
  // Fall back to a generic founder-voice line if no per-workspace copy exists,
  // so a freshly added workspace still gets a useful nudge.
  const headline = copy?.headline ?? `Open the ${snap.label} workspace.`;
  const body = snap.isStarted
    ? copy?.continueBody ?? `Pick up where you left off in ${snap.label}.`
    : copy?.startBody ?? `Start with ${snap.label}. A few minutes here moves the rest of the plan forward.`;
  const ctaLabel = snap.isStarted ? "Continue" : "Start";
  return {
    moduleNumber: snap.moduleNumber,
    label: snap.label,
    href: snap.href,
    headline,
    body,
    ctaLabel,
  };
}

interface NextStepCopy {
  headline: string;
  startBody: string;
  continueBody: string;
}

// Per-workspace copy. Founder-voice. No emojis. No leverage/synergy/
// passionate/curated. Headlines are Title Case-friendly sentence fragments.
const NEXT_STEP_COPY: Record<number, NextStepCopy> = {
  1: {
    headline: "Write your concept first.",
    startBody:
      "The concept anchors every other decision — menu, location, even hiring. Spend 15 minutes on it now.",
    continueBody:
      "Finish the concept so the menu, location, and financials have something to work from.",
  },
  2: {
    headline: "Calculate startup costs.",
    startBody:
      "Numbers turn the concept into something you can hand to a banker. Start with startup costs and the first 12 months.",
    continueBody:
      "Pick up your numbers — finish the startup-cost line items so the runway view is real.",
  },
  3: {
    headline: "Pick a target neighborhood.",
    startBody:
      "Without a neighborhood the rent assumptions are guesses. Set a target city and a couple of candidate streets.",
    continueBody:
      "Tighten the location notes — score one or two real candidates so the build-out has a footprint.",
  },
  4: {
    headline: "Draft your opening menu.",
    startBody:
      "Seed three signature drinks and a small food list. The menu drives equipment and supplier choices.",
    continueBody:
      "Round out the menu — add prices and a couple of signatures so the financials have COGS to chew on.",
  },
  5: {
    headline: "List the equipment you actually need.",
    startBody:
      "Pull a starter equipment list so build-out and supplier conversations have a concrete spec.",
    continueBody:
      "Fill in the build-out — confirm quantities and prices so the budget stops being a guess.",
  },
  6: {
    headline: "Set your target open date.",
    startBody:
      "Once an opening date is on the calendar, every other workspace gets a deadline. Pick a realistic one.",
    continueBody:
      "Walk the milestones — adjust dates so the launch plan actually fits build-out and hiring.",
  },
  7: {
    headline: "Sketch the opening team.",
    startBody:
      "Decide the headcount and roles for opening day. Even a one-line job description helps the financials.",
    continueBody:
      "Finish the role list — fill out the JD summaries so payroll lines up with the schedule.",
  },
  8: {
    headline: "Assemble your business plan.",
    startBody:
      "The business plan stitches every workspace into one doc. Open it once the basics are in place.",
    continueBody:
      "Review the assembled business plan — fix any thin sections before you export.",
  },
  9: {
    headline: "Plan the pre-launch marketing.",
    startBody:
      "Get the marketing workspace going — waitlist, social handles, a press list. Small moves now save money later.",
    continueBody:
      "Finish the pre-launch marketing — confirm the waitlist plan and grand-opening promo.",
  },
};

/**
 * Build stale nudges for workspaces that have not been edited recently AND
 * have obvious gaps (not yet complete). Skips workspaces the owner marked
 * "good enough for now". Capped at `limit` entries.
 */
export function buildStaleNudges(
  snapshots: WorkspaceProgressSnapshot[],
  options: {
    now?: Date;
    thresholdDays?: number;
    optedOut?: ReadonlySet<number>;
    limit?: number;
  } = {}
): StaleNudge[] {
  const now = options.now ?? new Date();
  const threshold = options.thresholdDays ?? STALE_THRESHOLD_DAYS;
  const optedOut = options.optedOut ?? new Set<number>();
  const limit = options.limit ?? 3;

  const nudges: StaleNudge[] = [];
  for (const snap of snapshots) {
    if (!snap.isUnlocked) continue;
    if (optedOut.has(snap.moduleNumber)) continue;
    if (snap.isComplete) continue;
    if (!snap.lastTouchedAt) continue; // never-touched is the "Next step" card's job
    const daysStale = Math.floor((now.getTime() - new Date(snap.lastTouchedAt).getTime()) / 86400000);
    if (daysStale < threshold) continue;

    nudges.push({
      moduleNumber: snap.moduleNumber,
      label: snap.label,
      href: snap.href,
      daysStale,
      message: staleMessageFor(snap, daysStale),
    });
    if (nudges.length >= limit) break;
  }
  return nudges;
}

function staleMessageFor(snap: WorkspaceProgressSnapshot, daysStale: number): string {
  const gap = snap.totalSections != null && snap.totalSections > 0
    ? `${snap.totalSections - snap.filledSections} section${
        snap.totalSections - snap.filledSections === 1 ? "" : "s"
      } left`
    : "still has gaps";
  return `${snap.label} hasn't been touched in ${daysStale} days — ${gap}.`;
}

/**
 * Build the recent activity feed from workspace_documents.updated_at values.
 * Returns the most recent `limit` entries newest-first, dropping any keys
 * that don't map to a shipped workspace module.
 */
export function buildRecentActivity(
  lastTouchedByKey: Map<string, string>,
  limit = 5
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const [key, at] of lastTouchedByKey.entries()) {
    const moduleNumber = moduleForWorkspaceKey(key);
    if (moduleNumber == null) continue;
    const item = NUDGE_MANIFEST.find((w) => w.moduleNumber === moduleNumber);
    if (!item || !item.isShipped) continue;
    entries.push({
      moduleNumber,
      label: item.label,
      href: item.href,
      at,
      summary: `Edited ${item.label}`,
    });
  }
  return entries
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

/**
 * Identify the weakest unlocked workspace for the "Improve with AI" quick
 * action. Picks the workspace with the lowest percent complete (treating
 * never-touched as 0%). Ties broken by RECOMMENDATION_ORDER.
 */
export function pickWeakestWorkspace(
  snapshots: WorkspaceProgressSnapshot[],
  optedOut: ReadonlySet<number> = new Set()
): WorkspaceProgressSnapshot | null {
  const candidates = snapshots
    .filter((s) => s.isUnlocked && !optedOut.has(s.moduleNumber) && !s.isComplete)
    .map((s) => ({
      snap: s,
      pctSafe: s.pct ?? (s.isStarted ? 50 : 0),
      orderIndex: indexInRecommendationOrder(s.moduleNumber),
    }));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.pctSafe - b.pctSafe || a.orderIndex - b.orderIndex);
  return candidates[0].snap;
}

function indexInRecommendationOrder(moduleNumber: number): number {
  const idx = RECOMMENDATION_ORDER.indexOf(moduleNumber);
  return idx === -1 ? RECOMMENDATION_ORDER.length : idx;
}

// ── workspace_key ↔ module number mapping ────────────────────────────────────
//
// `workspace_documents.workspace_key` and `WORKSPACE_MANIFEST.moduleNumber`
// live in different namespaces; this map keeps the dashboard from caring.

const KEY_TO_MODULE: Record<string, number> = {
  concept: 1,
  financials: 2,
  location_lease: 3,
  menu_pricing: 4,
  buildout_equipment: 5,
  launch_plan: 6,
  hiring: 7,
  business_plan: 8,
  marketing: 9,
};

const MODULE_TO_KEY: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_TO_MODULE).map(([k, v]) => [v, k])
);

export function moduleForWorkspaceKey(key: string): number | null {
  return KEY_TO_MODULE[key] ?? null;
}

export function workspaceKeyForModule(moduleNumber: number): string | null {
  return MODULE_TO_KEY[moduleNumber] ?? null;
}
