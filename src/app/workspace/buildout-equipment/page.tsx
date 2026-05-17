import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { loadWorkspaceContext } from "../_shared";

export const dynamic = "force-dynamic";

export default async function BuildoutEquipmentWorkspacePage() {
  const { planId } = await loadWorkspaceContext();

  return (
    <WorkspaceShell
      planId={planId}
      workspaceKey="buildout_equipment"
      title="Build-out & Equipment"
      description="Plan bar layout, equipment spec, and construction timeline. The Co-pilot ties equipment choices back to your menu and your build-out budget."
      icon="🛠️"
      shipsWith="W4 — Build-out & Equipment workspace (TIM-623)"
      currentFocusLabel="Build-out & Equipment workspace overview"
    />
  );
}
