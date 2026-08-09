// TIM-3452: which six, and why — stated once.
//
// The 5 August audit's "the product can't agree what it's counting" finding.
// Home says "0 of 11 workspaces complete"; the Launch Readiness card says it
// "grades all 6 workspaces". Both numbers are correct and the pair is
// nonsense: the word "all" tells a first-time owner there are six, moments
// after another screen told them there are eleven.
//
// The check really does grade six, and that is a sound product decision —
// these are the six that decide whether you can physically open. What was
// missing is that the screen never said WHICH six, so the number read as a
// contradiction instead of a scope.
//
// It also turned out not to be true end to end. `composeAllWorkspacesSnapshot`
// returns every `workspace_documents` row for the plan — up to eleven — and
// the route fed all of them to the model under a prompt that says "the six
// workspaces below" and a schema that only permits six keys. So the model was
// handed content it was told to ignore, with unlabelled snake_case keys as
// headings, and the owner paid credits for it. This module is the single list
// that the labels, the prompt filter, and the on-screen sentence all read, so
// the three cannot drift apart again.
//
// No runtime `@/` imports — must stay loadable from `node --test`.

export interface GradedWorkspace {
  /** Matches `workspace_documents.workspace_key` and the response schema. */
  key: string;
  /** What the owner sees. Title Case per AGENTS.md. */
  label: string;
}

/**
 * The six workspaces the readiness check grades, in the order the report
 * presents them. Adding a seventh means updating the route's response schema
 * and rubric too — `graded-workspaces.test.mjs` fails until they agree.
 */
export const GRADED_WORKSPACES: GradedWorkspace[] = [
  { key: "concept", label: "Concept" },
  { key: "location_lease", label: "Location & Lease" },
  { key: "financials", label: "Financials" },
  { key: "menu_pricing", label: "Menu & Pricing" },
  { key: "buildout_equipment", label: "Equipment & Supplies" },
  { key: "opening_month_plan", label: "Launch Plan" },
];

export const GRADED_WORKSPACE_KEYS: string[] = GRADED_WORKSPACES.map((w) => w.key);

/** Key → label, for rendering prompt headings and report rows. */
export const GRADED_WORKSPACE_LABELS: Record<string, string> = Object.fromEntries(
  GRADED_WORKSPACES.map((w) => [w.key, w.label]),
);

/** True when this workspace document belongs in the readiness prompt. */
export function isGradedWorkspace(key: string): boolean {
  return GRADED_WORKSPACE_KEYS.includes(key);
}

/**
 * Drop every workspace the check does not grade.
 *
 * Without this the model receives up to eleven workspaces while being told
 * there are six — wasted credits, and an invitation to grade something the
 * schema has no slot for.
 */
export function keepGradedWorkspaces<T extends { key: string }>(snapshots: T[]): T[] {
  return snapshots.filter((s) => isGradedWorkspace(s.key));
}

/** "Concept, Location & Lease, … and Launch Plan" */
export function gradedWorkspaceList(): string {
  const labels = GRADED_WORKSPACES.map((w) => w.label);
  const last = labels[labels.length - 1];
  return `${labels.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * The sentence the card shows.
 *
 * Deliberately drops the word "all" — that is the word that made six read as a
 * contradiction of eleven — and names the six instead, so the number is a
 * scope the owner can check rather than a claim they have to reconcile.
 */
export function gradedWorkspacesBlurb(): string {
  return `Grades the six workspaces that decide whether you can open — ${gradedWorkspaceList()} — and names what is blocking you.`;
}

/** The line shown while the check is running. */
export function gradedWorkspacesThinkingLabel(): string {
  return `Reading your ${GRADED_WORKSPACES.length} launch workspaces…`;
}
