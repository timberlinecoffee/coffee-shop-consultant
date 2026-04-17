import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = 'force-dynamic';

const MODULES = [
  { num: 1, title: "Concept & Positioning", desc: "Define your shop type, target customer, and what makes you different.", unlocked: true },
  { num: 2, title: "Financial Modeling", desc: "Build your startup budget and monthly P&L projections.", unlocked: true },
  { num: 3, title: "Site Selection & Lease", desc: "Find the right location and negotiate a smart lease.", unlocked: true },
  { num: 4, title: "Menu Design & Sourcing", desc: "Design your menu and find your roasting partner.", unlocked: false },
  { num: 5, title: "Bar Design & Equipment", desc: "Plan your bar layout and choose the right gear.", unlocked: false },
  { num: 6, title: "Hiring, Training & Culture", desc: "Build the team that brings your shop to life.", unlocked: false },
  { num: 7, title: "Pre-Opening Marketing", desc: "Get people lined up before you open.", unlocked: false },
  { num: 8, title: "BRD Assembly & Long-Term Ops", desc: "Assemble your complete Business Readiness Document.", unlocked: false },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, readiness_score, subscription_tier, onboarding_completed, ai_credits_remaining")
    .eq("id", user.id)
    .single();

  const firstName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "there";
  const readinessScore = profile?.readiness_score ?? 0;
  const subscriptionTier = profile?.subscription_tier ?? "free";
  const creditsRemaining = profile?.ai_credits_remaining ?? 0;

  if (profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-[#faf9f7]">
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
        {/* Welcome + readiness */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">Hey {firstName} 👋</h1>
            <p className="text-[#afafaf] text-sm">Your coffee shop plan is waiting. Let&apos;s keep building.</p>
          </div>
          <div className="flex gap-4 flex-wrap sm:flex-nowrap">
            <div className="bg-white rounded-2xl border border-[#efefef] p-5 min-w-48 text-center">
              <div className="text-4xl font-bold text-[#155e63] mb-1">{readinessScore}</div>
              <div className="text-xs text-[#afafaf] uppercase tracking-wide font-medium">Opening Readiness Score</div>
              <div className="mt-3 bg-[#efefef] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#155e63] h-2 rounded-full transition-all duration-500"
                  style={{ width: `${readinessScore}%` }}
                />
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-[#efefef] p-5 min-w-40 text-center">
              {subscriptionTier === "accelerator" ? (
                <div className="text-4xl font-bold text-[#76b39d] mb-1">∞</div>
              ) : subscriptionTier === "free" ? (
                <div className="text-4xl font-bold text-[#afafaf] mb-1">—</div>
              ) : (
                <div className={`text-4xl font-bold mb-1 ${creditsRemaining <= 10 ? "text-amber-500" : "text-[#155e63]"}`}>
                  {creditsRemaining}
                </div>
              )}
              <div className="text-xs text-[#afafaf] uppercase tracking-wide font-medium">AI Credits</div>
              {subscriptionTier === "free" && (
                <Link href="/account" className="mt-2 inline-block text-xs text-[#155e63] hover:underline">Upgrade →</Link>
              )}
            </div>
          </div>
        </div>

        {/* Module grid */}
        <h2 className="font-semibold text-lg text-[#1a1a1a] mb-4">Your 8-module plan</h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {MODULES.map((m) => (
            <div
              key={m.num}
              className={`bg-white rounded-xl border p-6 flex gap-4 ${
                m.unlocked ? "border-[#efefef] hover:border-[#155e63]/30 transition-colors" : "border-[#efefef] opacity-60"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                m.unlocked ? "bg-[#155e63] text-white" : "bg-[#efefef] text-[#afafaf]"
              }`}>
                {m.num}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm text-[#1a1a1a] truncate">{m.title}</h3>
                  {!m.unlocked && (
                    <span className="text-xs bg-[#efefef] text-[#afafaf] px-2 py-0.5 rounded-full flex-shrink-0">Locked</span>
                  )}
                </div>
                <p className="text-xs text-[#afafaf] leading-relaxed mb-3">{m.desc}</p>
                {m.unlocked && (
                  <Link
                    href={`/plan/${m.num}`}
                    className="text-xs text-[#155e63] font-medium hover:underline"
                  >
                    {m.num === 1 ? "Start here →" : "Open module →"}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <h2 className="font-semibold text-lg text-[#1a1a1a] mb-4">Your tools</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Equipment List", href: "/plan/equipment", icon: "🔧" },
            { label: "Financial Model", href: "/plan/financials", icon: "📊" },
            { label: "Cost Tracker", href: "/plan/costs", icon: "💰" },
            { label: "Milestones", href: "/plan/milestones", icon: "📅" },
          ].map((tool) => (
            <Link
              key={tool.label}
              href={tool.href}
              className="bg-white rounded-xl border border-[#efefef] p-4 text-center hover:border-[#155e63]/30 transition-colors"
            >
              <div className="text-2xl mb-2">{tool.icon}</div>
              <span className="text-xs font-medium text-[#1a1a1a]">{tool.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
