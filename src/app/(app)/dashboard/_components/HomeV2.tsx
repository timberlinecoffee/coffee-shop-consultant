// TIM-2593: Home v2 — rendered at /dashboard when ui_revamp_v2 is true.
//
// Groundwork UI Consistency Protocol:
//   Style-guide sections: Cards → Standard content card, Progress indicators
//   Reference component: src/app/(app)/dashboard/page.tsx (PlanStatusCard,
//   NextStepCard patterns). Uses existing tokens only: --teal, --sage,
//   --background, --foreground, --card, --muted, --muted-foreground, --border.

import Link from "next/link";
import { ShieldCheck, AlertTriangle, ArrowRight, TrendingUp, HelpCircle } from "lucide-react";
import type {
  PlanOverview,
  ConflictItem,
  ConflictCheckState,
} from "@/lib/dashboard/plan-overview";
import type { FinancialSnapshot } from "@/lib/dashboard/financial-snapshot";
// TIM-4102 (T1-C): plain-language copy for a figure that could not be worked
// out. Lives beside the derivers so the reason and its wording stay together.
import {
  BREAK_EVEN_BLOCKED_COPY,
  RUNWAY_BLOCKED_COPY,
  REVENUE_BLOCKED_COPY,
  showsRevenueRamp,
  rampExplanation,
} from "@/lib/dashboard/metric-status";
import { formatCurrencyAmount } from "@/lib/currency";

// ── Progress Ring ──

// TIM-4104 (T1-D): the ring said "18% ready" and never said ready for WHAT.
// It now says "ready to open", and `total` lets the title spell out what 100%
// actually means — the one question a percentage always invites.
function ProgressRing({ pct, total }: { pct: number; total: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r; // 226.19...
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);

  return (
    <div
      className="flex flex-col items-center gap-2"
      title={
        total > 0
          ? `100% means all ${total} workspaces are complete — everything your plan covers before you open.`
          : undefined
      }
    >
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
          className="absolute inset-0 flex items-center justify-center"
          aria-label={
            total > 0
              ? `${pct}% ready to open. 100% means all ${total} workspaces are complete.`
              : `${pct}% ready to open`
          }
        >
          <span className="text-xl font-bold text-[var(--foreground)] leading-none tabular-nums">
            {pct}%
          </span>
        </div>
      </div>

      {/* TIM-3454: "ready to open" used to sit inside the ring under the
          percentage, where it did not fit. The ring's clear inner diameter is
          65px, but a circle narrows as you move away from its centre: at the
          height the label sat, only 55-64px was actually available, and the
          label needs 65-72px at 10px. It collided with the stroke on both
          sides at every percentage.

          Shrinking it further was the wrong direction — the 5 August audit
          found 10px body text is already below the readable floor. Outside the
          ring it has the full card width, so it reads at 12px, the percentage
          gets the whole circle to itself, and a longer translation cannot
          reintroduce the collision. */}
      <span className="text-xs text-[var(--muted-foreground)] leading-tight">
        ready to open
      </span>
    </div>
  );
}

// ── Plan Badge ──

// TIM-4101 (T1-A): three states, not two.
//
// Before this change the card had exactly one non-conflict branch, painted
// green, and it rendered whether or not a check had ever run — so an
// unchecked plan was presented as a healthy plan. It also only ever saw the
// cached business-plan section findings, so Home could show "Your plan looks
// good" at the same moment Financials showed an amber "Resolve plan conflict"
// badge. `conflicts` now carries BOTH detectors and `state` distinguishes
// "we checked and it is clean" from "we have not checked".
function PlanBadge({
  conflicts,
  state,
}: {
  conflicts: ConflictItem[];
  state: ConflictCheckState;
}) {
  if (state === "conflicts" && conflicts.length > 0) {
    const first = conflicts[0];
    // Name the destination when every conflict points at the same screen;
    // otherwise stay generic rather than pointing at one of several.
    const workspaces = Array.from(new Set(conflicts.map((c) => c.workspace)));
    const destination = workspaces.length === 1 ? workspaces[0] : null;
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
              {destination
                ? `Two parts of your plan disagree. Open ${destination} to sort it out.`
                : "Two parts of your plan disagree. Open the screens below to sort it out."}
            </p>
            {first?.href && (
              <Link
                href={first.href}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"
              >
                {`Go to ${first.workspace}`} <ArrowRight size={11} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (state === "unchecked") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--muted)] flex items-center justify-center flex-shrink-0">
            <HelpCircle size={16} className="text-[var(--muted-foreground)]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              We haven&apos;t checked your plan for conflicts yet.
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Fill in a few more workspaces and we&apos;ll start cross-checking
              your numbers against each other.
            </p>
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
            Your numbers agree with each other everywhere we checked.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Plan Nudge Cards ──

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

// ── Financial Snapshot Card ──

interface SnapshotMetricProps {
  label: string;
  value: string;
  sub?: string;
  // TIM-4102 (T1-C): when the figure could not be calculated, we render the
  // reason in place of the number. Previously these metrics fell back to 0 and
  // the 0 was drawn as an em dash — an absence with no cause, which owners
  // read as broken software rather than as a missing input of their own.
  // A metric is now either a number or a sentence naming the next action.
  blockedMessage?: string;
}

function SnapshotMetric({ label, value, sub, blockedMessage }: SnapshotMetricProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </p>
      {blockedMessage ? (
        <p className="text-[13px] text-[var(--muted-foreground)] leading-snug mt-0.5">
          {blockedMessage}
        </p>
      ) : (
        <>
          <p className="text-xl font-bold text-[var(--foreground)] tabular-nums leading-tight">
            {value}
          </p>
          {sub && (
            <p className="text-[11px] text-[var(--muted-foreground)]">{sub}</p>
          )}
        </>
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

  // TIM-4102 (T1-C): the loader now hands us the reason a figure is missing,
  // so nothing here has to infer intent from a zero. Break-even and daily
  // customers share one reason — they come from the same model, and telling
  // the owner two different things about one missing input would be worse
  // than the dash was.
  const revenueBlocked = snapshot.revenueBlockedReason
    ? REVENUE_BLOCKED_COPY[snapshot.revenueBlockedReason]
    : undefined;
  const breakEvenBlocked = snapshot.breakEvenBlockedReason
    ? BREAK_EVEN_BLOCKED_COPY[snapshot.breakEvenBlockedReason]
    : undefined;
  const runwayBlocked = snapshot.runwayBlockedReason
    ? RUNWAY_BLOCKED_COPY[snapshot.runwayBlockedReason]
    : undefined;

  const computeFailed =
    snapshot.breakEvenBlockedReason === "compute_failed" &&
    snapshot.revenueBlockedReason === "compute_failed";

  // TIM-4103 (T1-B): Home was showing month 1 of the ramp and Financials was
  // showing mature trade, roughly three times apart, with nothing on either
  // screen saying they measured different moments. Show both, named. Suppress
  // entirely when there is no ramp (or the gap is too small to be worth a
  // distinction) so a simple plan still reads as one clean figure.
  const ramp = {
    firstMonthCents: snapshot.monthlyRevenueCents,
    matureCents: snapshot.matureMonthlyRevenueCents,
    rampMonths: snapshot.rampMonths,
  };
  const showRamp = !revenueBlocked && showsRevenueRamp(ramp);

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
      {/* Our failure, not the owner's — say so once, up front, rather than
          repeating the same apology in all four tiles. */}
      {computeFailed && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
          We couldn&apos;t work out your numbers just now. Opening Financials and
          saving again usually clears it.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        <SnapshotMetric
          label="Monthly Revenue"
          value={fmt(snapshot.monthlyRevenueCents)}
          sub={
            showRamp
              ? `first month · ${fmt(snapshot.matureMonthlyRevenueCents)} once you're up to speed`
              : "projected month 1"
          }
          blockedMessage={revenueBlocked}
        />
        <SnapshotMetric
          label="Break-Even"
          value={fmt(snapshot.breakEvenRevenueCents)}
          sub="revenue to cover costs"
          blockedMessage={breakEvenBlocked}
        />
        <SnapshotMetric
          label="Daily Customers"
          value={snapshot.dailyCustomersNeeded.toString()}
          sub="needed to break even"
          blockedMessage={breakEvenBlocked}
        />
        <SnapshotMetric
          label="Runway to Open"
          value={`${snapshot.runwayMonths.toFixed(1)} mo`}
          sub="months of operating cover"
          blockedMessage={runwayBlocked}
        />
      </div>
      {/* TIM-4103 (T1-B): the teaching line. The gap between these two figures
          is the single most confusing thing in the product and also the most
          useful thing to explain — a new shop does not open at full trade, and
          the ramp is a deliberate assumption the owner can change. */}
      {showRamp && (
        <p className="mt-4 pt-4 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] leading-relaxed">
          {rampExplanation(snapshot.rampMonths)}{" "}
          <Link
            href="/workspace/financials"
            className="font-semibold text-[var(--teal)] hover:underline"
          >
            Adjust your ramp
          </Link>
        </p>
      )}
    </div>
  );
}

// ── Home v2 root ──

interface HomeV2Props {
  firstName: string;
  overview: PlanOverview;
  snapshot: FinancialSnapshot | null;
}

export function HomeV2({ firstName, overview, snapshot }: HomeV2Props) {
  const { counts, conflicts, conflictCheckState, nudges } = overview;

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
            <ProgressRing pct={counts.completedPct} total={counts.total} />
            {/* TIM-4104 (T1-D): "sections" here meant WORKSPACES, while three
                other screens used the same word for the steps inside one. The
                left-hand nav has always called these workspaces; say that. */}
            <p className="text-xs text-[var(--muted-foreground)] text-center">
              {counts.completed} of {counts.total} workspaces complete
            </p>
          </div>
          <PlanBadge conflicts={conflicts} state={conflictCheckState} />
        </div>

        {/* Row 2: 3 nudge cards */}
        {nudges.length > 0 && (
          <div>
            {/* TIM-4104 (T1-D): this heading previously used the word "steps".
                That word now means the units inside a single workspace, and
                these cards link to whole workspaces — so reusing it here would
                recreate exactly the ambiguity this change removes. */}
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-3">
              Where to go next
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
