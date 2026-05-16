import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { loadWorkspaceContext } from "../_shared";

export const dynamic = "force-dynamic";

export default async function ConceptWorkspacePage() {
  const { planId } = await loadWorkspaceContext();

  return (
    <WorkspaceShell
      planId={planId}
      workspaceKey="concept"
      title="Concept"
      description="Shape your shop identity — model, target customer, competitive position, and concept brief. The Co-pilot can reference your concept work across every workspace."
      icon="☕"
      shipsWith="W1 — Concept workspace (TIM-619)"
      currentFocusLabel="Concept workspace overview"
    />
  );
}
