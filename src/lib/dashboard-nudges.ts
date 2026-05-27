// TIM-1063 + TIM-1147: Progress dashboard helpers.
//
// Pure data-shaping for the "Next step" card, workspace completion strip,
// stale nudges, and recent activity feed. Server-side fetching lives in the
// dashboard page; this module is intentionally side-effect free so it can be
// unit-tested without a Supabase client.
//
// TIM-1147: snapshots are derived from the manual 3-state workspace_status
// table (not auto-derived section counts). pct collapses to 0/50/100 to match.

// NOTE: this module deliberately does not import from `./workspace-manifest`,
// `./modules`, or `./workspace-status` so the unit test
// (`dashboard-nudges.test.mjs`) can run under Node's
// `--experimental-strip-types` without hitting cross-file ESM resolution
// issues. The constants below MUST stay in sync with `WORKSPACE_MANIFEST` /
// `AVAILABLE_MODULES` / `WORKSPACE_STATUS_PCT`; the contracts are pinned by
// `dashboard-nudges.test.mjs`, `workspace-manifest.test.mjs`, and
// `workspace-status.test.mjs`.

export type WorkspaceStatus = "not_started" | "in_progress" | "complete";

const STATUS_PCT: Record<WorkspaceStatus, number> = {
  not_started: 0,
  in_progress: 50,
  complete: 100,
};

function statusPct(status: WorkspaceStatus): number {
  return STATUS_PCT[status];
}

export type NavIcon =
  | "lightbulb"
  | "bar-chart"
  | "map-pin"
  | "utensils"
  | "wrench"
  | "rocket"
  | "users"
  | "megaphone"
  | "file-text"
  | "package";

interface NudgeManifestEntry {
  moduleNumber: number;
  workspaceKey: string;
  label: string;
  href: string;
  icon: NavIcon;
  /** True when the workspace page has actually shipped on every env. */
  isShipped: boolean;
}

// Mirror of WORKSPACE_MANIFEST + AVAILABLE_MODULES from ./workspace-manifest
// and ./modules. Update both files together.
const NUDGE_MANIFEST: ReadonlyArray<NudgeManifestEntry> = [
  { moduleNumber: 1, workspaceKey: "concept",            label: "Concept",               href: "/workspace/concept",            icon: "lightbulb",  isShipped: true },
  { moduleNumber: 2, workspaceKey: "financials",         label: "Financials",            href: "/workspace/financials",         icon: "bar-chart",  isShipped: true },
  { moduleNumber: 3, workspaceKey: "location_lease",     label: "Location & Lease",      href: "/workspace/location-lease",     icon: "map-pin",    isShipped: true },
  { moduleNumber: 4, workspaceKey: "menu_pricing",       label: "Menu & Pricing",        href: "/workspace/menu-pricing",       icon: "utensils",   isShipped: true },
  { moduleNumber: 5, workspaceKey: "buildout_equipment", label: "Build Out & Equipment", href: "/workspace/buildout-equipment", icon: "wrench",     isShipped: true },
  { moduleNumber: 6, workspaceKey: "launch_plan",        label: "Launch Plan",           href: "/workspace/launch-plan",        icon: "rocket",     isShipped: true },
  { moduleNumber: 7, workspaceKey: "hiring",             label: "Hiring & Onboarding",   href: "/workspace/hiring",             icon: "users",      isShipped: true },
  { moduleNumber: 8, workspaceKey: "business_plan",      label: "Business Plan",         href: "/workspace/business-plan",      icon: "file-text",  isShipped: true },
  { moduleNumber: 9, workspaceKey: "marketing",          label: "Marketing",             href: "/workspace/marketing",          icon: "megaphone",  isShipped: true },
  { moduleNumber: 13,workspaceKey: "inventory",          label: "Inventory",             href: "/workspace/inventory",          icon: "package",    isShipped: true },
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
  workspaceKey: string;
  label: string;
  href: string;
  icon: NavIcon;
  isUnlocked: boolean;
  /** Manual 3-state status drives every display. */
  status: WorkspaceStatus;
  /** Last edit timestamp (ISO), or null if never edited. */
  lastTouchedAt: string | null;
  /** True if status === 'complete'. */
  isComplete: boolean;
  /** True if status !== 'not_started' OR a workspace_documents row exists. */
  isStarted: boolean;
  /** Percent for the progress bar — always 0/50/100 to match status. */
  pct: number;
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

/**
 * Build the per-workspace snapshot list from the manual status table + the
 * activity timestamps already gathered by the dashboard page. Workspaces
 * whose pages have not shipped are filtered out so the dashboard quietly
 * omits Suppliers / SOPs until they exist.
 */
export function buildWorkspaceSnapshots(
  statusByKey: ReadonlyMap<string, WorkspaceStatus>,
  lastTouchedByKey: ReadonlyMap<string, string>
): WorkspaceProgressSnapshot[] {
  return NUDGE_MANIFEST.filter((item) => item.isShipped).map((item) =>
    buildSnapshot(item, statusByKey, lastTouchedByKey)
  );
}

function buildSnapshot(
  item: NudgeManifestEntry,
  statusByKey: ReadonlyMap<string, WorkspaceStatus>,
  lastTouchedByKey: ReadonlyMap<string, string>
): WorkspaceProgressSnapshot {
  const status = statusByKey.get(item.workspaceKey) ?? "not_started";
  const lastTouchedAt = lastTouchedByKey.get(item.workspaceKey) ?? null;
  return {
    moduleNumber: item.moduleNumber,
    workspaceKey: item.workspaceKey,
    label: item.label,
    href: item.href,
    icon: item.icon,
    isUnlocked: item.isShipped,
    status,
    lastTouchedAt,
    isComplete: status === "complete",
    isStarted: status !== "not_started" || lastTouchedAt !== null,
    pct: statusPct(status),
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
      "The concept anchors every other decision: menu, location, even hiring. Spend 15 minutes on it now.",
    continueBody:
      "Finish the concept so the menu, location, and financials have something to work from.",
  },
  2: {
    headline: "Calculate startup costs.",
    startBody:
      "Numbers turn the concept into something you can hand to a banker. Start with startup costs and the first 12 months.",
    continueBody:
      "Pick up your numbers. Finish the startup-cost line items so the runway view is real.",
  },
  3: {
    headline: "Pick a target neighborhood.",
    startBody:
      "Without a neighborhood the rent assumptions are guesses. Set a target city and a couple of candidate streets.",
    continueBody:
      "Tighten the location notes. Score one or two real candidates so the build-out has a footprint.",
  },
  4: {
    headline: "Draft your opening menu.",
    startBody:
      "Seed three signature drinks and a small food list. The menu drives equipment and supplier choices.",
    continueBody:
      "Round out the menu. Add prices and a couple of signatures so the financials have COGS to chew on.",
  },
  5: {
    headline: "List the equipment you actually need.",
    startBody:
      "Pull a starter equipment list so build-out and supplier conversations have a concrete spec.",
    continueBody:
      "Fill in the build-out. Confirm quantities and prices so the budget stops being a guess.",
  },
  6: {
    headline: "Set your target open date.",
    startBody:
      "Once an opening date is on the calendar, every other workspace gets a deadline. Pick a realistic one.",
    continueBody:
      "Walk the milestones. Adjust dates so the launch plan actually fits build-out and hiring.",
  },
  7: {
    headline: "Sketch the opening team.",
    startBody:
      "Decide the headcount and roles for opening day. Even a one-line job description helps the financials.",
    continueBody:
      "Finish the role list. Fill out the JD summaries so payroll lines up with the schedule.",
  },
  8: {
    headline: "Assemble your business plan.",
    startBody:
      "The business plan stitches every workspace into one doc. Open it once the basics are in place.",
    continueBody:
      "Review the assembled business plan. Fix any thin sections before you export.",
  },
  9: {
    headline: "Plan the pre-launch marketing.",
    startBody:
      "Get the marketing workspace going: waitlist, social handles, a press list. Small moves now save money later.",
    continueBody:
      "Finish the pre-launch marketing. Confirm the waitlist plan and grand-opening promo.",
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
  const status =
    snap.status === "in_progress" ? "still in progress" : "not yet marked complete";
  return `${snap.label} hasn't been touched in ${daysStale} days and is ${status}.`;
}

/**
 * Build the recent activity feed from workspace_documents.updated_at values.
 * Returns the most recent `limit` entries newest-first, dropping any keys
 * that don't map to a shipped workspace module.
 */
export function buildRecentActivity(
  lastTouchedByKey: ReadonlyMap<string, string>,
  limit = 5
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const [key, at] of lastTouchedByKey.entries()) {
    const item = NUDGE_MANIFEST.find((w) => w.workspaceKey === key);
    if (!item || !item.isShipped) continue;
    entries.push({
      moduleNumber: item.moduleNumber,
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
 * action. Picks the workspace with the lowest status (not_started < in_progress
 * < complete). Ties broken by RECOMMENDATION_ORDER.
 */
export function pickWeakestWorkspace(
  snapshots: WorkspaceProgressSnapshot[],
  optedOut: ReadonlySet<number> = new Set()
): WorkspaceProgressSnapshot | null {
  const candidates = snapshots
    .filter((s) => s.isUnlocked && !optedOut.has(s.moduleNumber) && !s.isComplete)
    .map((s) => ({
      snap: s,
      pctSafe: s.pct,
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
