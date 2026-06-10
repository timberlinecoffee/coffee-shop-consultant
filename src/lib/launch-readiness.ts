// TIM-1373: Launch Readiness view model for the dashboard.
//
// Rolls the per-workspace manual 3-state status (0/50/100) into a single
// readiness percent and a short founder-voice line, plus a per-workspace
// breakdown the dashboard renders as progress chips. Pure + unit-tested so the
// presentational component (launch-readiness.tsx) carries no logic.
//
// Voice: warm and plainspoken. No emojis, no em dashes, no AI-jargon.

import { AVAILABLE_MODULES } from "./modules.ts";
import { WORKSPACE_MANIFEST, type NavIcon } from "./workspace-manifest.ts";
import {
  planReadinessPctFromStatuses,
  statusPct,
  type WorkspaceStatus,
} from "./workspace-status.ts";

export interface ReadinessWorkspace {
  key: string;
  label: string;
  href: string;
  icon: NavIcon;
  status: WorkspaceStatus;
  /** 0 / 50 / 100 — drives the per-workspace chip bar. */
  pct: number;
}

export interface LaunchReadiness {
  /** Overall readiness, 0-100, averaged across unlocked workspaces. */
  pct: number;
  /** Primary motivating line, e.g. "You're 60% Ready To Open". */
  headline: string;
  /** Short encouraging follow-on line. */
  subline: string;
  /** True when no workspace has any progress yet (brand-new owner). */
  isEmpty: boolean;
  /** Per-workspace breakdown, unlocked workspaces only, manifest order. */
  workspaces: ReadinessWorkspace[];
}

/**
 * Founder-voice copy for a given readiness percent. The headline is a
 * Title Case label (per the title-case standard, TIM-1002); the subline is a
 * full sentence in sentence case.
 */
export function readinessCopy(pct: number): { headline: string; subline: string } {
  if (pct <= 0) {
    return {
      headline: "Let's Get Your Plan Started",
      subline: "Open a workspace below and your readiness will start to climb.",
    };
  }
  if (pct >= 100) {
    return {
      headline: "You're 100% Ready To Open",
      subline: "Every workspace is complete. Time to pour the first cup.",
    };
  }
  const headline = `You're ${pct}% Ready To Open`;
  let subline: string;
  if (pct < 34) {
    subline = "A good start. Keep the momentum going.";
  } else if (pct < 67) {
    subline = "You're making real progress.";
  } else {
    subline = "The finish line is in sight.";
  }
  return { headline, subline };
}

/**
 * Build the dashboard Launch Readiness view model from the founder's
 * per-workspace status map. Locked / unshipped workspaces are excluded so the
 * percent doesn't drag while modules are still being rolled out (mirrors
 * computePlanReadiness).
 */
export function buildLaunchReadiness(
  statusByKey: ReadonlyMap<string, WorkspaceStatus>
): LaunchReadiness {
  // TIM-2595: exclude module 99 (Build workspace container) from readiness.
  const unlocked = WORKSPACE_MANIFEST.filter((item) =>
    AVAILABLE_MODULES.has(item.moduleNumber) && item.moduleNumber !== 99
  );

  const workspaces: ReadinessWorkspace[] = unlocked.map((item) => {
    const status = statusByKey.get(item.workspaceKey) ?? "not_started";
    return {
      key: item.workspaceKey,
      label: item.label,
      href: item.href,
      icon: item.icon,
      status,
      pct: statusPct(status),
    };
  });

  const pct = planReadinessPctFromStatuses(
    unlocked.map((item) => item.workspaceKey),
    statusByKey
  );

  const { headline, subline } = readinessCopy(pct);

  return {
    pct,
    headline,
    subline,
    isEmpty: workspaces.every((w) => w.status === "not_started"),
    workspaces,
  };
}
