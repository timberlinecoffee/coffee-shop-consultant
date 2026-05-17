import Link from "next/link";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { SoftOpenPlanCard } from "@/components/launch-plan/SoftOpenPlanCard";
import { MarketingKickoffChecklistCard } from "@/components/launch-plan/MarketingKickoffChecklistCard";
import { HiringPlanCard } from "@/components/launch-plan/HiringPlanCard";
import { loadWorkspaceContext } from "../_shared";

export const dynamic = "force-dynamic";

export default async function LaunchPlanWorkspacePage() {
  const { planId } = await loadWorkspaceContext();

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

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="font-semibold text-2xl text-[#1a1a1a]">🚀 Launch Plan</h1>
          <p className="text-sm text-[#6b6b6b] mt-1">
            Sequence pre-opening marketing, hiring, training, and opening-week operations.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
