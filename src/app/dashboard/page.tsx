import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, readiness_score, subscription_tier, onboarding_completed, ai_credits_remaining, onboarding_data")
    .eq("id", user.id)
    .single();

  const firstName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "there";
  const subscriptionTier = profile?.subscription_tier ?? "free";
  const creditsRemaining = profile?.ai_credits_remaining ?? 0;
  const onboardingData = (profile?.onboarding_data as Record<string, string> | null) ?? {};
  const targetTimeline: string | null = onboardingData?.timeline ?? null;

  if (profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const readinessScore = profile?.readiness_score ?? 0;
  const showMilestones = !!targetTimeline;

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
            {/* Mobile abbreviates to first name only; desktop shows full greeting */}
            <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">
              <span className="sm:hidden">Hey {firstName}.</span>
              <span className="hidden sm:inline">Hey {firstName}. You&apos;ve started.</span>
            </h1>
          </div>
          <div
            className="bg-white rounded-2xl border border-[#efefef] p-5 min-w-48 text-center"
            title="Complete sections in each available workspace to raise this score."
          >
            <div className="text-4xl font-bold text-[#155e63] mb-1">{readinessScore}%</div>
            <div className="text-xs text-[#afafaf] uppercase tracking-wide font-medium">
              {/* Mobile abbreviates; desktop shows full label */}
              <span className="sm:hidden">alive</span>
              <span className="hidden sm:inline">Your plan is alive</span>
            </div>
            <div className="mt-3 bg-[#efefef] rounded-full h-2 overflow-hidden max-w-[140px] mx-auto">
              <div
                className="bg-[#155e63] h-2 rounded-full transition-all duration-500"
                style={{ width: `${readinessScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Workspaces — interim placeholder until TIM-619+ ship */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-[#155e63] uppercase tracking-widest mb-3">Your plan</p>
          <div className="bg-white rounded-xl border border-[#efefef] p-6">
            <p className="text-sm text-[#1a1a1a]">
              Workspace cards land here as each workspace ships. In the meantime, jump into any
              area below to keep building.
            </p>
          </div>
        </div>

        {/* Quick links */}
        <h2 className="font-semibold text-lg text-[#1a1a1a] mb-4">Quick links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            {
              label: "Equipment list",
              href: "/plan/equipment",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              ),
            },
            {
              label: "Your numbers",
              href: "/plan/financials",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>
                </svg>
              ),
            },
            {
              label: "Startup costs",
              href: "/plan/costs",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>
                </svg>
              ),
            },
            ...(showMilestones ? [{
              label: "Milestones",
              href: "/plan/milestones",
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

        {/* AI Credits — low-visual-weight line in quick links area */}
        <div className="bg-white rounded-xl border border-[#efefef] px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-[#afafaf]">AI Coach credits</span>
          {subscriptionTier === "pro" ? (
            <span className="text-xs font-medium text-[#155e63]">Unlimited</span>
          ) : subscriptionTier === "free" || creditsRemaining === 0 ? (
            <Link href="/account" className="text-xs text-[#155e63] hover:underline">Upgrade to get AI coaching</Link>
          ) : (
            <span className={`text-xs font-medium ${creditsRemaining <= 10 ? "text-amber-500" : "text-[#155e63]"}`}>
              {creditsRemaining} remaining
            </span>
          )}
        </div>
      </div>
      <BottomTabBar />
    </div>
  );
}
