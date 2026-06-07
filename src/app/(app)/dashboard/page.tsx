import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Play,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { capitalizeFirst } from "@/lib/format";
import { isTrialActive } from "@/lib/access";
import { PLAN_DISPLAY_NAMES } from "@/lib/plan-names";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import {
  loadPlanOverview,
  type ActivityItem,
  type ConflictItem,
  type HealthState,
  type PlanOverview,
} from "@/lib/dashboard/plan-overview";
import { TrialBanner } from "./_components/trial-banner";
import { WelcomeToast } from "./_components/welcome-toast";
import { RefreshConflictsButton } from "./_components/refresh-conflicts-button";

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

  const overview = await loadPlanOverview(supabase, user.id);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-6 pt-8 pb-16">
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

        <WorkspaceHeader
          Icon={ClipboardList}
          title="Plan Overview"
          description={`Welcome back, ${firstName}. See where your plan stands.`}
          actions={<RefreshConflictsButton />}
        />

        <div className="space-y-4">
          <PlanStatusCard overview={overview} />
          <StatsRow overview={overview} />
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

// ── Section 3 — Last 7 Days ────────────────────────────────────────────────

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

// ── Section 4 — Plan Conflicts ─────────────────────────────────────────────

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
