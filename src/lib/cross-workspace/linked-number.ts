// TIM-4114 (UX Phase 6): one shape for every number that comes from another
// workspace.
//
// ── The problem this exists to fix ────────────────────────────────────────────
//
// Trent, 2026-08-03: "the cost of goods actual numbers from the recipes is not
// automatically pulled in… how the numbers from different workspaces cross
// reference each other and are collected in the financials can cause confusion
// and be problematic. There should be a very simple way to update this and it
// should be clear to know that this has been updated. Like the default should
// be that it pulls the numbers."
//
// The audit found three different answers to the same question. Equipment feeds
// startup costs through a reconciliation banner. Hiring feeds staffing through
// an org-sync panel. The menu fed cost of goods through nothing at all — the
// owner typed a percentage into a bare box while the platform sat on a real one
// computed from their own recipes.
//
// That is the same class of drift UX Phases 1–3 fixed for the page header, and
// the fix is the same: stop letting each screen answer it alone.
//
// ── The three questions a borrowed number must answer ─────────────────────────
//
//   1. Where did this come from?   → the workspace that owns it
//   2. When did it last update?    → a real stamp, not a vibe
//   3. What if I disagree?         → one override, showing what you overrode
//
// ── Why "linked" is the default, not the opt-in ───────────────────────────────
//
// The beginner walkthrough's finding #5 is that the product asks for numbers a
// first-time owner has no way to produce. Cost of goods was the purest case:
// the product could compute it and asked anyway. So the default is to pull. A
// typed number only wins when the owner has said, explicitly, that it should —
// which is what `source: "manual"` records. Absent that, the link is live.
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

/**
 * Which number the owner has asked to use. Absent / unknown means "linked" —
 * pulling is the default, and an unset field is not consent to ignore the menu.
 */
export type LinkedSource = "linked" | "manual";

/**
 * Which number is actually in play, and why.
 *
 * The distinction between `manual` and `fallback` is the whole point. Both show
 * the owner's own number, but only one of them was a decision:
 *
 *   • `linked`   — the other workspace has an answer and it is being used.
 *   • `manual`   — the other workspace has an answer and the owner overrode it.
 *   • `fallback` — the other workspace has nothing to say yet, so the owner's
 *                  number stands in. Nothing has been overridden.
 *
 * Collapsing the last two would let the screen accuse the owner of overriding a
 * number that never existed.
 */
export type LinkedUsing = "linked" | "manual" | "fallback";

export type LinkedDrift = {
  /** Absolute size of the gap, in the field's own units. */
  size: number;
  /** Whether the owner's number sits above or below the linked one. */
  direction: "higher" | "lower";
};

export type LinkedNumberView = {
  /** The number the rest of the plan should use. Null when neither side has one. */
  value: number | null;
  using: LinkedUsing;
  /** What the owning workspace currently says, or null if it has nothing. */
  linkedValue: number | null;
  /** The owner's own number, or null if they have not typed one. */
  manualValue: number | null;
  /** Set only when the owner has overridden AND the two disagree. */
  drift: LinkedDrift | null;
};

const isUsable = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * Smaller gaps than this are rounding, not disagreement, and calling them out
 * would train the owner to ignore the callout that matters.
 */
const DRIFT_EPSILON = 0.05;

/**
 * Decide which number wins.
 *
 * Deliberately total: every combination of (linked, manual, source) returns a
 * view, because the screen has to render something in all of them — including
 * the brand-new plan where both sides are empty.
 */
export function resolveLinkedNumber(args: {
  linkedValue: number | null | undefined;
  manualValue: number | null | undefined;
  source: LinkedSource | null | undefined;
}): LinkedNumberView {
  const linkedValue = isUsable(args.linkedValue) ? args.linkedValue : null;
  const manualValue = isUsable(args.manualValue) ? args.manualValue : null;
  const overridden = args.source === "manual";

  // Nothing to pull. The owner's number stands in — and has not overridden
  // anything, even if they once chose to override something that has since
  // been emptied.
  if (linkedValue === null) {
    return { value: manualValue, using: "fallback", linkedValue: null, manualValue, drift: null };
  }

  if (!overridden) {
    return { value: linkedValue, using: "linked", linkedValue, manualValue, drift: null };
  }

  // Overridden, but the owner never typed anything — treat the link as live
  // rather than silently zeroing the plan's cost base.
  if (manualValue === null) {
    return { value: linkedValue, using: "linked", linkedValue, manualValue: null, drift: null };
  }

  const gap = manualValue - linkedValue;
  return {
    value: manualValue,
    using: "manual",
    linkedValue,
    manualValue,
    drift:
      Math.abs(gap) < DRIFT_EPSILON
        ? null
        : { size: Math.abs(gap), direction: gap > 0 ? "higher" : "lower" },
  };
}

/**
 * When the pull last ran, said plainly.
 *
 * `syncedAtMs` is a real timestamp, not a flag, because "it's connected" is not
 * what Trent asked for — he asked to be able to tell that it had updated. Both
 * arguments are passed in so this stays pure and testable; the caller owns the
 * clock.
 *
 * Returns null when there is no stamp yet, so a caller can render nothing
 * rather than "Checked never".
 */
export function freshnessLabel(
  syncedAtMs: number | null | undefined,
  nowMs: number,
): string | null {
  if (typeof syncedAtMs !== "number" || !Number.isFinite(syncedAtMs)) return null;
  const seconds = Math.max(0, Math.round((nowMs - syncedAtMs) / 1000));
  if (seconds < 90) return "Checked just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Checked ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Checked ${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "Checked more than a day ago";
}

/**
 * The sentence under a borrowed number.
 *
 * One function rather than copy at each call site, so a second linked number
 * cannot invent its own vocabulary — which is exactly how the three-different-
 * answers problem started.
 *
 * `ownerLabel` names the workspace in the owner's words ("your menu", "your
 * equipment list"), never a table or a feature name. `format` renders the value
 * in its own units so this module never has to know about percentages, money,
 * or counts.
 */
export function linkedNumberSentence(
  view: LinkedNumberView,
  opts: {
    ownerLabel: string;
    format: (value: number) => string;
    /** Plural noun for what the number is derived from, e.g. "priced items". */
    basis?: string | null;
  },
): string {
  const { ownerLabel, format } = opts;
  switch (view.using) {
    case "linked":
      return opts.basis
        ? `Pulled from ${ownerLabel}, blended across your ${opts.basis}.`
        : `Pulled from ${ownerLabel}.`;
    case "manual": {
      const linked = view.linkedValue === null ? null : format(view.linkedValue);
      if (!linked || !view.drift) {
        return `You are using your own number instead of the one from ${ownerLabel}.`;
      }
      return `You are using your own number. ${ownerLabel[0].toUpperCase()}${ownerLabel.slice(
        1,
      )} says ${linked} — yours is ${format(view.drift.size)} ${view.drift.direction}.`;
    }
    case "fallback":
      return `Nothing to pull from ${ownerLabel} yet, so your own number is being used. It will fill itself in once ${ownerLabel} has prices and costs.`;
  }
}
