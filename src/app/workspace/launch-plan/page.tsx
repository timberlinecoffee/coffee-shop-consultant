import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { LaunchTimelineCard } from "@/components/launch-plan/LaunchTimelineCard";
import { SoftOpenPlanCard } from "@/components/launch-plan/SoftOpenPlanCard";
import { MarketingKickoffChecklistCard } from "@/components/launch-plan/MarketingKickoffChecklistCard";
import { HiringPlanCard } from "@/components/launch-plan/HiringPlanCard";
import { LaunchReadinessButton } from "@/components/launch-plan/LaunchReadinessButton";

export const dynamic = "force-dynamic";

async function loadLaunchPlanContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [planResult, profileResult] = await Promise.all([
    supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("users")
      .select("target_opening_date")
      .eq("id", user.id)
      .single(),
  ]);

  if (!planResult.data) redirect("/onboarding");

  return {
    planId: planResult.data.id,
    launchDate: profileResult.data?.target_opening_date ?? null,
  };
}

type TMinusBanner =
  | { kind: "future"; days: number; label: string }
  | { kind: "today"; label: string }
  | { kind: "past"; days: number; label: string }
  | null;

function computeTMinus(launchDate: string | null): TMinusBanner {
  if (!launchDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(launchDate);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  const formatted = target.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  if (diffDays > 0) return { kind: "future", days: diffDays, label: formatted };
  if (diffDays === 0) return { kind: "today", label: formatted };
  return { kind: "past", days: Math.abs(diffDays), label: formatted };
}

export default async function LaunchPlanWorkspacePage() {
  const { planId, launchDate } = await loadLaunchPlanContext();
  const tMinus = computeTMinus(launchDate);

  return (
    <div className="min-h-screen bg-[#faf9f7] pb-24 lg:pb-0">
      <nav className="bg-white border-b border-[#efefef] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-[#155e63] font-medium hover:underline"
          >
            ← Back to dashboard
          </Link>
          <span className="text-xs text-[#6b6b6b]" data-workspace-key="launch_plan">
            Workspace · Launch Plan
          </span>
        </div>
      </nav>

      {tMinus && (
        <div
          aria-label="Launch countdown"
          className={`px-6 py-2.5 text-center text-sm font-medium ${
            tMinus.kind === "today"
              ? "bg-[#2d6a2d] text-white"
              : tMinus.kind === "future"
              ? "bg-[#155e63] text-white"
              : "bg-[#6b6b6b] text-white"
          }`}
        >
          {tMinus.kind === "future" && (
            <>T-{tMinus.days} day{tMinus.days !== 1 ? "s" : ""} · Opening {tMinus.label}</>
          )}
          {tMinus.kind === "today" && <>Day 0 — Opening day! {tMinus.label}</>}
          {tMinus.kind === "past" && (
            <>Opened {tMinus.days} day{tMinus.days !== 1 ? "s" : ""} ago · {tMinus.label}</>
          )}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="font-semibold text-2xl text-[#1a1a1a]">🚀 Launch Plan</h1>
          <p className="text-sm text-[#6b6b6b] mt-1">
            Sequence pre-opening marketing, hiring, training, and opening-week operations.
          </p>
        </div>

        {/* TIM-736: Cross-workspace launch readiness check */}
        <div className="mb-6">
          <LaunchReadinessButton planId={planId} />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <LaunchTimelineCard launchDate={launchDate} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <SoftOpenPlanCard />
          <MarketingKickoffChecklistCard />
          <HiringPlanCard />
        </div>
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey="launch_plan"
        currentFocus={{ label: "Launch Plan workspace" }}
      />

      <BottomTabBar />
    </div>
  );
}
