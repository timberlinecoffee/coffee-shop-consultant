// TIM-1147: Manual workspace + component status (3-state).
//
// Replaces auto-computed completion percentages with an explicit model the
// founder controls. `in_progress` may be auto-promoted from `not_started` on
// first edit, but `complete` requires explicit user action.

export type WorkspaceStatus = "not_started" | "in_progress" | "complete";

export const WORKSPACE_STATUS_VALUES: ReadonlyArray<WorkspaceStatus> = [
  "not_started",
  "in_progress",
  "complete",
];

export const WORKSPACE_STATUS_LABEL: Record<WorkspaceStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
};

/** Display percent for the 3 statuses. Drives every progress bar. */
export const WORKSPACE_STATUS_PCT: Record<WorkspaceStatus, number> = {
  not_started: 0,
  in_progress: 50,
  complete: 100,
};

export function isWorkspaceStatus(value: unknown): value is WorkspaceStatus {
  return value === "not_started" || value === "in_progress" || value === "complete";
}

export function statusPct(status: WorkspaceStatus): number {
  return WORKSPACE_STATUS_PCT[status];
}

/**
 * Aggregate a set of component statuses into a single workspace status.
 *  - all complete  → complete
 *  - any non-not_started → in_progress
 *  - otherwise → not_started
 *
 * Empty input returns `not_started`.
 */
export function aggregateStatus(
  components: ReadonlyArray<WorkspaceStatus>
): WorkspaceStatus {
  if (components.length === 0) return "not_started";
  if (components.every((c) => c === "complete")) return "complete";
  if (components.some((c) => c !== "not_started")) return "in_progress";
  return "not_started";
}

/**
 * Plan readiness rolled up from per-workspace statuses (0/50/100). Treats
 * every entry in `workspaceKeys` equally — locked / unshipped workspaces
 * should not be in this list.
 */
export function planReadinessPctFromStatuses(
  workspaceKeys: ReadonlyArray<string>,
  statusByKey: ReadonlyMap<string, WorkspaceStatus>
): number {
  if (workspaceKeys.length === 0) return 0;
  let sum = 0;
  for (const key of workspaceKeys) {
    sum += WORKSPACE_STATUS_PCT[statusByKey.get(key) ?? "not_started"];
  }
  return Math.round(sum / workspaceKeys.length);
}
