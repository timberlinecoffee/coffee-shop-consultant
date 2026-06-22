// TIM-2593: Home v2 — rendered at /dashboard when ui_revamp_v2 is true.
//
// Groundwork UI Consistency Protocol:
//   Style-guide sections: Cards → Standard content card, Progress indicators
//   Reference component: src/app/(app)/dashboard/page.tsx (PlanStatusCard,
//   NextStepCard patterns). Uses existing tokens only: --teal, --sage,
//   --background, --foreground, --card, --muted, --muted-foreground, --border.

import Link from "next/link";
import { ShieldCheck, AlertTriangle, ArrowRight, TrendingUp } from "lucide-react";
import type { PlanOverview, ConflictItem } from "@/lib/dashboard/plan-overview";
import type { FinancialSnapshot } from "@/lib/dashboard/financial-snapshot";
import { formatCurrencyAmount } from "@/lib/currency";

// ── Progress Ring ─────────────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r; // 226.19...
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* The @keyframes rule starts the dash at the full circumference (empty ring)
          and the inline stroke-dashoffset is the computed target; the browser
          interpolates from "from" to the element's own inline value. */}
      <style>{`
        @keyframes gwRingFill {
          from { stroke-dashoffset: ${circ.toFixed(1)}; }
        }
      `}</style>
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 96 96" className="w-24 h-24 -rotate-90" aria-hidden="true">
          <circle
            cx="48" cy="48" r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth="7"
          />
          <circle
            cx="48" cy="48" r={r}
            fill="none"
            stroke="var(--teal)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${circ.toFixed(1)} ${circ.toFixed(1)}`}
            style={{
              strokeDashoffset: offset.toFixed(1),
              animation: "gwRingFill 1s ease-out both",
            }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          aria-label={`${pct}% plan readiness`}
        >
          <span className="text-xl font-bold text-[var(--foreground)] leading-none tabular-nums">
            {pct}%
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
            ready
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Plan Badge ────────────────────────────────────────────────────────────────

function PlanBadge({ conflicts, lastCheckedAt }: { conflicts: ConflictItem[]; lastCheckedAt: string | null }) {
  if (conflicts.length > 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={16} className="text-amber-600" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {conflicts.length} plan {conflicts.length === 1 ? "conflict" : "conflicts"} found
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Open a conflicting section to resolve it.
            </p>
            {conflicts[0]?.href && (
              <Link
                href={conflicts[0].href}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"
              >
                Review conflicts <ArrowRight size={11} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--sage)]/30 bg-[var(--sage)]/5 p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--sage)]/15 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={16} className="text-[var(--sage)]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Your plan looks good
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {lastCheckedAt
              ? "No conflicts detected in your plan sections."
              : "Run a conflict check when you have more sections filled in."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Plan Nudge Cards ──────────────────────────────────────────────────────────

interface NudgeCardProps {
  href: string;
  label: string;
  copy: string;
}

function NudgeCard({ href, label, copy }: NudgeCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--teal)]/40 hover:bg-[var(--teal)]/[0.03] transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--teal)] bg-[var(--teal)]/8 rounded-full px-2.5 py-0.5">
          {label}
        </span>
        <ArrowRight
          size={14}
          className="text-[var(--muted-foreground)] group-hover:text-[var(--teal)] group-hover:translate-x-0.5 transition-all flex-shrink-0"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm font-medium text-[var(--foreground)] leading-snug">
        {copy}
      </p>
    </Link>
  );
}

// ── Financial Snapshot Card ───────────────────────────────────────────────────

interface SnapshotMetricProps {
  label: string;
  value: string;
  sub?: string;
}

function SnapshotMetric({ label, value, sub }: SnapshotMetricProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="text-xl font-bold text-[var(--foreground)] tabular-nums leading-tight">
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-[var(--muted-foreground)]">{sub}</p>
      )}
    </div>
  );
}

function FinancialSnapshotCard({ snapshot }: { snapshot: FinancialSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-[var(--teal)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Financial Snapshot
          </h2>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Fill in your financial model to see projected numbers here.{" "}
          <Link href="/workspace/financials" className="font-semibold text-[var(--teal)] hover:underline">
            Open Financials
          </Link>
        </p>
      </div>
    );
  }

  const cc = snapshot.currencyCode;
  const fmt = (cents: number) =>
    formatCurrencyAmount(Math.round(cents / 100), cc);

  const runwayLabel =
    snapshot.runwayMonths > 0
      ? `${snapshot.runwayMonths.toFixed(1)} mo`
      : "—";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[var(--teal)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Financial Snapshot
          </h2>
        </div>
        <Link
          href="/workspace/financials"
          className="text-xs font-semibold text-[var(--teal)] hover:underline shrink-0"
        >
          Edit
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        <SnapshotMetric
          label="Monthly Revenue"
          value={fmt(snapshot.monthlyRevenueCents)}
          sub="projected month 1"
        />
        <SnapshotMetric
          label="Break-Even"
          value={
            snapshot.breakEvenRevenueCents > 0 &&
            isFinite(snapshot.breakEvenRevenueCents)
              ? fmt(snapshot.breakEvenRevenueCents)
              : "—"
          }
          sub="revenue to cover costs"
        />
        <SnapshotMetric
          label="Daily Customers"
          value={
            snapshot.dailyCustomersNeeded > 0
              ? snapshot.dailyCustomersNeeded.toString()
              : "—"
          }
          sub="needed to break even"
        />
        <SnapshotMetric
          label="Runway to Open"
          value={runwayLabel}
          sub="months of operating cover"
        />
      </div>
    </div>
  );
}

// ── Home v2 root ──────────────────────────────────────────────────────────────

interface HomeV2Props {
  firstName: string;
  overview: PlanOverview;
  snapshot: FinancialSnapshot | null;
}

export function HomeV2({ firstName, overview, snapshot }: HomeV2Props) {
  const { counts, conflicts, lastConflictCheckAt, nudges } = overview;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="w-full px-4 sm:px-6 pt-8 pb-16 space-y-6">
        {/* Header */}
        <header>
          <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">
            Welcome back, {firstName}.
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Here is where your plan stands today.
          </p>
        </header>

        {/* Row 1: readiness ring + plan badge */}
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-stretch">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 flex flex-col items-center justify-center gap-3">
            <ProgressRing pct={counts.completedPct} />
            <p className="text-xs text-[var(--muted-foreground)] text-center">
              {counts.completed} of {counts.total} sections complete
            </p>
          </div>
          <PlanBadge
            conflicts={conflicts}
            lastCheckedAt={lastConflictCheckAt}
          />
        </div>

        {/* Row 2: 3 nudge cards */}
        {nudges.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-3">
              Suggested next steps
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {nudges.map((n) => (
                <NudgeCard key={n.workspaceKey} href={n.href} label={n.label} copy={n.copy} />
              ))}
            </div>
          </div>
        )}

        {/* Row 3: Financial Snapshot */}
        <FinancialSnapshotCard snapshot={snapshot} />
      </div>
    </div>
  );
}
