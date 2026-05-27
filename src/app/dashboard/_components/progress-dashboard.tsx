// TIM-1063: Progress dashboard section — surfaces the next-step card,
// workspace completion strip, stale nudges, recent activity, and quick actions
// on the main dashboard. Pure presentational component; all computation lives
// in src/lib/dashboard-nudges.ts so it can be unit-tested.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type {
  ActivityEntry,
  NextStepSuggestion,
  StaleNudge,
  WorkspaceProgressSnapshot,
} from "@/lib/dashboard-nudges";

interface ProgressDashboardProps {
  nextStep: NextStepSuggestion | null;
  snapshots: WorkspaceProgressSnapshot[];
  staleNudges: StaleNudge[];
  recentActivity: ActivityEntry[];
  weakest: WorkspaceProgressSnapshot | null;
  /** Server-side "now" so the activity feed dates stay deterministic. */
  nowIso: string;
}

export function ProgressDashboard({
  nextStep,
  snapshots,
  staleNudges,
  recentActivity,
  weakest,
  nowIso,
}: ProgressDashboardProps) {
  const now = new Date(nowIso);

  return (
    <section
      aria-label="Progress dashboard"
      className="mb-10"
    >
      {nextStep && <NextStepCard step={nextStep} />}

      <CompletionStrip snapshots={snapshots} />

      {staleNudges.length > 0 && <StaleNudgeList nudges={staleNudges} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <RecentActivityCard entries={recentActivity} now={now} />
        </div>
        <QuickActionsCard weakest={weakest} />
      </div>
    </section>
  );
}

// ── Next step card ───────────────────────────────────────────────────────────

function NextStepCard({ step }: { step: NextStepSuggestion }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-[#155e63] uppercase tracking-widest mb-3">
        Your Next Step
      </p>
      <div className="bg-white rounded-xl border border-[#155e63]/30 p-6 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-[#1a1a1a] mb-1">{step.headline}</h3>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">{step.body}</p>
        </div>
        <Link
          href={step.href}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-[#155e63] hover:bg-[#155e63]/90 px-4 py-2 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
        >
          {step.ctaLabel} {step.label}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

// ── Workspace completion strip ───────────────────────────────────────────────

function CompletionStrip({ snapshots }: { snapshots: WorkspaceProgressSnapshot[] }) {
  if (snapshots.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-widest mb-3">
        Workspace Progress
      </p>
      <div className="bg-white rounded-xl border border-[#efefef] p-4">
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
          {snapshots.map((snap) => (
            <li key={snap.moduleNumber} className="min-w-0">
              <Link
                href={snap.href}
                className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#155e63]/40 rounded-md"
              >
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="text-xs font-medium text-[#1a1a1a] truncate group-hover:text-[#155e63] transition-colors">
                    {snap.label}
                  </span>
                  <span className="text-[11px] text-[#afafaf] font-medium flex-shrink-0 tabular-nums">
                    {progressLabel(snap)}
                  </span>
                </div>
                <div className="bg-[#efefef] rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      snap.isComplete
                        ? "bg-[#155e63]"
                        : snap.status === "in_progress"
                          ? "bg-amber-400"
                          : "bg-[#efefef]"
                    }`}
                    style={{ width: `${snap.pct}%` }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function progressLabel(snap: WorkspaceProgressSnapshot): string {
  if (snap.status === "complete") return "Complete";
  if (snap.status === "in_progress") return "In Progress";
  return "Not Started";
}

// ── Stale nudges ─────────────────────────────────────────────────────────────

function StaleNudgeList({ nudges }: { nudges: StaleNudge[] }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-widest mb-3">
        Worth a Few Minutes
      </p>
      <ul className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100">
        {nudges.map((nudge) => (
          <li key={nudge.moduleNumber} className="p-4 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-[#1a1a1a] flex-1 min-w-0">{nudge.message}</p>
            <Link
              href={nudge.href}
              className="text-xs font-semibold text-[#155e63] hover:underline flex-shrink-0 inline-flex items-center gap-1"
            >
              Open <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Recent activity feed ─────────────────────────────────────────────────────

function RecentActivityCard({ entries, now }: { entries: ActivityEntry[]; now: Date }) {
  return (
    <div className="bg-white rounded-xl border border-[#efefef] p-4 h-full">
      <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-widest mb-3">
        Recent Activity
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-[#afafaf]">
          Nothing yet. Open a workspace and the latest edits will show up here.
        </p>
      ) : (
        <ul className="divide-y divide-[#efefef]">
          {entries.map((entry) => (
            <li key={`${entry.moduleNumber}-${entry.at}`} className="py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#1a1a1a] truncate">{entry.summary}</p>
                <p className="text-xs text-[#afafaf]">{formatRelative(entry.at, now)}</p>
              </div>
              <Link
                href={entry.href}
                className="text-xs text-[#155e63] font-medium hover:underline flex-shrink-0"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Quick actions ────────────────────────────────────────────────────────────

function QuickActionsCard({ weakest }: { weakest: WorkspaceProgressSnapshot | null }) {
  return (
    <div className="bg-white rounded-xl border border-[#efefef] p-4 h-full">
      <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-widest mb-3">
        Quick Actions
      </p>
      <div className="flex flex-col gap-2">
        <Link
          href="/workspace/business-plan"
          className="flex items-center justify-between gap-3 rounded-lg border border-[#efefef] px-3 py-2.5 hover:border-[#155e63]/30 transition-colors"
        >
          <span className="text-sm font-medium text-[#1a1a1a]">Export Business Plan</span>
          <ArrowRight size={14} className="text-[#afafaf]" aria-hidden="true" />
        </Link>
        {weakest && (
          <Link
            href={weakest.href}
            className="flex items-center justify-between gap-3 rounded-lg border border-[#efefef] px-3 py-2.5 hover:border-[#155e63]/30 transition-colors"
          >
            <span className="text-sm font-medium text-[#1a1a1a]">
              Improve {weakest.label} with AI
            </span>
            <ArrowRight size={14} className="text-[#afafaf]" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string, now: Date): string {
  const then = new Date(iso);
  const diffSec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
