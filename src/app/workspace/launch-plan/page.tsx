import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { loadWorkspaceContext } from "../_shared";

export const dynamic = "force-dynamic";

export default async function LaunchPlanWorkspacePage() {
  const { planId } = await loadWorkspaceContext();

  return (
    <WorkspaceShell
      planId={planId}
      workspaceKey="launch_plan"
      title="Launch Plan"
      description="Sequence pre-opening marketing, hiring, training, and opening-week operations. The Co-pilot tracks your milestones against your target opening date."
      icon="🚀"
      shipsWith="W5 — Launch Plan workspace (TIM-624)"
      currentFocusLabel="Launch Plan workspace overview"
    />
  );
}
