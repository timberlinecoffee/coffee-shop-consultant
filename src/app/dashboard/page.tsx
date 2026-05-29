import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { buildNavItems } from "@/lib/workspace-manifest";
import { capitalizeFirst } from "@/lib/format";
import {
  buildRecentActivity,
  buildStaleNudges,
  buildWorkspaceSnapshots,
  pickNextStep,
  pickWeakestWorkspace,
} from "@/lib/dashboard-nudges";
import {
  isWorkspaceStatus,
  type WorkspaceStatus,
} from "@/lib/workspace-status";
import { ConceptUnlockNote } from "./_components/concept-unlock-note";
import { ProgressDashboard } from "./_components/progress-dashboard";
import { DashboardHero } from "./_components/dashboard-hero";
import { WorkspaceNav } from "./_components/workspace-nav";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: plan }] = await Promise.all([
    supabase
      .from("users")
      .select("full_name, readiness_score, subscription_tier, subscription_status, onboarding_completed, ai_credits_remaining, copilot_trial_messages_used, onboarding_data")
      .eq("id", user.id)
      .single(),
    supabase
      .from("coffee_shop_plans")
      .select("id, latest_readiness_check, latest_readiness_check_at")
      .eq("user_id", user.id)
      .single(),
  ]);

  const rawName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0];
  const firstName = rawName ? capitalizeFirst(rawName) : "there";
  const subscriptionTier = profile?.subscription_tier ?? "free";
  const subscriptionStatus = profile?.subscription_status ?? "free_trial";
  const creditsRemaining = profile?.ai_credits_remaining ?? 0;
  const trialMessagesUsed = profile?.copilot_trial_messages_used ?? 0;
  const FREE_TRIAL_COPILOT_LIMIT = 5;
  const onboardingData = (profile?.onboarding_data as Record<string, string> | null) ?? {};
  const targetTimeline: string | null = onboardingData?.timeline ?? null;

  if (profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  // TIM-1147: workspace progress is the manual 3-state status the founder
  // controls. `lastTouchedByKey` continues to come from workspace_documents
  // for the stale-nudge + recent activity feeds.
  const statusByKey = new Map<string, WorkspaceStatus>();
  const lastTouchedByKey = new Map<string, string>();

  if (plan?.id) {
    const [{ data: workspaceDocs }, { data: statusRows }] = await Promise.all([
      supabase
        .from("workspace_documents")
        .select("workspace_key, updated_at")
        .eq("plan_id", plan.id),
      supabase
        .from("workspace_status")
        .select("component_key, status")
        .eq("plan_id", plan.id),
    ]);

    for (const doc of workspaceDocs ?? []) {
      if (doc.updated_at && typeof doc.workspace_key === "string") {
        lastTouchedByKey.set(doc.workspace_key, doc.updated_at);
      }
    }
    for (const row of statusRows ?? []) {
      if (isWorkspaceStatus(row.status)) {
        statusByKey.set(row.component_key, row.status);
      }
    }
  }

  // Concept completion gates the milestones quick-link + unlock note.
  const w1Completed = (statusByKey.get("concept") ?? "not_started") === "complete";

  // TIM-1268: workspace nav grouped by category, mirroring the sidebar. Uses
  // the shared manifest source of truth so the grouping cannot drift.
  const navItems = buildNavItems(statusByKey);

  // Show milestones once opening date is set OR Workspace 1 is complete
  const showMilestones = !!targetTimeline || w1Completed;

  // All downstream modules unlock simultaneously when concept is complete
  const allUnlocked = w1Completed;

  // TIM-1063: Progress dashboard data — next-step nudge, completion strip,
  // stale nudges, recent activity, weakest workspace for "Improve with AI".
  // Skipping the per-owner "good enough for now" opt-out for now — surface it
  // here once owners can mark workspaces complete from the UI.
  const workspaceSnapshots = buildWorkspaceSnapshots(statusByKey, lastTouchedByKey);
  const nextStep = pickNextStep(workspaceSnapshots);
  const staleNudges = buildStaleNudges(workspaceSnapshots);
  const recentActivity = buildRecentActivity(lastTouchedByKey);
  const weakestWorkspace = pickWeakestWorkspace(workspaceSnapshots);
  const nowIso = new Date().toISOString();

  const cookieStore = await cookies();
  const noteDismissed = cookieStore.get("concept_unlock_note_dismissed")?.value === "1";
  const showUnlockNote = allUnlocked && !noteDismissed;

  const isPaid = subscriptionTier !== "free";
  const isTrial = subscriptionStatus === "free_trial";

  // TIM-736: readiness check banner data
  type ReadinessOverall = "green" | "yellow" | "red";
  const readinessCheck = plan?.latest_readiness_check as { overall?: ReadinessOverall } | null | undefined;
  const readinessAt = plan?.latest_readiness_check_at ?? null;
  const readinessOverall: ReadinessOverall | null = readinessCheck?.overall ?? null;
  // Show banner only if check is recent (within 7 days)
  const readinessBannerVisible =
    readinessOverall !== null &&
    readinessAt !== null &&
    Date.now() - new Date(readinessAt).getTime() < 7 * 24 * 60 * 60 * 1000;

  const READINESS_COLORS: Record<ReadinessOverall, { bg: string; text: string; dot: string; label: string }> = {
    green: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", dot: "bg-emerald-500", label: "On track" },
    yellow: { bg: "bg-amber-50 border-amber-200", text: "text-amber-800", dot: "bg-amber-400", label: "Gaps to address" },
    red: { bg: "bg-red-50 border-red-200", text: "text-red-800", dot: "bg-red-500", label: "Critical blockers" },
  };

  return (
    <div className="min-h-screen bg-[var(--background)] pb-16 lg:pb-0">
      {/* Top bar */}
      <nav className="bg-white border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[var(--teal)] rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="font-semibold text-[var(--teal)] text-sm hidden sm:block">My Coffee Shop Consultant</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/account" className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors">Account</Link>
            <form action="/auth/signout" method="POST">
              <button type="submit" className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors">Sign Out</button>
            </form>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* TIM-736: Launch readiness banner */}
        {readinessBannerVisible && readinessOverall && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-6 ${READINESS_COLORS[readinessOverall].bg}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${READINESS_COLORS[readinessOverall].dot}`} />
            <p className={`text-xs font-medium flex-1 ${READINESS_COLORS[readinessOverall].text}`}>
              Last readiness check: <span className="font-semibold">{READINESS_COLORS[readinessOverall].label}</span>
              {readinessAt && (
                <span className="font-normal opacity-70">
                  {" · "}
                  {new Date(readinessAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </p>
            <Link
              href="/workspace/launch-plan"
              className={`text-xs font-semibold flex-shrink-0 hover:underline ${READINESS_COLORS[readinessOverall].text}`}
            >
              View results →
            </Link>
          </div>
        )}

        {/* TIM-1268: personable hero — time-of-day greeting + rotating fact. */}
        <DashboardHero firstName={firstName} />

        {/* TIM-1268: workspace display grouped by category, mirroring the
            sidebar. Replaces the old numbered "Start Here" + "Coming Up" lists. */}
        <ConceptUnlockNote show={showUnlockNote} />
        <WorkspaceNav items={navItems} />

        {/* TIM-1063: Progress dashboard — next-step nudge, stale nudges,
           recent activity, quick actions. */}
        <ProgressDashboard
          nextStep={nextStep}
          staleNudges={staleNudges}
          recentActivity={recentActivity}
          weakest={weakestWorkspace}
          nowIso={nowIso}
        />

        {/* Quick links */}
        <h2 className="font-semibold text-lg text-[var(--foreground)] mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            {
              label: "Equipment List",
              href: "/workspace/buildout-equipment",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              ),
            },
            {
              label: "Your Numbers",
              href: "/workspace/financials",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>
                </svg>
              ),
            },
            {
              label: "Startup Costs",
              href: "/workspace/financials",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>
                </svg>
              ),
            },
            ...(showMilestones ? [{
              label: "Milestones",
              href: "/workspace/launch-plan",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
                </svg>
              ),
            }] : []),
          ].map((tool) => (
            <Link
              key={tool.label}
              href={tool.href}
              className="bg-white rounded-xl border border-[var(--border)] p-4 text-center hover:border-[var(--teal)]/30 transition-colors"
            >
              <div className="flex justify-center mb-2 text-[var(--teal)]">{tool.icon}</div>
              <span className="text-xs font-medium text-[var(--foreground)]">{tool.label}</span>
            </Link>
          ))}
        </div>

        {/* TIM-1062: Export Business Plan — bundle every workspace into one printable doc */}
        <Link
          href="/workspace/business-plan/print"
          target="_blank"
          className="block bg-white rounded-xl border border-[var(--teal)]/30 p-4 mb-4 hover:border-[var(--teal)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--teal)]/10 text-[var(--teal)] flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 12 15 15" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">Export Business Plan</p>
              <p className="text-xs text-[var(--dark-grey)]">
                One printable document: concept, team, menu, equipment, financials, and more.
              </p>
            </div>
            <ArrowRight size={16} className="text-[var(--teal)] flex-shrink-0" />
          </div>
        </Link>

        {/* AI coaching — low-visual-weight line in quick links area */}
        <div className="bg-white rounded-xl border border-[var(--border)] px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-[var(--dark-grey)]">AI coaching</span>
          {isTrial ? (
            trialMessagesUsed < FREE_TRIAL_COPILOT_LIMIT ? (
              <span className={`text-xs font-medium ${FREE_TRIAL_COPILOT_LIMIT - trialMessagesUsed <= 1 ? "text-amber-500" : "text-[var(--teal)]"}`}>
                {FREE_TRIAL_COPILOT_LIMIT - trialMessagesUsed} of {FREE_TRIAL_COPILOT_LIMIT} trial messages left
              </span>
            ) : (
              <Link href="/pricing" className="text-xs text-[var(--teal)] hover:underline">Trial used — upgrade to continue</Link>
            )
          ) : isPaid && creditsRemaining > 0 ? (
            <span className={`text-xs font-medium ${creditsRemaining <= 10 ? "text-amber-500" : "text-[var(--teal)]"}`}>
              {creditsRemaining} messages left this month
            </span>
          ) : (
            <Link href="/pricing" className="text-xs text-[var(--teal)] hover:underline">Upgrade to get AI coaching</Link>
          )}
        </div>
      </div>
      <BottomTabBar />
    </div>
  );
}
