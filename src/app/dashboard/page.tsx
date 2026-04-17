import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export const dynamic = 'force-dynamic';

const MODULES = [
  { num: 1, title: "Concept & Positioning", desc: "Define your shop type, target customer, and what makes you different.", unlocked: true, totalSections: 5 },
  { num: 2, title: "Financial Modeling", desc: "Build your startup budget and monthly P&L projections.", unlocked: true, totalSections: 4 },
  { num: 3, title: "Site Selection & Lease", desc: "Find the right location and negotiate a smart lease.", unlocked: true, totalSections: 0 },
  { num: 4, title: "Menu Design & Sourcing", desc: "Design your menu and find your roasting partner.", unlocked: false, totalSections: 0 },
  { num: 5, title: "Bar Design & Equipment", desc: "Plan your bar layout and choose the right gear.", unlocked: false, totalSections: 0 },
  { num: 6, title: "Hiring, Training & Culture", desc: "Build the team that brings your shop to life.", unlocked: false, totalSections: 0 },
  { num: 7, title: "Pre-Opening Marketing", desc: "Get people lined up before you open.", unlocked: false, totalSections: 0 },
  { num: 8, title: "BRD Assembly & Long-Term Ops", desc: "Assemble your complete Business Readiness Document.", unlocked: false, totalSections: 0 },
];

const UNLOCKED_TOTAL_SECTIONS = MODULES.filter(m => m.unlocked && m.totalSections > 0)
  .reduce((sum, m) => sum + m.totalSections, 0);

function ReadinessRing({ score }: { score: number }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="140" height="140" viewBox="0 0 140 140" aria-label={`Readiness score: ${score} out of 100`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#efefef" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke="#155e63"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '70px 70px' }}
        />
        <text x="70" y="64" textAnchor="middle" fill="#155e63" fontSize="30" fontWeight="700" fontFamily="Poppins, sans-serif">
          {score}
        </text>
        <text x="70" y="88" textAnchor="middle" fill="#afafaf" fontSize="11" fontFamily="Poppins, sans-serif">
          out of 100
        </text>
      </svg>
      <p className="text-[10px] font-semibold text-[#afafaf] uppercase tracking-wider">Opening Readiness</p>
    </div>
  );
}

function buildMilestones(targetDate: string | null, currentModule: number) {
  if (!targetDate) return null;
  const now = new Date();
  const open = new Date(targetDate + 'T00:00:00');
  if (open <= now) return null;

  const msTotal = open.getTime() - now.getTime();
  const checkpoints = [
    { label: 'Concept finalized', pct: 0.12, doneAfter: 1 },
    { label: 'Financials complete', pct: 0.25, doneAfter: 2 },
    { label: 'Location secured', pct: 0.42, doneAfter: 3 },
    { label: 'Equipment & buildout', pct: 0.60, doneAfter: 5 },
    { label: 'Staff trained', pct: 0.78, doneAfter: 6 },
    { label: 'Soft open', pct: 0.92, doneAfter: 7 },
    { label: 'Grand opening', pct: 1.0, doneAfter: 8 },
  ];

  return checkpoints.map(c => ({
    label: c.label,
    date: new Date(now.getTime() + msTotal * c.pct),
    isCompleted: currentModule > c.doneAfter,
    isGrandOpening: c.pct === 1.0,
  }));
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: plan }] = await Promise.all([
    supabase
      .from("users")
      .select("full_name, readiness_score, subscription_tier, onboarding_completed, ai_credits_remaining, target_opening_date")
      .eq("id", user.id)
      .single(),
    supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", user.id)
      .single(),
  ]);

  if (profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  // Fetch module completion data
  const moduleProgress: Record<number, number> = {};
  if (plan) {
    const { data: responses } = await supabase
      .from("module_responses")
      .select("module_number, status")
      .eq("plan_id", plan.id);

    for (const r of responses ?? []) {
      if (r.status === "complete") {
        moduleProgress[r.module_number] = (moduleProgress[r.module_number] ?? 0) + 1;
      }
    }
  }

  const totalDone = Object.values(moduleProgress).reduce((s, n) => s + n, 0);
  const readinessScore = UNLOCKED_TOTAL_SECTIONS > 0
    ? Math.round((totalDone / UNLOCKED_TOTAL_SECTIONS) * 100)
    : 0;

  // First module that has sections but isn't fully complete
  const currentModule = MODULES.find(
    m => m.totalSections > 0 && (moduleProgress[m.num] ?? 0) < m.totalSections
  )?.num ?? 1;

  const firstName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "there";
  const subscriptionTier = profile?.subscription_tier ?? "free";
  const creditsRemaining = profile?.ai_credits_remaining ?? 0;
  const milestones = buildMilestones(profile?.target_opening_date ?? null, currentModule);

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
        {/* Welcome + readiness */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-10">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">Hey {firstName} 👋</h1>
            <p className="text-[#afafaf] text-sm">Your coffee shop plan is waiting. Let&apos;s keep building.</p>
          </div>
          <div className="flex gap-4 flex-wrap sm:flex-nowrap">
            {/* Readiness ring */}
            <div className="bg-white rounded-2xl border border-[#efefef] p-5 flex items-center justify-center">
              <ReadinessRing score={readinessScore} />
            </div>
            {/* AI credits */}
            <div className="bg-white rounded-2xl border border-[#efefef] p-5 min-w-40 text-center flex flex-col justify-center">
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
                <Link href="/pricing" className="mt-2 inline-block text-xs text-[#155e63] hover:underline">Upgrade →</Link>
              )}
            </div>
          </div>
        </div>

        {/* Module grid */}
        <h2 className="font-semibold text-lg text-[#1a1a1a] mb-4">Your 8-module plan</h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {MODULES.map((m) => {
            const done = moduleProgress[m.num] ?? 0;
            const total = m.totalSections;
            const isComplete = total > 0 && done >= total;
            const isInProgress = total > 0 && done > 0 && !isComplete;
            const borderClass = isComplete
              ? "border-[#155e63]/40 bg-[#155e63]/5"
              : m.unlocked
              ? "border-[#efefef] hover:border-[#155e63]/30 transition-colors"
              : "border-[#efefef] opacity-60";
            return (
              <div key={m.num} className={`bg-white rounded-xl border p-6 flex gap-4 ${borderClass}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  isComplete ? "bg-[#155e63] text-white" : m.unlocked ? "bg-[#155e63] text-white" : "bg-[#efefef] text-[#afafaf]"
                }`}>
                  {isComplete ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : m.num}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm text-[#1a1a1a] truncate">{m.title}</h3>
                    {!m.unlocked && (
                      <span className="text-xs bg-[#efefef] text-[#afafaf] px-2 py-0.5 rounded-full flex-shrink-0">Locked</span>
                    )}
                    {isComplete && (
                      <span className="text-xs bg-[#155e63]/10 text-[#155e63] px-2 py-0.5 rounded-full flex-shrink-0 font-medium">Done</span>
                    )}
                    {isInProgress && (
                      <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full flex-shrink-0 font-medium">In progress</span>
                    )}
                  </div>
                  <p className="text-xs text-[#afafaf] leading-relaxed mb-3">{m.desc}</p>
                  {m.unlocked && total > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-[#afafaf]">{done}/{total} sections done</span>
                        <span className="text-[10px] text-[#afafaf]">{Math.round((done / total) * 100)}%</span>
                      </div>
                      <div className="h-1 bg-[#efefef] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#155e63] rounded-full transition-all"
                          style={{ width: `${Math.round((done / total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {m.unlocked && (
                    <Link
                      href={`/plan/${m.num}`}
                      className="text-xs text-[#155e63] font-medium hover:underline"
                    >
                      {isComplete ? "Review →" : done === 0 ? (m.num === 1 ? "Start here →" : "Open module →") : "Continue →"}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Milestone timeline */}
        {milestones && (
          <>
            <h2 className="font-semibold text-lg text-[#1a1a1a] mb-4">Opening timeline</h2>
            <div className="bg-white rounded-2xl border border-[#efefef] p-6 mb-10">
              <div className="relative">
                <div className="absolute left-[9px] top-0 bottom-0 w-0.5 bg-[#efefef]" />
                <ul className="space-y-5">
                  {milestones.map((m, i) => (
                    <li key={i} className="flex items-start gap-4 relative">
                      <span className={`relative z-10 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        m.isCompleted
                          ? 'bg-[#155e63] border-[#155e63]'
                          : m.isGrandOpening
                          ? 'bg-[#76b39d] border-[#76b39d]'
                          : 'bg-white border-[#efefef]'
                      }`}>
                        {m.isCompleted && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <div>
                        <p className={`text-sm font-medium ${m.isCompleted ? 'text-[#1a1a1a]' : 'text-[#afafaf]'}`}>{m.label}</p>
                        <p className="text-xs text-[#afafaf]">
                          {m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}

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
      <BottomTabBar />
    </div>
  );
}
