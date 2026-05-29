// TIM-1373: Launch Readiness visual for the main dashboard.
//
// A circular progress ring shows overall readiness with a short founder-voice
// line, and a grid of per-workspace chips doubles as a "next best action" nav
// affordance (each links to its workspace). Pure presentational; all math lives
// in src/lib/launch-readiness.ts. Server-rendered (no client JS) so the percent
// is present in the SSR HTML.
//
// Voice + style: warm and plainspoken, no emojis, no em dashes, no AI-jargon.
// Matches the Groundwork design system (teal accent, warm neutrals, hairline
// borders, rounded-xl cards) used by the greeting hero and workspace list.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type {
  LaunchReadiness,
  ReadinessWorkspace,
} from "@/lib/launch-readiness";
import { WORKSPACE_STATUS_LABEL } from "@/lib/workspace-status";

// Ring geometry. strokeWidth and radius chosen so the 100% arc reads cleanly
// at the rendered ~132px size and scales with the viewBox on small screens.
const RING_SIZE = 132;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ReadinessRing({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const dashOffset = RING_CIRCUMFERENCE * (1 - clamped / 100);
  const center = RING_SIZE / 2;

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: RING_SIZE, height: RING_SIZE }}
      role="img"
      aria-label={`Launch readiness: ${clamped} percent`}
    >
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--teal-tint-300)"
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={center}
          cy={center}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--teal)"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight text-[var(--foreground)] tabular-nums">
          {clamped}%
        </span>
        <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--muted-foreground)]">
          Ready
        </span>
      </div>
    </div>
  );
}

function chipBarClass(status: ReadinessWorkspace["status"]): string {
  switch (status) {
    case "complete":
      return "bg-[var(--teal)]";
    case "in_progress":
      return "bg-amber-400";
    case "not_started":
      return "bg-[var(--neutral-cool-300)]";
  }
}

function WorkspaceChip({ workspace }: { workspace: ReadinessWorkspace }) {
  return (
    <Link
      href={workspace.href}
      className="group flex flex-col gap-2 rounded-lg border border-[var(--warm-550)] bg-white px-3 py-2.5 transition-colors hover:border-[var(--teal)]/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-[var(--foreground)] transition-colors group-hover:text-[var(--teal)]">
          {workspace.label}
        </span>
        <span className="flex-shrink-0 text-[11px] font-medium tabular-nums text-[var(--muted-foreground)]">
          {workspace.pct}%
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-warm-100)]"
        role="progressbar"
        aria-valuenow={workspace.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${workspace.label}: ${WORKSPACE_STATUS_LABEL[workspace.status]}`}
      >
        <div
          className={`h-full rounded-full transition-all ${chipBarClass(workspace.status)}`}
          style={{ width: `${Math.max(workspace.pct, workspace.status === "not_started" ? 0 : 6)}%` }}
        />
      </div>
    </Link>
  );
}

export function LaunchReadinessCard({ readiness }: { readiness: LaunchReadiness }) {
  const { pct, headline, subline, isEmpty, workspaces } = readiness;

  return (
    <section aria-label="Launch readiness" className="mb-10">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--teal)]">
        Launch Readiness
      </p>

      <div className="rounded-xl border border-[var(--warm-550)] bg-white p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          <ReadinessRing pct={pct} />

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
              {headline}
            </h2>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              {subline}
            </p>
            {isEmpty && (
              <Link
                href={workspaces[0]?.href ?? "/workspace/concept"}
                className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--teal)]/90"
              >
                Start Your First Workspace
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        {workspaces.length > 0 && (
          <>
            <div className="my-5 h-px bg-[var(--warm-500)]" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {workspaces.map((workspace) => (
                <WorkspaceChip key={workspace.key} workspace={workspace} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
