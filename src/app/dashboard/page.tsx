import { createClient } from "@/lib/supabase/server";
import { isModuleAvailable } from "@/lib/modules";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export const dynamic = 'force-dynamic';

const WORKSPACE_1 = { num: 1, title: "Workspace 1: Concept", subtitle: "Define your shop identity", totalSections: 5 };
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
      .select("full_name, readiness_score, subscription_tier, onboarding_completed, ai_credits_remaining, onboarding_data")
      .eq("id", user.id)
      .single(),
    supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", user.id)
      .single(),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "there";
  const subscriptionTier = profile?.subscription_tier ?? "free";
  const creditsRemaining = profile?.ai_credits_remaining ?? 0;
  const onboardingData = (profile?.onboarding_data as Record<string, string> | null) ?? {};
  const targetTimeline: string | null = onboardingData?.timeline ?? null;

  if (profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const workspaceProgressMap: Record<number, number> = {};

  if (plan?.id) {
    const { data: responses } = await supabase
      .from("module_responses")
      .select("module_number, status")
      .eq("plan_id", plan.id);

    (responses ?? []).forEach((r) => {
      if (r.status === "completed") {
        workspaceProgressMap[r.module_number] = (workspaceProgressMap[r.module_number] ?? 0) + 1;
      }
    });
  }

  const availableWorkspaceSets = [WORKSPACE_1].filter((w) => isModuleAvailable(w.num));
  const totalAvailableSections = availableWorkspaceSets.reduce((sum, w) => sum + w.totalSections, 0);
  const completedSections = availableWorkspaceSets.reduce((sum, w) => sum + (workspaceProgressMap[w.num] ?? 0), 0);
  const readinessScore = totalAvailableSections > 0
    ? Math.round((completedSections / totalAvailableSections) * 100)
    : (profile?.readiness_score ?? 0);

  const w1Completed = (workspaceProgressMap[1] ?? 0) >= WORKSPACE_1.totalSections;
  const w1Started = (workspaceProgressMap[1] ?? 0) > 0;
  const w1Progress = workspaceProgressMap[1] ?? 0;
  const w1Pct = Math.round((w1Progress / WORKSPACE_1.totalSections) * 100);

  // Show milestones once opening date is set OR Workspace 1 is complete
  const showMilestones = !!targetTimeline || w1Completed;

  // Workspace 2 unlocks after Workspace 1 complete
  const w2Unlocked = w1Completed;

  const isPaid = subscriptionTier !== "free";

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
              <button type="submit" className="text-sm text-[#afafaf] hover:text-[#1a1a1a] transition-colors">Sign out</button>
            </form>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
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
          <p className="text-xs font-semibold text-[#155e63] uppercase tracking-widest mb-3">Start here</p>
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
                  {w1Progress}/{WORKSPACE_1.totalSections} sections
                </span>
              </div>
              <Link
                href="/workspace/concept"
                className="inline-block text-sm font-semibold text-white bg-[#155e63] hover:bg-[#155e63]/90 px-4 py-1.5 rounded-lg transition-colors"
              >
                {w1Completed ? "Review \u2192" : w1Started ? "Continue \u2192" : "Start \u2192"}
              </Link>
            </div>
          </div>
        </div>

        {/* COMING UP */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-widest mt-6 mb-3">Coming up</p>
          <div className="bg-white rounded-xl border border-[#efefef] divide-y divide-[#efefef]">
            {/* Workspace 2 */}
            <div className="p-5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#efefef] flex items-center justify-center flex-shrink-0">
                {w2Unlocked ? (
                  <span className="text-xs font-bold text-[#155e63]">2</span>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#afafaf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1a1a1a]">Workspace 2: Location &amp; Lease</p>
                <p className="text-xs text-[#afafaf]">
                  {w2Unlocked ? "Ready to start" : "Begin after Concept"}
                </p>
              </div>
              {w2Unlocked && (
                <Link href="/workspace/location-lease" className="text-xs text-[#155e63] font-medium hover:underline flex-shrink-0">Open \u2192</Link>
              )}
            </div>
            {/* Workspaces 3-6 collapsed */}
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#efefef] flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#afafaf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <p className="text-sm text-[#afafaf]">Workspaces 3{"\u20136"} unlock as you go</p>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <h2 className="font-semibold text-lg text-[#1a1a1a] mb-4">Quick links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            {
              label: "Equipment list",
              href: "/workspace/buildout-equipment",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              ),
            },
            {
              label: "Your numbers",
              href: "/workspace/financials",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>
                </svg>
              ),
            },
            {
              label: "Startup costs",
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
          {isPaid && creditsRemaining > 0 ? (
            <span className={`text-xs font-medium ${creditsRemaining <= 10 ? "text-amber-500" : "text-[#155e63]"}`}>
              {creditsRemaining} coaching messages left this month
            </span>
          ) : (
            <Link href="/account" className="text-xs text-[#155e63] hover:underline">Upgrade to get AI coaching</Link>
          )}
        </div>
      </div>
      <BottomTabBar />
    </div>
  );
}
