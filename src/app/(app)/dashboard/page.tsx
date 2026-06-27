import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Play,
  ShieldCheck,
} from "lucide-react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { capitalizeFirst } from "@/lib/format";
import { isTrialActive, effectivePlanForGating } from "@/lib/access";
import { PLAN_DISPLAY_NAMES } from "@/lib/plan-names";
import {
  loadPlanOverview,
  type ActivityItem,
  type ConflictItem,
  type HealthState,
  type PlanOverview,
  type NextWorkspace,
} from "@/lib/dashboard/plan-overview";
import {
  UI_REVAMP_COOKIE,
  UI_REVAMP_OVERRIDE_COOKIE,
  getUiRevampSetting,
  resolveUiRevamp,
} from "@/lib/ui-revamp";
import { loadFinancialSnapshot } from "@/lib/dashboard/financial-snapshot";
import { HomeV2 } from "./_components/HomeV2";
import { TrialBanner } from "./_components/trial-banner";
import { PaymentFailureBanner } from "./_components/payment-failure-banner";
import { WelcomeToast } from "./_components/welcome-toast";
import { RefreshConflictsButton } from "./_components/refresh-conflicts-button";
import { OpenImportFromQuery } from "./_components/open-import-from-query";
import { IntakeBanner } from "./_components/intake-banner";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // TIM-2593: resolve ui_revamp_v2 flag — same logic as app layout so the
  // dashboard can branch server-side without a client-side hook.
  const [profile, dbUiRevamp] = await Promise.all([
    supabase
      .from("users")
      .select(
        "full_name, onboarding_completed, subscription_status, subscription_tier, paused_from_tier, trial_ends_at, trial_just_converted_to"
      )
      .eq("id", user.id)
      .single()
      .then((r) => r.data),
    getUiRevampSetting(supabase, user.id),
  ]);

  if (profile && !profile.onboarding_completed) redirect("/onboarding");

  const rawName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0];
  const firstName = rawName ? capitalizeFirst(rawName) : "there";

  const cookieStore = await cookies();
  const uiRevamp = resolveUiRevamp({
    dbValue: dbUiRevamp,
    overrideCookie: cookieStore.get(UI_REVAMP_OVERRIDE_COOKIE)?.value,
    mirrorCookie: cookieStore.get(UI_REVAMP_COOKIE)?.value,
  });

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

  // TIM-2593: v2 path — render HomeV2 with financial snapshot.
  if (uiRevamp) {
    const snapshot = overview.planId
      ? await loadFinancialSnapshot(supabase, overview.planId).catch(() => null)
      : null;
    return (
      <>
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
        {profile?.subscription_status === "past_due" && <PaymentFailureBanner />}
        {profile?.trial_just_converted_to && (
          <WelcomeToast
            planName={
              PLAN_DISPLAY_NAMES[profile.trial_just_converted_to as string] ??
              "Pro"
            }
          />
        )}
        {overview.planId && <IntakeBanner planId={overview.planId} subscriptionTier={profile ? effectivePlanForGating(profile) : "free"} />}
        <HomeV2 firstName={firstName} overview={overview} snapshot={snapshot} />
        {overview.planId && (
          <CoPilotDrawer
            workspaceKey="dashboard"
            planId={overview.planId}
            showDesktopLauncher={true}
          />
        )}
      </>
    );
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

        {profile?.subscription_status === "past_due" && <PaymentFailureBanner />}

        {profile?.trial_just_converted_to && (
          <WelcomeToast
            planName={
              PLAN_DISPLAY_NAMES[profile.trial_just_converted_to as string] ??
              "Pro"
            }
          />
        )}

        {overview.planId && <IntakeBanner planId={overview.planId} subscriptionTier={profile ? effectivePlanForGating(profile) : "free"} />}

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
          <NextStepCard
            nextWorkspace={overview.nextWorkspace}
            counts={overview.counts}
            planStarted={overview.status.planStarted}
          />
          {overview.activity.length > 0 ? (
            <LastSevenDaysCard activity={overview.activity} />
          ) : (
            <GettingStartedCard />
          )}
          {(overview.counts.completed + overview.counts.inProgress >= 2) && (
            <PlanConflictsCard
              conflicts={overview.conflicts}
              lastCheckedAt={overview.lastConflictCheckAt}
            />
          )}
        </div>
      </div>
      {overview.planId && (
        <CoPilotDrawer
          workspaceKey="dashboard"
          planId={overview.planId}
          showDesktopLauncher={true}
        />
      )}
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
    nextWorkspace: { href: "/workspace/concept", label: "Concept", blurb: "Shape your shop's identity, story, and what sets it apart." },
    nudges: [
      { href: "/workspace/concept",    label: "Concept",    copy: "Define your shop concept",   workspaceKey: "concept"    },
      { href: "/workspace/financials", label: "Financials", copy: "Start your financial model",  workspaceKey: "financials" },
      { href: "/workspace/location-lease", label: "Location", copy: "Add your first location option", workspaceKey: "location_lease" },
    ],
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

// ── Section 2 — Next Step Card ──────────────────────────────────────────────

function NextStepCard({
  nextWorkspace,
  counts,
  planStarted,
}: {
  nextWorkspace: NextWorkspace | null;
  counts: PlanOverview["counts"];
  planStarted: boolean;
}) {
  const started = counts.completed + counts.inProgress;
  const total = counts.total;

  if (!nextWorkspace) {
    return (
      <div className="rounded-xl border border-[var(--teal)]/20 bg-[var(--teal)]/5 p-5">
        <p className="text-sm font-semibold text-[var(--teal)] mb-1">
          All sections started
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {started} of {total} plan sections started. Keep going!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
        Your next step
      </p>
      <Link
        href={nextWorkspace.href}
        className="group flex items-center justify-between gap-3 rounded-lg border border-[var(--teal)]/20 bg-[var(--teal)]/5 px-4 py-3 hover:bg-[var(--teal)]/10 transition-colors mb-3"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--teal)] truncate">
            {nextWorkspace.label}
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">
            {nextWorkspace.blurb}
          </p>
        </div>
        <ArrowRight
          size={16}
          className="text-[var(--teal)] flex-shrink-0 group-hover:translate-x-0.5 transition-transform"
          aria-hidden="true"
        />
      </Link>
      {planStarted && (
        <p className="text-xs text-[var(--muted-foreground)]">
          {started} of {total} plan sections started
        </p>
      )}
    </div>
  );
}

// ── Section 3 — Activity ────────────────────────────────────────────────────

function GettingStartedCard() {
  const steps = [
    { href: "/workspace/concept", label: "Complete your concept", desc: "Define your shop type, vision, and customer." },
    { href: "/workspace/financials", label: "Model your startup costs", desc: "Estimate what it takes to open." },
    { href: "/workspace/location-lease", label: "Compare 2 location options", desc: "Start a shortlist of candidate sites." },
  ];
  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Getting started</h2>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {steps.map((step) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-warm-100)] transition-colors"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--foreground)]">{step.label}</p>
                <p className="text-xs text-[var(--muted-foreground)] truncate">{step.desc}</p>
              </div>
              <ArrowRight size={12} className="text-[var(--muted-foreground)] flex-shrink-0 ml-auto" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Section 3b — Last 7 Days ───────────────────────────────────────────────

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
