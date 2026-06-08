import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Play,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { capitalizeFirst } from "@/lib/format";
import { isTrialActive } from "@/lib/access";
import { PLAN_DISPLAY_NAMES } from "@/lib/plan-names";
import {
  loadPlanOverview,
  type ActivityItem,
  type ConflictItem,
  type HealthState,
  type PlanOverview,
  type FinancialHealthSummary,
  type HealthMetric,
} from "@/lib/dashboard/plan-overview";
import { TIER_STYLES } from "@/lib/financials/health-metrics";
import { TrialBanner } from "./_components/trial-banner";
import { WelcomeToast } from "./_components/welcome-toast";
import { RefreshConflictsButton } from "./_components/refresh-conflicts-button";
import { OpenImportFromQuery } from "./_components/open-import-from-query";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select(
      "full_name, onboarding_completed, subscription_status, subscription_tier, trial_ends_at, trial_just_converted_to"
    )
    .eq("id", user.id)
    .single();

  if (profile && !profile.onboarding_completed) redirect("/onboarding");

  const rawName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0];
  const firstName = rawName ? capitalizeFirst(rawName) : "there";

  // TIM-2470: defense in depth. The dashboard is the existing-user root, so a
  // single bad row in workspace_status / plan_quality_audit_cache must never
  // tip the whole route into the dashboard error boundary. If overview load
  // throws (RLS row drift, schema mismatch, transient supabase 5xx), render
  // the same zero-state the "no plan yet" branch shows.
  let overview: PlanOverview;
  try {
    overview = await loadPlanOverview(supabase, user.id);
  } catch (err) {
    console.error("[dashboard] loadPlanOverview failed", err);
    overview = emptyOverview();
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-6 pt-8 pb-16">
        {/* TIM-2434: ?openImport=1 from Settings → Documents or onboarding
            auto-opens the companion drawer in Import mode. Suspense wraps
            the client useSearchParams call. */}
        <Suspense fallback={null}>
          <OpenImportFromQuery />
        </Suspense>
        {profile?.subscription_status === "free_trial" &&
          isTrialActive(profile.trial_ends_at) && (
            <TrialBanner
              trialEndsAt={profile.trial_ends_at as string}
              chosenTier={
                profile.subscription_tier === "pro" ? "pro" : "starter"
              }
            />
          )}

        {profile?.trial_just_converted_to && (
          <WelcomeToast
            planName={
              PLAN_DISPLAY_NAMES[profile.trial_just_converted_to as string] ??
              "Pro"
            }
          />
        )}

        {/* TIM-2470 / TIM-1894 / TIM-1937: canonical WorkspaceHeader chrome
            (icon + h1 + description, action cluster right-aligned with
            min-[1200px] nowrap), hand-rolled here because this is a Server
            Component and the shared WorkspaceHeader is a "use client"
            component — passing a lucide forwardRef as the `Icon` prop fails
            RSC serialization and crashes the route (the bug TIM-2470 fixes).
            Same pattern as workspace/location-lease/page.tsx. */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 min-[1200px]:flex-nowrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList
                className="w-5 h-5 text-[var(--teal)] flex-shrink-0"
                aria-hidden="true"
              />
              <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight whitespace-nowrap">
                Plan Overview
              </h1>
            </div>
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
              Welcome back, {firstName}. See where your plan stands.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-auto flex-wrap min-[1200px]:flex-nowrap">
            <RefreshConflictsButton />
          </div>
        </header>

        <div className="space-y-4">
          <PlanStatusCard overview={overview} />
          <StatsRow overview={overview} />
          {overview.financialHealth && (
            <FinancialHealthCard health={overview.financialHealth} />
          )}
          <LastSevenDaysCard activity={overview.activity} />
          <PlanConflictsCard
            conflicts={overview.conflicts}
            lastCheckedAt={overview.lastConflictCheckAt}
          />
        </div>
      </div>
    </div>
  );
}

// TIM-2470: zero-state fallback used by the try/catch around loadPlanOverview
// in DashboardPage. Same shape the "no plan yet" branch already renders for —
// PlanStatusCard short-circuits on planStarted=false, the stat cards show
// dashes, Last 7 Days renders the empty-state copy, and PlanConflictsCard
// renders the "Run a conflict check" branch. Pre-TIM-2470 a thrown
// loadPlanOverview would have crashed the whole dashboard.
function emptyOverview(): PlanOverview {
  return {
    planId: null,
    status: {
      stageName: "Not Started",
      healthState: "needs_attention",
      healthLabel: "Needs Attention",
      lastUpdatedAt: null,
      startedAt: null,
      planStarted: false,
    },
    counts: {
      total: 0,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
      completedPct: 0,
      inProgressPct: 0,
      notStartedPct: 0,
    },
    activity: [],
    conflicts: [],
    lastConflictCheckAt: null,
    financialHealth: null,
  };
}

// ── Section 1 — Plan Status ─────────────────────────────────────────────────

function PlanStatusCard({ overview }: { overview: PlanOverview }) {
  if (!overview.planId || !overview.status.planStarted) {
    return (
      <div className="rounded-xl border bg-white border-[var(--border)] p-5">
        <p className="text-sm font-medium text-[var(--foreground)] mb-1">
          Plan not started yet.
        </p>
        <p className="text-xs text-[var(--muted-foreground)] mb-3">
          Complete your first workspace to see your plan status here.
        </p>
        <Link
          href="/workspace/concept"
          className="text-xs font-semibold text-[var(--teal)] hover:underline"
        >
          Go to Concept →
        </Link>
      </div>
    );
  }

  const { stageName, healthLabel, healthState, lastUpdatedAt } =
    overview.status;
  return (
    <div className="rounded-xl border bg-[var(--teal)]/5 border-[var(--teal)]/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide bg-[var(--teal)] text-white rounded-full px-3 py-1">
            {stageName}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full ${healthDotClass(healthState)}`}
            />
            {healthLabel}
          </span>
        </div>
        {lastUpdatedAt ? (
          <p className="text-xs text-[var(--dark-grey)]">
            Last updated {relativeTime(lastUpdatedAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function healthDotClass(state: HealthState): string {
  switch (state) {
    case "on_track":
      return "bg-[var(--sage)]";
    case "needs_attention":
      return "bg-amber-400";
    case "has_conflicts":
      return "bg-[var(--error)]";
  }
}

// ── Section 2 — Stats Row ───────────────────────────────────────────────────

function StatsRow({ overview }: { overview: PlanOverview }) {
  const { counts } = overview;
  const pctOrDash = (n: number) =>
    counts.total === 0 || !overview.status.planStarted ? "—" : `${n}%`;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard
        tone="teal"
        count={counts.completed}
        label="Completed"
        pct={pctOrDash(counts.completedPct)}
      />
      <StatCard
        tone="amber"
        count={counts.inProgress}
        label="In Progress"
        pct={pctOrDash(counts.inProgressPct)}
      />
      <StatCard
        tone="neutral"
        count={
          counts.completed === 0 && counts.inProgress === 0
            ? counts.total
            : counts.notStarted
        }
        label="Not Started"
        pct={pctOrDash(counts.notStartedPct)}
      />
    </div>
  );
}

function StatCard({
  tone,
  count,
  label,
  pct,
}: {
  tone: "teal" | "amber" | "neutral";
  count: number;
  label: string;
  pct: string;
}) {
  const shell =
    tone === "teal"
      ? "bg-[var(--teal)]/5 border-[var(--teal)]/20"
      : tone === "amber"
        ? "bg-amber-50 border-amber-200"
        : "bg-[var(--surface-warm-100)] border-[var(--border)]";
  const numberColor =
    tone === "teal"
      ? "text-[var(--teal)]"
      : tone === "amber"
        ? "text-amber-700"
        : "text-[var(--dark-grey)]";
  return (
    <div className={`rounded-xl border p-4 ${shell}`}>
      <p className={`text-2xl font-bold ${numberColor}`}>{count}</p>
      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
        {label}
        <span className="ml-1.5 font-medium text-[var(--foreground)]">
          {pct}
        </span>
      </p>
    </div>
  );
}

// ── Section 3 — Financial Health (TIM-2525) ───────────────────────────────

function FinancialHealthCard({ health }: { health: FinancialHealthSummary }) {
  const s = TIER_STYLES[health.worst];
  const redCount = health.metrics.filter((m: HealthMetric) => m.tier === "red").length;
  const yellowCount = health.metrics.filter(
    (m: HealthMetric) => m.tier === "yellow"
  ).length;
  const summaryTitle =
    health.worst === "green"
      ? "Financial health looks good"
      : health.worst === "yellow"
      ? `${yellowCount} indicator${yellowCount > 1 ? "s" : ""} to watch`
      : `${redCount} indicator${redCount > 1 ? "s" : ""} need${redCount > 1 ? "" : "s"} attention`;

  return (
    <div className={`rounded-xl border overflow-hidden ${s.wrap}`}>
      <div className="px-5 py-4 border-b border-current/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-current opacity-60" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Financial Health
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${s.chip}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {summaryTitle}
          </span>
          <Link
            href="/workspace/financials"
            className="text-xs font-semibold text-[var(--teal)] hover:underline"
          >
            View in Financials →
          </Link>
        </div>
      </div>
      <div className="divide-y divide-current/10">
        {health.metrics.map((m: HealthMetric) => {
          const ms = TIER_STYLES[m.tier];
          return (
            <div key={m.key} className="px-5 py-3 flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--foreground)] font-medium">{m.label}</p>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-[var(--foreground)] tabular-nums">
                  {m.formattedValue}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${ms.chip}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${ms.dot}`} />
                  {ms.chipLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section 4 — Last 7 Days ────────────────────────────────────────────────

function LastSevenDaysCard({ activity }: { activity: ActivityItem[] }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Last 7 Days
        </h2>
        <span className="text-xs text-[var(--muted-foreground)]">
          {activity.length === 0 ? "No changes" : `${activity.length} changes`}
        </span>
      </div>
      {activity.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[var(--muted-foreground)] text-center">
          Nothing moved in the past 7 days. Keep filling in your plan and
          activity will show up here as you go.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {activity.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTIVITY_ICON = {
  section_completed: CheckCircle2,
  section_started: Play,
  conflict_resolved: ShieldCheck,
  conflict_appeared: AlertTriangle,
  notable_edit: Play,
} as const;

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = ACTIVITY_ICON[item.kind] ?? Play;
  const iconColor = activityIconColor(item.kind);
  const body = (
    <div className="flex items-center gap-3 px-5 py-3">
      <Icon size={14} className={iconColor} aria-hidden="true" />
      <p className="text-xs text-[var(--foreground)] flex-1 truncate">
        {item.description}
      </p>
      <span className="text-xs text-[var(--dark-grey)] shrink-0">
        {relativeTime(item.occurredAt)}
      </span>
    </div>
  );
  if (item.href) {
    return (
      <li>
        <Link
          href={item.href}
          className="block hover:bg-[var(--surface-warm-100)]"
        >
          {body}
        </Link>
      </li>
    );
  }
  return <li>{body}</li>;
}

function activityIconColor(kind: ActivityItem["kind"]): string {
  switch (kind) {
    case "section_completed":
      return "text-[var(--sage)]";
    case "section_started":
      return "text-[var(--teal)]";
    case "conflict_resolved":
      return "text-[var(--sage)]";
    case "conflict_appeared":
      return "text-amber-500";
    default:
      return "text-[var(--muted-foreground)]";
  }
}

// ── Section 5 — Plan Conflicts ─────────────────────────────────────────────

function PlanConflictsCard({
  conflicts,
  lastCheckedAt,
}: {
  conflicts: ConflictItem[];
  lastCheckedAt: string | null;
}) {
  if (conflicts.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--sage)]/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck
              size={16}
              className="text-[var(--sage)]"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--foreground)]">
              {lastCheckedAt ? "No conflicts found" : "Run a conflict check"}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {lastCheckedAt
                ? "Your plan sections are consistent with each other."
                : "Use the Refresh button above to check your plan for internal contradictions."}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle
            size={15}
            className="text-amber-600"
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Plan Conflicts
          </h2>
        </div>
        <span className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-0.5">
          {conflicts.length} found
        </span>
      </div>
      <ul className="divide-y divide-amber-100">
        {conflicts.map((c) => (
          <ConflictRow key={c.id} conflict={c} />
        ))}
      </ul>
    </div>
  );
}

function ConflictRow({ conflict }: { conflict: ConflictItem }) {
  const body = (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide bg-white border border-amber-200 text-amber-700 rounded-full px-2 py-0.5">
          {conflict.sectionLabel}
        </span>
      </div>
      <p className="text-xs text-[var(--foreground)] font-medium mb-1">
        {conflict.description}
      </p>
      <p className="text-xs text-[var(--muted-foreground)]">
        <span className="font-medium text-[var(--dark-grey)]">Fix: </span>
        {conflict.suggestion}
      </p>
    </div>
  );
  if (conflict.href) {
    return (
      <li>
        <Link href={conflict.href} className="block hover:bg-amber-50">
          {body}
        </Link>
      </li>
    );
  }
  return <li>{body}</li>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = now - t;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
