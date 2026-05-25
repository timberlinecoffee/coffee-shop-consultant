import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { normalizeConceptV2, getConceptV2Progress } from "@/lib/concept";
import { computePlanReadiness } from "@/lib/workspace-manifest";
import { capitalizeFirst } from "@/lib/format";
import { ConceptUnlockNote } from "./_components/concept-unlock-note";

export const dynamic = 'force-dynamic';

const WORKSPACE_1 = { num: 1, title: "Workspace 1: Concept", subtitle: "Define your shop identity" };
const WORKSPACE_2 = { num: 2 };

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

  // completedByModule: module number → count of filled sections.
  // Concept (module 1) reads from workspace_documents; the old module_responses
  // path is NOT used for workspace 1 — onboarding never wrote there.
  const completedByModule = new Map<number, number>();

  if (plan?.id) {
    const { data: conceptDoc } = await supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "concept")
      .maybeSingle();

    if (conceptDoc?.content) {
      const conceptV2 = normalizeConceptV2(conceptDoc.content);
      const progress = getConceptV2Progress(conceptV2);
      completedByModule.set(1, progress.filled);
    }
  }

  // W1-specific counters for the "Start here" card (not the overall score).
  const w1FilledCount = completedByModule.get(1) ?? 0;
  const w1TotalSections = 5; // concept always has 5 core sections
  const w1Progress = w1FilledCount;
  const w1Completed = w1Progress >= w1TotalSections;
  const w1Started = w1Progress > 0;
  const w1Pct = Math.round((w1Progress / w1TotalSections) * 100);

  // Overall plan readiness: filled sections / total expected sections across ALL modules.
  // computePlanReadiness weights locked modules at 5 sections each in the denominator,
  // so completing only concept gives ~17% — not 100%. See workspace-manifest.ts.
  const planReadiness = computePlanReadiness(completedByModule);
  const readinessScore = planReadiness.total > 0
    ? Math.round((planReadiness.filled / planReadiness.total) * 100)
    : 0;

  // Show milestones once opening date is set OR Workspace 1 is complete
  const showMilestones = !!targetTimeline || w1Completed;

  // All downstream modules unlock simultaneously when concept is complete
  const allUnlocked = w1Completed;

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
    <div className="min-h-screen bg-[#faf9f7] pb-16 lg:pb-0">
      {/* Top bar */}
      <nav className="bg-white border-b border-[#efefef] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#155e63] rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="font-semibold text-[#155e63] text-sm hidden sm:block">My Coffee Shop Consultant</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/account" className="text-sm text-[#afafaf] hover:text-[#1a1a1a] transition-colors">Account</Link>
            <form action="/auth/signout" method="POST">
              <button type="submit" className="text-sm text-[#afafaf] hover:text-[#1a1a1a] transition-colors">Sign Out</button>
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

        {/* Greeting + readiness */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">
              <span className="sm:hidden">Hey {firstName}.</span>
              <span className="hidden sm:inline">Hey {firstName}. You have started.</span>
            </h1>
          </div>
          <div
            className="bg-white rounded-2xl border border-[#efefef] p-5 min-w-48 text-center"
            title="Complete sections in each available workspace to raise this score."
          >
            <div className="text-4xl font-bold text-[#155e63] mb-1">{readinessScore}%</div>
            <div className="text-xs text-[#afafaf] uppercase tracking-wide font-medium">
              <span className="sm:hidden">Taking shape</span>
              <span className="hidden sm:inline">Your plan is taking shape</span>
            </div>
            <div className="mt-3 bg-[#efefef] rounded-full h-2 overflow-hidden max-w-[140px] mx-auto">
              <div
                className="bg-[#155e63] h-2 rounded-full transition-all duration-500"
                style={{ width: `${readinessScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* START HERE — Workspace 1 */}
        <div className="mb-2">
          <p className="text-xs font-semibold text-[#155e63] uppercase tracking-widest mb-3">Start Here</p>
          <div className="bg-white rounded-xl border border-[#155e63]/30 p-6 flex gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              w1Completed ? "bg-[#155e63] text-white" :
              w1Started ? "bg-[#155e63]/20 text-[#155e63]" :
              "bg-[#155e63] text-white"
            }`}>
              {w1Completed
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : 1}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-[#1a1a1a] mb-0.5">{WORKSPACE_1.title}</h3>
              <p className="text-xs text-[#afafaf] mb-3">{WORKSPACE_1.subtitle}</p>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 bg-[#efefef] rounded-full h-1.5 overflow-hidden max-w-[200px]">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${w1Completed ? "bg-[#155e63]" : w1Started ? "bg-amber-400" : "bg-[#efefef]"}`}
                    style={{ width: `${w1Pct}%` }}
                  />
                </div>
                <span className="text-xs text-[#afafaf] whitespace-nowrap flex-shrink-0">
                  {w1Progress}/{w1TotalSections} sections
                </span>
              </div>
              <Link
                href="/workspace/concept"
                className="inline-block text-sm font-semibold text-white bg-[#155e63] hover:bg-[#155e63]/90 px-4 py-1.5 rounded-lg transition-colors"
              >
                {w1Completed ? "Review →" : w1Started ? "Continue →" : "Start →"}
              </Link>
            </div>
          </div>
        </div>

        {/* COMING UP */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-widest mt-6 mb-3">Coming Up</p>
          <ConceptUnlockNote show={showUnlockNote} />
          <div className="bg-white rounded-xl border border-[#efefef] divide-y divide-[#efefef]">
            {[
              { num: 2, title: "Location & Lease", href: "/workspace/location-lease", lockedNote: <><span>Finish your Concept to open all modules.</span>{" "}<Link href="/workspace/concept" className="underline font-medium">Go to Concept</Link></> },
              { num: 3, title: "Build-out & Equipment", href: "/workspace/buildout-equipment", lockedNote: <span>Opens with Concept</span> },
              { num: 4, title: "Financials", href: "/workspace/financials", lockedNote: <span>Opens with Concept</span> },
              { num: 5, title: "Menu & Pricing", href: "/workspace/menu-pricing", lockedNote: <span>Opens with Concept</span> },
              { num: 6, title: "Launch Plan", href: "/workspace/launch-plan", lockedNote: <span>Opens with Concept</span> },
              { num: 7, title: "Suppliers & Vendors", href: "/workspace/suppliers", lockedNote: <span>Opens with Concept</span> },
            ].map(({ num, title, href, lockedNote }) => (
              <div key={num} className="p-5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#efefef] flex items-center justify-center flex-shrink-0">
                  {allUnlocked ? (
                    <span className="text-xs font-bold text-[#155e63]">{num}</span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#afafaf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1a1a1a]">Workspace {num}: {title}</p>
                  <p className="text-xs text-[#afafaf]">
                    {allUnlocked ? "Ready to start" : lockedNote}
                  </p>
                </div>
                {allUnlocked && (
                  <Link href={href} className="text-xs text-[#155e63] font-medium hover:underline flex-shrink-0 inline-flex items-center gap-1">Open <ArrowRight size={12} /></Link>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <h2 className="font-semibold text-lg text-[#1a1a1a] mb-4">Quick Links</h2>
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
              className="bg-white rounded-xl border border-[#efefef] p-4 text-center hover:border-[#155e63]/30 transition-colors"
            >
              <div className="flex justify-center mb-2 text-[#155e63]">{tool.icon}</div>
              <span className="text-xs font-medium text-[#1a1a1a]">{tool.label}</span>
            </Link>
          ))}
        </div>

        {/* AI coaching — low-visual-weight line in quick links area */}
        <div className="bg-white rounded-xl border border-[#efefef] px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-[#afafaf]">AI coaching</span>
          {isTrial ? (
            trialMessagesUsed < FREE_TRIAL_COPILOT_LIMIT ? (
              <span className={`text-xs font-medium ${FREE_TRIAL_COPILOT_LIMIT - trialMessagesUsed <= 1 ? "text-amber-500" : "text-[#155e63]"}`}>
                {FREE_TRIAL_COPILOT_LIMIT - trialMessagesUsed} of {FREE_TRIAL_COPILOT_LIMIT} trial messages left
              </span>
            ) : (
              <Link href="/pricing" className="text-xs text-[#155e63] hover:underline">Trial used — upgrade to continue</Link>
            )
          ) : isPaid && creditsRemaining > 0 ? (
            <span className={`text-xs font-medium ${creditsRemaining <= 10 ? "text-amber-500" : "text-[#155e63]"}`}>
              {creditsRemaining} messages left this month
            </span>
          ) : (
            <Link href="/pricing" className="text-xs text-[#155e63] hover:underline">Upgrade to get AI coaching</Link>
          )}
        </div>
      </div>
      <BottomTabBar />
    </div>
  );
}
